# @TASK P3-T3.6 - AI Router integration tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
# @TEST tests/test_ai_router.py
"""Tests for the AIRouter unified interface.

All tests use mocks -- no real API calls are made.

Covers:
- __init__ auto-detection (environment variable mock)
- register_provider / get_provider
- available_providers (empty and non-empty)
- all_models (multiple providers)
- resolve_model (by name, None default, missing model)
- chat success (mock provider)
- stream success + SSE format (data: prefix, [DONE] marker)
- stream with ProviderError -> SSE error event
- provider missing -> chat/stream raise ProviderError
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai_router.schemas import (
    AIRequest,
    AIResponse,
    Message,
    ModelInfo,
    ProviderError,
    TokenUsage,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_provider(
    name: str = "mock",
    models: list[ModelInfo] | None = None,
) -> MagicMock:
    """Create a mock AIProvider with configurable models."""
    provider = MagicMock()
    if models is None:
        models = [
            ModelInfo(
                id=f"{name}-model-1",
                name=f"{name.upper()} Model 1",
                provider=name,
                max_tokens=128000,
                supports_streaming=True,
            ),
        ]
    provider.available_models.return_value = models
    return provider


def _make_ai_response(
    content: str = "Hello!",
    model: str = "test-model",
    provider: str = "test",
) -> AIResponse:
    """Build a standard AIResponse for testing."""
    return AIResponse(
        content=content,
        model=model,
        provider=provider,
        usage=TokenUsage(
            prompt_tokens=10,
            completion_tokens=5,
            total_tokens=15,
        ),
        finish_reason="stop",
    )


async def _mock_stream_generator() -> AsyncIterator[str]:
    """Simulate a provider stream that yields text chunks."""
    for chunk in ["Hello", " ", "world", "!"]:
        yield chunk


async def _mock_stream_error() -> AsyncIterator[str]:
    """Simulate a provider stream that raises ProviderError mid-stream."""
    yield "partial"
    raise ProviderError(
        provider="test",
        message="Stream interrupted",
        status_code=500,
    )


# ---------------------------------------------------------------------------
# Test: __init__ auto-detection
# ---------------------------------------------------------------------------


class TestAIRouterInit:
    """Tests for AIRouter.__init__ auto-detection of providers."""

    def test_auto_detect_openai_when_key_present(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """OpenAI provider is registered when OPENAI_API_KEY is set."""
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()
        assert "openai" in router.available_providers()

    def test_auto_detect_anthropic_when_key_present(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Anthropic provider is registered when ANTHROPIC_API_KEY is set."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()
        assert "anthropic" in router.available_providers()

    def test_auto_detect_google_when_key_present(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Google provider is registered when GOOGLE_API_KEY is set."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.setenv("GOOGLE_API_KEY", "google-test-key")
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()
        assert "google" in router.available_providers()

    def test_auto_detect_zhipuai_when_key_present(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """ZhipuAI provider is registered when ZHIPUAI_API_KEY is set."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.setenv("ZHIPUAI_API_KEY", "zhipu-test-key")

        from app.ai_router.router import AIRouter

        router = AIRouter()
        assert "zhipuai" in router.available_providers()

    def test_no_providers_when_no_keys(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """No providers are registered when no API keys are set."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()
        assert router.available_providers() == []

    def test_multiple_providers_auto_detected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Multiple providers are registered when multiple keys are set."""
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()
        providers = router.available_providers()
        assert "openai" in providers
        assert "anthropic" in providers
        assert len(providers) == 2


# ---------------------------------------------------------------------------
# Test: register_provider / get_provider
# ---------------------------------------------------------------------------


class TestRegisterAndGetProvider:
    """Tests for register_provider and get_provider methods."""

    def test_register_and_get_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Manually registered provider can be retrieved by name."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()
        mock_provider = _make_mock_provider("custom")
        router.register_provider("custom", mock_provider)

        result = router.get_provider("custom")
        assert result is mock_provider

    def test_get_nonexistent_provider_raises_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """get_provider raises ProviderError for unknown provider name."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()

        with pytest.raises(ProviderError) as exc_info:
            router.get_provider("nonexistent")

        assert "nonexistent" in str(exc_info.value)

    def test_register_overwrites_existing_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Registering a provider with an existing name overwrites it."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()
        provider_a = _make_mock_provider("test")
        provider_b = _make_mock_provider("test")

        router.register_provider("test", provider_a)
        router.register_provider("test", provider_b)

        assert router.get_provider("test") is provider_b


# ---------------------------------------------------------------------------
# Test: available_providers
# ---------------------------------------------------------------------------


class TestAvailableProviders:
    """Tests for available_providers method."""

    def test_empty_when_no_providers(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """available_providers returns empty list when nothing registered."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()
        assert router.available_providers() == []

    def test_returns_registered_provider_names(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """available_providers returns names of all registered providers."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()
        router.register_provider("alpha", _make_mock_provider("alpha"))
        router.register_provider("beta", _make_mock_provider("beta"))

        providers = router.available_providers()
        assert "alpha" in providers
        assert "beta" in providers
        assert len(providers) == 2


# ---------------------------------------------------------------------------
# Test: all_models
# ---------------------------------------------------------------------------


class TestAllModels:
    """Tests for all_models method."""

    def test_empty_when_no_providers(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """all_models returns empty list with no providers."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()
        assert router.all_models() == []

    def test_aggregates_models_from_all_providers(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """all_models collects models from all registered providers."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()

        models_a = [
            ModelInfo(id="model-a1", name="A1", provider="alpha", max_tokens=100),
            ModelInfo(id="model-a2", name="A2", provider="alpha", max_tokens=200),
        ]
        models_b = [
            ModelInfo(id="model-b1", name="B1", provider="beta", max_tokens=300),
        ]

        router.register_provider("alpha", _make_mock_provider("alpha", models_a))
        router.register_provider("beta", _make_mock_provider("beta", models_b))

        all_models = router.all_models()
        assert len(all_models) == 3

        model_ids = [m.id for m in all_models]
        assert "model-a1" in model_ids
        assert "model-a2" in model_ids
        assert "model-b1" in model_ids


# ---------------------------------------------------------------------------
# Test: resolve_model
# ---------------------------------------------------------------------------


class TestResolveModel:
    """Tests for resolve_model method."""

    def test_resolve_by_model_name(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """resolve_model finds the provider for a specific model ID."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()

        models_a = [
            ModelInfo(id="alpha-model", name="Alpha", provider="alpha", max_tokens=100),
        ]
        models_b = [
            ModelInfo(id="beta-model", name="Beta", provider="beta", max_tokens=200),
        ]

        provider_a = _make_mock_provider("alpha", models_a)
        provider_b = _make_mock_provider("beta", models_b)

        router.register_provider("alpha", provider_a)
        router.register_provider("beta", provider_b)

        model_name, provider = router.resolve_model("beta-model")
        assert model_name == "beta-model"
        assert provider is provider_b

    def test_resolve_none_uses_first_available(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """resolve_model(None) returns the first provider's first model."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()
        models = [
            ModelInfo(id="default-model", name="Default", provider="test", max_tokens=100),
        ]
        provider = _make_mock_provider("test", models)
        router.register_provider("test", provider)

        model_name, resolved_provider = router.resolve_model(None)
        assert model_name == "default-model"
        assert resolved_provider is provider

    def test_resolve_unknown_model_raises_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """resolve_model raises ProviderError for unknown model name."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()
        router.register_provider("test", _make_mock_provider("test"))

        with pytest.raises(ProviderError):
            router.resolve_model("nonexistent-model")

    def test_resolve_no_providers_raises_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """resolve_model raises ProviderError when no providers registered."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()

        with pytest.raises(ProviderError):
            router.resolve_model(None)


# ---------------------------------------------------------------------------
# Test: chat
# ---------------------------------------------------------------------------


class TestChat:
    """Tests for the chat method."""

    @pytest.mark.asyncio
    async def test_chat_success(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """chat() delegates to the correct provider and returns AIResponse."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()

        expected_response = _make_ai_response(
            content="Test response",
            model="test-model-1",
            provider="test",
        )

        models = [
            ModelInfo(id="test-model-1", name="Test", provider="test", max_tokens=100),
        ]
        mock_provider = _make_mock_provider("test", models)
        mock_provider.chat = AsyncMock(return_value=expected_response)
        router.register_provider("test", mock_provider)

        request = AIRequest(
            messages=[Message(role="user", content="Hello")],
            model="test-model-1",
            temperature=0.5,
            max_tokens=100,
        )

        response = await router.chat(request)
        assert isinstance(response, AIResponse)
        assert response.content == "Test response"
        assert response.model == "test-model-1"

    @pytest.mark.asyncio
    async def test_chat_with_no_model_uses_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """chat() with model=None auto-selects the first available model."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()

        expected_response = _make_ai_response(
            content="Default model response",
            model="default-model",
            provider="test",
        )

        models = [
            ModelInfo(id="default-model", name="Default", provider="test", max_tokens=100),
        ]
        mock_provider = _make_mock_provider("test", models)
        mock_provider.chat = AsyncMock(return_value=expected_response)
        router.register_provider("test", mock_provider)

        request = AIRequest(
            messages=[Message(role="user", content="Hello")],
            model=None,
        )

        response = await router.chat(request)
        assert response.content == "Default model response"

        # Verify the provider was called with the resolved model name
        mock_provider.chat.assert_called_once()
        call_args = mock_provider.chat.call_args
        assert call_args.kwargs.get("model") == "default-model" or call_args.args[1] == "default-model"

    @pytest.mark.asyncio
    async def test_chat_no_providers_raises_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """chat() raises ProviderError when no providers are registered."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()

        request = AIRequest(
            messages=[Message(role="user", content="Hello")],
            model="nonexistent",
        )

        with pytest.raises(ProviderError):
            await router.chat(request)


# ---------------------------------------------------------------------------
# Test: stream
# ---------------------------------------------------------------------------


class TestStream:
    """Tests for the stream method with SSE format."""

    @pytest.mark.asyncio
    async def test_stream_success_sse_format(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """stream() yields SSE-formatted data lines with [DONE] at the end."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()

        models = [
            ModelInfo(id="stream-model", name="Stream", provider="test", max_tokens=100),
        ]
        mock_provider = _make_mock_provider("test", models)
        mock_provider.stream = MagicMock(return_value=_mock_stream_generator())
        router.register_provider("test", mock_provider)

        request = AIRequest(
            messages=[Message(role="user", content="Hello")],
            model="stream-model",
            stream=True,
        )

        collected: list[str] = []
        async for sse_line in router.stream(request):
            collected.append(sse_line)

        # Verify SSE format: each chunk wrapped in JSON
        assert collected[0] == 'data: {"chunk": "Hello"}\n\n'
        assert collected[1] == 'data: {"chunk": " "}\n\n'
        assert collected[2] == 'data: {"chunk": "world"}\n\n'
        assert collected[3] == 'data: {"chunk": "!"}\n\n'
        # Last line is the [DONE] marker
        assert collected[-1] == "data: [DONE]\n\n"

    @pytest.mark.asyncio
    async def test_stream_data_prefix_on_every_chunk(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Every chunk from stream() starts with 'data: ' prefix."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()

        models = [
            ModelInfo(id="stream-model", name="Stream", provider="test", max_tokens=100),
        ]
        mock_provider = _make_mock_provider("test", models)
        mock_provider.stream = MagicMock(return_value=_mock_stream_generator())
        router.register_provider("test", mock_provider)

        request = AIRequest(
            messages=[Message(role="user", content="Hello")],
            model="stream-model",
            stream=True,
        )

        async for sse_line in router.stream(request):
            assert sse_line.startswith("data: "), f"SSE line missing 'data: ' prefix: {sse_line!r}"

    @pytest.mark.asyncio
    async def test_stream_provider_error_yields_sse_error_event(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """ProviderError during streaming is sent as an SSE error event."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()

        models = [
            ModelInfo(id="error-model", name="Error", provider="test", max_tokens=100),
        ]
        mock_provider = _make_mock_provider("test", models)
        mock_provider.stream = MagicMock(return_value=_mock_stream_error())
        router.register_provider("test", mock_provider)

        request = AIRequest(
            messages=[Message(role="user", content="Hello")],
            model="error-model",
            stream=True,
        )

        collected: list[str] = []
        async for sse_line in router.stream(request):
            collected.append(sse_line)

        # First chunk should be the partial data in JSON format
        assert collected[0] == 'data: {"chunk": "partial"}\n\n'

        # Error event should follow SSE error format
        error_lines = [line for line in collected if line.startswith("event: error")]
        assert len(error_lines) == 1
        assert "Stream interrupted" in error_lines[0]

    @pytest.mark.asyncio
    async def test_stream_no_providers_raises_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """stream() raises ProviderError when no providers are registered."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()

        request = AIRequest(
            messages=[Message(role="user", content="Hello")],
            model="nonexistent",
            stream=True,
        )

        with pytest.raises(ProviderError):
            async for _ in router.stream(request):
                pass

    @pytest.mark.asyncio
    async def test_stream_with_none_model_uses_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """stream() with model=None auto-selects the first available model."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)

        from app.ai_router.router import AIRouter

        router = AIRouter()

        models = [
            ModelInfo(id="default-stream", name="Default", provider="test", max_tokens=100),
        ]
        mock_provider = _make_mock_provider("test", models)
        mock_provider.stream = MagicMock(return_value=_mock_stream_generator())
        router.register_provider("test", mock_provider)

        request = AIRequest(
            messages=[Message(role="user", content="Hello")],
            model=None,
            stream=True,
        )

        collected: list[str] = []
        async for sse_line in router.stream(request):
            collected.append(sse_line)

        # Should have data chunks + [DONE]
        assert len(collected) > 0
        assert collected[-1] == "data: [DONE]\n\n"


# ---------------------------------------------------------------------------
# Test: __init__.py exports AIRouter
# ---------------------------------------------------------------------------


class TestAIRouterExport:
    """Tests that AIRouter is exported from the ai_router package."""

    def test_import_ai_router_from_package(self) -> None:
        """AIRouter can be imported from app.ai_router."""
        from app.ai_router import AIRouter  # noqa: F401

        assert AIRouter is not None
