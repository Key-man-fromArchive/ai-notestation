"""Tests for OAuth provider integration: register, remove, hot-swap."""

from __future__ import annotations

import base64
import json
from unittest.mock import MagicMock, patch

import pytest

from app.ai_router.router import AIRouter


def _make_fake_jwt(account_id: str = "acct-test123") -> str:
    """Create a fake JWT with a chatgpt_account_id claim."""
    payload = {"https://api.openai.com/auth": {"chatgpt_account_id": account_id}}
    b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"header.{b64}.signature"


class TestRegisterOAuthProvider:
    """Test register_oauth_provider for OpenAI and Google."""

    def test_register_openai_oauth(self):
        router = AIRouter()
        with patch.dict("os.environ", {}, clear=True):
            router._providers.clear()

        fake_jwt = _make_fake_jwt("acct-test123")
        router.register_oauth_provider("openai", fake_jwt)

        assert "openai" in router._providers
        assert router._providers["openai"].is_oauth is True
        assert router._providers["openai"]._account_id == "acct-test123"

    def test_register_openai_oauth_with_explicit_account_id(self):
        router = AIRouter()
        with patch.dict("os.environ", {}, clear=True):
            router._providers.clear()

        router.register_oauth_provider("openai", "plain-token", account_id="acct-explicit")

        assert "openai" in router._providers
        assert router._providers["openai"]._account_id == "acct-explicit"

    def test_register_openai_oauth_no_account_id_skips(self):
        router = AIRouter()
        with patch.dict("os.environ", {}, clear=True):
            router._providers.clear()

        router.register_oauth_provider("openai", "invalid-no-account-id-token")
        assert "openai" not in router._providers

    def test_register_google_oauth(self):
        router = AIRouter()
        with patch.dict("os.environ", {}, clear=True):
            router._providers.clear()

        with patch("app.ai_router.providers.google.GoogleProvider") as MockProvider:
            mock_instance = MagicMock()
            mock_instance.is_oauth = True
            MockProvider.return_value = mock_instance

            router.register_oauth_provider("google", "ya29.oauth-token")

            MockProvider.assert_called_once_with(oauth_token="ya29.oauth-token", is_oauth=True)
            assert "google" in router._providers

    def test_register_unsupported_provider_ignored(self):
        router = AIRouter()
        with patch.dict("os.environ", {}, clear=True):
            router._providers.clear()

        router.register_oauth_provider("unsupported", "token")
        assert "unsupported" not in router._providers

    def test_register_failure_handled(self):
        router = AIRouter()
        with patch.dict("os.environ", {}, clear=True):
            router._providers.clear()

        with patch(
            "app.ai_router.providers.chatgpt_codex.ChatGPTCodexProvider",
            side_effect=Exception("init failed"),
        ):
            fake_jwt = _make_fake_jwt()
            router.register_oauth_provider("openai", fake_jwt)

        assert "openai" not in router._providers


class TestRemoveProvider:
    """Test provider removal."""

    def test_remove_existing_provider(self):
        router = AIRouter()
        with patch.dict("os.environ", {}, clear=True):
            router._providers.clear()

        router._providers["test"] = MagicMock()
        assert router.remove_provider("test") is True
        assert "test" not in router._providers

    def test_remove_nonexistent_provider(self):
        router = AIRouter()
        with patch.dict("os.environ", {}, clear=True):
            router._providers.clear()

        assert router.remove_provider("nonexistent") is False


class TestOAuthProviderFlags:
    """Test is_oauth flag on providers."""

    def test_openai_is_oauth_default_false(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}):
            from app.ai_router.providers.openai import OpenAIProvider
            provider = OpenAIProvider(api_key="sk-test")
            assert provider.is_oauth is False

    def test_openai_is_oauth_true(self):
        from app.ai_router.providers.openai import OpenAIProvider
        provider = OpenAIProvider(api_key="oauth-token", is_oauth=True)
        assert provider.is_oauth is True

    def test_google_is_oauth_default_false(self):
        with patch("google.genai.Client"):
            from app.ai_router.providers.google import GoogleProvider
            provider = GoogleProvider(api_key="test-key")
            assert provider.is_oauth is False

    def test_google_oauth_token_sets_flag(self):
        with patch("google.genai.Client"):
            with patch("google.oauth2.credentials.Credentials"):
                from app.ai_router.providers.google import GoogleProvider
                provider = GoogleProvider(oauth_token="ya29.test")
                assert provider.is_oauth is True
