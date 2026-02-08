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

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel

from app.services.auth_service import get_current_user

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


# Module-level singleton -- shared across requests.
_sync_state = SyncState()


# ---------------------------------------------------------------------------
# Background sync runner
# ---------------------------------------------------------------------------


async def _create_sync_service() -> tuple:
    """Create a SyncService instance with database session.

    Returns:
        A tuple of (SyncService, AsyncSession) so the caller can manage
        the session lifecycle.

    Raises:
        Any exception from session creation or service instantiation.
    """
    from app.api.settings import get_nas_config
    from app.database import async_session_factory
    from app.services.sync_service import SyncService
    from app.synology_gateway.client import SynologyClient
    from app.synology_gateway.notestation import NoteStationService

    nas = get_nas_config()
    session = async_session_factory()

    client = SynologyClient(
        url=nas["url"],
        user=nas["user"],
        password=nas["password"],
    )
    await client.login()

    notestation = NoteStationService(client)
    service = SyncService(notestation=notestation, db=session)

    return service, session


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

    state.status = "syncing"
    state.is_syncing = True
    state.error_message = None
    state.notes_indexed = None

    try:
        service, session = await _create_sync_service()
        try:
            result = await service.sync_all()
            await session.commit()

            state.last_sync_at = result.synced_at.isoformat()
            state.notes_synced = result.total
            state.notes_missing_images = await _count_notes_missing_images()

            logger.info(
                "Sync completed: total=%d, added=%d, updated=%d, deleted=%d",
                result.total,
                result.added,
                result.updated,
                result.deleted,
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
            state.status = "completed"
            state.error_message = None

        finally:
            await session.close()

    except Exception as exc:
        state.status = "error"
        state.error_message = str(exc)
        logger.exception("Sync failed: %s", exc)

    finally:
        state.is_syncing = False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/trigger", response_model=SyncTriggerResponse)
async def trigger_sync(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> SyncTriggerResponse:
    """Manually trigger a NoteStation synchronisation.

    If a sync is already in progress, returns an ``already_syncing``
    status without starting a new one.

    Requires a valid Bearer access token.
    """
    if _sync_state.is_syncing:
        return SyncTriggerResponse(
            status="already_syncing",
            message="이미 동기화가 진행 중입니다.",
        )

    background_tasks.add_task(_run_sync_background, _sync_state)

    return SyncTriggerResponse(
        status="syncing",
        message="동기화를 시작합니다.",
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
    )
