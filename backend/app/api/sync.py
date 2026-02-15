# @TASK P4-T4.5 - Sync API endpoints
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#sync-api
# @TEST tests/test_api_sync.py

"""Sync API endpoints for manual synchronisation control.

Provides:
- ``POST /sync/trigger``  -- Start a manual NoteStation sync
- ``GET  /sync/status``   -- Query current sync status

Both endpoints require JWT authentication via the ``get_current_user``
dependency.

Sync state is tracked in-memory via :class:`SyncState`. The actual
synchronisation runs as an ``asyncio.Task`` in the background so the
trigger endpoint can return immediately.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Note
from app.services.auth_service import get_current_user
from app.utils.i18n import get_language
from app.utils.messages import msg

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["sync"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class SyncTriggerResponse(BaseModel):
    """Response for the sync trigger endpoint."""

    status: str  # "syncing" | "already_syncing"
    message: str


class SyncStatusResponse(BaseModel):
    """Response for the sync status endpoint."""

    status: str  # "idle" | "syncing" | "indexing" | "completed" | "error"
    last_sync_at: str | None = None
    notes_synced: int | None = None
    error_message: str | None = None
    notes_missing_images: int | None = None
    notes_indexed: int | None = None
    notes_pending_index: int | None = None
    pushed_count: int | None = None
    conflicts_count: int | None = None
    write_enabled: bool | None = None


# ---------------------------------------------------------------------------
# In-memory sync state
# ---------------------------------------------------------------------------


class SyncState:
    """Mutable in-memory tracker for synchronisation progress.

    Attributes:
        status: Current sync status (idle / syncing / indexing / completed / error).
        is_syncing: Convenience flag indicating whether a sync is running.
        last_sync_at: ISO-8601 timestamp of the last completed sync.
        notes_synced: Total note count from the last successful sync.
        error_message: Error message if the last sync failed.
        notes_missing_images: Count of notes with image refs but no extracted images.
        notes_indexed: Number of notes indexed in the last sync.
        notes_pending_index: Number of notes still needing indexing.
    """

    def __init__(self) -> None:
        self.status: str = "idle"
        self.is_syncing: bool = False
        self.last_sync_at: str | None = None
        self.notes_synced: int | None = None
        self.error_message: str | None = None
        self.notes_missing_images: int | None = None
        self.notes_indexed: int | None = None
        self.notes_pending_index: int | None = None
        self.pushed_count: int | None = None
        self.conflicts_count: int | None = None
        self.write_enabled: bool | None = None
        self.triggered_by: str | None = None
        self.user_id: int | None = None


# Module-level singleton -- shared across requests.
_sync_state = SyncState()


# ---------------------------------------------------------------------------
# Background sync runner
# ---------------------------------------------------------------------------


class Sync2FARequiredError(Exception):
    """Raised when NAS account requires 2FA and cannot auto-sync."""

    pass


async def _create_sync_service(user_id: int | None = None) -> tuple:
    from app.api.settings import get_nas_config
    from app.database import async_session_factory
    from app.services.sync_service import SyncService
    from app.synology_gateway.client import Synology2FARequired, SynologyClient
    from app.synology_gateway.notestation import NoteStationService

    nas = get_nas_config()
    session = async_session_factory()

    client = SynologyClient(
        url=nas["url"],
        user=nas["user"],
        password=nas["password"],
    )
    try:
        await client.login()
    except Synology2FARequired:
        await client.close()
        await session.close()
        raise Sync2FARequiredError("2FA 계정은 자동 동기화를 지원하지 않습니다. NSX 파일을 가져오기하세요.")

    notestation = NoteStationService(client)

    # Discover write capability for bidirectional sync
    write_enabled = await notestation.discover_write_capability()
    logger.info("NoteStation write capability: %s", write_enabled)

    service = SyncService(notestation=notestation, db=session, write_enabled=write_enabled, user_id=user_id)

    return service, session, write_enabled


async def _count_notes_missing_images() -> int:
    from sqlalchemy import text
    from app.database import async_session_factory

    async with async_session_factory() as session:
        result = await session.execute(
            text("""
                SELECT COUNT(DISTINCT n.synology_note_id)
                FROM notes n
                WHERE n.content_html ~ '<img[^>]*ref="[^"]+"'
                AND NOT EXISTS (
                    SELECT 1 FROM note_images ni
                    WHERE ni.synology_note_id = n.synology_note_id
                )
            """)
        )
        return result.scalar() or 0


async def _count_notes_pending_index() -> int:
    from sqlalchemy import text
    from app.database import async_session_factory

    async with async_session_factory() as session:
        result = await session.execute(
            text("""
                SELECT COUNT(*)
                FROM notes n
                WHERE NOT EXISTS (
                    SELECT 1 FROM note_embeddings ne
                    WHERE ne.note_id = n.id
                )
            """)
        )
        return result.scalar() or 0


async def _index_notes_batch(note_ids: list[int], batch_size: int = 10) -> int:
    from app.config import get_settings
    from app.database import async_session_factory
    from app.search.embeddings import EmbeddingService
    from app.search.indexer import NoteIndexer

    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        logger.info("OPENAI_API_KEY not set - use /api/search/index with OAuth for manual indexing")
        return 0

    indexed_count = 0
    embedding_service = EmbeddingService(
        api_key=settings.OPENAI_API_KEY,
        model=settings.EMBEDDING_MODEL,
        dimensions=settings.EMBEDDING_DIMENSION,
    )

    for i in range(0, len(note_ids), batch_size):
        batch = note_ids[i : i + batch_size]
        async with async_session_factory() as session:
            indexer = NoteIndexer(session=session, embedding_service=embedding_service)
            result = await indexer.index_notes(batch)
            await session.commit()
            indexed_count += result.indexed
            logger.info(
                "Indexed batch %d-%d: %d indexed, %d skipped, %d failed",
                i,
                i + len(batch),
                result.indexed,
                result.skipped,
                result.failed,
            )

    return indexed_count


async def _run_sync_background(state: SyncState) -> None:
    """Execute the full synchronisation and update *state* accordingly.

    This function is designed to run as a background task. It catches
    all exceptions so that the sync state is always updated even on
    failure.

    Args:
        state: The :class:`SyncState` instance to update.
    """
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models import Note
    from app.services.activity_log import log_activity

    state.status = "syncing"
    state.is_syncing = True
    state.error_message = None
    state.notes_indexed = None
    await log_activity("sync", "started", triggered_by=state.triggered_by)

    try:
        service, session, write_enabled = await _create_sync_service(user_id=state.user_id)
        state.write_enabled = write_enabled
        try:
            result = await service.sync_all()
            await session.commit()

            state.last_sync_at = result.synced_at.isoformat()
            state.notes_synced = result.total
            state.pushed_count = result.pushed
            state.conflicts_count = result.conflicts
            state.notes_missing_images = await _count_notes_missing_images()

            logger.info(
                "Sync completed: total=%d, added=%d, updated=%d, deleted=%d, pushed=%d, conflicts=%d",
                result.total,
                result.added,
                result.updated,
                result.deleted,
                result.pushed,
                result.conflicts,
            )

            # Phase 2: Index notes that need embeddings
            state.status = "indexing"
            state.notes_pending_index = await _count_notes_pending_index()

            if state.notes_pending_index > 0:
                logger.info("Starting embedding indexing for %d notes", state.notes_pending_index)

                async with async_session_factory() as index_session:
                    stmt = select(Note.id).where(
                        ~Note.id.in_(select(Note.id).join_from(Note, Note).where(Note.id.isnot(None)))
                    )
                    # Get notes without embeddings
                    from sqlalchemy import text

                    result_ids = await index_session.execute(
                        text("""
                            SELECT n.id FROM notes n
                            WHERE NOT EXISTS (
                                SELECT 1 FROM note_embeddings ne WHERE ne.note_id = n.id
                            )
                        """)
                    )
                    note_ids = [row[0] for row in result_ids.fetchall()]

                if note_ids:
                    state.notes_indexed = await _index_notes_batch(note_ids)
                    logger.info("Indexed %d notes", state.notes_indexed)
                else:
                    state.notes_indexed = 0

            state.notes_pending_index = await _count_notes_pending_index()

            # Refresh graph materialized view after indexing
            try:
                from app.services.graph_service import refresh_avg_embeddings
                from app.database import async_session_factory

                async with async_session_factory() as mv_session:
                    await refresh_avg_embeddings(mv_session)
            except Exception:
                logger.warning("Failed to refresh graph materialized view after sync", exc_info=True)

            state.status = "completed"
            state.error_message = None
            await log_activity(
                "sync",
                "completed",
                message=f"동기화 완료: {state.notes_synced}개 노트",
                details={
                    "added": result.added,
                    "updated": result.updated,
                    "deleted": result.deleted,
                    "pushed": result.pushed,
                    "conflicts": result.conflicts,
                    "total": result.total,
                    "notes_indexed": state.notes_indexed,
                },
                triggered_by=state.triggered_by,
            )

        finally:
            await session.close()

    except Exception as exc:
        state.status = "error"
        state.error_message = str(exc)
        logger.exception("Sync failed: %s", exc)
        await log_activity(
            "sync",
            "error",
            message=str(exc),
            triggered_by=state.triggered_by,
        )

    finally:
        state.is_syncing = False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/trigger", response_model=SyncTriggerResponse)
async def trigger_sync(
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> SyncTriggerResponse:
    """Manually trigger a NoteStation synchronisation.

    If a sync is already in progress, returns an ``already_syncing``
    status without starting a new one.

    Requires a valid Bearer access token.
    """
    lang = get_language(request)

    if _sync_state.is_syncing:
        return SyncTriggerResponse(
            status="already_syncing",
            message=msg("sync.trigger_already_running", lang),
        )

    _sync_state.triggered_by = current_user.get("username", "unknown")
    _sync_state.user_id = current_user.get("user_id")
    background_tasks.add_task(_run_sync_background, _sync_state)

    return SyncTriggerResponse(
        status="syncing",
        message=msg("sync.trigger_started", lang),
    )


@router.get("/status", response_model=SyncStatusResponse)
async def get_sync_status(
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> SyncStatusResponse:
    """Return the current synchronisation status.

    Requires a valid Bearer access token.
    """
    return SyncStatusResponse(
        status=_sync_state.status,
        last_sync_at=_sync_state.last_sync_at,
        notes_synced=_sync_state.notes_synced,
        error_message=_sync_state.error_message,
        notes_missing_images=_sync_state.notes_missing_images,
        notes_indexed=_sync_state.notes_indexed,
        notes_pending_index=_sync_state.notes_pending_index,
        pushed_count=_sync_state.pushed_count,
        conflicts_count=_sync_state.conflicts_count,
        write_enabled=_sync_state.write_enabled,
    )


# ---------------------------------------------------------------------------
# Single-note push sync
# ---------------------------------------------------------------------------


class NoteSyncResponse(BaseModel):
    """Response for a single-note push/pull sync."""

    status: str  # "success" | "error" | "skipped" | "conflict"
    message: str
    new_note_id: str | None = None  # Set when note ID changes (e.g. local → NAS)


# Keep alias for backward compatibility in type hints
NotePushResponse = NoteSyncResponse


@router.post("/push/{note_id}", response_model=NoteSyncResponse)
async def push_note(
    note_id: str,
    request: Request,
    force: bool = False,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NoteSyncResponse:
    """Push a single note to NAS (NoteStation).

    Only pushes if the note was locally modified. Checks NAS modification
    time to prevent overwriting newer remote changes.

    Args:
        force: If True, skip conflict checks and overwrite NAS.
    """
    from app.services.activity_log import log_activity

    lang = get_language(request)
    username = current_user.get("username", "unknown")

    # Fetch the note from local DB
    result = await db.execute(select(Note).where(Note.synology_note_id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail=msg("sync.note_not_found", lang))

    # Guard: only push if locally modified
    if not note.local_modified_at and not force:
        return NoteSyncResponse(
            status="skipped",
            message=msg("sync.push_skipped_detail", lang),
        )

    try:
        service, sync_session, write_enabled = await _create_sync_service()
    except Sync2FARequiredError:
        raise HTTPException(status_code=400, detail=msg("sync.2fa_required", lang))
    except Exception as exc:
        logger.exception("NAS connection failed: %s", exc)
        raise HTTPException(status_code=502, detail=msg("sync.nas_connection_failed", lang, detail=str(exc)))

    if not write_enabled:
        await sync_session.close()
        raise HTTPException(
            status_code=400,
            detail=msg("sync.no_write_permission", lang),
        )

    try:
        # Detect whether this note already exists on NAS
        is_new_note = False
        if not force:
            try:
                nas_note = await service._notestation.get_note(note.synology_note_id)
            except Exception:
                # Note doesn't exist on NAS — treat as new note
                is_new_note = True
                logger.info("push_note %s: note not found on NAS, will create", note_id)

            # Conflict check: was NAS modified AFTER our local edit?
            if not is_new_note:
                nas_mtime = nas_note.get("mtime")
                compare_dt = note.local_modified_at or note.source_updated_at
                if nas_mtime and compare_dt:
                    nas_dt = datetime.fromtimestamp(nas_mtime, tz=UTC)
                    if nas_dt > compare_dt:
                        from zoneinfo import ZoneInfo
                        from app.api.settings import get_timezone
                        nas_local = nas_dt.astimezone(ZoneInfo(get_timezone()))
                        await sync_session.close()
                        return NoteSyncResponse(
                            status="conflict",
                            message=msg("sync.push_conflict_detail", lang, time=nas_local.strftime('%m/%d %H:%M')),
                        )

        from app.synology_gateway.notestation import NoteStationService
        from app.utils.note_utils import inline_local_file_images, restore_nas_image_urls

        # Convert local images: /api/files/ -> data URI, /api/images/ -> NAS ref
        push_content = note.content_html or ""
        logger.info(
            "push_note %s: before transforms — nas-images=%d, images=%d, files=%d, placeholders=%d",
            note_id,
            push_content.count("/api/nas-images/"),
            push_content.count("/api/images/"),
            push_content.count("/api/files/"),
            push_content.count("notestation-image:"),
        )
        push_content = inline_local_file_images(push_content)
        logger.info(
            "push_note %s: after inline_local_file_images — data URIs=%d",
            note_id,
            push_content.count("data:image/"),
        )
        push_content = restore_nas_image_urls(push_content)
        logger.info(
            "push_note %s: after restore_nas_image_urls — NAS refs=%d, remaining /api/=%d",
            note_id,
            push_content.count("syno-notestation-image-object"),
            push_content.count("/api/"),
        )

        if is_new_note:
            # Resolve notebook name → NAS parent_id
            notebooks = await service._notestation.list_notebooks()
            name_to_id = {nb.get("title", ""): nb["object_id"] for nb in notebooks if "object_id" in nb}
            parent_id = name_to_id.get(note.notebook_name)
            if not parent_id:
                await sync_session.close()
                return NoteSyncResponse(
                    status="error",
                    message=msg("sync.push_error", lang, detail=f"Notebook '{note.notebook_name}' not found on NAS"),
                )

            result_data = await service._notestation.create_note(
                parent_id=parent_id,
                title=note.title,
                content=push_content,
            )
            # Update local note with NAS-assigned ID
            old_id = note.synology_note_id
            new_nas_id = result_data.get("object_id", old_id)
            note.synology_note_id = new_nas_id
            logger.info("push_note: created on NAS, old_id=%s → new_id=%s", old_id, new_nas_id)
        else:
            await service._notestation.update_note(
                object_id=note.synology_note_id,
                title=note.title,
                content=push_content,
            )

        # Fetch updated note from NAS to get new version hash, content & attachment metadata
        # NAS converts data URIs to NAS attachments, so we need the canonical NAS content
        try:
            nas_note = await service._notestation.get_note(note.synology_note_id)
            if nas_note.get("ver"):
                note.nas_ver = nas_note["ver"]
            if nas_note.get("link_id"):
                note.link_id = nas_note["link_id"]
            if nas_note.get("mtime"):
                note.source_updated_at = datetime.fromtimestamp(nas_note["mtime"], tz=UTC)
            # Use NAS content (canonical format with NAS refs instead of data URIs)
            if nas_note.get("content"):
                push_content = nas_note["content"]
                logger.info(
                    "push_note %s: NAS re-fetch — refs=%d, data URIs=%d",
                    note_id,
                    push_content.count('ref="'),
                    push_content.count("data:image/"),
                )
        except Exception:
            logger.warning("Failed to fetch updated note %s after push", note.synology_note_id)
            note.source_updated_at = datetime.now(UTC)

        # Mark as synced and store NAS-format content in DB
        # Extract data URI images the NAS may have left in the content
        from app.utils.note_utils import extract_data_uri_images
        push_content = extract_data_uri_images(push_content)
        note.content_html = push_content
        note.content_text = NoteStationService.extract_text(push_content)
        note.sync_status = "synced"
        note.local_modified_at = None
        await db.commit()

        await log_activity(
            "sync",
            "note_pushed",
            message=f"노트 '{note.title}' NAS 동기화 완료",
            details={"note_id": note_id},
            triggered_by=username,
        )

        # Include new_note_id if the ID changed (local → NAS)
        changed_id = note.synology_note_id if note.synology_note_id != note_id else None
        return NoteSyncResponse(
            status="success",
            message=msg("sync.push_success_detail", lang, title=note.title),
            new_note_id=changed_id,
        )

    except Exception as exc:
        logger.exception("Failed to push note %s: %s", note_id, exc)
        return NoteSyncResponse(
            status="error",
            message=msg("sync.push_error", lang, detail=str(exc)),
        )

    finally:
        await sync_session.close()


# ---------------------------------------------------------------------------
# Single-note pull sync (NAS → local)
# ---------------------------------------------------------------------------


@router.post("/pull/{note_id}", response_model=NoteSyncResponse)
async def pull_note(
    note_id: str,
    request: Request,
    force: bool = False,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NoteSyncResponse:
    """Pull a single note from NAS (NoteStation) into local DB.

    Fetches the latest version from NAS and updates the local note.
    If the local note has unsaved modifications, returns a conflict
    unless ``force=True``.

    Args:
        force: If True, overwrite local modifications with NAS version.
    """
    from app.services.activity_log import log_activity
    from app.synology_gateway.notestation import NoteStationService
    from app.utils.note_utils import extract_data_uri_images

    lang = get_language(request)
    username = current_user.get("username", "unknown")

    # Fetch the note from local DB
    result = await db.execute(select(Note).where(Note.synology_note_id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail=msg("sync.note_not_found", lang))

    # Guard: protect local modifications
    if note.local_modified_at and not force:
        return NoteSyncResponse(
            status="conflict",
            message=msg("sync.pull_conflict_prompt", lang),
        )

    try:
        service, sync_session, _write_enabled = await _create_sync_service()
    except Sync2FARequiredError:
        raise HTTPException(status_code=400, detail=msg("sync.2fa_required", lang))
    except Exception as exc:
        logger.exception("NAS connection failed: %s", exc)
        raise HTTPException(status_code=502, detail=msg("sync.nas_connection_failed", lang, detail=str(exc)))

    try:
        nas_note = await service._notestation.get_note(note.synology_note_id)

        # Check if NAS has newer content
        nas_mtime = nas_note.get("mtime")
        if nas_mtime and note.source_updated_at and not force:
            nas_dt = datetime.fromtimestamp(nas_mtime, tz=UTC)
            if nas_dt <= note.source_updated_at:
                return NoteSyncResponse(
                    status="skipped",
                    message=msg("sync.pull_no_changes", lang),
                )

        # Update local note with NAS data
        content_html = nas_note.get("content", "")
        # Extract data URI images to local files (rehype-raw can't parse huge data URIs)
        content_html = extract_data_uri_images(content_html)
        note.title = nas_note.get("title", note.title)
        note.content_html = content_html
        note.content_text = NoteStationService.extract_text(content_html)

        # Update tags
        tag_raw = nas_note.get("tag")
        if isinstance(tag_raw, dict):
            note.tags = list(tag_raw.values()) if tag_raw else None
        elif isinstance(tag_raw, list):
            note.tags = tag_raw if tag_raw else None

        # Update timestamps
        if nas_note.get("ctime"):
            note.source_created_at = datetime.fromtimestamp(nas_note["ctime"], tz=UTC)
        if nas_mtime:
            note.source_updated_at = datetime.fromtimestamp(nas_mtime, tz=UTC)

        # Update NAS metadata (link_id, ver) for image proxy URLs
        if nas_note.get("link_id"):
            note.link_id = nas_note["link_id"]
        if nas_note.get("ver"):
            note.nas_ver = nas_note["ver"]

        # Clear local modification state
        note.sync_status = "synced"
        note.local_modified_at = None
        note.remote_conflict_data = None
        note.synced_at = datetime.now(UTC)

        await db.commit()

        await log_activity(
            "sync",
            "note_pulled",
            message=f"노트 '{note.title}' NAS에서 가져오기 완료",
            details={"note_id": note_id},
            triggered_by=username,
        )

        return NoteSyncResponse(
            status="success",
            message=msg("sync.pull_success_detail", lang, title=note.title),
        )

    except Exception as exc:
        logger.exception("Failed to pull note %s: %s", note_id, exc)
        return NoteSyncResponse(
            status="error",
            message=msg("sync.pull_error", lang, detail=str(exc)),
        )

    finally:
        await sync_session.close()
