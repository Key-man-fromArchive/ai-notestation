# @TASK P4-T4.1 - 인증 API 엔드포인트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#authentication

"""Authentication API endpoints.

Provides:
- ``POST /auth/login``          -- Synology NAS login, returns JWT pair
- ``POST /auth/token/refresh``  -- Exchange refresh token for new access token
- ``GET  /auth/me``             -- Return current user info (requires auth)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.config import get_settings
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    verify_token,
)
from app.synology_gateway.client import SynologyAuthError, SynologyClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    """Login request body."""

    username: str
    password: str


class TokenResponse(BaseModel):
    """JWT token pair response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AccessTokenResponse(BaseModel):
    """Single access token response (for refresh)."""

    access_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    """Refresh token request body."""

    refresh_token: str


class UserResponse(BaseModel):
    """Current user information."""

    username: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_synology_client(username: str, password: str) -> SynologyClient:
    """Create a SynologyClient with the given credentials.

    Uses the NAS URL from application settings.
    This function is extracted to allow easy mocking in tests.
    """
    settings = get_settings()
    return SynologyClient(
        url=settings.SYNOLOGY_URL,
        user=username,
        password=password,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest) -> TokenResponse:
    """Authenticate via Synology NAS and return JWT tokens.

    The user's credentials are forwarded to the Synology NAS.
    On success, a JWT access + refresh token pair is returned.

    Raises:
        HTTPException 401: If Synology authentication fails.
    """
    client = _create_synology_client(request.username, request.password)

    try:
        await client.login()
    except SynologyAuthError:
        logger.warning("Login failed for user=%s", request.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Synology credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    finally:
        await client.close()

    token_data = {"sub": request.username}
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/token/refresh", response_model=AccessTokenResponse)
async def refresh_token(request: RefreshRequest) -> AccessTokenResponse:
    """Exchange a valid refresh token for a new access token.

    Raises:
        HTTPException 401: If the refresh token is invalid or expired.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = verify_token(request.refresh_token)
    except Exception:
        raise credentials_exception from None

    # Only refresh tokens are accepted here
    if payload.get("type") != "refresh":
        raise credentials_exception

    username = payload.get("sub")
    if username is None:
        raise credentials_exception

    new_access = create_access_token(data={"sub": username})
    return AccessTokenResponse(access_token=new_access)


@router.get("/me", response_model=UserResponse)
async def me(current_user: dict = Depends(get_current_user)) -> UserResponse:  # noqa: B008
    """Return information about the currently authenticated user.

    Requires a valid Bearer access token in the Authorization header.
    """
    return UserResponse(username=current_user["username"])
