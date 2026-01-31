"""Tests for OAuth API endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


def _get_app():
    from app.main import app
    return app


def _setup_overrides(app):
    from app.services.auth_service import get_current_user

    async def _fake_current_user():
        return {"username": "testuser"}

    app.dependency_overrides[get_current_user] = _fake_current_user
    return app


def _clear_overrides(app):
    app.dependency_overrides.clear()


class TestAuthorizeEndpoint:
    """GET /api/oauth/{provider}/authorize."""

    @pytest.mark.asyncio
    async def test_unsupported_provider_returns_400(self):
        app = _get_app()
        _setup_overrides(app)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/oauth/unsupported/authorize")
            assert resp.status_code == 400
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_google_authorize_returns_url(self):
        app = _get_app()
        _setup_overrides(app)
        try:
            mock_result = {"authorization_url": "https://accounts.google.com/...", "state": "abc123"}

            with patch("app.api.oauth.OAuthService") as MockService:
                instance = MockService.return_value
                instance.build_authorize_url = AsyncMock(return_value=mock_result)

                from app.api.oauth import _get_oauth_service
                app.dependency_overrides[_get_oauth_service] = lambda: instance

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.get("/api/oauth/google/authorize")

                assert resp.status_code == 200
                data = resp.json()
                assert "authorization_url" in data
                assert "state" in data
        finally:
            _clear_overrides(app)


class TestCallbackEndpoint:
    """POST /api/oauth/{provider}/callback."""

    @pytest.mark.asyncio
    async def test_callback_success(self):
        app = _get_app()
        _setup_overrides(app)
        try:
            mock_result = {"connected": True, "provider": "google", "email": "user@gmail.com"}

            with patch("app.api.oauth.OAuthService") as MockService:
                instance = MockService.return_value
                instance.exchange_code = AsyncMock(return_value=mock_result)

                from app.api.oauth import _get_oauth_service
                app.dependency_overrides[_get_oauth_service] = lambda: instance

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.post(
                        "/api/oauth/google/callback",
                        json={"code": "auth-code", "state": "valid-state"},
                    )

                assert resp.status_code == 200
                data = resp.json()
                assert data["connected"] is True
                assert data["email"] == "user@gmail.com"
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_callback_invalid_state_returns_400(self):
        app = _get_app()
        _setup_overrides(app)
        try:
            from app.services.oauth_service import OAuthError

            with patch("app.api.oauth.OAuthService") as MockService:
                instance = MockService.return_value
                instance.exchange_code = AsyncMock(
                    side_effect=OAuthError("Invalid or expired state", "google")
                )

                from app.api.oauth import _get_oauth_service
                app.dependency_overrides[_get_oauth_service] = lambda: instance

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.post(
                        "/api/oauth/google/callback",
                        json={"code": "bad-code", "state": "bad-state"},
                    )

                assert resp.status_code == 400
        finally:
            _clear_overrides(app)


class TestStatusEndpoint:
    """GET /api/oauth/{provider}/status."""

    @pytest.mark.asyncio
    async def test_status_connected(self):
        app = _get_app()
        _setup_overrides(app)
        try:
            mock_result = {"connected": True, "provider": "google", "email": "user@gmail.com", "expires_at": None}

            with patch("app.api.oauth.OAuthService") as MockService:
                instance = MockService.return_value
                instance.get_status = AsyncMock(return_value=mock_result)

                from app.api.oauth import _get_oauth_service
                app.dependency_overrides[_get_oauth_service] = lambda: instance

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.get("/api/oauth/google/status")

                assert resp.status_code == 200
                assert resp.json()["connected"] is True
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_status_disconnected(self):
        app = _get_app()
        _setup_overrides(app)
        try:
            mock_result = {"connected": False, "provider": "google", "email": None, "expires_at": None}

            with patch("app.api.oauth.OAuthService") as MockService:
                instance = MockService.return_value
                instance.get_status = AsyncMock(return_value=mock_result)

                from app.api.oauth import _get_oauth_service
                app.dependency_overrides[_get_oauth_service] = lambda: instance

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.get("/api/oauth/google/status")

                assert resp.status_code == 200
                assert resp.json()["connected"] is False
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_openai_authorize_returns_url(self):
        """OpenAI OAuth (Codex CLI flow) should return authorize URL."""
        app = _get_app()
        _setup_overrides(app)
        try:
            mock_result = {"authorization_url": "https://auth.openai.com/oauth/authorize?...", "state": "xyz"}

            with patch("app.api.oauth.OAuthService") as MockService:
                instance = MockService.return_value
                instance.build_authorize_url = AsyncMock(return_value=mock_result)

                from app.api.oauth import _get_oauth_service
                app.dependency_overrides[_get_oauth_service] = lambda: instance

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.get("/api/oauth/openai/authorize")

                assert resp.status_code == 200
                data = resp.json()
                assert "authorization_url" in data
                assert "auth.openai.com" in data["authorization_url"]
        finally:
            _clear_overrides(app)


class TestDisconnectEndpoint:
    """DELETE /api/oauth/{provider}/disconnect."""

    @pytest.mark.asyncio
    async def test_disconnect_success(self):
        app = _get_app()
        _setup_overrides(app)
        try:
            with patch("app.api.oauth.OAuthService") as MockService:
                instance = MockService.return_value
                instance.revoke_token = AsyncMock(return_value={"disconnected": True})

                from app.api.oauth import _get_oauth_service
                app.dependency_overrides[_get_oauth_service] = lambda: instance

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.delete("/api/oauth/google/disconnect")

                assert resp.status_code == 200
                assert resp.json()["disconnected"] is True
        finally:
            _clear_overrides(app)
