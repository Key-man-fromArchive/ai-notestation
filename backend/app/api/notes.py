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

import base64
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import NoteImage
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

    name: str
    url: str


class NoteDetailResponse(NoteItem):
    """Full note detail including content."""

    content: str
    attachments: list[AttachmentItem] = []


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


def _normalize_tags(raw: dict) -> list[str]:
    """Normalize Synology tag field to a flat list of strings.

    Synology may return tags as a list, a dict, or None.
    """
    tag_raw = raw.get("tag", [])
    if isinstance(tag_raw, dict):
        return list(tag_raw.values()) if tag_raw else []
    if isinstance(tag_raw, list):
        return tag_raw
    return []


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
        tags=_normalize_tags(raw),
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
    notebook: str | None = Query(None, description="Filter by notebook name"),
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ns_service: NoteStationService = Depends(_get_ns_service),  # noqa: B008
) -> NoteListResponse:
    """Retrieve a paginated list of notes.

    Requires JWT authentication via Bearer token.

    Args:
        offset: Pagination offset.
        limit: Page size (max 200).
        notebook: Optional notebook name to filter by.
        current_user: Injected authenticated user.
        ns_service: Injected NoteStation service.

    Returns:
        Paginated response with note items, offset, limit, and total count.
    """
    # Build notebook_map: object_id -> title for human-readable notebook names
    notebook_map: dict[str, str] = {}
    try:
        raw_notebooks = await ns_service.list_notebooks()
        notebook_map = {
            nb.get("object_id", ""): nb.get("title", "")
            for nb in raw_notebooks
            if nb.get("object_id")
        }
    except Exception:
        logger.warning("Failed to fetch notebooks for name resolution")

    # Synology NoteStation API has a bug: when offset/limit are passed,
    # the returned `total` equals the returned note count, not the true total.
    # Workaround: always fetch ALL notes first (no params), then slice locally.
    all_data = await ns_service.list_notes()
    all_notes = all_data.get("notes", [])

    if notebook:
        # Resolve notebook name → object_id(s)
        target_ids = {
            oid for oid, name in notebook_map.items() if name == notebook
        }
        if not target_ids:
            return NoteListResponse(items=[], offset=offset, limit=limit, total=0)

        # Filter by parent_id
        filtered = [n for n in all_notes if n.get("parent_id") in target_ids]
        total = len(filtered)
        page = filtered[offset : offset + limit]
        items = [_note_to_item(n, notebook_map) for n in page]
    else:
        total = len(all_notes)
        page = all_notes[offset : offset + limit]
        items = [_note_to_item(n, notebook_map) for n in page]

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
            nb_map = {
                nb.get("object_id", ""): nb.get("title", "")
                for nb in raw_notebooks
                if nb.get("object_id")
            }
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
        result = await db.execute(
            select(NoteImage).where(NoteImage.synology_note_id == note_id)
        )
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
        tags=_normalize_tags(note),
        created_at=_unix_to_iso(note.get("ctime")),
        updated_at=_unix_to_iso(note.get("mtime")),
        content=_rewrite_image_urls(note.get("content", ""), note_id, att_lookup, image_map),
        attachments=attachments,
    )


@router.get("/notebooks", response_model=NotebooksListResponse)
async def list_notebooks(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ns_service: NoteStationService = Depends(_get_ns_service),  # noqa: B008
) -> NotebooksListResponse:
    """Retrieve all notebooks with computed note counts.

    Synology may not return accurate ``note_count`` values, so we
    fetch a page of notes and count per ``parent_id`` ourselves.

    Requires JWT authentication via Bearer token.

    Returns:
        NotebooksListResponse with notebook items and computed counts.
    """
    raw_notebooks = await ns_service.list_notebooks()

    # Compute note counts per notebook by fetching ALL notes (no params).
    # Synology API returns wrong totals when offset/limit are passed.
    note_counts: dict[str, int] = {}
    try:
        notes_data = await ns_service.list_notes()
        for note in notes_data.get("notes", []):
            parent_id = note.get("parent_id", "")
            if parent_id:
                note_counts[parent_id] = note_counts.get(parent_id, 0) + 1
    except Exception:
        logger.warning("Failed to compute notebook note counts")

    items = [
        NotebookItem(
            name=nb.get("title", ""),
            note_count=note_counts.get(nb.get("object_id", ""), nb.get("note_count", 0)),
        )
        for nb in raw_notebooks
        if nb.get("title", "").strip()  # skip empty-named notebooks
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
# We replace these <img> tags with placeholder markers that the frontend
# renders as styled image cards showing the filename and dimensions.

_NOTESTATION_IMG_RE = re.compile(
    r'<img\b[^>]*?\bref="([^"]+)"[^>]*/?>',
    re.IGNORECASE,
)


def _rewrite_image_urls(
    html: str,
    note_id: str,
    attachment_lookup: dict[str, dict] | None = None,
    image_map: dict[str, "NoteImage"] | None = None,
) -> str:
    """Replace NoteStation image tags with either real image URLs or placeholders.

    If an image has been extracted from an NSX export and exists in the database,
    we produce an ``<img src="/api/images/{note_id}/{ref}">`` tag. Otherwise,
    we produce a placeholder ``<img alt="notestation-image:...">`` tag for the
    frontend to render as a styled card.

    Args:
        html: HTML content from NoteStation.
        note_id: The note's object_id for constructing image URLs.
        attachment_lookup: Dict mapping attachment refs/IDs to metadata dicts
                           with keys like ``name``, ``width``, ``height``.
        image_map: Dict mapping image refs to NoteImage DB records (if available).
    """
    if not html:
        return html

    def _replace(match: re.Match) -> str:
        ref_b64 = match.group(1)
        try:
            decoded_name = base64.b64decode(ref_b64).decode("utf-8")
        except Exception:
            decoded_name = "image"

        # Look up attachment metadata for a human-readable name & dimensions
        display_name = decoded_name
        width = ""
        height = ""
        if attachment_lookup:
            for att in attachment_lookup.values():
                if not isinstance(att, dict):
                    continue
                if att.get("ref") == decoded_name or att.get("name") == decoded_name:
                    display_name = att.get("name", decoded_name)
                    if att.get("width"):
                        width = str(att["width"])
                    if att.get("height"):
                        height = str(att["height"])
                    break

        # Check if we have an extracted image for this ref
        img_record = None
        if image_map:
            # Direct lookup by decoded name or attachment name
            img_record = image_map.get(decoded_name)
            # Decoded name may have a timestamp prefix (e.g. "1770102482260ns_attach_...")
            # Try matching by suffix against known image names
            if not img_record:
                for candidate in image_map.values():
                    if candidate.name and decoded_name.endswith(candidate.name):
                        img_record = candidate
                        break

        if img_record:
            # Use dimensions from DB if available (more reliable than attachment metadata)
            if img_record.width:
                width = str(img_record.width)
            if img_record.height:
                height = str(img_record.height)

            # Produce a real <img> tag with API URL
            # Use the DB ref (NSX attachment key) for the URL path
            from urllib.parse import quote
            safe_ref = quote(img_record.ref, safe="")
            parts = [f'<img src="/api/images/{note_id}/{safe_ref}"']
            parts.append(f' alt="{display_name}"')
            if width:
                parts.append(f' width="{width}"')
            if height:
                parts.append(f' height="{height}"')
            parts.append(' class="notestation-image" loading="lazy" />')
            return "".join(parts)

        # No extracted image available - produce a placeholder
        parts = [f'<img alt="notestation-image:{display_name}"']
        if width:
            parts.append(f' width="{width}"')
        if height:
            parts.append(f' height="{height}"')
        parts.append(" />")
        return "".join(parts)

    return _NOTESTATION_IMG_RE.sub(_replace, html)
