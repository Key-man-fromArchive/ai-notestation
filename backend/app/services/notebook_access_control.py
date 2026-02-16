# @TASK Unified Permission Resolution Service
# @SPEC Notebook-level access control for permission hierarchy

from __future__ import annotations

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import NotePermission
from app.models import Membership, NoteAccess, NotebookAccess

PERMISSION_HIERARCHY: dict[str, int] = {
    NotePermission.READ: 1,
    NotePermission.WRITE: 2,
    NotePermission.ADMIN: 3,
}


def permission_satisfies(granted: str, required: str) -> bool:
    """Check if granted permission satisfies required permission level."""
    granted_level = PERMISSION_HIERARCHY.get(granted, 0)
    required_level = PERMISSION_HIERARCHY.get(required, 0)
    return granted_level >= required_level


async def get_user_org_ids(db: AsyncSession, user_id: int) -> list[int]:
    """Get all organization IDs where user is an accepted member."""
    result = await db.execute(
        select(Membership.org_id).where(
            Membership.user_id == user_id,
            Membership.accepted_at.isnot(None),
        )
    )
    return [row[0] for row in result.all()]


async def check_notebook_access(
    db: AsyncSession,
    user_id: int,
    notebook_id: int,
    required_permission: str = NotePermission.READ,
) -> bool:
    """Check if user has required permission on notebook."""
    org_ids = await get_user_org_ids(db, user_id)

    conditions = [NotebookAccess.notebook_id == notebook_id]
    access_conditions = [NotebookAccess.user_id == user_id]
    if org_ids:
        access_conditions.append(NotebookAccess.org_id.in_(org_ids))

    conditions.append(or_(*access_conditions))

    result = await db.execute(select(NotebookAccess).where(*conditions))
    access_records = result.scalars().all()

    return any(permission_satisfies(access.permission, required_permission) for access in access_records)


async def get_accessible_notebooks(
    db: AsyncSession,
    user_id: int,
    min_permission: str = NotePermission.READ,
) -> list[int]:
    """Get list of notebook IDs user can access with minimum permission level."""
    org_ids = await get_user_org_ids(db, user_id)

    access_conditions = [NotebookAccess.user_id == user_id]
    if org_ids:
        access_conditions.append(NotebookAccess.org_id.in_(org_ids))

    result = await db.execute(select(NotebookAccess).where(or_(*access_conditions)))
    access_records = result.scalars().all()

    notebook_ids = set()
    for access in access_records:
        if permission_satisfies(access.permission, min_permission):
            notebook_ids.add(access.notebook_id)

    return list(notebook_ids)


async def grant_notebook_access(
    db: AsyncSession,
    notebook_id: int,
    user_id: int | None,
    org_id: int | None,
    permission: str,
    granted_by: int,
) -> NotebookAccess:
    """Grant or update notebook access for user or organization."""
    if user_id is None and org_id is None:
        raise ValueError("Either user_id or org_id must be provided")
    if user_id is not None and org_id is not None:
        raise ValueError("Only one of user_id or org_id should be provided")

    conditions = [NotebookAccess.notebook_id == notebook_id]
    if user_id is not None:
        conditions.append(NotebookAccess.user_id == user_id)
    else:
        conditions.append(NotebookAccess.org_id == org_id)

    result = await db.execute(select(NotebookAccess).where(*conditions))
    existing = result.scalar_one_or_none()

    if existing:
        existing.permission = permission
        existing.granted_by = granted_by
        await db.flush()
        return existing

    access = NotebookAccess(
        notebook_id=notebook_id,
        user_id=user_id,
        org_id=org_id,
        permission=permission,
        granted_by=granted_by,
    )
    db.add(access)
    await db.flush()
    return access


async def revoke_notebook_access(
    db: AsyncSession,
    access_id: int,
) -> bool:
    """Revoke notebook access by access record ID."""
    result = await db.execute(select(NotebookAccess).where(NotebookAccess.id == access_id))
    existing = result.scalar_one_or_none()
    if not existing:
        return False

    await db.execute(delete(NotebookAccess).where(NotebookAccess.id == access_id))
    return True


async def get_notebook_access_list(db: AsyncSession, notebook_id: int) -> list[NotebookAccess]:
    """Get all access records for a notebook."""
    result = await db.execute(select(NotebookAccess).where(NotebookAccess.notebook_id == notebook_id))
    return list(result.scalars().all())


async def can_manage_notebook_access(
    db: AsyncSession,
    user_id: int,
    notebook_id: int,
) -> bool:
    """Check if user can manage access for notebook (requires ADMIN permission)."""
    return await check_notebook_access(db, user_id, notebook_id, NotePermission.ADMIN)


async def get_user_notebook_accesses(
    db: AsyncSession,
    user_id: int,
) -> list[dict]:
    """Get all notebook access records for a specific user, with notebook names."""
    from app.models import Notebook

    result = await db.execute(
        select(NotebookAccess).where(NotebookAccess.user_id == user_id)
    )
    accesses = result.scalars().all()

    items = []
    for access in accesses:
        nb_result = await db.execute(
            select(Notebook.name).where(Notebook.id == access.notebook_id)
        )
        notebook_name = nb_result.scalar_one_or_none() or "Unknown"
        items.append({
            "access_id": access.id,
            "notebook_id": access.notebook_id,
            "notebook_name": notebook_name,
            "permission": access.permission,
        })

    return items


async def get_effective_note_permission(
    db: AsyncSession,
    user_id: int,
    note_id: int,
) -> str | None:
    """
    Get effective permission for a note, with note-level overriding notebook-level.

    Resolution order:
    1. Check NoteAccess for this specific note (if found, return highest permission)
    2. If not found, check NotebookAccess for the note's notebook
    3. Return None if no access at all

    Note-level permission ALWAYS overrides notebook-level, regardless of which is more restrictive.
    """
    from app.models import Note

    org_ids = await get_user_org_ids(db, user_id)

    # Step 1: Check note-level access first
    note_conditions = [NoteAccess.note_id == note_id]
    note_access_conditions = [NoteAccess.user_id == user_id]
    if org_ids:
        note_access_conditions.append(NoteAccess.org_id.in_(org_ids))
    note_conditions.append(or_(*note_access_conditions))

    result = await db.execute(select(NoteAccess).where(*note_conditions))
    note_access_records = result.scalars().all()

    # If note-level access exists, return the highest permission found
    if note_access_records:
        highest_permission = None
        highest_level = 0
        for access in note_access_records:
            level = PERMISSION_HIERARCHY.get(access.permission, 0)
            if level > highest_level:
                highest_level = level
                highest_permission = access.permission
        return highest_permission

    # Step 2: No note-level access, check notebook-level access
    # First get the note's notebook_id
    note_result = await db.execute(select(Note.notebook_id).where(Note.id == note_id))
    notebook_id = note_result.scalar_one_or_none()

    if notebook_id is None:
        return None

    # Check notebook access
    notebook_conditions = [NotebookAccess.notebook_id == notebook_id]
    notebook_access_conditions = [NotebookAccess.user_id == user_id]
    if org_ids:
        notebook_access_conditions.append(NotebookAccess.org_id.in_(org_ids))
    notebook_conditions.append(or_(*notebook_access_conditions))

    result = await db.execute(select(NotebookAccess).where(*notebook_conditions))
    notebook_access_records = result.scalars().all()

    # Return highest notebook permission found
    if notebook_access_records:
        highest_permission = None
        highest_level = 0
        for access in notebook_access_records:
            level = PERMISSION_HIERARCHY.get(access.permission, 0)
            if level > highest_level:
                highest_level = level
                highest_permission = access.permission
        return highest_permission

    return None
