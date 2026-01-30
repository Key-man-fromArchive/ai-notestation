"""OAuth API endpoints for Google and OpenAI authentication.

Provides:
- ``GET    /oauth/{provider}/authorize``   -- Get authorization URL
- ``POST   /oauth/{provider}/callback``    -- Exchange code for tokens
- ``GET    /oauth/{provider}/status``      -- Check connection status
- ``DELETE /oauth/{provider}/disconnect``  -- Revoke tokens

All endpoints require JWT authentication.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.oauth_service import SUPPORTED_PROVIDERS, OAuthError, OAuthService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class AuthorizeResponse(BaseModel):
    authorization_url: str
    state: str


class CallbackRequest(BaseModel):
    code: str
    state: str


class CallbackResponse(BaseModel):
    connected: bool
    provider: str
    email: str | None = None


class StatusResponse(BaseModel):
    connected: bool
    provider: str
    email: str | None = None
    expires_at: str | None = None


class DisconnectResponse(BaseModel):
    disconnected: bool


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

def _get_oauth_service() -> OAuthService:
    return OAuthService()


def _validate_provider(provider: str) -> str:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider: {provider}. Supported: {', '.join(SUPPORTED_PROVIDERS)}",
        )
    return provider


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/{provider}/authorize", response_model=AuthorizeResponse)
async def get_authorize_url(
    provider: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    oauth_service: OAuthService = Depends(_get_oauth_service),
) -> AuthorizeResponse:
    """Get OAuth authorization URL for a provider."""
    _validate_provider(provider)

    try:
        result = await oauth_service.build_authorize_url(
            provider=provider,
            username=current_user["username"],
            db=db,
        )
        return AuthorizeResponse(**result)
    except OAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=exc.message,
        ) from exc


@router.post("/{provider}/callback", response_model=CallbackResponse)
async def handle_callback(
    provider: str,
    body: CallbackRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    oauth_service: OAuthService = Depends(_get_oauth_service),
) -> CallbackResponse:
    """Exchange authorization code for tokens."""
    _validate_provider(provider)

    try:
        result = await oauth_service.exchange_code(
            provider=provider,
            code=body.code,
            state=body.state,
            db=db,
        )
        return CallbackResponse(**result)
    except OAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=exc.message,
        ) from exc


@router.get("/{provider}/status", response_model=StatusResponse)
async def get_status(
    provider: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    oauth_service: OAuthService = Depends(_get_oauth_service),
) -> StatusResponse:
    """Check OAuth connection status for a provider."""
    _validate_provider(provider)

    result = await oauth_service.get_status(
        username=current_user["username"],
        provider=provider,
        db=db,
    )
    return StatusResponse(**result)


@router.delete("/{provider}/disconnect", response_model=DisconnectResponse)
async def disconnect(
    provider: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    oauth_service: OAuthService = Depends(_get_oauth_service),
) -> DisconnectResponse:
    """Revoke OAuth tokens and disconnect a provider."""
    _validate_provider(provider)

    result = await oauth_service.revoke_token(
        username=current_user["username"],
        provider=provider,
        db=db,
    )
    return DisconnectResponse(**result)
