"""Notification creation for comments and @mentions."""

import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Note, Notebook, Notification

_MENTION_RE = re.compile(r'data-type="memberMention"\s+data-id="(\d+)"')


def extract_mention_ids(html: str | None) -> set[int]:
    """Extract @mentioned user IDs from HTML content."""
    if not html:
        return set()
    return {int(m) for m in _MENTION_RE.findall(html)}


async def create_comment_notification(
    db: AsyncSession,
    note_pk: int,
    commenter_id: int,
    commenter_name: str,
    comment_id: str,
) -> None:
    """Create notification for note owner when a comment is added."""
    note = await db.get(Note, note_pk)
    if not note or not note.notebook_id:
        return
    notebook = await db.get(Notebook, note.notebook_id)
    if not notebook or not notebook.owner_id or notebook.owner_id == commenter_id:
        return  # self-comment = no notification
    db.add(
        Notification(
            user_id=notebook.owner_id,
            notification_type="comment_added",
            actor_id=commenter_id,
            actor_name=commenter_name,
            note_id=note_pk,
            note_title=note.title or "",
            synology_note_id=note.synology_note_id,
            comment_id=comment_id,
        )
    )


async def create_mention_notifications(
    db: AsyncSession,
    note_pk: int,
    old_html: str | None,
    new_html: str | None,
    mentioner_id: int,
    mentioner_name: str,
) -> None:
    """Create notifications for newly @mentioned users (diff-based)."""
    old_ids = extract_mention_ids(old_html)
    new_ids = extract_mention_ids(new_html)
    added = new_ids - old_ids - {mentioner_id}  # exclude self-mention
    if not added:
        return
    note = await db.get(Note, note_pk)
    if not note:
        return
    for uid in added:
        db.add(
            Notification(
                user_id=uid,
                notification_type="mention",
                actor_id=mentioner_id,
                actor_name=mentioner_name,
                note_id=note_pk,
                note_title=note.title or "",
                synology_note_id=note.synology_note_id,
            )
        )
