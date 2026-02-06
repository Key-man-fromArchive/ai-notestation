# @TASK P6-T6.3 - RBAC Access Control Service
# @SPEC docs/plans/phase6-member-auth.md

from __future__ import annotations

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import MemberRole, NotePermission
from app.models import Membership, NoteAccess

PERMISSION_HIERARCHY: dict[str, int] = {
    NotePermission.READ: 1,
    NotePermission.WRITE: 2,
    NotePermission.ADMIN: 3,
}

ROLE_IMPLIES_PERMISSION = {
    MemberRole.OWNER: NotePermission.ADMIN,
    MemberRole.ADMIN: NotePermission.ADMIN,
    MemberRole.MEMBER: NotePermission.WRITE,
    MemberRole.VIEWER: NotePermission.READ,
}


def permission_satisfies(granted: str, required: str) -> bool:
    granted_level = PERMISSION_HIERARCHY.get(granted, 0)
    required_level = PERMISSION_HIERARCHY.get(required, 0)
    return granted_level >= required_level


async def get_user_org_ids(db: AsyncSession, user_id: int) -> list[int]:
    result = await db.execute(
        select(Membership.org_id).where(
            Membership.user_id == user_id,
            Membership.accepted_at.isnot(None),
        )
    )
    return [row[0] for row in result.all()]


async def get_user_membership_for_org(db: AsyncSession, user_id: int, org_id: int) -> Membership | None:
    result = await db.execute(
        select(Membership).where(
            Membership.user_id == user_id,
            Membership.org_id == org_id,
            Membership.accepted_at.isnot(None),
        )
    )
    return result.scalar_one_or_none()


async def check_note_access(
    db: AsyncSession,
    user_id: int,
    note_id: int,
    required_permission: str = NotePermission.READ,
) -> bool:
    org_ids = await get_user_org_ids(db, user_id)

    conditions = [NoteAccess.note_id == note_id]
    access_conditions = [NoteAccess.user_id == user_id]
    if org_ids:
        access_conditions.append(NoteAccess.org_id.in_(org_ids))

    conditions.append(or_(*access_conditions))

    result = await db.execute(select(NoteAccess).where(*conditions))
    access_records = result.scalars().all()

    return any(permission_satisfies(access.permission, required_permission) for access in access_records)


async def get_accessible_note_ids(
    db: AsyncSession,
    user_id: int,
    min_permission: str = NotePermission.READ,
) -> list[int]:
    org_ids = await get_user_org_ids(db, user_id)

    access_conditions = [NoteAccess.user_id == user_id]
    if org_ids:
        access_conditions.append(NoteAccess.org_id.in_(org_ids))

    result = await db.execute(select(NoteAccess).where(or_(*access_conditions)))
    access_records = result.scalars().all()

    note_ids = set()
    for access in access_records:
        if permission_satisfies(access.permission, min_permission):
            note_ids.add(access.note_id)

    return list(note_ids)


async def grant_note_access(
    db: AsyncSession,
    note_id: int,
    granted_by: int,
    permission: str = NotePermission.READ,
    user_id: int | None = None,
    org_id: int | None = None,
) -> NoteAccess:
    if user_id is None and org_id is None:
        raise ValueError("Either user_id or org_id must be provided")
    if user_id is not None and org_id is not None:
        raise ValueError("Only one of user_id or org_id should be provided")

    conditions = [NoteAccess.note_id == note_id]
    if user_id is not None:
        conditions.append(NoteAccess.user_id == user_id)
    else:
        conditions.append(NoteAccess.org_id == org_id)

    result = await db.execute(select(NoteAccess).where(*conditions))
    existing = result.scalar_one_or_none()

    if existing:
        existing.permission = permission
        existing.granted_by = granted_by
        await db.flush()
        return existing

    access = NoteAccess(
        note_id=note_id,
        user_id=user_id,
        org_id=org_id,
        permission=permission,
        granted_by=granted_by,
    )
    db.add(access)
    await db.flush()
    return access


async def revoke_note_access(
    db: AsyncSession,
    note_id: int,
    user_id: int | None = None,
    org_id: int | None = None,
) -> bool:
    if user_id is None and org_id is None:
        raise ValueError("Either user_id or org_id must be provided")

    conditions = [NoteAccess.note_id == note_id]
    if user_id is not None:
        conditions.append(NoteAccess.user_id == user_id)
    if org_id is not None:
        conditions.append(NoteAccess.org_id == org_id)

    check_result = await db.execute(select(NoteAccess).where(*conditions))
    existing = check_result.scalar_one_or_none()
    if not existing:
        return False

    await db.execute(delete(NoteAccess).where(*conditions))
    return True


async def get_note_access_list(db: AsyncSession, note_id: int) -> list[NoteAccess]:
    result = await db.execute(select(NoteAccess).where(NoteAccess.note_id == note_id))
    return list(result.scalars().all())


async def can_manage_note_access(
    db: AsyncSession,
    user_id: int,
    note_id: int,
) -> bool:
    return await check_note_access(db, user_id, note_id, NotePermission.ADMIN)


async def grant_org_default_access(
    db: AsyncSession,
    note_id: int,
    org_id: int,
    granted_by: int,
    permission: str = NotePermission.READ,
) -> NoteAccess:
    return await grant_note_access(
        db,
        note_id=note_id,
        granted_by=granted_by,
        permission=permission,
        org_id=org_id,
    )
