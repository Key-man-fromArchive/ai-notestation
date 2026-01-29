# @TASK P3-T3.3 - Anthropic Provider tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""Tests for the Anthropic AI provider.

All tests use mocks -- no real API calls are made.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import httpx
import pytest

from app.ai_router.providers.anthropic import AnthropicProvider
from app.ai_router.schemas import AIResponse, Message, ModelInfo, ProviderError, TokenUsage

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def api_key() -> str:
    return "sk-ant-test-key-for-testing"


@pytest.fixture
def provider(api_key: str) -> AnthropicProvider:
    return AnthropicProvider(api_key=api_key)


@pytest.fixture
def user_messages() -> list[Message]:
    return [
        Message(role="user", content="Hello, Claude!"),
    ]


@pytest.fixture
def messages_with_system() -> list[Message]:
    return [
        Message(role="system", content="You are a helpful assistant."),
        Message(role="user", content="Hello, Claude!"),
    ]


def _make_mock_response(
    content_text: str = "Hello! How can I help?",
    input_tokens: int = 10,
    output_tokens: int = 20,
    model: str = "claude-3-5-sonnet-20241022",
    stop_reason: str = "end_turn",
) -> MagicMock:
    """Build a mock Anthropic API response."""
    mock_response = MagicMock()
    # content[0].text
    content_block = MagicMock()
    content_block.text = content_text
    mock_response.content = [content_block]
    # usage
    mock_response.usage.input_tokens = input_tokens
    mock_response.usage.output_tokens = output_tokens
    # model & stop_reason
    mock_response.model = model
    mock_response.stop_reason = stop_reason
    return mock_response


# ---------------------------------------------------------------------------
# chat - success
# ---------------------------------------------------------------------------

class TestAnthropicChat:
    async def test_chat_success(self, provider: AnthropicProvider, user_messages: list[Message]) -> None:
        mock_resp = _make_mock_response()
        provider._client.messages.create = AsyncMock(return_value=mock_resp)

        result = await provider.chat(user_messages, model="claude-3-5-sonnet-20241022")

        assert isinstance(result, AIResponse)
        assert result.content == "Hello! How can I help?"
        assert result.model == "claude-3-5-sonnet-20241022"
        assert result.provider == "anthropic"
        assert result.finish_reason == "end_turn"

        provider._client.messages.create.assert_awaited_once()
        call_kwargs = provider._client.messages.create.call_args
        # messages should NOT contain system role
        sent_messages = call_kwargs.kwargs.get("messages") or call_kwargs[1].get("messages")
        for m in sent_messages:
            assert m["role"] != "system"

    async def test_chat_system_message_separation(
        self, provider: AnthropicProvider, messages_with_system: list[Message]
    ) -> None:
        """System messages must be extracted and passed as the `system` parameter."""
        mock_resp = _make_mock_response()
        provider._client.messages.create = AsyncMock(return_value=mock_resp)

        await provider.chat(messages_with_system, model="claude-3-5-sonnet-20241022")

        call_kwargs = provider._client.messages.create.call_args.kwargs
        # system parameter should contain the system message text
        assert call_kwargs["system"] == "You are a helpful assistant."
        # messages list should only have the user message
        assert len(call_kwargs["messages"]) == 1
        assert call_kwargs["messages"][0]["role"] == "user"

    async def test_chat_token_usage(self, provider: AnthropicProvider, user_messages: list[Message]) -> None:
        mock_resp = _make_mock_response(input_tokens=15, output_tokens=25)
        provider._client.messages.create = AsyncMock(return_value=mock_resp)

        result = await provider.chat(user_messages, model="claude-3-5-sonnet-20241022")

        assert result.usage is not None
        assert isinstance(result.usage, TokenUsage)
        assert result.usage.prompt_tokens == 15
        assert result.usage.completion_tokens == 25
        assert result.usage.total_tokens == 40

    async def test_chat_passes_max_tokens(self, provider: AnthropicProvider, user_messages: list[Message]) -> None:
        mock_resp = _make_mock_response()
        provider._client.messages.create = AsyncMock(return_value=mock_resp)

        await provider.chat(user_messages, model="claude-3-5-sonnet-20241022", max_tokens=2048)

        call_kwargs = provider._client.messages.create.call_args.kwargs
        assert call_kwargs["max_tokens"] == 2048


# ---------------------------------------------------------------------------
# stream - success
# ---------------------------------------------------------------------------

class TestAnthropicStream:
    async def test_stream_success(self, provider: AnthropicProvider, user_messages: list[Message]) -> None:
        """stream() should yield text chunks from text_stream."""
        chunks = ["Hello", " there", "!"]

        # Build a mock async context manager that provides .text_stream
        mock_stream = MagicMock()

        async def _text_stream_iter():
            for chunk in chunks:
                yield chunk

        mock_stream.text_stream = _text_stream_iter()

        # The stream context manager: async with client.messages.stream(...) as stream
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        provider._client.messages.stream = MagicMock(return_value=mock_cm)

        collected: list[str] = []
        async for text in provider.stream(user_messages, model="claude-3-5-sonnet-20241022"):
            collected.append(text)

        assert collected == chunks

    async def test_stream_system_message_separation(
        self, provider: AnthropicProvider, messages_with_system: list[Message]
    ) -> None:
        """System messages should be separated in stream calls too."""
        mock_stream = MagicMock()

        async def _text_stream_iter():
            yield "ok"

        mock_stream.text_stream = _text_stream_iter()

        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        provider._client.messages.stream = MagicMock(return_value=mock_cm)

        async for _ in provider.stream(messages_with_system, model="claude-3-5-sonnet-20241022"):
            pass

        call_kwargs = provider._client.messages.stream.call_args.kwargs
        assert call_kwargs["system"] == "You are a helpful assistant."
        assert len(call_kwargs["messages"]) == 1
        assert call_kwargs["messages"][0]["role"] == "user"


# ---------------------------------------------------------------------------
# available_models
# ---------------------------------------------------------------------------

class TestAnthropicModels:
    def test_available_models(self, provider: AnthropicProvider) -> None:
        models = provider.available_models()

        assert isinstance(models, list)
        assert len(models) == 2

        model_ids = {m.id for m in models}
        assert "claude-3-5-sonnet-20241022" in model_ids
        assert "claude-3-haiku-20240307" in model_ids

        for m in models:
            assert isinstance(m, ModelInfo)
            assert m.provider == "anthropic"
            assert m.max_tokens == 200_000
            assert m.supports_streaming is True


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

class TestAnthropicErrors:
    def test_no_api_key_raises_provider_error(self) -> None:
        """ProviderError should be raised when no API key is available."""
        with patch.dict("os.environ", {}, clear=True):
            # Remove ANTHROPIC_API_KEY from env if present
            import os
            env = os.environ.copy()
            env.pop("ANTHROPIC_API_KEY", None)
            with patch.dict("os.environ", env, clear=True):
                with pytest.raises(ProviderError) as exc_info:
                    AnthropicProvider(api_key=None)
                assert exc_info.value.provider == "anthropic"

    async def test_api_error_wrapped_in_provider_error(
        self, provider: AnthropicProvider, user_messages: list[Message]
    ) -> None:
        """anthropic.APIError should be caught and re-raised as ProviderError."""
        mock_request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        api_error = anthropic.APIError(
            message="Internal server error",
            request=mock_request,
            body=None,
        )
        provider._client.messages.create = AsyncMock(side_effect=api_error)

        with pytest.raises(ProviderError) as exc_info:
            await provider.chat(user_messages, model="claude-3-5-sonnet-20241022")

        assert exc_info.value.provider == "anthropic"
        assert "Internal server error" in exc_info.value.message

    async def test_api_status_error_wrapped_with_status_code(
        self, provider: AnthropicProvider, user_messages: list[Message]
    ) -> None:
        """anthropic.APIStatusError should include the HTTP status code."""
        mock_response = httpx.Response(
            status_code=429,
            request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"),
        )
        api_error = anthropic.RateLimitError(
            message="Rate limit exceeded",
            response=mock_response,
            body=None,
        )
        provider._client.messages.create = AsyncMock(side_effect=api_error)

        with pytest.raises(ProviderError) as exc_info:
            await provider.chat(user_messages, model="claude-3-5-sonnet-20241022")

        assert exc_info.value.provider == "anthropic"
        assert exc_info.value.status_code == 429
