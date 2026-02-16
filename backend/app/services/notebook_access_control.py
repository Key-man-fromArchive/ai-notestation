# @TASK Unified Permission Resolution Service
# @SPEC Notebook-level access control for permission hierarchy

from __future__ import annotations

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import NotePermission
from app.models import GroupNotebookAccess, MemberGroupMembership, Membership, NoteAccess, NotebookAccess

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


async def get_user_group_notebook_permissions(
    db: AsyncSession, user_id: int, org_ids: list[int]
) -> dict[int, str]:
    """Get notebook permissions from all groups the user belongs to.

    JOIN: Membership -> MemberGroupMembership -> GroupNotebookAccess
    Returns {notebook_id: highest_permission} across all groups.
    """
    # Find all memberships for this user in the given orgs
    membership_result = await db.execute(
        select(Membership.id).where(
            Membership.user_id == user_id,
            Membership.accepted_at.isnot(None),
            Membership.org_id.in_(org_ids) if org_ids else Membership.org_id.is_(None),
        )
    )
    membership_ids = [row[0] for row in membership_result.all()]

    if not membership_ids:
        return {}

    # Find all group notebook accesses via group memberships
    result = await db.execute(
        select(GroupNotebookAccess.notebook_id, GroupNotebookAccess.permission).where(
            GroupNotebookAccess.group_id.in_(
                select(MemberGroupMembership.group_id).where(
                    MemberGroupMembership.membership_id.in_(membership_ids)
                )
            )
        )
    )

    # Build dict with highest permission per notebook
    permissions: dict[int, str] = {}
    for notebook_id, permission in result.all():
        existing = permissions.get(notebook_id)
        if existing is None or PERMISSION_HIERARCHY.get(permission, 0) > PERMISSION_HIERARCHY.get(existing, 0):
            permissions[notebook_id] = permission

    return permissions


async def check_notebook_access(
    db: AsyncSession,
    user_id: int,
    notebook_id: int,
    required_permission: str = NotePermission.READ,
) -> bool:
    """Check if user has required permission on notebook.

    Resolution: Individual user access > Group access > Org access.
    """
    org_ids = await get_user_org_ids(db, user_id)

    # 1. Check individual user access first
    result = await db.execute(
        select(NotebookAccess).where(
            NotebookAccess.notebook_id == notebook_id,
            NotebookAccess.user_id == user_id,
        )
    )
    user_access = result.scalars().all()
    if user_access:
        return any(permission_satisfies(a.permission, required_permission) for a in user_access)

    # 2. Check group access
    group_perms = await get_user_group_notebook_permissions(db, user_id, org_ids)
    group_perm = group_perms.get(notebook_id)
    if group_perm is not None:
        return permission_satisfies(group_perm, required_permission)

    # 3. Check org access
    if org_ids:
        result = await db.execute(
            select(NotebookAccess).where(
                NotebookAccess.notebook_id == notebook_id,
                NotebookAccess.org_id.in_(org_ids),
            )
        )
        org_access = result.scalars().all()
        if org_access:
            return any(permission_satisfies(a.permission, required_permission) for a in org_access)

    return False


async def get_accessible_notebooks(
    db: AsyncSession,
    user_id: int,
    min_permission: str = NotePermission.READ,
) -> list[int]:
    """Get list of notebook IDs user can access with minimum permission level.

    Merges individual, group, and org access. Individual overrides group overrides org.
    """
    org_ids = await get_user_org_ids(db, user_id)

    # Collect all notebook permissions: {notebook_id: permission}
    notebook_permissions: dict[int, str] = {}

    # 3. Org access (lowest priority, add first)
    if org_ids:
        result = await db.execute(
            select(NotebookAccess).where(
                NotebookAccess.org_id.in_(org_ids),
            )
        )
        for access in result.scalars().all():
            notebook_permissions[access.notebook_id] = access.permission

    # 2. Group access (overrides org)
    group_perms = await get_user_group_notebook_permissions(db, user_id, org_ids)
    notebook_permissions.update(group_perms)

    # 1. Individual access (highest priority, overrides all)
    result = await db.execute(
        select(NotebookAccess).where(NotebookAccess.user_id == user_id)
    )
    for access in result.scalars().all():
        notebook_permissions[access.notebook_id] = access.permission

    # Filter by min_permission
    return [
        nb_id for nb_id, perm in notebook_permissions.items()
        if permission_satisfies(perm, min_permission)
    ]


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

    # Check individual notebook access first
    result = await db.execute(
        select(NotebookAccess).where(
            NotebookAccess.notebook_id == notebook_id,
            NotebookAccess.user_id == user_id,
        )
    )
    user_notebook_access = result.scalars().all()

    if user_notebook_access:
        highest_permission = None
        highest_level = 0
        for access in user_notebook_access:
            level = PERMISSION_HIERARCHY.get(access.permission, 0)
            if level > highest_level:
                highest_level = level
                highest_permission = access.permission
        return highest_permission

    # Check group notebook access
    group_perms = await get_user_group_notebook_permissions(db, user_id, org_ids)
    group_perm = group_perms.get(notebook_id)
    if group_perm is not None:
        return group_perm

    # Check org notebook access
    if org_ids:
        result = await db.execute(
            select(NotebookAccess).where(
                NotebookAccess.notebook_id == notebook_id,
                NotebookAccess.org_id.in_(org_ids),
            )
        )
        org_notebook_access = result.scalars().all()
        if org_notebook_access:
            highest_permission = None
            highest_level = 0
            for access in org_notebook_access:
                level = PERMISSION_HIERARCHY.get(access.permission, 0)
                if level > highest_level:
                    highest_level = level
                    highest_permission = access.permission
            return highest_permission

    return None
