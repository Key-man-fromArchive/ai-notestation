# @TASK P4-T4.6 - Settings API 엔드포인트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#settings

"""Settings API endpoints.

Provides:
- ``GET  /settings``       -- List all settings (API keys masked)
- ``GET  /settings/{key}`` -- Retrieve individual setting
- ``PUT  /settings/{key}`` -- Update individual setting

All endpoints require JWT authentication via Bearer token.

Storage:
    Uses PostgreSQL ``settings`` table with in-memory cache.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import Setting
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
    "nas_url": "Synology NAS URL (e.g. http://192.168.1.100:5000)",
    "nas_user": "Synology NAS login username",
    "nas_password": "Synology NAS login password",
    "openai_api_key": "OpenAI API key for GPT models",
    "anthropic_api_key": "Anthropic API key for Claude models",
    "google_api_key": "Google API key for Gemini models",
    "zhipuai_api_key": "ZhipuAI API key for GLM models",
    "default_ai_model": "Default AI model for inference",
    "sync_interval_minutes": "Note synchronization interval in minutes",
    "embedding_model": "Embedding model for semantic search",
    "max_search_results": "Maximum number of search results returned",
}


def _get_default_settings() -> dict[str, Any]:
    """Return default settings from environment variables."""
    env = get_settings()
    return {
        "nas_url": env.SYNOLOGY_URL,
        "nas_user": env.SYNOLOGY_USER,
        "nas_password": env.SYNOLOGY_PASSWORD,
        "openai_api_key": env.OPENAI_API_KEY or "",
        "anthropic_api_key": env.ANTHROPIC_API_KEY or "",
        "google_api_key": env.GOOGLE_API_KEY or "",
        "zhipuai_api_key": env.ZHIPUAI_API_KEY or "",
        "default_ai_model": "gpt-4",
        "sync_interval_minutes": 30,
        "embedding_model": "text-embedding-3-small",
        "max_search_results": 20,
    }


_settings_cache: dict[str, Any] = {}


def _get_store() -> dict[str, Any]:
    """Return cached settings (for sync access). Use _load_from_db for fresh data."""
    if not _settings_cache:
        _settings_cache.update(_get_default_settings())
    return _settings_cache


async def _load_from_db(db: AsyncSession) -> dict[str, Any]:
    """Load settings from database, merging with defaults."""
    defaults = _get_default_settings()

    result = await db.execute(select(Setting))
    db_settings = result.scalars().all()

    for setting in db_settings:
        if setting.key in defaults and setting.value.get("v"):
            defaults[setting.key] = setting.value["v"]

    _settings_cache.clear()
    _settings_cache.update(defaults)
    return defaults


async def _save_to_db(db: AsyncSession, key: str, value: Any) -> None:
    """Save a setting to the database."""
    from sqlalchemy.orm.attributes import flag_modified

    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()

    logger.info("_save_to_db: key=%s, existing=%s", key, setting is not None)

    if setting:
        setting.value = {"v": value}
        flag_modified(setting, "value")
        logger.info("_save_to_db: updated existing setting, new value=%s", setting.value)
    else:
        setting = Setting(key=key, value={"v": value})
        db.add(setting)
        logger.info("_save_to_db: created new setting")

    await db.flush()
    await db.commit()
    logger.info("_save_to_db: committed successfully")
    _settings_cache[key] = value


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
    if key == "nas_password" and isinstance(value, str) and len(value) > 0:
        return "****"
    return value


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=SettingsListResponse)
async def list_settings(
    _current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> SettingsListResponse:
    """Return all application settings.

    API key values are masked for security. Requires JWT authentication.
    """
    settings_dict = await _load_from_db(db)
    items = [
        SettingItem(
            key=key,
            value=_mask_value(key, settings_dict[key]),
            description=_SETTING_DESCRIPTIONS.get(key, ""),
        )
        for key in settings_dict
    ]
    return SettingsListResponse(settings=items)


@router.get("/{key}", response_model=SettingItem)
async def get_setting(
    key: str,
    _current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> SettingItem:
    """Return a single setting by key.

    API key values are masked. Returns 404 if the key is not recognized.

    Args:
        key: The setting key to retrieve.
    """
    settings_dict = await _load_from_db(db)
    if key not in settings_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Setting '{key}' not found",
        )

    return SettingItem(
        key=key,
        value=_mask_value(key, settings_dict[key]),
        description=_SETTING_DESCRIPTIONS.get(key, ""),
    )


@router.put("/{key}", response_model=SettingUpdateResponse)
async def update_setting(
    key: str,
    body: SettingUpdateRequest,
    _current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> SettingUpdateResponse:
    """Update a single setting by key.

    Returns the updated value (masked if it is an API key).
    Returns 404 if the key is not recognized.

    Args:
        key: The setting key to update.
        body: Request body containing the new value.
    """
    settings_dict = await _load_from_db(db)
    if key not in settings_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Setting '{key}' not found",
        )

    await _save_to_db(db, key, body.value)
    logger.info("Setting '%s' updated by user", key)

    if key.endswith("_api_key") and key != "nas_password":
        try:
            from app.api.ai import reset_ai_router

            reset_ai_router()
            logger.info("AI router reset due to key change: %s", key)
        except Exception:
            logger.warning("Failed to reset AI router after key change")

    return SettingUpdateResponse(
        key=key,
        value=_mask_value(key, body.value),
        updated=True,
    )


# ---------------------------------------------------------------------------
# NAS configuration helpers (used by sync / auth modules)
# ---------------------------------------------------------------------------


def get_nas_config() -> dict[str, str]:
    """Return the current NAS connection settings.

    Other modules (sync, auth) should call this instead of reading
    ``get_settings()`` directly so that runtime overrides made through
    the Settings UI are respected.

    Returns:
        A dict with keys ``url``, ``user``, ``password``.
    """
    store = _get_store()
    return {
        "url": store["nas_url"],
        "user": store["nas_user"],
        "password": store["nas_password"],
    }


# ---------------------------------------------------------------------------
# NAS connection test
# ---------------------------------------------------------------------------


class NasTestResponse(BaseModel):
    """Response for the NAS connection test."""

    success: bool
    message: str


@router.post("/nas/test", response_model=NasTestResponse)
async def test_nas_connection(
    _current_user: dict = Depends(get_current_user),  # noqa: B008
) -> NasTestResponse:
    """Test connectivity to the configured Synology NAS.

    Attempts to authenticate using the current NAS settings.
    Returns success/failure with a human-readable message.
    """
    from app.synology_gateway.client import SynologyAuthError, SynologyClient

    nas = get_nas_config()

    if not nas["url"]:
        return NasTestResponse(success=False, message="NAS URL이 설정되지 않았습니다.")

    client = SynologyClient(
        url=nas["url"],
        user=nas["user"],
        password=nas["password"],
    )
    try:
        await client.login()
        return NasTestResponse(success=True, message="NAS에 성공적으로 연결되었습니다.")
    except SynologyAuthError:
        return NasTestResponse(
            success=False,
            message="NAS 인증에 실패했습니다. 사용자 이름과 비밀번호를 확인하세요.",
        )
    except Exception as exc:
        return NasTestResponse(
            success=False,
            message=f"NAS 연결에 실패했습니다: {exc}",
        )
    finally:
        await client.close()
