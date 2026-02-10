"""Authentication API endpoints.

Unified auth endpoints:
- POST /auth/login          -- Member login (email/password), returns JWT pair
- POST /auth/token/refresh  -- Exchange refresh token for new access token
- GET  /auth/me             -- Return current user info (requires auth)
- POST /auth/nas/test       -- Test NAS connection (admin/owner only)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import MemberRole
from app.database import get_db
from app.models import Organization
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    verify_token,
)
from app.services.user_service import (
    get_membership,
    get_user_by_email,
    get_user_by_id,
    get_user_memberships,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    name: str
    org_id: int
    org_slug: str
    role: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    user_id: int
    email: str
    name: str
    org_id: int
    org_slug: str
    role: str


class NasTestRequest(BaseModel):
    username: str
    password: str
    otp_code: str | None = None


class NasTestResponse(BaseModel):
    success: bool
    message: str
    requires_2fa: bool = False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> TokenResponse:
    """Authenticate user with email/password. Returns JWT with org context."""
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
    accepted = [m for m in memberships if m.accepted_at]

    if not accepted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active organization membership",
        )

    membership = accepted[0]

    org_result = await db.execute(
        select(Organization).where(Organization.id == membership.org_id)
    )
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


@router.post("/token/refresh", response_model=AccessTokenResponse)
async def refresh_token(
    request: RefreshRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AccessTokenResponse:
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
    return AccessTokenResponse(access_token=new_access)


@router.get("/me", response_model=UserResponse)
async def me(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> UserResponse:
    """Return full user info for the authenticated user."""
    user = await get_user_by_id(db, current_user["user_id"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    org_result = await db.execute(
        select(Organization).where(Organization.id == current_user["org_id"])
    )
    org = org_result.scalar_one_or_none()

    return UserResponse(
        user_id=user.id,
        email=user.email,
        name=user.name,
        org_id=current_user["org_id"],
        org_slug=org.slug if org else "",
        role=current_user["role"],
    )


@router.post("/nas/test", response_model=NasTestResponse)
async def test_nas_connection(
    request: NasTestRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> NasTestResponse:
    """Test NAS connection with given credentials. Admin/Owner only."""
    if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can manage NAS connection",
        )

    from app.api.settings import get_nas_config
    from app.synology_gateway.client import (
        Synology2FARequired,
        SynologyAuthError,
        SynologyClient,
    )

    nas = get_nas_config()
    client = SynologyClient(
        url=nas["url"],
        user=request.username,
        password=request.password,
    )

    try:
        await client.login(otp_code=request.otp_code)
        await client.close()
        return NasTestResponse(success=True, message="NAS connection successful")
    except Synology2FARequired:
        await client.close()
        return NasTestResponse(
            success=False,
            message="2FA required",
            requires_2fa=True,
        )
    except SynologyAuthError as e:
        await client.close()
        msg = "Invalid credentials"
        if e.code == 404:
            msg = "Invalid OTP code"
        return NasTestResponse(success=False, message=msg)
    except Exception as e:
        await client.close()
        return NasTestResponse(success=False, message=str(e))
