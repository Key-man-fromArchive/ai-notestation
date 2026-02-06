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

import logging
from datetime import UTC, datetime
from uuid import uuid4

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import Note, NoteAttachment, NoteImage
from app.services.auth_service import get_current_user
from app.synology_gateway.client import SynologyApiError, SynologyClient
from app.synology_gateway.notestation import NoteStationService
from app.utils.datetime_utils import datetime_to_iso, unix_to_iso
from app.utils.note_utils import (
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


class NoteDetailResponse(NoteItem):
    """Full note detail including content."""

    content: str
    attachments: list[AttachmentItem] = []


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


class NotebookItem(BaseModel):
    """Summary representation of a notebook."""

    name: str
    note_count: int = 0


class NotebooksListResponse(BaseModel):
    """List of notebooks."""

    items: list[NotebookItem]


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
        )
        for att in attachments
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
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NoteListResponse:
    """Retrieve a paginated list of notes.

    Requires JWT authentication via Bearer token.

    Args:
        offset: Pagination offset.
        limit: Page size (max 200).
        notebook: Optional notebook name to filter by.
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


@router.get("/notes/{note_id}", response_model=NoteDetailResponse)
async def get_note(
    note_id: str,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ns_service: NoteStationService = Depends(_get_ns_service),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NoteDetailResponse:
    """Retrieve a single note by ID, including its full content.

    Requires JWT authentication via Bearer token.

    Args:
        note_id: The unique note identifier.
        current_user: Injected authenticated user.
        ns_service: Injected NoteStation service.
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

        content = rewrite_image_urls(
            db_note.content_html or "",
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
        )

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
        content=rewrite_image_urls(note.get("content", ""), note_id, att_lookup, image_map),
        attachments=attachments,
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
        synced_at=now,
    )
    db.add(note)
    await db.flush()

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

    note.source_updated_at = datetime.now(UTC)

    return NoteDetailResponse(
        note_id=note.synology_note_id,
        title=note.title,
        snippet=truncate_snippet(note.content_text),
        notebook=note.notebook_name,
        tags=normalize_db_tags(note.tags),
        created_at=datetime_to_iso(note.source_created_at),
        updated_at=datetime_to_iso(note.source_updated_at),
        content=note.content_html,
        attachments=await _load_note_attachments(db, note.id),
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


@router.get("/notebooks", response_model=NotebooksListResponse)
async def list_notebooks(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NotebooksListResponse:
    """Retrieve all notebooks with computed note counts.

    Synology may not return accurate ``note_count`` values, so we
    fetch a page of notes and count per ``parent_id`` ourselves.

    Requires JWT authentication via Bearer token.

    Returns:
        NotebooksListResponse with notebook items and computed counts.
    """
    stmt = (
        select(Note.notebook_name, func.count())
        .where(Note.notebook_name.is_not(None))
        .where(Note.notebook_name != "")
        .group_by(Note.notebook_name)
        .order_by(Note.notebook_name.asc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    items = [NotebookItem(name=row[0], note_count=int(row[1] or 0)) for row in rows]
    return NotebooksListResponse(items=items)


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
