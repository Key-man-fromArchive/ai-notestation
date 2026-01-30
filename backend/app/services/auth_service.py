# @TASK P4-T4.1 - JWT 토큰 발급/검증 서비스
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#authentication

"""JWT authentication service for LabNote AI.

Provides token creation, verification, and a FastAPI dependency
for extracting the current user from the Authorization header.

Token types:
- **access**: Short-lived token (default 30 min) for API access.
- **refresh**: Long-lived token (default 7 days) for obtaining new access tokens.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=True)


def create_access_token(
    data: dict,
    expires_delta: timedelta | None = None,
    *,
    settings: Settings | None = None,
) -> str:
    """Create a JWT access token.

    Args:
        data: Claims to encode in the token (must include ``sub`` for subject).
        expires_delta: Custom expiration timedelta. Falls back to config default.
        settings: Optional settings override (useful for testing).

    Returns:
        Encoded JWT string.
    """
    if settings is None:
        settings = get_settings()

    to_encode = data.copy()
    expire = datetime.now(UTC) + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})

    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    data: dict,
    *,
    settings: Settings | None = None,
) -> str:
    """Create a JWT refresh token.

    Args:
        data: Claims to encode (must include ``sub`` for subject).
        settings: Optional settings override.

    Returns:
        Encoded JWT string.
    """
    if settings is None:
        settings = get_settings()

    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})

    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def verify_token(
    token: str,
    *,
    settings: Settings | None = None,
) -> dict:
    """Decode and verify a JWT token.

    Args:
        token: The encoded JWT string.
        settings: Optional settings override.

    Returns:
        The decoded payload dictionary.

    Raises:
        JWTError: If the token is invalid, expired, or tampered with.
    """
    if settings is None:
        settings = get_settings()

    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


async def get_current_user(
    token: str = Depends(oauth2_scheme),
) -> dict:
    """FastAPI dependency that extracts the current user from a Bearer token.

    This function is designed to be used with ``Depends(get_current_user)``.

    Args:
        token: JWT bearer token (injected by ``OAuth2PasswordBearer``).

    Returns:
        A dict with at least ``{"username": "<sub_claim>"}``.

    Raises:
        HTTPException: 401 if the token is invalid, expired, or missing ``sub``.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = verify_token(token)
    except JWTError:
        raise credentials_exception from None

    # Only access tokens are allowed for API authentication
    if payload.get("type") != "access":
        raise credentials_exception

    username: str | None = payload.get("sub")
    if username is None:
        raise credentials_exception

    return {"username": username}
