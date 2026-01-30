# @TASK P4-T4.6 - Settings API 엔드포인트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#settings

"""Settings API endpoints.

Provides:
- ``GET  /settings``       -- List all settings (API keys masked)
- ``GET  /settings/{key}`` -- Retrieve individual setting
- ``PUT  /settings/{key}`` -- Update individual setting

All endpoints require JWT authentication via Bearer token.

Storage:
    Currently uses an in-memory dictionary (``_settings_store``).
    This will be migrated to the ``settings`` PostgreSQL table (JSONB)
    in a future phase.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class SettingItem(BaseModel):
    """Single setting item returned by the API."""

    key: str
    value: Any
    description: str = ""
    oauth_connected: bool | None = None
    oauth_email: str | None = None


class SettingsListResponse(BaseModel):
    """Response for listing all settings."""

    settings: list[SettingItem]


class SettingUpdateRequest(BaseModel):
    """Request body for updating a setting."""

    value: Any


class SettingUpdateResponse(BaseModel):
    """Response after updating a setting."""

    key: str
    value: Any
    updated: bool


# ---------------------------------------------------------------------------
# Setting definitions and in-memory store
# ---------------------------------------------------------------------------

# Description metadata for each known setting key
_SETTING_DESCRIPTIONS: dict[str, str] = {
    "openai_api_key": "OpenAI API key for GPT models",
    "anthropic_api_key": "Anthropic API key for Claude models",
    "google_api_key": "Google API key for Gemini models",
    "zhipuai_api_key": "ZhipuAI API key for GLM models",
    "default_ai_model": "Default AI model for inference",
    "sync_interval_minutes": "Note synchronization interval in minutes",
    "embedding_model": "Embedding model for semantic search",
    "max_search_results": "Maximum number of search results returned",
}

# In-memory settings store (will be replaced by DB in future phase)
# Keys must match _SETTING_DESCRIPTIONS to be recognized.
_settings_store: dict[str, Any] = {
    "openai_api_key": "",
    "anthropic_api_key": "",
    "google_api_key": "",
    "zhipuai_api_key": "",
    "default_ai_model": "gpt-4",
    "sync_interval_minutes": 30,
    "embedding_model": "text-embedding-3-small",
    "max_search_results": 20,
}


# ---------------------------------------------------------------------------
# Masking helper
# ---------------------------------------------------------------------------


def _mask_value(key: str, value: Any) -> Any:
    """Mask sensitive values (API keys).

    Rules:
    - Keys ending with ``_api_key``: show first 3 characters + ``****``
    - Empty string keys: return as-is
    - All other keys: return value unchanged

    Args:
        key: The setting key name.
        value: The raw setting value.

    Returns:
        The masked or original value.
    """
    if key.endswith("_api_key") and isinstance(value, str) and len(value) > 0:
        return value[:3] + "****"
    return value


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=SettingsListResponse)
async def list_settings(
    _current_user: dict = Depends(get_current_user),  # noqa: B008
) -> SettingsListResponse:
    """Return all application settings.

    API key values are masked for security. Requires JWT authentication.
    """
    items = [
        SettingItem(
            key=key,
            value=_mask_value(key, _settings_store[key]),
            description=_SETTING_DESCRIPTIONS.get(key, ""),
        )
        for key in _settings_store
    ]
    return SettingsListResponse(settings=items)


@router.get("/{key}", response_model=SettingItem)
async def get_setting(
    key: str,
    _current_user: dict = Depends(get_current_user),  # noqa: B008
) -> SettingItem:
    """Return a single setting by key.

    API key values are masked. Returns 404 if the key is not recognized.

    Args:
        key: The setting key to retrieve.
    """
    if key not in _settings_store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Setting '{key}' not found",
        )

    return SettingItem(
        key=key,
        value=_mask_value(key, _settings_store[key]),
        description=_SETTING_DESCRIPTIONS.get(key, ""),
    )


@router.put("/{key}", response_model=SettingUpdateResponse)
async def update_setting(
    key: str,
    body: SettingUpdateRequest,
    _current_user: dict = Depends(get_current_user),  # noqa: B008
) -> SettingUpdateResponse:
    """Update a single setting by key.

    Returns the updated value (masked if it is an API key).
    Returns 404 if the key is not recognized.

    Args:
        key: The setting key to update.
        body: Request body containing the new value.
    """
    if key not in _settings_store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Setting '{key}' not found",
        )

    _settings_store[key] = body.value
    logger.info("Setting '%s' updated by user", key)

    return SettingUpdateResponse(
        key=key,
        value=_mask_value(key, _settings_store[key]),
        updated=True,
    )
