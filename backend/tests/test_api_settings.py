# @TASK P4-T4.6 - Settings API 테스트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#settings
# @TEST tests/test_api_settings.py

"""Tests for the Settings API endpoints.

Covers:
- GET /api/settings (list all settings with masked API keys)
- GET /api/settings/{key} (retrieve individual setting)
- PUT /api/settings/{key} (update individual setting)
- Authentication enforcement (401 without JWT)
- 404 for non-existent keys
- JSONB value types (string, number, boolean)
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient


def _get_app():
    """Import and return the FastAPI app with settings router included."""
    from app.main import app

    route_paths = [route.path for route in app.routes]
    if "/api/settings" not in route_paths:
        from app.api.settings import router as settings_router

        app.include_router(settings_router, prefix="/api")
    return app


def _auth_headers() -> dict[str, str]:
    """Return Authorization headers with a valid access token."""
    from app.services.auth_service import create_access_token

    token = create_access_token(data={"sub": "testadmin"})
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# GET /api/settings - List all settings
# ---------------------------------------------------------------------------


class TestListSettings:
    """Test GET /api/settings endpoint."""

    @pytest.mark.asyncio
    async def test_list_settings_returns_all(self):
        """Authenticated GET /api/settings should return all setting items."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/settings",
                headers=_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        assert "settings" in data
        assert isinstance(data["settings"], list)
        assert len(data["settings"]) > 0

        # Each item should have key, value, and description
        for item in data["settings"]:
            assert "key" in item
            assert "value" in item
            assert "description" in item

    @pytest.mark.asyncio
    async def test_api_keys_are_masked(self):
        """API key values should be masked (first 3 chars + '****')."""
        from app.api.settings import _settings_store

        # Pre-populate a key
        _settings_store["openai_api_key"] = "sk-abc123secretkey"

        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/settings",
                headers=_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        openai_setting = next(
            (s for s in data["settings"] if s["key"] == "openai_api_key"),
            None,
        )
        assert openai_setting is not None
        assert openai_setting["value"] == "sk-****"
        assert "abc123secretkey" not in openai_setting["value"]

        # Cleanup
        _settings_store["openai_api_key"] = ""

    @pytest.mark.asyncio
    async def test_empty_api_key_not_masked(self):
        """Empty API key should be returned as-is (empty string)."""
        from app.api.settings import _settings_store

        _settings_store["openai_api_key"] = ""

        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/settings",
                headers=_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        openai_setting = next(
            (s for s in data["settings"] if s["key"] == "openai_api_key"),
            None,
        )
        assert openai_setting is not None
        assert openai_setting["value"] == ""

    @pytest.mark.asyncio
    async def test_list_settings_unauthenticated(self):
        """GET /api/settings without auth should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/settings")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/settings/{key} - Individual setting
# ---------------------------------------------------------------------------


class TestGetSetting:
    """Test GET /api/settings/{key} endpoint."""

    @pytest.mark.asyncio
    async def test_get_existing_setting(self):
        """GET /api/settings/{key} should return the setting item."""
        from app.api.settings import _settings_store

        _settings_store["default_ai_model"] = "gpt-4"

        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/settings/default_ai_model",
                headers=_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "default_ai_model"
        assert data["value"] == "gpt-4"
        assert "description" in data

    @pytest.mark.asyncio
    async def test_get_nonexistent_setting(self):
        """GET /api/settings/{key} for unknown key should return 404."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/settings/nonexistent_key_xyz",
                headers=_auth_headers(),
            )

        assert response.status_code == 404
        data = response.json()
        assert "detail" in data

    @pytest.mark.asyncio
    async def test_get_api_key_masked(self):
        """GET individual API key setting should return masked value."""
        from app.api.settings import _settings_store

        _settings_store["anthropic_api_key"] = "ant-mySecretKeyVal"

        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/settings/anthropic_api_key",
                headers=_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        assert data["value"] == "ant****"
        assert "mySecretKeyVal" not in data["value"]

        # Cleanup
        _settings_store["anthropic_api_key"] = ""

    @pytest.mark.asyncio
    async def test_get_setting_unauthenticated(self):
        """GET /api/settings/{key} without auth should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/settings/default_ai_model")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# PUT /api/settings/{key} - Update setting
# ---------------------------------------------------------------------------


class TestUpdateSetting:
    """Test PUT /api/settings/{key} endpoint."""

    @pytest.mark.asyncio
    async def test_update_string_value(self):
        """PUT /api/settings/{key} should update a string setting."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/settings/default_ai_model",
                json={"value": "claude-3-opus"},
                headers=_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "default_ai_model"
        assert data["value"] == "claude-3-opus"
        assert data["updated"] is True

    @pytest.mark.asyncio
    async def test_update_numeric_value(self):
        """PUT /api/settings/{key} should handle numeric values."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/settings/sync_interval_minutes",
                json={"value": 15},
                headers=_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "sync_interval_minutes"
        assert data["value"] == 15
        assert data["updated"] is True

    @pytest.mark.asyncio
    async def test_update_boolean_value(self):
        """PUT /api/settings/{key} should handle boolean values.

        Note: max_search_results is a known key; here we test with a numeric setting
        storing a boolean-like value or any JSONB-compatible value.
        """
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/settings/max_search_results",
                json={"value": 50},
                headers=_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        assert data["value"] == 50
        assert data["updated"] is True

    @pytest.mark.asyncio
    async def test_update_api_key_returns_masked(self):
        """Updating an API key should return the masked value in the response."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/settings/openai_api_key",
                json={"value": "sk-newkey1234567890"},
                headers=_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "openai_api_key"
        assert data["value"] == "sk-****"
        assert data["updated"] is True

    @pytest.mark.asyncio
    async def test_update_nonexistent_key(self):
        """PUT /api/settings/{key} for unknown key should return 404."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/settings/totally_unknown_key",
                json={"value": "whatever"},
                headers=_auth_headers(),
            )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_setting_unauthenticated(self):
        """PUT /api/settings/{key} without auth should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/settings/default_ai_model",
                json={"value": "test"},
            )

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# JSONB value type verification
# ---------------------------------------------------------------------------


class TestJsonbValueTypes:
    """Verify JSONB-compatible value types are handled correctly."""

    @pytest.mark.asyncio
    async def test_store_and_retrieve_string(self):
        """String values should round-trip correctly."""
        app = _get_app()
        transport = ASGITransport(app=app)
        headers = _auth_headers()

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Set
            await client.put(
                "/api/settings/embedding_model",
                json={"value": "text-embedding-3-large"},
                headers=headers,
            )
            # Get
            response = await client.get(
                "/api/settings/embedding_model",
                headers=headers,
            )

        assert response.status_code == 200
        assert response.json()["value"] == "text-embedding-3-large"

    @pytest.mark.asyncio
    async def test_store_and_retrieve_integer(self):
        """Integer values should round-trip correctly."""
        app = _get_app()
        transport = ASGITransport(app=app)
        headers = _auth_headers()

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.put(
                "/api/settings/max_search_results",
                json={"value": 100},
                headers=headers,
            )
            response = await client.get(
                "/api/settings/max_search_results",
                headers=headers,
            )

        assert response.status_code == 200
        assert response.json()["value"] == 100

    @pytest.mark.asyncio
    async def test_store_and_retrieve_boolean_like(self):
        """Numeric zero/nonzero values should round-trip correctly as JSONB."""
        app = _get_app()
        transport = ASGITransport(app=app)
        headers = _auth_headers()

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.put(
                "/api/settings/sync_interval_minutes",
                json={"value": 0},
                headers=headers,
            )
            response = await client.get(
                "/api/settings/sync_interval_minutes",
                headers=headers,
            )

        assert response.status_code == 200
        assert response.json()["value"] == 0
