# @TASK P6-T6.2 - Member Auth API
# @SPEC docs/plans/phase6-member-auth.md

"""Member authentication and organization management API.

Provides:
- ``POST /members/signup``    -- Register user and create organization
- ``POST /members/login``     -- Authenticate user, return JWT with org/role
- ``POST /members/invite``    -- Invite user to organization (OWNER/ADMIN)
- ``POST /members/accept``    -- Accept invite with token
- ``POST /members/refresh``   -- Refresh JWT token
- ``GET  /members``           -- List organization members
- ``PUT  /members/{id}/role`` -- Change member role (OWNER/ADMIN)
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
    verify_token,
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
    get_user_memberships,
    verify_password,
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


class LoginRequest(BaseModel):
    """Login request body."""

    email: str  # Can be email or username
    password: str


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


class RefreshRequest(BaseModel):
    """Refresh token request body."""

    refresh_token: str


class RefreshResponse(BaseModel):
    """Refreshed access token response."""

    access_token: str
    token_type: str = "bearer"


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


async def get_current_member(
    token: str,
    db: AsyncSession,
) -> dict:
    """Extract and validate current user from JWT token.

    Returns dict with user_id, org_id, role, email.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = verify_token(token)
    except Exception:
        raise credentials_exception from None

    if payload.get("type") != "access":
        raise credentials_exception

    user_id = payload.get("user_id")
    org_id = payload.get("org_id")
    if user_id is None or org_id is None:
        raise credentials_exception

    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise credentials_exception

    membership = await get_membership(db, user_id, org_id)
    if not membership or not membership.accepted_at:
        raise credentials_exception

    return {
        "user_id": user_id,
        "org_id": org_id,
        "role": membership.role,
        "email": user.email,
    }


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


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> TokenResponse:
    """Authenticate user with email and password.

    Returns JWT tokens with organization context.
    If user belongs to multiple orgs, returns the first one.
    """
    user = await get_user_by_email(db, request.email)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(request.password, user.password_hash):
        logger.warning("Login failed for email=%s", request.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    memberships = await get_user_memberships(db, user.id)
    accepted_memberships = [m for m in memberships if m.accepted_at]

    if not accepted_memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active organization membership",
        )

    membership = accepted_memberships[0]
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

    logger.info("User logged in: email=%s, org=%s", user.email, org.slug)

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


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    request: RefreshRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> RefreshResponse:
    """Exchange a valid refresh token for a new access token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = verify_token(request.refresh_token)
    except Exception:
        raise credentials_exception from None

    if payload.get("type") != "refresh":
        raise credentials_exception

    user_id = payload.get("user_id")
    org_id = payload.get("org_id")
    if user_id is None or org_id is None:
        raise credentials_exception

    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise credentials_exception

    membership = await get_membership(db, user_id, org_id)
    if not membership or not membership.accepted_at:
        raise credentials_exception

    token_data = {
        "sub": user.email,
        "user_id": user.id,
        "org_id": org_id,
        "role": membership.role,
    }
    new_access = create_access_token(data=token_data)

    return RefreshResponse(access_token=new_access)


@router.post("/invite", response_model=InviteResponse)
async def invite_member(
    request: InviteRequest,
    authorization: str | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> InviteResponse:
    """Invite a user to the organization.

    Requires OWNER or ADMIN role.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1]
    current_member = await get_current_member(token, db)

    if current_member["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER or ADMIN can invite members",
        )

    existing_user = await get_user_by_email(db, request.email)
    if existing_user:
        existing_membership = await get_membership(db, existing_user.id, current_member["org_id"])
        if existing_membership and existing_membership.accepted_at:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this organization",
            )

    membership, invite_token = await create_invite(
        db,
        org_id=current_member["org_id"],
        invited_by=current_member["user_id"],
        email=request.email,
        role=request.role,
    )

    await db.commit()

    logger.info(
        "Invite created: email=%s, org_id=%d, by=%s",
        request.email,
        current_member["org_id"],
        current_member["email"],
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
    authorization: str | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> MemberListResponse:
    """List all members of the current organization."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1]
    current_member = await get_current_member(token, db)

    memberships = await get_org_members(db, current_member["org_id"])

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
    authorization: str | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> MemberResponse:
    """Update a member's role.

    Requires OWNER or ADMIN role.
    OWNER role can only be transferred by current OWNER.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1]
    current_member = await get_current_member(token, db)

    if current_member["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER or ADMIN can change roles",
        )

    if request.role == MemberRole.OWNER and current_member["role"] != MemberRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER can transfer ownership",
        )

    from sqlalchemy import select

    from app.models import Membership

    result = await db.execute(
        select(Membership).where(
            Membership.id == member_id,
            Membership.org_id == current_member["org_id"],
        )
    )
    membership = result.scalar_one_or_none()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    if membership.user_id == current_member["user_id"] and membership.role == MemberRole.OWNER:
        all_memberships = await get_org_members(db, current_member["org_id"])
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
        current_member["email"],
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
