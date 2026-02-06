# @TASK P3-T3.2 - OpenAI Provider tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""Tests for the OpenAI provider implementation.

All tests use mocks -- no real OpenAI API calls are made.

Covers:
- chat success with mocked AsyncOpenAI
- Message -> OpenAI format conversion
- TokenUsage returned from chat
- stream success (mock streaming response, delta.content yield)
- available_models returns GPT-4o and GPT-4o-mini
- ProviderError when API key is missing
- openai.APIError -> ProviderError conversion
- temperature/max_tokens kwargs forwarded to OpenAI
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.ai_router.schemas import (
    AIResponse,
    Message,
    ModelInfo,
    ProviderError,
    TokenUsage,
)

# ---------------------------------------------------------------------------
# Helpers for mocking OpenAI responses
# ---------------------------------------------------------------------------


def _make_chat_completion(
    content: str = "Hello!",
    model: str = "gpt-4o",
    finish_reason: str = "stop",
    prompt_tokens: int = 10,
    completion_tokens: int = 5,
    total_tokens: int = 15,
) -> MagicMock:
    """Build a mock ChatCompletion object matching the openai SDK structure."""
    usage = MagicMock()
    usage.prompt_tokens = prompt_tokens
    usage.completion_tokens = completion_tokens
    usage.total_tokens = total_tokens

    message = MagicMock()
    message.content = content

    choice = MagicMock()
    choice.message = message
    choice.finish_reason = finish_reason

    completion = MagicMock()
    completion.choices = [choice]
    completion.model = model
    completion.usage = usage
    return completion


def _make_stream_chunk(content: str | None, finish_reason: str | None = None) -> MagicMock:
    """Build a mock streaming chunk with delta.content."""
    delta = MagicMock()
    delta.content = content

    choice = MagicMock()
    choice.delta = delta
    choice.finish_reason = finish_reason

    chunk = MagicMock()
    chunk.choices = [choice]
    return chunk


async def _async_chunk_generator(chunks: list[MagicMock]) -> AsyncIterator[MagicMock]:
    """Create an async iterator from a list of mock chunks."""
    for chunk in chunks:
        yield chunk


# ---------------------------------------------------------------------------
# Test: API key missing raises ProviderError
# ---------------------------------------------------------------------------


class TestOpenAIProviderInit:
    """Initialization and API key tests."""

    def test_api_key_from_argument(self) -> None:
        """Provider accepts api_key as constructor argument."""
        from app.ai_router.providers.openai import OpenAIProvider

        provider = OpenAIProvider(api_key="sk-test-key-123")
        assert provider is not None

    def test_api_key_from_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Provider falls back to OPENAI_API_KEY env var."""
        monkeypatch.setenv("OPENAI_API_KEY", "sk-env-key-456")
        from app.ai_router.providers.openai import OpenAIProvider

        provider = OpenAIProvider()
        assert provider is not None

    def test_missing_api_key_raises_provider_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """ProviderError raised when no API key is available."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        from app.ai_router.providers.openai import OpenAIProvider

        with pytest.raises(ProviderError) as exc_info:
            OpenAIProvider(api_key=None)

        assert exc_info.value.provider == "openai"
        assert exc_info.value.status_code is None


# ---------------------------------------------------------------------------
# Test: chat method
# ---------------------------------------------------------------------------


class TestOpenAIProviderChat:
    """Tests for the chat() method."""

    @pytest.fixture
    def provider(self) -> OpenAIProvider:  # noqa: F821
        from app.ai_router.providers.openai import OpenAIProvider

        return OpenAIProvider(api_key="sk-test-key")

    @pytest.mark.asyncio
    async def test_chat_success(self, provider: OpenAIProvider) -> None:  # noqa: F821
        """chat() returns an AIResponse with correct content."""
        mock_completion = _make_chat_completion(content="Hi there!", model="gpt-4o")
        provider._client.chat.completions.create = AsyncMock(return_value=mock_completion)

        messages = [Message(role="user", content="Hello")]
        response = await provider.chat(messages, model="gpt-4o")

        assert isinstance(response, AIResponse)
        assert response.content == "Hi there!"
        assert response.model == "gpt-4o"
        assert response.provider == "openai"
        assert response.finish_reason == "stop"

    @pytest.mark.asyncio
    async def test_chat_message_conversion(self, provider: OpenAIProvider) -> None:  # noqa: F821
        """Messages are converted to OpenAI format (list of dicts)."""
        mock_completion = _make_chat_completion()
        provider._client.chat.completions.create = AsyncMock(return_value=mock_completion)

        messages = [
            Message(role="system", content="Be helpful."),
            Message(role="user", content="What is 2+2?"),
        ]
        await provider.chat(messages, model="gpt-4o")

        call_kwargs = provider._client.chat.completions.create.call_args
        openai_messages = call_kwargs.kwargs.get("messages", call_kwargs.args[0] if call_kwargs.args else None)
        if openai_messages is None:
            openai_messages = call_kwargs[1].get("messages")

        assert len(openai_messages) == 2
        assert openai_messages[0] == {"role": "system", "content": "Be helpful."}
        assert openai_messages[1] == {"role": "user", "content": "What is 2+2?"}

    @pytest.mark.asyncio
    async def test_chat_returns_token_usage(self, provider: OpenAIProvider) -> None:  # noqa: F821
        """chat() returns TokenUsage from OpenAI response."""
        mock_completion = _make_chat_completion(
            prompt_tokens=20,
            completion_tokens=30,
            total_tokens=50,
        )
        provider._client.chat.completions.create = AsyncMock(return_value=mock_completion)

        messages = [Message(role="user", content="Test")]
        response = await provider.chat(messages, model="gpt-4o")

        assert response.usage is not None
        assert isinstance(response.usage, TokenUsage)
        assert response.usage.prompt_tokens == 20
        assert response.usage.completion_tokens == 30
        assert response.usage.total_tokens == 50

    @pytest.mark.asyncio
    async def test_chat_passes_temperature_and_max_tokens(self, provider: OpenAIProvider) -> None:  # noqa: F821
        """temperature and max_tokens kwargs are forwarded to OpenAI."""
        mock_completion = _make_chat_completion()
        provider._client.chat.completions.create = AsyncMock(return_value=mock_completion)

        messages = [Message(role="user", content="Test")]
        await provider.chat(messages, model="gpt-4o", temperature=0.2, max_tokens=512)

        call_kwargs = provider._client.chat.completions.create.call_args.kwargs
        assert call_kwargs["temperature"] == 0.2
        assert call_kwargs["max_tokens"] == 512

    @pytest.mark.asyncio
    async def test_chat_api_error_raises_provider_error(self, provider: OpenAIProvider) -> None:  # noqa: F821
        """openai.APIError is caught and re-raised as ProviderError."""
        import openai

        api_error = openai.APIStatusError(
            message="Rate limit exceeded",
            response=MagicMock(status_code=429),
            body=None,
        )
        provider._client.chat.completions.create = AsyncMock(side_effect=api_error)

        messages = [Message(role="user", content="Test")]
        with pytest.raises(ProviderError) as exc_info:
            await provider.chat(messages, model="gpt-4o")

        assert exc_info.value.provider == "openai"
        assert exc_info.value.status_code == 429


# ---------------------------------------------------------------------------
# Test: stream method
# ---------------------------------------------------------------------------


class TestOpenAIProviderStream:
    """Tests for the stream() method."""

    @pytest.fixture
    def provider(self) -> OpenAIProvider:  # noqa: F821
        from app.ai_router.providers.openai import OpenAIProvider

        return OpenAIProvider(api_key="sk-test-key")

    @pytest.mark.asyncio
    async def test_stream_success(self, provider: OpenAIProvider) -> None:  # noqa: F821
        """stream() yields string chunks from delta.content."""
        chunks = [
            _make_stream_chunk("Hello"),
            _make_stream_chunk(" world"),
            _make_stream_chunk("!", finish_reason="stop"),
        ]

        mock_stream = _async_chunk_generator(chunks)
        provider._client.chat.completions.create = AsyncMock(return_value=mock_stream)

        messages = [Message(role="user", content="Hi")]
        collected: list[str] = []
        async for text in provider.stream(messages, model="gpt-4o"):
            collected.append(text)

        assert collected == ["Hello", " world", "!"]

    @pytest.mark.asyncio
    async def test_stream_skips_none_content(self, provider: OpenAIProvider) -> None:  # noqa: F821
        """stream() skips chunks where delta.content is None."""
        chunks = [
            _make_stream_chunk(None),
            _make_stream_chunk("Hello"),
            _make_stream_chunk(None),
            _make_stream_chunk(" there"),
        ]

        mock_stream = _async_chunk_generator(chunks)
        provider._client.chat.completions.create = AsyncMock(return_value=mock_stream)

        messages = [Message(role="user", content="Hi")]
        collected: list[str] = []
        async for text in provider.stream(messages, model="gpt-4o"):
            collected.append(text)

        assert collected == ["Hello", " there"]

    @pytest.mark.asyncio
    async def test_stream_passes_kwargs(self, provider: OpenAIProvider) -> None:  # noqa: F821
        """stream() forwards temperature and max_tokens to OpenAI."""
        chunks = [_make_stream_chunk("ok", finish_reason="stop")]
        mock_stream = _async_chunk_generator(chunks)
        provider._client.chat.completions.create = AsyncMock(return_value=mock_stream)

        messages = [Message(role="user", content="Test")]
        async for _ in provider.stream(messages, model="gpt-4o-mini", temperature=0.5, max_tokens=100):
            pass

        call_kwargs = provider._client.chat.completions.create.call_args.kwargs
        assert call_kwargs["stream"] is True
        assert call_kwargs["temperature"] == 0.5
        assert call_kwargs["max_tokens"] == 100

    @pytest.mark.asyncio
    async def test_stream_api_error_raises_provider_error(self, provider: OpenAIProvider) -> None:  # noqa: F821
        """openai.APIError during streaming is caught as ProviderError."""
        import openai

        api_error = openai.APIStatusError(
            message="Server error",
            response=MagicMock(status_code=500),
            body=None,
        )
        provider._client.chat.completions.create = AsyncMock(side_effect=api_error)

        messages = [Message(role="user", content="Test")]
        with pytest.raises(ProviderError) as exc_info:
            async for _ in provider.stream(messages, model="gpt-4o"):
                pass

        assert exc_info.value.provider == "openai"
        assert exc_info.value.status_code == 500


# ---------------------------------------------------------------------------
# Test: available_models method
# ---------------------------------------------------------------------------


class TestOpenAIProviderAvailableModels:
    """Tests for available_models()."""

    def test_returns_multiple_models(self) -> None:
        """available_models() returns GPT-5, GPT-4, and o-series models."""
        from app.ai_router.providers.openai import OpenAIProvider

        provider = OpenAIProvider(api_key="sk-test-key")
        models = provider.available_models()

        assert len(models) >= 10
        assert all(isinstance(m, ModelInfo) for m in models)

        model_ids = [m.id for m in models]
        assert "gpt-5.2" in model_ids
        assert "gpt-5-mini" in model_ids
        assert "gpt-4o" in model_ids
        assert "o3" in model_ids

    def test_models_have_correct_metadata(self) -> None:
        """Each model has correct provider and streaming support."""
        from app.ai_router.providers.openai import OpenAIProvider

        provider = OpenAIProvider(api_key="sk-test-key")
        models = provider.available_models()

        for model in models:
            assert model.provider == "openai"
            assert model.max_tokens >= 128_000
            assert model.supports_streaming is True

    def test_model_names(self) -> None:
        """Models have descriptive human-readable names."""
        from app.ai_router.providers.openai import OpenAIProvider

        provider = OpenAIProvider(api_key="sk-test-key")
        models = provider.available_models()
        model_map = {m.id: m for m in models}

        assert "GPT-5.2" in model_map["gpt-5.2"].name
        assert "GPT-4o" in model_map["gpt-4o"].name
