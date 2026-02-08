# @TASK Public shared content access endpoint
# @SPEC GET /shared/{token} - Access shared content via token (NO AUTH)

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Note, Notebook, ShareLink

router = APIRouter(tags=["shared"])


class SharedNotePreview(BaseModel):
    id: int
    title: str
    preview: str


class SharedNoteContent(BaseModel):
    id: int
    title: str
    content_html: str
    content_text: str


class SharedNotebookContent(BaseModel):
    id: int
    name: str
    description: str | None
    notes: list[SharedNotePreview]


class SharedContentResponse(BaseModel):
    type: str
    notebook: SharedNotebookContent | None = None
    note: SharedNoteContent | None = None
    expires_at: str | None = None


@router.get("/shared/{token}", response_model=SharedContentResponse)
async def access_shared_content(
    token: str,
    db: AsyncSession = Depends(get_db),
    x_email: str | None = Header(None, alias="X-Email"),
) -> SharedContentResponse:
    result = await db.execute(select(ShareLink).where(ShareLink.token == token))
    link = result.scalar_one_or_none()

    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share link not found",
        )

    if not link.is_active:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This link has been revoked",
        )

    if link.expires_at and link.expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This link has expired",
        )

    if link.email_restriction:
        if not x_email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email verification required. Please provide your email address.",
            )
        if x_email != link.email_restriction:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email address does not match the allowed recipient",
            )

    link.access_count += 1
    await db.flush()

    expires_at_iso = link.expires_at.isoformat() if link.expires_at else None

    if link.notebook_id:
        notebook_result = await db.execute(select(Notebook).where(Notebook.id == link.notebook_id))
        notebook = notebook_result.scalar_one_or_none()

        if not notebook:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notebook not found",
            )

        notes_result = await db.execute(select(Note).where(Note.notebook_id == notebook.id))
        notes = notes_result.scalars().all()

        note_previews = [
            SharedNotePreview(
                id=note.id,
                title=note.title,
                preview=_truncate_preview(note.content_text, max_length=200),
            )
            for note in notes
        ]

        return SharedContentResponse(
            type="notebook",
            notebook=SharedNotebookContent(
                id=notebook.id,
                name=notebook.name,
                description=notebook.description,
                notes=note_previews,
            ),
            expires_at=expires_at_iso,
        )

    if link.note_id:
        note_result = await db.execute(select(Note).where(Note.id == link.note_id))
        note = note_result.scalar_one_or_none()

        if not note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Note not found",
            )

        return SharedContentResponse(
            type="note",
            note=SharedNoteContent(
                id=note.id,
                title=note.title,
                content_html=note.content_html,
                content_text=note.content_text,
            ),
            expires_at=expires_at_iso,
        )

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Invalid share link configuration",
    )


def _truncate_preview(text: str, max_length: int = 200) -> str:
    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + "..."
