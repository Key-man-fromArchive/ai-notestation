"""Test that AI endpoints use OAuth tokens when available."""

from __future__ import annotations

import base64
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai_router.schemas import AIResponse, TokenUsage
from app.services.auth_service import create_access_token


_VALID_TOKEN: str | None = None


def _make_fake_chatgpt_jwt(account_id: str = "acct-test123") -> str:
    """Create a fake JWT with a chatgpt_account_id claim."""
    payload = {"https://api.openai.com/auth": {"chatgpt_account_id": account_id}}
    b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"header.{b64}.signature"


def _get_valid_token() -> str:
    global _VALID_TOKEN  # noqa: PLW0603
    if _VALID_TOKEN is None:
        _VALID_TOKEN = create_access_token(data={
            "sub": "testuser@example.com",
            "user_id": 1,
            "org_id": 1,
            "role": "owner",
        })
    return _VALID_TOKEN


def _auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_get_valid_token()}"}


class TestAIOAuthIntegration:
    """Test OAuth token injection into AI endpoints."""

    @pytest.mark.asyncio
    async def test_chat_uses_oauth_token_when_available(self):
        """AI chat should inject OAuth token for the resolved provider."""
        from app.api.ai import _get_oauth_service, get_ai_router
        from app.database import get_db
        from app.main import app

        # Mock AI router (will be copied via __new__ + _providers dict)
        mock_router = MagicMock()
        mock_router._providers = {}

        # Mock OAuth service that returns a token (fake JWT with account_id)
        fake_jwt = _make_fake_chatgpt_jwt("acct-test123")
        mock_oauth = MagicMock()
        mock_oauth.get_valid_token = AsyncMock(return_value=fake_jwt)

        # Mock DB
        mock_db = AsyncMock()

        app.dependency_overrides[get_ai_router] = lambda: mock_router
        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[_get_oauth_service] = lambda: mock_oauth

        try:
            from httpx import ASGITransport, AsyncClient

            # Mock the ChatGPTCodexProvider to avoid real HTTP calls
            mock_codex_provider = MagicMock()
            mock_codex_provider.is_oauth = True
            mock_codex_provider.available_models.return_value = [
                MagicMock(id="gpt-4o"),
            ]
            mock_codex_provider.chat = AsyncMock(return_value=AIResponse(
                content="codex response",
                model="gpt-4o",
                provider="openai-codex",
                usage=None,
            ))

            with patch(
                "app.ai_router.providers.chatgpt_codex.ChatGPTCodexProvider",
                return_value=mock_codex_provider,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.post("/api/ai/chat", json={
                        "feature": "insight",
                        "content": "test note content",
                        "model": "gpt-4o",
                    }, headers=_auth_headers())

            assert resp.status_code == 200
            data = resp.json()
            assert data["content"] == "codex response"
            assert data["provider"] == "openai-codex"
            # Verify OAuth token was fetched
            mock_oauth.get_valid_token.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_chat_works_without_oauth_token(self):
        """AI chat should still work when no OAuth token is available."""
        from app.api.ai import _get_oauth_service, get_ai_router
        from app.database import get_db
        from app.main import app

        mock_router = MagicMock()
        mock_router.chat = AsyncMock(return_value=AIResponse(
            content="api key response",
            model="gpt-4o",
            provider="openai",
            usage=None,
        ))

        # OAuth service returns None (no token)
        mock_oauth = MagicMock()
        mock_oauth.get_valid_token = AsyncMock(return_value=None)

        app.dependency_overrides[get_ai_router] = lambda: mock_router
        app.dependency_overrides[get_db] = lambda: AsyncMock()
        app.dependency_overrides[_get_oauth_service] = lambda: mock_oauth

        try:
            from httpx import ASGITransport, AsyncClient

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post("/api/ai/chat", json={
                    "feature": "insight",
                    "content": "test note content",
                    "model": "gpt-4o",
                }, headers=_auth_headers())

            assert resp.status_code == 200
            # Router.chat should be called (uses original router, no OAuth)
            mock_router.chat.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_resolve_provider_name(self):
        """_resolve_provider_name should map models to OAuth providers."""
        from app.api.ai import _resolve_provider_name

        assert _resolve_provider_name("gpt-4o") == "openai"
        assert _resolve_provider_name("gpt-4o-mini") == "openai"
        assert _resolve_provider_name("gemini-2.0-flash") == "google"
        assert _resolve_provider_name("claude-sonnet-4-20250514") is None
        assert _resolve_provider_name(None) is None
