# @TASK T3.1 - Inline comment CRUD for notes
# @SPEC docs/planning/editor-roadmap.md#inline-comments

"""Inline comment CRUD for notes."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Note, NoteComment, User
from app.services.auth_service import get_current_user

router = APIRouter(tags=["comments"])


class CommentCreate(BaseModel):
    comment_id: str
    content: str


class CommentResponse(BaseModel):
    id: int
    comment_id: str
    note_id: int
    user_id: int | None
    user_name: str
    content: str
    is_resolved: bool
    resolved_by: int | None
    resolved_at: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


def _serialize_comment(c: NoteComment) -> dict:
    return {
        "id": c.id,
        "comment_id": c.comment_id,
        "note_id": c.note_id,
        "user_id": c.user_id,
        "user_name": c.user_name,
        "content": c.content,
        "is_resolved": c.is_resolved,
        "resolved_by": c.resolved_by,
        "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


async def _get_note_pk(db: AsyncSession, synology_note_id: str) -> int:
    """Resolve synology_note_id -> notes.id PK."""
    result = await db.execute(
        select(Note.id).where(Note.synology_note_id == synology_note_id)
    )
    note_pk = result.scalar_one_or_none()
    if note_pk is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_pk


@router.get("/notes/{note_id}/comments")
async def list_comments(
    note_id: str,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    note_pk = await _get_note_pk(db, note_id)
    result = await db.execute(
        select(NoteComment)
        .where(NoteComment.note_id == note_pk)
        .order_by(NoteComment.created_at)
    )
    comments = result.scalars().all()
    return [_serialize_comment(c) for c in comments]


@router.post("/notes/{note_id}/comments", status_code=201)
async def create_comment(
    note_id: str,
    body: CommentCreate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    note_pk = await _get_note_pk(db, note_id)

    # Get user name
    user = await db.get(User, current_user["user_id"])
    user_name = user.name if user else "Unknown"

    comment = NoteComment(
        comment_id=body.comment_id,
        note_id=note_pk,
        user_id=current_user["user_id"],
        user_name=user_name,
        content=body.content,
    )
    db.add(comment)
    await db.flush()

    # Notify note owner about the new comment
    from app.services.notification_service import create_comment_notification

    await create_comment_notification(
        db, note_pk, current_user["user_id"], user_name, body.comment_id
    )

    await db.commit()
    await db.refresh(comment)
    return _serialize_comment(comment)


@router.patch("/notes/{note_id}/comments/{comment_id}/resolve")
async def toggle_resolve(
    note_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    await _get_note_pk(db, note_id)  # validate note exists
    result = await db.execute(
        select(NoteComment).where(NoteComment.comment_id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    comment.is_resolved = not comment.is_resolved
    if comment.is_resolved:
        comment.resolved_by = current_user["user_id"]
        comment.resolved_at = datetime.now(UTC)
    else:
        comment.resolved_by = None
        comment.resolved_at = None

    await db.commit()
    await db.refresh(comment)
    return _serialize_comment(comment)


@router.delete("/notes/{note_id}/comments/{comment_id}", status_code=204)
async def delete_comment(
    note_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    await _get_note_pk(db, note_id)
    result = await db.execute(
        select(NoteComment).where(NoteComment.comment_id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    await db.delete(comment)
    await db.commit()
