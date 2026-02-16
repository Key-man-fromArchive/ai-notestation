"""Group management service for member groups, memberships, and notebook access.

Provides CRUD operations for MemberGroup, bulk member assignment via
MemberGroupMembership, and group-level notebook access via GroupNotebookAccess.
"""

from __future__ import annotations

import logging

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    GroupNotebookAccess,
    MemberGroup,
    MemberGroupMembership,
    Membership,
    Notebook,
    User,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Group CRUD
# ---------------------------------------------------------------------------


async def create_group(
    db: AsyncSession,
    org_id: int,
    name: str,
    description: str = "",
    color: str = "#6B7280",
    created_by: int | None = None,
) -> MemberGroup:
    """Create a new member group.

    Raises ValueError if a group with the same name already exists in the org.
    """
    existing = await db.execute(
        select(MemberGroup).where(
            MemberGroup.org_id == org_id,
            MemberGroup.name == name,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ValueError(f"Group '{name}' already exists in this organization")

    group = MemberGroup(
        org_id=org_id,
        name=name,
        description=description,
        color=color,
        created_by=created_by,
    )
    db.add(group)
    await db.flush()
    return group


async def get_group(db: AsyncSession, group_id: int) -> MemberGroup | None:
    """Get a group by ID."""
    result = await db.execute(select(MemberGroup).where(MemberGroup.id == group_id))
    return result.scalar_one_or_none()


async def list_groups(db: AsyncSession, org_id: int) -> list[MemberGroup]:
    """List all groups for an organization, ordered by name."""
    result = await db.execute(
        select(MemberGroup)
        .where(MemberGroup.org_id == org_id)
        .order_by(MemberGroup.name)
    )
    return list(result.scalars().all())


async def update_group(
    db: AsyncSession,
    group_id: int,
    name: str | None = None,
    description: str | None = None,
    color: str | None = None,
) -> MemberGroup | None:
    """Update group fields. Returns None if not found."""
    result = await db.execute(select(MemberGroup).where(MemberGroup.id == group_id))
    group = result.scalar_one_or_none()
    if group is None:
        return None

    if name is not None:
        # Check for duplicate name within the same org
        dup = await db.execute(
            select(MemberGroup).where(
                MemberGroup.org_id == group.org_id,
                MemberGroup.name == name,
                MemberGroup.id != group_id,
            )
        )
        if dup.scalar_one_or_none() is not None:
            raise ValueError(f"Group '{name}' already exists in this organization")
        group.name = name

    if description is not None:
        group.description = description
    if color is not None:
        group.color = color

    await db.flush()
    return group


async def delete_group(db: AsyncSession, group_id: int) -> bool:
    """Delete a group and all related records (cascade). Returns False if not found."""
    result = await db.execute(select(MemberGroup).where(MemberGroup.id == group_id))
    group = result.scalar_one_or_none()
    if group is None:
        return False

    # Cascade deletes handle MemberGroupMembership and GroupNotebookAccess
    # via FK ondelete="CASCADE", but we delete explicitly for clarity.
    await db.execute(
        delete(MemberGroupMembership).where(MemberGroupMembership.group_id == group_id)
    )
    await db.execute(
        delete(GroupNotebookAccess).where(GroupNotebookAccess.group_id == group_id)
    )
    await db.execute(delete(MemberGroup).where(MemberGroup.id == group_id))
    return True


# ---------------------------------------------------------------------------
# Group Members
# ---------------------------------------------------------------------------


async def add_members_to_group(
    db: AsyncSession,
    group_id: int,
    membership_ids: list[int],
    added_by: int | None = None,
) -> dict:
    """Add members to a group.

    Returns ``{added: int, already_exists: int, errors: list[str]}``.
    Duplicate memberships are silently skipped.
    """
    added = 0
    already_exists = 0
    errors: list[str] = []

    for mid in membership_ids:
        # Verify membership exists
        mem_result = await db.execute(
            select(Membership).where(Membership.id == mid)
        )
        if mem_result.scalar_one_or_none() is None:
            errors.append(f"Membership {mid} not found")
            continue

        # Check if already in group
        existing = await db.execute(
            select(MemberGroupMembership).where(
                MemberGroupMembership.group_id == group_id,
                MemberGroupMembership.membership_id == mid,
            )
        )
        if existing.scalar_one_or_none() is not None:
            already_exists += 1
            continue

        gm = MemberGroupMembership(
            group_id=group_id,
            membership_id=mid,
            added_by=added_by,
        )
        db.add(gm)
        added += 1

    if added > 0:
        await db.flush()

    return {"added": added, "already_exists": already_exists, "errors": errors}


async def remove_members_from_group(
    db: AsyncSession,
    group_id: int,
    membership_ids: list[int],
) -> int:
    """Remove members from a group. Returns the count of records removed."""
    result = await db.execute(
        delete(MemberGroupMembership).where(
            MemberGroupMembership.group_id == group_id,
            MemberGroupMembership.membership_id.in_(membership_ids),
        )
    )
    return result.rowcount  # type: ignore[return-value]


async def get_group_members(db: AsyncSession, group_id: int) -> list[dict]:
    """Get members of a group with user info.

    Returns a list of dicts containing:
    ``membership_id``, ``user_id``, ``email``, ``name``, ``role``, ``added_at``.
    """
    result = await db.execute(
        select(
            MemberGroupMembership.membership_id,
            MemberGroupMembership.created_at,
            Membership.user_id,
            Membership.role,
            User.email,
            User.name,
        )
        .join(Membership, MemberGroupMembership.membership_id == Membership.id)
        .join(User, Membership.user_id == User.id)
        .where(MemberGroupMembership.group_id == group_id)
        .order_by(User.name)
    )

    return [
        {
            "membership_id": row.membership_id,
            "user_id": row.user_id,
            "email": row.email,
            "name": row.name,
            "role": row.role,
            "added_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in result.all()
    ]


async def get_member_groups(
    db: AsyncSession,
    membership_id: int,
) -> list[MemberGroup]:
    """Get all groups that a membership belongs to."""
    result = await db.execute(
        select(MemberGroup)
        .join(
            MemberGroupMembership,
            MemberGroupMembership.group_id == MemberGroup.id,
        )
        .where(MemberGroupMembership.membership_id == membership_id)
        .order_by(MemberGroup.name)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Group Notebook Access
# ---------------------------------------------------------------------------


async def set_group_notebook_access(
    db: AsyncSession,
    group_id: int,
    notebook_id: int,
    permission: str,
    granted_by: int | None = None,
) -> GroupNotebookAccess:
    """Upsert group notebook access. Updates permission if already exists."""
    result = await db.execute(
        select(GroupNotebookAccess).where(
            GroupNotebookAccess.group_id == group_id,
            GroupNotebookAccess.notebook_id == notebook_id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.permission = permission
        if granted_by is not None:
            existing.granted_by = granted_by
        await db.flush()
        return existing

    access = GroupNotebookAccess(
        group_id=group_id,
        notebook_id=notebook_id,
        permission=permission,
        granted_by=granted_by,
    )
    db.add(access)
    await db.flush()
    return access


async def remove_group_notebook_access(
    db: AsyncSession,
    group_id: int,
    notebook_id: int,
) -> bool:
    """Remove group access to a specific notebook. Returns False if not found."""
    result = await db.execute(
        select(GroupNotebookAccess).where(
            GroupNotebookAccess.group_id == group_id,
            GroupNotebookAccess.notebook_id == notebook_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is None:
        return False

    await db.execute(
        delete(GroupNotebookAccess).where(
            GroupNotebookAccess.group_id == group_id,
            GroupNotebookAccess.notebook_id == notebook_id,
        )
    )
    return True


async def get_group_notebook_accesses(
    db: AsyncSession,
    group_id: int,
) -> list[dict]:
    """Get all notebook accesses for a group with notebook names.

    Returns a list of dicts containing:
    ``id``, ``notebook_id``, ``notebook_name``, ``permission``, ``created_at``.
    """
    result = await db.execute(
        select(
            GroupNotebookAccess.id,
            GroupNotebookAccess.notebook_id,
            GroupNotebookAccess.permission,
            GroupNotebookAccess.created_at,
            Notebook.name.label("notebook_name"),
        )
        .join(Notebook, GroupNotebookAccess.notebook_id == Notebook.id)
        .where(GroupNotebookAccess.group_id == group_id)
        .order_by(Notebook.name)
    )

    return [
        {
            "id": row.id,
            "notebook_id": row.notebook_id,
            "notebook_name": row.notebook_name,
            "permission": row.permission,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in result.all()
    ]


async def bulk_set_group_notebook_access(
    db: AsyncSession,
    group_id: int,
    accesses: list[dict],
    granted_by: int | None = None,
) -> int:
    """Set multiple notebook accesses at once.

    Each dict in *accesses* must have ``notebook_id`` and ``permission`` keys.
    Returns the total count of records created or updated.
    """
    count = 0
    for item in accesses:
        notebook_id = item["notebook_id"]
        permission = item["permission"]
        await set_group_notebook_access(
            db,
            group_id=group_id,
            notebook_id=notebook_id,
            permission=permission,
            granted_by=granted_by,
        )
        count += 1
    return count
