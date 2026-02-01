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

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.services.auth_service import get_current_user
from app.synology_gateway.client import SynologyApiError, SynologyClient
from app.synology_gateway.notestation import NoteStationService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["notes"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class NoteItem(BaseModel):
    """Summary representation of a note (without content)."""

    note_id: str
    title: str
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


class NoteDetailResponse(NoteItem):
    """Full note detail including content."""

    content: str


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


def _unix_to_iso(ts: int | float | None) -> str | None:
    """Convert a Unix timestamp to an ISO-8601 string, or None."""
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=UTC).isoformat()


def _note_to_item(raw: dict) -> NoteItem:
    """Convert a raw Synology note dict to a NoteItem schema.

    Args:
        raw: Dictionary with object_id, title, parent_id, tag, ctime, mtime.

    Returns:
        Populated NoteItem instance.
    """
    return NoteItem(
        note_id=raw.get("object_id", ""),
        title=raw.get("title", ""),
        notebook=raw.get("parent_id"),
        tags=raw.get("tag", []) or [],
        created_at=_unix_to_iso(raw.get("ctime")),
        updated_at=_unix_to_iso(raw.get("mtime")),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/notes", response_model=NoteListResponse)
async def list_notes(
    offset: int = Query(0, ge=0, description="Number of notes to skip"),
    limit: int = Query(50, ge=1, le=200, description="Maximum notes to return"),
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ns_service: NoteStationService = Depends(_get_ns_service),  # noqa: B008
) -> NoteListResponse:
    """Retrieve a paginated list of notes.

    Requires JWT authentication via Bearer token.

    Args:
        offset: Pagination offset.
        limit: Page size (max 200).
        current_user: Injected authenticated user.
        ns_service: Injected NoteStation service.

    Returns:
        Paginated response with note items, offset, limit, and total count.
    """
    data = await ns_service.list_notes(offset=offset, limit=limit)
    raw_notes = data.get("notes", [])
    total = data.get("total", 0)

    items = [_note_to_item(n) for n in raw_notes]

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
) -> NoteDetailResponse:
    """Retrieve a single note by ID, including its full content.

    Requires JWT authentication via Bearer token.

    Args:
        note_id: The unique note identifier.
        current_user: Injected authenticated user.
        ns_service: Injected NoteStation service.

    Returns:
        Full note detail with content.

    Raises:
        HTTPException 404: If the note is not found.
    """
    try:
        note = await ns_service.get_note(note_id)
    except SynologyApiError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Note not found: {note_id}",
        ) from None

    return NoteDetailResponse(
        note_id=note.get("object_id", note_id),
        title=note.get("title", ""),
        notebook=note.get("parent_id"),
        tags=note.get("tag", []) or [],
        created_at=_unix_to_iso(note.get("ctime")),
        updated_at=_unix_to_iso(note.get("mtime")),
        content=note.get("content", ""),
    )


@router.get("/notebooks", response_model=NotebooksListResponse)
async def list_notebooks(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ns_service: NoteStationService = Depends(_get_ns_service),  # noqa: B008
) -> NotebooksListResponse:
    """Retrieve all notebooks.

    Requires JWT authentication via Bearer token.

    Returns:
        NotebooksListResponse with notebook items mapped from Synology data.
    """
    raw_notebooks = await ns_service.list_notebooks()
    items = [
        NotebookItem(
            name=nb.get("title", ""),
            note_count=nb.get("note_count", 0),
        )
        for nb in raw_notebooks
    ]
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
