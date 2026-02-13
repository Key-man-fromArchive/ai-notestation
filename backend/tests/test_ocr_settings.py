"""Tests for OCR engine setting CRUD + service reflection.

Covers:
- GET /settings/ocr_engine default
- PUT to paddleocr_vl
- Round-trip back to ai_vision
- Settings cache reflection
"""

from __future__ import annotations

import pytest

from tests.conftest import make_auth_headers


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    """Reset the in-memory settings cache before each test."""
    from app.api.settings import _settings_cache
    _settings_cache.clear()
    yield
    _settings_cache.clear()


class TestOcrSettings:
    """OCR engine setting CRUD via /api/settings/{key}."""

    @pytest.mark.asyncio
    async def test_get_returns_valid_engine(self, test_client, test_db):
        """GET /settings/ocr_engine returns a valid engine value."""
        resp = await test_client.get(
            "/api/settings/ocr_engine",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["value"] in ("ai_vision", "paddleocr_vl")

    @pytest.mark.asyncio
    async def test_update_to_paddleocr(self, test_client, test_db):
        resp = await test_client.put(
            "/api/settings/ocr_engine",
            json={"value": "paddleocr_vl"},
            headers=make_auth_headers(),
        )
        assert resp.status_code == 200
        assert resp.json()["updated"] is True

        # Verify via GET
        get_resp = await test_client.get(
            "/api/settings/ocr_engine",
            headers=make_auth_headers(),
        )
        assert get_resp.json()["value"] == "paddleocr_vl"

    @pytest.mark.asyncio
    async def test_update_back_to_ai_vision(self, test_client, test_db):
        # First change to paddleocr_vl
        await test_client.put(
            "/api/settings/ocr_engine",
            json={"value": "paddleocr_vl"},
            headers=make_auth_headers(),
        )
        # Then change back
        resp = await test_client.put(
            "/api/settings/ocr_engine",
            json={"value": "ai_vision"},
            headers=make_auth_headers(),
        )
        assert resp.status_code == 200

        get_resp = await test_client.get(
            "/api/settings/ocr_engine",
            headers=make_auth_headers(),
        )
        assert get_resp.json()["value"] == "ai_vision"

    @pytest.mark.asyncio
    async def test_reflected_in_service_cache(self, test_client, test_db):
        """Settings cache should reflect the updated value."""
        await test_client.put(
            "/api/settings/ocr_engine",
            json={"value": "paddleocr_vl"},
            headers=make_auth_headers(),
        )

        from app.api.settings import _get_store
        store = _get_store()
        assert store.get("ocr_engine") == "paddleocr_vl"
