# @TASK P4-T4.6 - Settings API 테스트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#settings
# @TEST tests/test_api_settings.py

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import make_auth_headers


class TestListSettings:
    @pytest.mark.asyncio
    async def test_list_settings_returns_all(self, test_client: AsyncClient):
        response = await test_client.get("/api/settings", headers=make_auth_headers())

        assert response.status_code == 200
        data = response.json()
        assert "settings" in data
        assert isinstance(data["settings"], list)
        assert len(data["settings"]) > 0

        for item in data["settings"]:
            assert "key" in item
            assert "value" in item
            assert "description" in item

    @pytest.mark.asyncio
    async def test_api_keys_are_masked(self, test_client: AsyncClient):
        # First set an API key
        await test_client.put(
            "/api/settings/openai_api_key",
            json={"value": "sk-abc123secretkey"},
            headers=make_auth_headers(),
        )

        response = await test_client.get("/api/settings", headers=make_auth_headers())

        assert response.status_code == 200
        data = response.json()
        openai_setting = next(
            (s for s in data["settings"] if s["key"] == "openai_api_key"),
            None,
        )
        assert openai_setting is not None
        assert openai_setting["value"] == "sk-****"
        assert "abc123secretkey" not in openai_setting["value"]

    @pytest.mark.asyncio
    async def test_empty_api_key_not_masked(self, test_client: AsyncClient):
        # Set empty API key
        await test_client.put(
            "/api/settings/openai_api_key",
            json={"value": ""},
            headers=make_auth_headers(),
        )

        response = await test_client.get("/api/settings", headers=make_auth_headers())

        assert response.status_code == 200
        data = response.json()
        openai_setting = next(
            (s for s in data["settings"] if s["key"] == "openai_api_key"),
            None,
        )
        assert openai_setting is not None
        assert openai_setting["value"] == ""

    @pytest.mark.asyncio
    async def test_list_settings_unauthenticated(self, test_client: AsyncClient):
        response = await test_client.get("/api/settings")
        assert response.status_code == 401


class TestGetSetting:
    @pytest.mark.asyncio
    async def test_get_existing_setting(self, test_client: AsyncClient):
        # Set value first
        await test_client.put(
            "/api/settings/default_ai_model",
            json={"value": "gpt-4"},
            headers=make_auth_headers(),
        )

        response = await test_client.get(
            "/api/settings/default_ai_model",
            headers=make_auth_headers(),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "default_ai_model"
        assert data["value"] == "gpt-4"
        assert "description" in data

    @pytest.mark.asyncio
    async def test_get_nonexistent_setting(self, test_client: AsyncClient):
        response = await test_client.get(
            "/api/settings/nonexistent_key_xyz",
            headers=make_auth_headers(),
        )

        assert response.status_code == 404
        data = response.json()
        assert "detail" in data

    @pytest.mark.asyncio
    async def test_get_api_key_masked(self, test_client: AsyncClient):
        await test_client.put(
            "/api/settings/anthropic_api_key",
            json={"value": "ant-mySecretKeyVal"},
            headers=make_auth_headers(),
        )

        response = await test_client.get(
            "/api/settings/anthropic_api_key",
            headers=make_auth_headers(),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["value"] == "ant****"
        assert "mySecretKeyVal" not in data["value"]

    @pytest.mark.asyncio
    async def test_get_setting_unauthenticated(self, test_client: AsyncClient):
        response = await test_client.get("/api/settings/default_ai_model")
        assert response.status_code == 401


class TestUpdateSetting:
    @pytest.mark.asyncio
    async def test_update_string_value(self, test_client: AsyncClient):
        response = await test_client.put(
            "/api/settings/default_ai_model",
            json={"value": "claude-3-opus"},
            headers=make_auth_headers(),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "default_ai_model"
        assert data["value"] == "claude-3-opus"
        assert data["updated"] is True

    @pytest.mark.asyncio
    async def test_update_numeric_value(self, test_client: AsyncClient):
        response = await test_client.put(
            "/api/settings/sync_interval_minutes",
            json={"value": 15},
            headers=make_auth_headers(),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "sync_interval_minutes"
        assert data["value"] == 15
        assert data["updated"] is True

    @pytest.mark.asyncio
    async def test_update_boolean_value(self, test_client: AsyncClient):
        response = await test_client.put(
            "/api/settings/max_search_results",
            json={"value": 50},
            headers=make_auth_headers(),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["value"] == 50
        assert data["updated"] is True

    @pytest.mark.asyncio
    async def test_update_api_key_returns_masked(self, test_client: AsyncClient):
        response = await test_client.put(
            "/api/settings/openai_api_key",
            json={"value": "sk-newkey1234567890"},
            headers=make_auth_headers(),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "openai_api_key"
        assert data["value"] == "sk-****"
        assert data["updated"] is True

    @pytest.mark.asyncio
    async def test_update_nonexistent_key(self, test_client: AsyncClient):
        response = await test_client.put(
            "/api/settings/totally_unknown_key",
            json={"value": "whatever"},
            headers=make_auth_headers(),
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_setting_unauthenticated(self, test_client: AsyncClient):
        response = await test_client.put(
            "/api/settings/default_ai_model",
            json={"value": "test"},
        )

        assert response.status_code == 401


class TestJsonbValueTypes:
    @pytest.mark.asyncio
    async def test_store_and_retrieve_string(self, test_client: AsyncClient):
        headers = make_auth_headers()

        await test_client.put(
            "/api/settings/embedding_model",
            json={"value": "text-embedding-3-large"},
            headers=headers,
        )

        response = await test_client.get("/api/settings/embedding_model", headers=headers)

        assert response.status_code == 200
        assert response.json()["value"] == "text-embedding-3-large"

    @pytest.mark.asyncio
    async def test_store_and_retrieve_integer(self, test_client: AsyncClient):
        headers = make_auth_headers()

        await test_client.put(
            "/api/settings/max_search_results",
            json={"value": 100},
            headers=headers,
        )

        response = await test_client.get("/api/settings/max_search_results", headers=headers)

        assert response.status_code == 200
        assert response.json()["value"] == 100

    @pytest.mark.asyncio
    async def test_store_and_retrieve_boolean_like(self, test_client: AsyncClient):
        headers = make_auth_headers()

        await test_client.put(
            "/api/settings/sync_interval_minutes",
            json={"value": 0},
            headers=headers,
        )

        response = await test_client.get("/api/settings/sync_interval_minutes", headers=headers)

        assert response.status_code == 200
        assert response.json()["value"] == 0
