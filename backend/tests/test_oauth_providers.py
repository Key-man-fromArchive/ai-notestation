"""Tests for OAuth provider integration: register, remove, hot-swap."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.ai_router.router import AIRouter


class TestRegisterOAuthProvider:
    """Test register_oauth_provider for OpenAI and Google."""

    def test_register_openai_oauth(self):
        router = AIRouter()
        with patch.dict("os.environ", {}, clear=True):
            router._providers.clear()

        with patch("app.ai_router.providers.openai.OpenAIProvider") as MockProvider:
            mock_instance = MagicMock()
            mock_instance.is_oauth = True
            MockProvider.return_value = mock_instance

            router.register_oauth_provider("openai", "oauth-access-token")

            MockProvider.assert_called_once_with(api_key="oauth-access-token", is_oauth=True)
            assert "openai" in router._providers
            assert router._providers["openai"].is_oauth is True

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

        with patch("app.ai_router.providers.openai.OpenAIProvider", side_effect=Exception("init failed")):
            router.register_oauth_provider("openai", "bad-token")

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
