# @TASK P4-T4.2 - Notes API endpoints
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#notes-api

"""Notes API endpoints for LabNote AI.

Provides read-only proxy endpoints to the Synology NoteStation API,
protected by JWT authentication.

Endpoints:
- ``GET /notes``            -- Paginated note list
- ``GET /notes/{note_id}``  -- Single note detail (with content)
- ``GET /notebooks``        -- Notebook list
- ``GET /tags``             -- Tag list
- ``GET /todos``            -- Todo list
- ``GET /shortcuts``        -- Shortcut list
- ``GET /smart``            -- Smart note list
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import and_, func, select, text
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import async_session_factory, get_db
from app.models import Note, NoteAttachment, NoteImage
from app.services.activity_log import get_trigger_name, log_activity
from app.services.auth_service import get_current_user
from app.services.related_notes import RelatedNotesService
from app.synology_gateway.client import SynologyApiError, SynologyClient
from app.synology_gateway.notestation import NoteStationService
from app.utils.datetime_utils import datetime_to_iso, unix_to_iso
from app.utils.note_utils import (
    extract_data_uri_images,
    normalize_db_tags,
    normalize_tags,
    rewrite_image_urls,
    truncate_snippet,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["notes"])
settings = get_settings()


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class NoteItem(BaseModel):
    """Summary representation of a note (without content)."""

    note_id: str
    title: str
    snippet: str = ""
    notebook: str | None = None
    tags: list[str] = []
    created_at: str | None = None
    updated_at: str | None = None
    sync_status: str | None = None


class NoteListResponse(BaseModel):
    """Paginated list of notes."""

    items: list[NoteItem]
    offset: int
    limit: int
    total: int


class AttachmentItem(BaseModel):
    """Attachment metadata for a note."""

    file_id: str | None = None
    name: str
    url: str
    extraction_status: str | None = None
    page_count: int | None = None


class NoteImageItem(BaseModel):
    """NoteImage metadata for a note (NSX extracted images)."""

    id: int
    synology_note_id: str
    ref: str
    name: str
    file_path: str
    mime_type: str
    extraction_status: str | None = None
    extracted_text: str | None = None
    vision_status: str | None = None
    vision_description: str | None = None


class NoteDetailResponse(NoteItem):
    """Full note detail including content."""

    content: str
    attachments: list[AttachmentItem] = []
    images: list[NoteImageItem] = []


class NoteCreateRequest(BaseModel):
    """Request payload for creating a note."""

    title: str
    content: str
    content_json: dict | None = None
    notebook: str | None = None
    tags: list[str] | None = None


class NoteUpdateRequest(BaseModel):
    """Request payload for updating a note."""

    title: str | None = None
    content: str | None = None
    content_json: dict | None = None
    notebook: str | None = None
    tags: list[str] | None = None



class RelatedNoteItemResponse(BaseModel):
    note_id: str
    title: str
    snippet: str
    similarity: float
    notebook: str | None = None


class RelatedNotesResponse(BaseModel):
    items: list[RelatedNoteItemResponse]


# ---------------------------------------------------------------------------
# Dependency: NoteStationService factory
# ---------------------------------------------------------------------------


def _get_ns_service() -> NoteStationService:
    """Create a NoteStationService using app settings.

    This function is extracted to allow easy mocking in tests.
    The SynologyClient is created with NAS credentials from the
    settings store (which respects runtime UI overrides).

    Returns:
        A NoteStationService wrapping an authenticated SynologyClient.
    """
    from app.api.settings import get_nas_config

    nas = get_nas_config()
    client = SynologyClient(
        url=nas["url"],
        user=nas["user"],
        password=nas["password"],
    )
    return NoteStationService(client)


# ---------------------------------------------------------------------------
# Helper: map raw Synology note dict to NoteItem
# ---------------------------------------------------------------------------


def _model_to_item(note: Note) -> NoteItem:
    """Convert a Note ORM model to a NoteItem schema."""
    updated_at = note.source_updated_at or note.updated_at
    created_at = note.source_created_at or note.created_at

    return NoteItem(
        note_id=note.synology_note_id,
        title=note.title,
        snippet=truncate_snippet(note.content_text),
        notebook=note.notebook_name,
        tags=normalize_db_tags(note.tags),
        created_at=datetime_to_iso(created_at),
        updated_at=datetime_to_iso(updated_at),
        sync_status=note.sync_status,
    )


async def _load_note_attachments(
    db: AsyncSession,
    note_id: int,
) -> list[AttachmentItem]:
    result = await db.execute(select(NoteAttachment).where(NoteAttachment.note_id == note_id))
    attachments = result.scalars().all()
    return [
        AttachmentItem(
            file_id=att.file_id,
            name=att.name,
            url=f"/api/files/{att.file_id}",
            extraction_status=att.extraction_status,
            page_count=att.page_count,
        )
        for att in attachments
    ]


async def _load_note_images(
    db: AsyncSession,
    synology_note_id: str,
) -> list[NoteImageItem]:
    """Load NoteImages (NSX extracted images) for a note."""
    result = await db.execute(
        select(NoteImage).where(NoteImage.synology_note_id == synology_note_id)
    )
    images = result.scalars().all()
    return [
        NoteImageItem(
            id=img.id,
            synology_note_id=img.synology_note_id,
            ref=img.ref,
            name=img.name,
            file_path=img.file_path,
            mime_type=img.mime_type,
            extraction_status=img.extraction_status,
            extracted_text=img.extracted_text,
            vision_status=img.vision_status,
            vision_description=img.vision_description,
        )
        for img in images
    ]


def _parse_attachments(note_data: dict) -> list[AttachmentItem]:
    """Parse Synology attachment field into AttachmentItem list.

    Synology may return attachments as a dict (keyed by unique ID) or a list.

    Args:
        note_data: Raw note dict from Synology.
    """
    raw = note_data.get("attachment")
    if not raw:
        return []

    # Normalize to list of dicts
    if isinstance(raw, dict):
        entries = list(raw.values())
    elif isinstance(raw, list):
        entries = raw
    else:
        return []

    items: list[AttachmentItem] = []
    for att in entries:
        if not isinstance(att, dict):
            continue
        name = att.get("name", att.get("file_name", ""))
        if name:
            items.append(AttachmentItem(name=name, url=""))
    return items


def _note_to_item(raw: dict, notebook_map: dict[str, str] | None = None) -> NoteItem:
    """Convert a raw Synology note dict to a NoteItem schema.

    Args:
        raw: Dictionary with object_id, title, parent_id, tag, ctime, mtime, brief.
        notebook_map: Optional mapping of parent_id (UUID) to notebook name.

    Returns:
        Populated NoteItem instance.
    """
    parent_id = raw.get("parent_id")
    notebook_name = None
    if notebook_map and parent_id:
        notebook_name = notebook_map.get(parent_id, parent_id)
    elif parent_id:
        notebook_name = parent_id

    return NoteItem(
        note_id=raw.get("object_id", ""),
        title=raw.get("title", ""),
        snippet=raw.get("brief", ""),
        notebook=notebook_name,
        tags=normalize_tags(raw),
        created_at=unix_to_iso(raw.get("ctime")),
        updated_at=unix_to_iso(raw.get("mtime")),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/notes", response_model=NoteListResponse)
async def list_notes(
    offset: int = Query(0, ge=0, description="Number of notes to skip"),
    limit: int = Query(50, ge=1, le=200, description="Maximum notes to return"),
    notebook: str | None = Query(None, description="Filter by notebook name"),
    tag: str | None = Query(None, description="Filter by tag name"),
    empty_only: bool = Query(False, description="Filter to only empty notes (no title and no content)"),
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NoteListResponse:
    """Retrieve a paginated list of notes.

    Requires JWT authentication via Bearer token.

    Args:
        offset: Pagination offset.
        limit: Page size (max 200).
        notebook: Optional notebook name to filter by.
        tag: Optional tag name to filter by (JSONB array contains).
        empty_only: If True, only return notes with empty title and content.
        current_user: Injected authenticated user.
        db: Database session for local notes.

    Returns:
        Paginated response with note items, offset, limit, and total count.
    """
    count_stmt = select(func.count()).select_from(Note)
    stmt = select(Note)

    if notebook:
        count_stmt = count_stmt.where(Note.notebook_name == notebook)
        stmt = stmt.where(Note.notebook_name == notebook)

    if tag:
        tag_filter = Note.tags.contains([tag])
        count_stmt = count_stmt.where(tag_filter)
        stmt = stmt.where(tag_filter)

    if empty_only:
        empty_filter = and_(
            func.coalesce(func.trim(Note.title), "") == "",
            func.coalesce(func.trim(Note.content_text), "") == "",
        )
        count_stmt = count_stmt.where(empty_filter)
        stmt = stmt.where(empty_filter)

    stmt = stmt.order_by(
        Note.source_updated_at.desc().nulls_last(),
        Note.updated_at.desc().nulls_last(),
    )

    total_result = await db.execute(count_stmt)
    total = int(total_result.scalar_one())

    notes_result = await db.execute(stmt.offset(offset).limit(limit))
    notes = notes_result.scalars().all()
    items = [_model_to_item(note) for note in notes]

    return NoteListResponse(
        items=items,
        offset=offset,
        limit=limit,
        total=total,
    )


# ---------------------------------------------------------------------------
# Auto-Tagging State & Endpoints
# ---------------------------------------------------------------------------


@dataclass
class TaggingState:
    status: str = "idle"
    is_tagging: bool = False
    total: int = 0
    tagged: int = 0
    failed: int = 0
    error_message: str | None = None


_tagging_state = TaggingState()


class TagResponse(BaseModel):
    tags: list[str]


class TaggingTriggerResponse(BaseModel):
    status: str
    message: str


class TaggingStatusResponse(BaseModel):
    status: str
    total: int
    tagged: int
    failed: int
    error_message: str | None = None


class LocalTagItem(BaseModel):
    name: str
    count: int


async def _run_tagging_background(state: TaggingState) -> None:
    """Background task: auto-tag all untagged notes."""
    from app.services.auto_tagger import AutoTagger

    state.status = "tagging"
    state.is_tagging = True
    state.error_message = None
    state.tagged = 0
    state.failed = 0

    try:
        async with async_session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT id FROM notes
                    WHERE tags IS NULL OR tags = '[]'::jsonb
                """)
            )
            note_ids = [row[0] for row in result.fetchall()]
            state.total = len(note_ids)

        if not note_ids:
            state.status = "completed"
            state.is_tagging = False
            return

        tagger = AutoTagger()
        batch_size = 3
        for i in range(0, len(note_ids), batch_size):
            batch = note_ids[i : i + batch_size]
            for nid in batch:
                try:
                    async with async_session_factory() as session:
                        tags = await tagger.tag_note(nid, session)
                        await session.commit()
                        if tags:
                            state.tagged += 1
                        else:
                            state.failed += 1
                except Exception:
                    state.failed += 1
                    logger.exception("Failed to tag note %d", nid)
            await asyncio.sleep(1.0)

        state.status = "completed"

    except Exception as exc:
        state.status = "error"
        state.error_message = str(exc)
        logger.exception("Batch tagging failed: %s", exc)

    finally:
        state.is_tagging = False


@router.post("/notes/batch-auto-tag", response_model=TaggingTriggerResponse)
async def trigger_batch_auto_tag(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> TaggingTriggerResponse:
    """Trigger batch auto-tagging for all untagged notes."""
    if _tagging_state.is_tagging:
        return TaggingTriggerResponse(
            status="already_tagging",
            message="Batch auto-tagging is already in progress.",
        )

    background_tasks.add_task(_run_tagging_background, _tagging_state)

    return TaggingTriggerResponse(
        status="tagging",
        message="Batch auto-tagging started.",
    )


@router.get("/notes/batch-auto-tag/status", response_model=TaggingStatusResponse)
async def get_batch_auto_tag_status(
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> TaggingStatusResponse:
    """Get the current batch auto-tagging status."""
    return TaggingStatusResponse(
        status=_tagging_state.status,
        total=_tagging_state.total,
        tagged=_tagging_state.tagged,
        failed=_tagging_state.failed,
        error_message=_tagging_state.error_message,
    )


class ConflictItem(BaseModel):
    """A note with sync conflict, including both versions."""

    note_id: str
    title: str
    local_content: str
    local_updated_at: str | None = None
    remote_content: str
    remote_title: str
    remote_updated_at: str | None = None


class ConflictListResponse(BaseModel):
    """List of notes with sync conflicts."""

    items: list[ConflictItem]
    total: int


class ResolveConflictRequest(BaseModel):
    """Request to resolve a sync conflict."""

    resolution: str  # "keep_local" | "keep_remote"


@router.get("/notes/conflicts", response_model=ConflictListResponse)
async def list_conflicts(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> ConflictListResponse:
    """List all notes with sync conflicts (both local and remote versions)."""
    stmt = select(Note).where(Note.sync_status == "conflict")
    result = await db.execute(stmt)
    notes = result.scalars().all()

    items = []
    for note in notes:
        remote_data = note.remote_conflict_data or {}
        items.append(ConflictItem(
            note_id=note.synology_note_id,
            title=note.title,
            local_content=note.content_html or "",
            local_updated_at=datetime_to_iso(note.local_modified_at),
            remote_content=remote_data.get("content", ""),
            remote_title=remote_data.get("title", note.title),
            remote_updated_at=remote_data.get("source_updated_at"),
        ))

    return ConflictListResponse(items=items, total=len(items))


@router.post("/notes/{note_id}/resolve-conflict", response_model=NoteDetailResponse)
async def resolve_conflict(
    note_id: str,
    payload: ResolveConflictRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NoteDetailResponse:
    """Resolve a sync conflict by choosing local or remote version."""
    result = await db.execute(select(Note).where(Note.synology_note_id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Note not found: {note_id}")

    if note.sync_status != "conflict":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Note has no conflict to resolve")

    if payload.resolution == "keep_remote":
        remote_data = note.remote_conflict_data or {}
        if remote_data.get("title"):
            note.title = remote_data["title"]
        if remote_data.get("content"):
            note.content_html = remote_data["content"]
            note.content_text = NoteStationService.extract_text(remote_data["content"])
        note.sync_status = "synced"
        note.local_modified_at = None
    elif payload.resolution == "keep_local":
        note.sync_status = "local_modified"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="resolution must be 'keep_local' or 'keep_remote'",
        )

    note.remote_conflict_data = None

    await log_activity(
        "sync", "completed",
        message=f"충돌 해결 ({payload.resolution}): {note.title}",
        triggered_by=get_trigger_name(current_user),
    )

    return NoteDetailResponse(
        note_id=note.synology_note_id,
        title=note.title,
        snippet=truncate_snippet(note.content_text),
        notebook=note.notebook_name,
        tags=normalize_db_tags(note.tags),
        created_at=datetime_to_iso(note.source_created_at),
        updated_at=datetime_to_iso(note.local_modified_at or note.source_updated_at),
        content=note.content_html,
        attachments=await _load_note_attachments(db, note.id),
        images=await _load_note_images(db, note.synology_note_id) if note.synology_note_id else [],
        sync_status=note.sync_status,
    )


@router.post("/notes/{note_id}/auto-tag", response_model=TagResponse)
async def auto_tag_note(
    note_id: str,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> TagResponse:
    """Generate AI tags for a single note.

    Requires JWT authentication via Bearer token.
    """
    from app.services.auto_tagger import AutoTagger

    result = await db.execute(select(Note).where(Note.synology_note_id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Note not found: {note_id}")

    tagger = AutoTagger()
    tags = await tagger.tag_note(note.id, db)
    await db.commit()
    return TagResponse(tags=tags)


class BatchDeleteRequest(BaseModel):
    note_ids: list[str]


class BatchDeleteResponse(BaseModel):
    deleted: int
    failed: list[str]


@router.post("/notes/batch-delete", response_model=BatchDeleteResponse)
async def delete_notes_batch(
    request: BatchDeleteRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ns_service: NoteStationService = Depends(_get_ns_service),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> BatchDeleteResponse:
    """Delete multiple notes by their IDs (NAS + local DB).

    Requires JWT authentication via Bearer token.
    """
    deleted = 0
    failed: list[str] = []

    for note_id in request.note_ids:
        try:
            # Delete from NAS first
            try:
                await ns_service.delete_note(note_id)
            except Exception:
                logger.warning("NAS delete failed for note %s, continuing with local cleanup", note_id)

            # Delete NoteImage records (no FK cascade)
            await db.execute(
                sa_delete(NoteImage).where(NoteImage.synology_note_id == note_id)
            )

            # Delete Note record (cascades to embeddings, attachments, access, share links)
            result = await db.execute(select(Note).where(Note.synology_note_id == note_id))
            db_note = result.scalar_one_or_none()
            if db_note:
                await db.delete(db_note)
                deleted += 1
            else:
                failed.append(note_id)
        except Exception:
            logger.exception("Failed to delete note %s", note_id)
            failed.append(note_id)

    await db.commit()
    return BatchDeleteResponse(deleted=deleted, failed=failed)


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: str,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ns_service: NoteStationService = Depends(_get_ns_service),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> None:
    """Delete a single note (NAS + local DB).

    Requires JWT authentication via Bearer token.

    Args:
        note_id: The Synology note object_id.

    Raises:
        HTTPException 404: If the note is not found in local DB.
    """
    result = await db.execute(select(Note).where(Note.synology_note_id == note_id))
    db_note = result.scalar_one_or_none()
    if not db_note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Note not found: {note_id}",
        )

    # Delete from NAS
    try:
        await ns_service.delete_note(note_id)
    except Exception:
        logger.warning("NAS delete failed for note %s, continuing with local cleanup", note_id)

    # Delete NoteImage records (no FK cascade)
    await db.execute(
        sa_delete(NoteImage).where(NoteImage.synology_note_id == note_id)
    )

    # Delete Note record (cascades to embeddings, attachments, access, share links)
    await db.delete(db_note)
    await db.commit()


@router.get("/notes/{note_id}", response_model=NoteDetailResponse)
async def get_note(
    note_id: str,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ns_service: NoteStationService = Depends(_get_ns_service),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NoteDetailResponse:
    """Retrieve a single note by ID, including its full content.

    Requires JWT authentication via Bearer token.
    Local notes are served entirely from the DB (no NAS call).
    Notes not in local DB fall back to a NAS fetch via ns_service.

    Args:
        note_id: The unique note identifier.
        current_user: Injected authenticated user.
        ns_service: Injected NoteStation service (used only for fallback).
        db: Database session for image lookups.

    Returns:
        Full note detail with content.

    Raises:
        HTTPException 404: If the note is not found.
    """
    result = await db.execute(select(Note).where(Note.synology_note_id == note_id))
    db_note = result.scalar_one_or_none()

    if db_note:
        image_map: dict[str, NoteImage] = {}
        try:
            img_result = await db.execute(select(NoteImage).where(NoteImage.synology_note_id == note_id))
            for img in img_result.scalars():
                image_map[img.ref] = img
                if img.name:
                    image_map[img.name] = img
        except Exception:
            logger.warning("Failed to fetch images for note %s", note_id)

        raw_html = db_note.content_html or ""

        # Extract data URI images to local files (lazy migration).
        # rehype-raw (parse5) cannot handle very large data URI attributes,
        # so we save them as files and use /api/files/ URLs instead.
        if "data:image/" in raw_html:
            raw_html = extract_data_uri_images(raw_html)
            if raw_html != (db_note.content_html or ""):
                db_note.content_html = raw_html
                await db.commit()
                logger.info("Extracted data URI images for note %s", note_id)

        content = rewrite_image_urls(
            raw_html,
            note_id,
            attachment_lookup=None,
            image_map=image_map,
        )

        updated_at = db_note.source_updated_at or db_note.updated_at
        created_at = db_note.source_created_at or db_note.created_at

        return NoteDetailResponse(
            note_id=db_note.synology_note_id,
            title=db_note.title,
            snippet=truncate_snippet(db_note.content_text),
            notebook=db_note.notebook_name,
            tags=normalize_db_tags(db_note.tags),
            created_at=datetime_to_iso(created_at),
            updated_at=datetime_to_iso(updated_at),
            content=content,
            attachments=await _load_note_attachments(db, db_note.id),
            images=await _load_note_images(db, db_note.synology_note_id) if db_note.synology_note_id else [],
            sync_status=db_note.sync_status,
        )

    # Fallback: note not in local DB — fetch directly from NAS
    try:
        note = await ns_service.get_note(note_id)
    except SynologyApiError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Note not found: {note_id}",
        ) from None

    # Resolve notebook name from parent_id
    parent_id = note.get("parent_id")
    notebook_name = parent_id
    if parent_id:
        try:
            raw_notebooks = await ns_service.list_notebooks()
            nb_map = {nb.get("object_id", ""): nb.get("title", "") for nb in raw_notebooks if nb.get("object_id")}
            notebook_name = nb_map.get(parent_id, parent_id)
        except Exception:
            logger.warning("Failed to fetch notebooks for name resolution")

    attachments = _parse_attachments(note)

    # Build attachment lookup for image metadata resolution
    att_raw = note.get("attachment")
    att_lookup: dict[str, dict] = {}
    if isinstance(att_raw, dict):
        att_lookup = att_raw
    elif isinstance(att_raw, list):
        for a in att_raw:
            if isinstance(a, dict) and a.get("ref"):
                att_lookup[a["ref"]] = a

    # Fetch extracted images from database for this note
    image_map: dict[str, NoteImage] = {}
    try:
        result = await db.execute(select(NoteImage).where(NoteImage.synology_note_id == note_id))
        for img in result.scalars():
            image_map[img.ref] = img
            # Also index by name so content refs (which use name, not ref) can match
            if img.name:
                image_map[img.name] = img
    except Exception:
        logger.warning("Failed to fetch images for note %s", note_id)

    return NoteDetailResponse(
        note_id=note.get("object_id", note_id),
        title=note.get("title", ""),
        snippet=note.get("brief", ""),
        notebook=notebook_name,
        tags=normalize_tags(note),
        created_at=unix_to_iso(note.get("ctime")),
        updated_at=unix_to_iso(note.get("mtime")),
        content=rewrite_image_urls(
            extract_data_uri_images(note.get("content", "")),
            note_id,
            att_lookup,
            image_map,
            nas_attachments=att_lookup if att_lookup else None,
        ),
        attachments=attachments,
    )


@router.get("/notes/{note_id}/related", response_model=RelatedNotesResponse)
async def get_related_notes(
    note_id: str,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
    limit: int = Query(default=5, ge=1, le=20),
) -> RelatedNotesResponse:
    """Return notes semantically related to the given note."""
    service = RelatedNotesService(db)
    try:
        items = await service.get_related(note_id=note_id, limit=limit)
    except Exception:
        logger.exception("Related notes query failed for %s", note_id)
        return RelatedNotesResponse(items=[])

    return RelatedNotesResponse(
        items=[
            RelatedNoteItemResponse(
                note_id=item.note_id,
                title=item.title,
                snippet=item.snippet,
                similarity=item.similarity,
                notebook=item.notebook,
            )
            for item in items
        ]
    )


@router.post("/notes", response_model=NoteDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    payload: NoteCreateRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NoteDetailResponse:
    """Create a new note in the local database."""
    now = datetime.now(UTC)
    note_id = uuid4().hex
    content_html = payload.content
    content_text = NoteStationService.extract_text(content_html)

    note = Note(
        synology_note_id=note_id,
        title=payload.title,
        content_html=content_html,
        content_text=content_text,
        notebook_name=payload.notebook,
        tags=payload.tags or None,
        content_json=payload.content_json,
        is_todo=False,
        is_shortcut=False,
        source_created_at=now,
        source_updated_at=now,
        sync_status="local_modified",
        local_modified_at=now,
    )
    db.add(note)
    await db.flush()

    await log_activity(
        "note", "completed",
        message=f"노트 생성: {payload.title}",
        triggered_by=get_trigger_name(current_user),
    )

    return NoteDetailResponse(
        note_id=note.synology_note_id,
        title=note.title,
        snippet=truncate_snippet(note.content_text),
        notebook=note.notebook_name,
        tags=normalize_db_tags(note.tags),
        created_at=datetime_to_iso(note.source_created_at),
        updated_at=datetime_to_iso(note.source_updated_at),
        content=note.content_html,
        attachments=[],
    )


@router.put("/notes/{note_id}", response_model=NoteDetailResponse)
async def update_note(
    note_id: str,
    payload: NoteUpdateRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NoteDetailResponse:
    """Update an existing note in the local database."""
    result = await db.execute(select(Note).where(Note.synology_note_id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Note not found: {note_id}",
        )

    if payload.title is not None:
        note.title = payload.title
    if payload.content is not None:
        note.content_html = payload.content
        note.content_text = NoteStationService.extract_text(payload.content)
    if payload.content_json is not None:
        note.content_json = payload.content_json
    if payload.notebook is not None:
        note.notebook_name = payload.notebook
    if payload.tags is not None:
        note.tags = payload.tags

    # Track local modification for bidirectional sync
    # Do NOT touch source_updated_at — it only tracks the Synology mtime
    now = datetime.now(UTC)
    note.local_modified_at = now
    if note.sync_status == "synced":
        note.sync_status = "local_modified"

    await log_activity(
        "note", "completed",
        message=f"노트 수정: {note.title}",
        triggered_by=get_trigger_name(current_user),
    )

    return NoteDetailResponse(
        note_id=note.synology_note_id,
        title=note.title,
        snippet=truncate_snippet(note.content_text),
        notebook=note.notebook_name,
        tags=normalize_db_tags(note.tags),
        created_at=datetime_to_iso(note.source_created_at),
        updated_at=datetime_to_iso(note.local_modified_at or note.source_updated_at),
        content=note.content_html,
        attachments=await _load_note_attachments(db, note.id),
        images=await _load_note_images(db, note.synology_note_id) if note.synology_note_id else [],
        sync_status=note.sync_status,
    )


@router.post("/notes/{note_id}/attachments", response_model=AttachmentItem, status_code=status.HTTP_201_CREATED)
async def add_attachment(
    note_id: str,
    file: UploadFile = File(..., description="Attachment file"),
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AttachmentItem:
    """Upload a file and associate it with a note."""
    result = await db.execute(select(Note).where(Note.synology_note_id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Note not found: {note_id}",
        )

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required",
        )

    uploads_dir = Path(settings.UPLOADS_PATH)
    uploads_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(file.filename).suffix
    file_id = f"{uuid4().hex}{suffix}"
    target_path = uploads_dir / file_id

    try:
        with open(target_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"File upload failed: {exc}",
        ) from exc

    attachment = NoteAttachment(
        note_id=note.id,
        file_id=file_id,
        name=file.filename,
        mime_type=file.content_type,
    )
    db.add(attachment)
    await db.flush()

    await log_activity(
        "note", "completed",
        message=f"첨부 파일 추가: {file.filename}",
        details={"note_id": note_id},
        triggered_by=get_trigger_name(current_user),
    )

    return AttachmentItem(
        file_id=attachment.file_id,
        name=attachment.name,
        url=f"/api/files/{attachment.file_id}",
    )


@router.delete("/notes/{note_id}/attachments/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    note_id: str,
    file_id: str,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> None:
    """Remove an attachment from a note."""
    note_result = await db.execute(select(Note).where(Note.synology_note_id == note_id))
    note = note_result.scalar_one_or_none()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Note not found: {note_id}",
        )

    attachment_result = await db.execute(
        select(NoteAttachment).where(NoteAttachment.note_id == note.id).where(NoteAttachment.file_id == file_id)
    )
    attachment = attachment_result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found",
        )

    await db.delete(attachment)

    file_path = Path(settings.UPLOADS_PATH) / file_id
    if file_path.exists():
        file_path.unlink(missing_ok=True)

    await log_activity(
        "note", "completed",
        message="첨부 파일 삭제",
        details={"note_id": note_id, "file_id": file_id},
        triggered_by=get_trigger_name(current_user),
    )



@router.get("/tags")
async def list_tags(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ns_service: NoteStationService = Depends(_get_ns_service),  # noqa: B008
) -> list[dict]:
    """Retrieve all tags.

    Requires JWT authentication via Bearer token.

    Returns:
        List of tag dicts from NoteStation.
    """
    return await ns_service.list_tags()


@router.get("/tags/local", response_model=list[LocalTagItem])
async def list_local_tags(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> list[LocalTagItem]:
    """Retrieve all tags from local DB with counts.

    Returns tags extracted from the JSONB tags column, ordered by count desc.
    """
    result = await db.execute(
        text("""
            SELECT tag, COUNT(*) as cnt
            FROM (
                SELECT id, tags FROM notes
                WHERE tags IS NOT NULL AND jsonb_typeof(tags) = 'array'
            ) n, jsonb_array_elements_text(n.tags) AS tag
            GROUP BY tag
            ORDER BY cnt DESC, tag ASC
        """)
    )
    return [LocalTagItem(name=row[0], count=int(row[1])) for row in result.fetchall()]


@router.get("/todos")
async def list_todos(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ns_service: NoteStationService = Depends(_get_ns_service),  # noqa: B008
) -> list[dict]:
    """Retrieve all TODO items.

    Requires JWT authentication via Bearer token.

    Returns:
        List of todo dicts from NoteStation.
    """
    return await ns_service.list_todos()


@router.get("/shortcuts")
async def list_shortcuts(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ns_service: NoteStationService = Depends(_get_ns_service),  # noqa: B008
) -> list[dict]:
    """Retrieve all shortcuts.

    Requires JWT authentication via Bearer token.

    Returns:
        List of shortcut dicts from NoteStation.
    """
    return await ns_service.list_shortcuts()


@router.get("/smart")
async def list_smart(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ns_service: NoteStationService = Depends(_get_ns_service),  # noqa: B008
) -> list[dict]:
    """Retrieve all smart notes / smart folders.

    Requires JWT authentication via Bearer token.

    Returns:
        List of smart note dicts from NoteStation.
    """
    return await ns_service.list_smart()


# ---------------------------------------------------------------------------
# NoteStation image handling
# ---------------------------------------------------------------------------

# NoteStation embeds images as:
#   <img class="syno-notestation-image-object"
#        src="webman/3rdparty/NoteStation/images/transparent.gif"
#        ref="BASE64_ENCODED_IMAGE_NAME" />
#
# The ref attribute is base64-encoded and decodes to an image filename like:
#   1769648706702ns_attach_image_11331769648706699.png
#
# Synology NoteStation does NOT expose a public API for downloading embedded
# note images (streaming.cgi returns 500, method=streaming returns error 103).
