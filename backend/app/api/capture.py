"""External content capture API endpoints."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.notes import NoteDetailResponse
from app.database import get_db
from app.models import Note
from app.services.activity_log import get_trigger_name, log_activity
from app.services.auth_service import get_current_user
from app.services.capture_service import CaptureResult, CaptureService
from app.utils.datetime_utils import datetime_to_iso
from app.utils.note_utils import normalize_db_tags, truncate_snippet

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/capture", tags=["capture"])

_capture = CaptureService()


# ------------------------------------------------------------------
# Request schemas
# ------------------------------------------------------------------


class URLCaptureRequest(BaseModel):
    url: str
    notebook: str | None = None
    tags: list[str] | None = None


class ArxivCaptureRequest(BaseModel):
    arxiv_id: str
    notebook: str | None = None
    tags: list[str] | None = None


class PubmedCaptureRequest(BaseModel):
    pmid: str
    notebook: str | None = None
    tags: list[str] | None = None


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


async def _save_captured_note(
    result: CaptureResult,
    notebook: str | None,
    extra_tags: list[str] | None,
    current_user: dict,
    db: AsyncSession,
) -> NoteDetailResponse:
    """Create a Note from a CaptureResult and return the response."""
    now = datetime.now(UTC)
    note_id = uuid4().hex

    tags = list(result.tags)
    if extra_tags:
        tags.extend(t for t in extra_tags if t not in tags)

    note = Note(
        synology_note_id=note_id,
        title=result.title,
        content_html=result.content_html,
        content_text=result.content_text,
        notebook_name=notebook,
        tags=tags or None,
        content_json=result.metadata,
        is_todo=False,
        is_shortcut=False,
        source_created_at=now,
        source_updated_at=now,
        sync_status="local_modified",
        local_modified_at=now,
    )
    db.add(note)
    await db.flush()

    source = result.metadata.get("capture_source", "unknown")
    await log_activity(
        "note",
        "completed",
        message=f"외부 캡처({source}): {result.title}",
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


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@router.post("/url", response_model=NoteDetailResponse, status_code=status.HTTP_201_CREATED)
async def capture_url(
    payload: URLCaptureRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NoteDetailResponse:
    """Capture a web page and save as a note."""
    try:
        result = await _capture.capture_url(payload.url)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e
    except Exception as e:
        logger.exception("URL capture failed: %s", payload.url)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to fetch URL: {e}") from e

    return await _save_captured_note(result, payload.notebook, payload.tags, current_user, db)


@router.post("/arxiv", response_model=NoteDetailResponse, status_code=status.HTTP_201_CREATED)
async def capture_arxiv(
    payload: ArxivCaptureRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NoteDetailResponse:
    """Capture an arXiv paper and save as a note."""
    try:
        result = await _capture.capture_arxiv(payload.arxiv_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e
    except Exception as e:
        logger.exception("arXiv capture failed: %s", payload.arxiv_id)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to fetch arXiv: {e}") from e

    return await _save_captured_note(result, payload.notebook, payload.tags, current_user, db)


@router.post("/pubmed", response_model=NoteDetailResponse, status_code=status.HTTP_201_CREATED)
async def capture_pubmed(
    payload: PubmedCaptureRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NoteDetailResponse:
    """Capture a PubMed article and save as a note."""
    try:
        result = await _capture.capture_pubmed(payload.pmid)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e
    except Exception as e:
        logger.exception("PubMed capture failed: %s", payload.pmid)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to fetch PubMed: {e}") from e

    return await _save_captured_note(result, payload.notebook, payload.tags, current_user, db)
