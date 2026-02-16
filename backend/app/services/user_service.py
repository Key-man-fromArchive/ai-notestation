from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import MemberRole
from app.models import Membership, Organization, User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def generate_invite_token() -> str:
    return secrets.token_urlsafe(32)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    email: str,
    password: str,
    name: str = "",
) -> User:
    user = User(
        email=email.lower().strip(),
        password_hash=hash_password(password),
        name=name,
    )
    db.add(user)
    await db.flush()
    return user


async def create_organization(db: AsyncSession, name: str, slug: str) -> Organization:
    org = Organization(name=name, slug=slug.lower().strip())
    db.add(org)
    await db.flush()
    return org


async def get_organization_by_slug(db: AsyncSession, slug: str) -> Organization | None:
    result = await db.execute(select(Organization).where(Organization.slug == slug))
    return result.scalar_one_or_none()


async def add_member_to_org(
    db: AsyncSession,
    user_id: int,
    org_id: int,
    role: str = MemberRole.MEMBER,
    invited_by: int | None = None,
) -> Membership:
    membership = Membership(
        user_id=user_id,
        org_id=org_id,
        role=role,
        invited_by=invited_by,
        accepted_at=datetime.now(UTC),
    )
    db.add(membership)
    await db.flush()
    return membership


async def create_invite(
    db: AsyncSession,
    org_id: int,
    invited_by: int,
    email: str,
    role: str = MemberRole.MEMBER,
    expires_hours: int = 72,
) -> tuple[Membership, str]:
    user = await get_user_by_email(db, email)
    if not user:
        user = User(
            email=email.lower().strip(),
            password_hash="",
            name="",
            is_active=False,
        )
        db.add(user)
        await db.flush()

    token = generate_invite_token()
    membership = Membership(
        user_id=user.id,
        org_id=org_id,
        role=role,
        invited_by=invited_by,
        invite_token=token,
        invite_expires_at=datetime.now(UTC) + timedelta(hours=expires_hours),
    )
    db.add(membership)
    await db.flush()
    return membership, token


async def accept_invite(
    db: AsyncSession,
    token: str,
    password: str | None = None,
    name: str | None = None,
) -> Membership | None:
    result = await db.execute(select(Membership).where(Membership.invite_token == token))
    membership = result.scalar_one_or_none()

    if not membership:
        return None

    if membership.invite_expires_at and membership.invite_expires_at < datetime.now(UTC):
        return None

    if membership.accepted_at:
        return membership

    user_result = await db.execute(select(User).where(User.id == membership.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return None

    if password and not user.password_hash:
        user.password_hash = hash_password(password)
    if name:
        user.name = name
    user.is_active = True

    membership.accepted_at = datetime.now(UTC)
    membership.invite_token = None

    return membership


async def get_user_memberships(db: AsyncSession, user_id: int) -> list[Membership]:
    result = await db.execute(select(Membership).where(Membership.user_id == user_id))
    return list(result.scalars().all())


async def get_org_members(db: AsyncSession, org_id: int) -> list[Membership]:
    result = await db.execute(select(Membership).where(Membership.org_id == org_id))
    return list(result.scalars().all())


async def get_membership(db: AsyncSession, user_id: int, org_id: int) -> Membership | None:
    result = await db.execute(
        select(Membership).where(Membership.user_id == user_id).where(Membership.org_id == org_id)
    )
    return result.scalar_one_or_none()


async def remove_member_from_org(db: AsyncSession, membership_id: int, org_id: int) -> bool:
    """Remove a member and all their access records from the organization."""
    from app.models import NoteAccess, NotebookAccess

    result = await db.execute(
        select(Membership).where(
            Membership.id == membership_id,
            Membership.org_id == org_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        return False

    user_id = membership.user_id

    # Delete notebook access for this user
    await db.execute(
        delete(NotebookAccess).where(NotebookAccess.user_id == user_id)
    )
    # Delete note access for this user
    await db.execute(
        delete(NoteAccess).where(NoteAccess.user_id == user_id)
    )
    # Delete the membership
    await db.execute(
        delete(Membership).where(Membership.id == membership_id)
    )

    return True
