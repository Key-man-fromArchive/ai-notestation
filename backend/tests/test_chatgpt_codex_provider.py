"""Tests for ChatGPT Codex provider."""

from __future__ import annotations

import base64
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai_router.schemas import Message


class TestChatGPTCodexProvider:
    """Test ChatGPT Codex provider initialization."""

    def test_init_with_token(self):
        from app.ai_router.providers.chatgpt_codex import ChatGPTCodexProvider

        provider = ChatGPTCodexProvider(
            access_token="test-jwt-token",
            account_id="account-123",
        )
        assert provider.is_oauth is True
        assert provider._account_id == "account-123"

    def test_init_requires_access_token(self):
        from app.ai_router.providers.chatgpt_codex import ChatGPTCodexProvider
        from app.ai_router.schemas import ProviderError

        with pytest.raises(ProviderError, match="access_token.*required"):
            ChatGPTCodexProvider(access_token="", account_id="")

    def test_available_models(self):
        from app.ai_router.providers.chatgpt_codex import ChatGPTCodexProvider

        provider = ChatGPTCodexProvider(
            access_token="test-token",
            account_id="account-123",
        )
        models = provider.available_models()
        model_ids = [m.id for m in models]
        assert "gpt-4o" in model_ids
        assert "gpt-4o-mini" in model_ids

    def test_messages_to_input(self):
        from app.ai_router.providers.chatgpt_codex import ChatGPTCodexProvider

        provider = ChatGPTCodexProvider(
            access_token="test-token",
            account_id="account-123",
        )
        messages = [
            Message(role="system", content="You are helpful."),
            Message(role="user", content="Hello"),
        ]
        result = provider._messages_to_input(messages)
        assert "[System]" in result
        assert "You are helpful." in result
        assert "Hello" in result

    def test_build_headers(self):
        from app.ai_router.providers.chatgpt_codex import ChatGPTCodexProvider

        provider = ChatGPTCodexProvider(
            access_token="test-token",
            account_id="account-123",
        )
        headers = provider._build_headers()
        assert headers["Authorization"] == "Bearer test-token"
        assert headers["chatgpt-account-id"] == "account-123"
        assert headers["OpenAI-Beta"] == "responses=experimental"
        assert headers["originator"] == "codex_cli_rs"


class TestChatGPTCodexChat:
    """Test chat (non-streaming) via Codex backend."""

    @pytest.mark.asyncio
    async def test_chat_returns_response(self):
        from app.ai_router.providers.chatgpt_codex import ChatGPTCodexProvider

        provider = ChatGPTCodexProvider(
            access_token="test-token",
            account_id="account-123",
        )

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "output": [
                {"type": "message", "content": [{"type": "output_text", "text": "Hello!"}]}
            ],
            "model": "gpt-4o",
            "usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
        }

        with patch("app.ai_router.providers.chatgpt_codex.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            messages = [Message(role="user", content="Hi")]
            response = await provider.chat(messages, model="gpt-4o")

        assert response.content == "Hello!"
        assert response.provider == "openai-codex"
        assert response.usage is not None
        assert response.usage.prompt_tokens == 10
        assert response.usage.completion_tokens == 5

    @pytest.mark.asyncio
    async def test_chat_error_raises_provider_error(self):
        from app.ai_router.providers.chatgpt_codex import ChatGPTCodexProvider
        from app.ai_router.schemas import ProviderError

        provider = ChatGPTCodexProvider(
            access_token="test-token",
            account_id="account-123",
        )

        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.text = "Unauthorized"

        with patch("app.ai_router.providers.chatgpt_codex.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            with pytest.raises(ProviderError, match="ChatGPT backend error: 401"):
                messages = [Message(role="user", content="Hi")]
                await provider.chat(messages, model="gpt-4o")


class TestAccountIdExtraction:
    """Test JWT account_id extraction utility."""

    def test_extract_account_id_from_jwt(self):
        from app.ai_router.providers.chatgpt_codex import extract_chatgpt_account_id

        payload = {"https://api.openai.com/auth": {"chatgpt_account_id": "acct-abc123"}}
        b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        fake_jwt = f"header.{b64}.signature"

        account_id = extract_chatgpt_account_id(fake_jwt)
        assert account_id == "acct-abc123"

    def test_extract_returns_none_for_invalid(self):
        from app.ai_router.providers.chatgpt_codex import extract_chatgpt_account_id

        assert extract_chatgpt_account_id("not-a-jwt") is None
        assert extract_chatgpt_account_id("") is None

    def test_extract_returns_none_for_missing_claim(self):
        from app.ai_router.providers.chatgpt_codex import extract_chatgpt_account_id

        payload = {"sub": "user123"}
        b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        fake_jwt = f"header.{b64}.signature"

        assert extract_chatgpt_account_id(fake_jwt) is None
