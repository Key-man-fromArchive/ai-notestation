# @TASK P6-T6.2 - Member Auth API
# @SPEC docs/plans/phase6-member-auth.md

"""Member authentication and organization management API.

Provides:
- ``POST /members/signup``    -- Register user and create organization
- ``POST /members/invite``    -- Invite user to organization (OWNER/ADMIN)
- ``POST /members/accept``    -- Accept invite with token
- ``GET  /members``           -- List organization members
- ``PUT  /members/{id}/role`` -- Change member role (OWNER/ADMIN)

Login and token refresh are handled by ``/api/auth/login`` and
``/api/auth/token/refresh`` respectively (see ``app.api.auth``).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import MemberRole
from app.database import get_db
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    get_current_user,
)
from app.services.user_service import (
    accept_invite,
    add_member_to_org,
    create_invite,
    create_organization,
    create_user,
    get_membership,
    get_org_members,
    get_organization_by_slug,
    get_user_by_email,
    get_user_by_id,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/members", tags=["members"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class SignupRequest(BaseModel):
    """User registration with organization creation."""

    email: EmailStr
    password: str
    name: str = ""
    org_name: str
    org_slug: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("org_slug")
    @classmethod
    def validate_org_slug(cls, v: str) -> str:
        if not re.match(r"^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$", v.lower()):
            raise ValueError("Slug must be 3-50 lowercase alphanumeric characters or hyphens")
        return v.lower()


class TokenResponse(BaseModel):
    """JWT token pair response with user/org context."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    name: str
    org_id: int
    org_slug: str
    role: str


class InviteRequest(BaseModel):
    """Invite user to organization."""

    email: EmailStr
    role: str = MemberRole.MEMBER

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        valid_roles = {MemberRole.ADMIN, MemberRole.MEMBER, MemberRole.VIEWER}
        if v not in valid_roles:
            raise ValueError(f"Role must be one of: {', '.join(valid_roles)}")
        return v


class InviteResponse(BaseModel):
    """Invite creation response."""

    invite_token: str
    email: str
    role: str
    expires_at: datetime


class AcceptInviteRequest(BaseModel):
    """Accept invitation request."""

    token: str
    password: str | None = None
    name: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class MemberResponse(BaseModel):
    """Member information response."""

    id: int
    user_id: int
    email: str
    name: str
    role: str
    accepted_at: datetime | None
    is_pending: bool


class MemberListResponse(BaseModel):
    """List of organization members."""

    members: list[MemberResponse]
    total: int


class UpdateRoleRequest(BaseModel):
    """Update member role request."""

    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        valid_roles = {MemberRole.OWNER, MemberRole.ADMIN, MemberRole.MEMBER, MemberRole.VIEWER}
        if v not in valid_roles:
            raise ValueError(f"Role must be one of: {', '.join(valid_roles)}")
        return v


class MessageResponse(BaseModel):
    """Generic message response."""

    message: str


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


def require_role(*allowed_roles: str):
    """Create a dependency that requires specific roles."""

    async def check_role(member: dict) -> dict:
        if member["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of: {', '.join(allowed_roles)}",
            )
        return member

    return check_role


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    request: SignupRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> TokenResponse:
    """Register a new user and create their organization.

    The user becomes the OWNER of the newly created organization.
    """
    existing_user = await get_user_by_email(db, request.email)
    if existing_user and existing_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    existing_org = await get_organization_by_slug(db, request.org_slug)
    if existing_org:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organization slug already taken",
        )

    user = await create_user(db, request.email, request.password, request.name)
    org = await create_organization(db, request.org_name, request.org_slug)
    await add_member_to_org(db, user.id, org.id, role=MemberRole.OWNER)
    await db.commit()

    token_data = {
        "sub": user.email,
        "user_id": user.id,
        "org_id": org.id,
        "role": MemberRole.OWNER,
    }
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)

    logger.info("User signed up: email=%s, org=%s", user.email, org.slug)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        email=user.email,
        name=user.name,
        org_id=org.id,
        org_slug=org.slug,
        role=MemberRole.OWNER,
    )


@router.post("/invite", response_model=InviteResponse)
async def invite_member(
    request: InviteRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> InviteResponse:
    """Invite a user to the organization.

    Requires OWNER or ADMIN role.
    """
    if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER or ADMIN can invite members",
        )

    existing_user = await get_user_by_email(db, request.email)
    if existing_user:
        existing_membership = await get_membership(db, existing_user.id, current_user["org_id"])
        if existing_membership and existing_membership.accepted_at:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this organization",
            )

    membership, invite_token = await create_invite(
        db,
        org_id=current_user["org_id"],
        invited_by=current_user["user_id"],
        email=request.email,
        role=request.role,
    )

    await db.commit()

    logger.info(
        "Invite created: email=%s, org_id=%d, by=%s",
        request.email,
        current_user["org_id"],
        current_user["email"],
    )

    if not membership.invite_expires_at:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create invite",
        )

    return InviteResponse(
        invite_token=invite_token,
        email=request.email,
        role=request.role,
        expires_at=membership.invite_expires_at,
    )


@router.post("/accept", response_model=TokenResponse)
async def accept_invitation(
    request: AcceptInviteRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> TokenResponse:
    """Accept an invitation to join an organization."""
    membership = await accept_invite(
        db,
        token=request.token,
        password=request.password,
        name=request.name,
    )

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation token",
        )

    await db.commit()

    user = await get_user_by_id(db, membership.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User not found after accepting invite",
        )

    from sqlalchemy import select

    from app.models import Organization

    org_result = await db.execute(select(Organization).where(Organization.id == membership.org_id))
    org = org_result.scalar_one()

    token_data = {
        "sub": user.email,
        "user_id": user.id,
        "org_id": org.id,
        "role": membership.role,
    }
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)

    logger.info("Invite accepted: email=%s, org=%s", user.email, org.slug)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        email=user.email,
        name=user.name,
        org_id=org.id,
        org_slug=org.slug,
        role=membership.role,
    )


@router.get("", response_model=MemberListResponse)
async def list_members(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> MemberListResponse:
    """List all members of the current organization."""
    memberships = await get_org_members(db, current_user["org_id"])

    members = []
    for m in memberships:
        user = await get_user_by_id(db, m.user_id)
        members.append(
            MemberResponse(
                id=m.id,
                user_id=m.user_id,
                email=user.email if user else "",
                name=user.name if user else "",
                role=m.role,
                accepted_at=m.accepted_at,
                is_pending=m.accepted_at is None,
            )
        )

    return MemberListResponse(members=members, total=len(members))


@router.put("/{member_id}/role", response_model=MemberResponse)
async def update_member_role(
    member_id: int,
    request: UpdateRoleRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> MemberResponse:
    """Update a member's role.

    Requires OWNER or ADMIN role.
    OWNER role can only be transferred by current OWNER.
    """
    if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER or ADMIN can change roles",
        )

    if request.role == MemberRole.OWNER and current_user["role"] != MemberRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER can transfer ownership",
        )

    from sqlalchemy import select

    from app.models import Membership

    result = await db.execute(
        select(Membership).where(
            Membership.id == member_id,
            Membership.org_id == current_user["org_id"],
        )
    )
    membership = result.scalar_one_or_none()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    if membership.user_id == current_user["user_id"] and membership.role == MemberRole.OWNER:
        all_memberships = await get_org_members(db, current_user["org_id"])
        owner_count = sum(1 for m in all_memberships if m.role == MemberRole.OWNER)
        if owner_count <= 1 and request.role != MemberRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the only owner",
            )

    old_role = membership.role
    membership.role = request.role
    await db.commit()

    user = await get_user_by_id(db, membership.user_id)

    logger.info(
        "Role changed: member_id=%d, %s -> %s, by=%s",
        member_id,
        old_role,
        request.role,
        current_user["email"],
    )

    return MemberResponse(
        id=membership.id,
        user_id=membership.user_id,
        email=user.email if user else "",
        name=user.name if user else "",
        role=membership.role,
        accepted_at=membership.accepted_at,
        is_pending=membership.accepted_at is None,
    )
