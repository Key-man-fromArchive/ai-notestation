"""Notification feed API — list and mark-read."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.database import get_db
from app.models import Notification
from app.services.auth_service import get_current_user

router = APIRouter(tags=["notifications"])


class MarkReadRequest(BaseModel):
    notification_ids: list[int] | None = None  # None = mark all


@router.get("/notifications")
async def list_notifications(
    limit: int = 50,
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    user_id = current_user["user_id"]

    # items query
    q = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        q = q.where(Notification.is_read == False)  # noqa: E712
    q = q.order_by(Notification.created_at.desc()).limit(limit)
    result = await db.execute(q)
    items = result.scalars().all()

    # unread count
    count_q = (
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
    )
    unread_count = (await db.execute(count_q)).scalar() or 0

    return {
        "items": [
            {
                "id": n.id,
                "type": n.notification_type,
                "actor_name": n.actor_name,
                "note_title": n.note_title,
                "synology_note_id": n.synology_note_id,
                "comment_id": n.comment_id,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in items
        ],
        "unread_count": unread_count,
    }


@router.post("/notifications/mark-read")
async def mark_read(
    body: MarkReadRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    user_id = current_user["user_id"]
    stmt = (
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
    )
    if body.notification_ids:
        stmt = stmt.where(Notification.id.in_(body.notification_ids))
    stmt = stmt.values(is_read=True)
    await db.execute(stmt)
    await db.commit()
    return {"ok": True}
