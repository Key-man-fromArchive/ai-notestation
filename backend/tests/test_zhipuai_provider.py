# @TASK P3-T3.5 - ZhipuAI Provider tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""Tests for ZhipuAI Provider implementation.

Covers:
- chat success with mocked ZaiClient
- chat TokenUsage conversion
- stream success with mocked streaming response
- available_models verification (10 GLM models + glm-ocr)
- API key missing raises ProviderError
- SDK error converted to ProviderError

Note: All tests mock the zai-sdk client so no real API calls are made.
The zai module is injected as a mock via sys.modules to avoid environment
issues with the cryptography/PyO3 stack when pytest-cov is enabled.
"""

from __future__ import annotations

import importlib
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.ai_router.schemas import (
    AIResponse,
    Message,
    ModelInfo,
    ProviderError,
    TokenUsage,
)

# ---------------------------------------------------------------------------
# Helpers: Mock response objects mimicking ZhipuAI SDK structures
# ---------------------------------------------------------------------------


def _make_chat_response(
    content: str = "Hello from GLM",
    prompt_tokens: int = 10,
    completion_tokens: int = 20,
    total_tokens: int = 30,
    finish_reason: str = "stop",
) -> SimpleNamespace:
    """Build a mock ZhipuAI chat completion response."""
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=content),
                finish_reason=finish_reason,
            ),
        ],
        usage=SimpleNamespace(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
        ),
        model="glm-4.7",
    )


def _make_stream_chunks(texts: list[str | None]) -> list[SimpleNamespace]:
    """Build a list of mock streaming chunks.

    A None in the texts list simulates a chunk where delta.content is None.
    """
    chunks = []
    for text in texts:
        chunks.append(
            SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        delta=SimpleNamespace(content=text),
                    ),
                ],
            ),
        )
    return chunks


def _get_provider_class():
    """Import and return the ZhipuAIProvider class.

    The autouse fixture ``_mock_zhipuai_sdk`` guarantees that ``sys.modules``
    already contains a mock ``zhipuai`` package, so this import will never
    trigger the real SDK (avoiding cryptography/PyO3 double-init under
    pytest-cov).
    """
    mod = importlib.import_module("app.ai_router.providers.zhipuai")
    return mod.ZhipuAIProvider


def _make_provider(mock_sdk: MagicMock, api_key: str = "test-key"):
    """Create a ZhipuAIProvider instance with the given mock SDK and key."""
    cls = _get_provider_class()
    return cls(api_key=api_key)


# ---------------------------------------------------------------------------
# Fixture: provide a mock ZhipuAI SDK to prevent real SDK import issues
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _mock_zhipuai_sdk():
    """Pre-populate sys.modules with a mock 'zai' package.

    This prevents the real zai-sdk (and its heavy cryptography deps)
    from being imported during tests, making the test suite resilient to
    environment issues like PyO3 double-init under pytest-cov.
    """
    mock_zai = MagicMock()
    mock_zai.ZaiClient = MagicMock()

    # Save and remove any existing zai modules
    saved = {}
    for mod_name in list(sys.modules.keys()):
        if mod_name == "zai" or mod_name.startswith("zai."):
            saved[mod_name] = sys.modules.pop(mod_name)

    sys.modules["zai"] = mock_zai

    # Clear cached import of our provider module so it reimports with mock
    provider_mod_name = "app.ai_router.providers.zhipuai"
    saved_provider = sys.modules.pop(provider_mod_name, None)
    providers_init = "app.ai_router.providers"
    saved_providers_init = sys.modules.pop(providers_init, None)

    yield mock_zai

    # Restore original modules
    sys.modules.pop("zai", None)
    sys.modules.pop(provider_mod_name, None)
    sys.modules.pop(providers_init, None)
    for mod_name, mod in saved.items():
        sys.modules[mod_name] = mod
    if saved_provider is not None:
        sys.modules[provider_mod_name] = saved_provider
    if saved_providers_init is not None:
        sys.modules[providers_init] = saved_providers_init


# ---------------------------------------------------------------------------
# TestZhipuAIProvider
# ---------------------------------------------------------------------------


class TestZhipuAIProvider:
    """ZhipuAI provider unit tests (all mocked, no real API calls)."""

    # -- API key handling ---------------------------------------------------

    def test_init_with_explicit_api_key(self, _mock_zhipuai_sdk: MagicMock) -> None:
        """Provider accepts an explicit API key."""
        provider = _make_provider(_mock_zhipuai_sdk, api_key="test-key")
        call_kwargs = _mock_zhipuai_sdk.ZaiClient.call_args
        assert call_kwargs.kwargs["api_key"] == "test-key"
        assert "base_url" in call_kwargs.kwargs
        assert provider is not None

    def test_init_with_env_api_key(self, _mock_zhipuai_sdk: MagicMock, monkeypatch: pytest.MonkeyPatch) -> None:
        """Provider reads API key from ZHIPUAI_API_KEY env var."""
        monkeypatch.setenv("ZHIPUAI_API_KEY", "env-key")
        cls = _get_provider_class()
        provider = cls()  # no explicit api_key -- should fall back to env
        call_kwargs = _mock_zhipuai_sdk.ZaiClient.call_args
        assert call_kwargs.kwargs["api_key"] == "env-key"
        assert provider is not None

    def test_init_no_api_key_raises_provider_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """ProviderError raised when no API key is available."""
        monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)
        cls = _get_provider_class()

        with pytest.raises(ProviderError) as exc_info:
            cls(api_key=None)
        assert exc_info.value.provider == "zhipuai"

    # -- chat ---------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_chat_success(self, _mock_zhipuai_sdk: MagicMock) -> None:
        """chat() returns a proper AIResponse from the ZhipuAI SDK."""
        mock_response = _make_chat_response(content="GLM says hi")

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        _mock_zhipuai_sdk.ZaiClient.return_value = mock_client

        provider = _make_provider(_mock_zhipuai_sdk)

        messages = [
            Message(role="system", content="You are helpful."),
            Message(role="user", content="Hello"),
        ]
        result = await provider.chat(messages, model="glm-4.7")

        assert isinstance(result, AIResponse)
        assert result.content == "GLM says hi"
        assert result.model == "glm-4.7"
        assert result.provider == "zhipuai"
        assert result.finish_reason == "stop"

        # Verify the SDK was called with correct args
        mock_client.chat.completions.create.assert_called_once()
        call_kwargs = mock_client.chat.completions.create.call_args
        assert call_kwargs.kwargs["model"] == "glm-4.7"
        assert len(call_kwargs.kwargs["messages"]) == 2
        assert call_kwargs.kwargs["messages"][0] == {"role": "system", "content": "You are helpful."}

    @pytest.mark.asyncio
    async def test_chat_token_usage(self, _mock_zhipuai_sdk: MagicMock) -> None:
        """chat() correctly converts token usage from SDK response."""
        mock_response = _make_chat_response(
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
        )

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        _mock_zhipuai_sdk.ZaiClient.return_value = mock_client

        provider = _make_provider(_mock_zhipuai_sdk)
        messages = [Message(role="user", content="Count tokens")]
        result = await provider.chat(messages, model="glm-4.7")

        assert result.usage is not None
        assert isinstance(result.usage, TokenUsage)
        assert result.usage.prompt_tokens == 100
        assert result.usage.completion_tokens == 50
        assert result.usage.total_tokens == 150

    @pytest.mark.asyncio
    async def test_chat_sdk_error_raises_provider_error(self, _mock_zhipuai_sdk: MagicMock) -> None:
        """SDK exceptions are wrapped in ProviderError."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = Exception("SDK boom")
        _mock_zhipuai_sdk.ZaiClient.return_value = mock_client

        provider = _make_provider(_mock_zhipuai_sdk)
        messages = [Message(role="user", content="fail")]

        with pytest.raises(ProviderError) as exc_info:
            await provider.chat(messages, model="glm-4.7")
        assert exc_info.value.provider == "zhipuai"
        assert "SDK boom" in exc_info.value.message

    # -- stream -------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_stream_success(self, _mock_zhipuai_sdk: MagicMock) -> None:
        """stream() yields content chunks from the SDK streaming response."""
        chunks = _make_stream_chunks(["Hello", " ", "World", None, "!"])

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = iter(chunks)
        _mock_zhipuai_sdk.ZaiClient.return_value = mock_client

        provider = _make_provider(_mock_zhipuai_sdk)
        messages = [Message(role="user", content="Stream test")]

        collected: list[str] = []
        async for token in provider.stream(messages, model="glm-4.7-flash"):
            collected.append(token)

        # None chunks should be skipped
        assert collected == ["Hello", " ", "World", "!"]

        # Verify stream=True was passed
        call_kwargs = mock_client.chat.completions.create.call_args
        assert call_kwargs.kwargs["stream"] is True

    @pytest.mark.asyncio
    async def test_stream_sdk_error_raises_provider_error(self, _mock_zhipuai_sdk: MagicMock) -> None:
        """SDK exceptions during streaming are wrapped in ProviderError."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = Exception("Stream SDK error")
        _mock_zhipuai_sdk.ZaiClient.return_value = mock_client

        provider = _make_provider(_mock_zhipuai_sdk)
        messages = [Message(role="user", content="fail stream")]

        with pytest.raises(ProviderError) as exc_info:
            async for _ in provider.stream(messages, model="glm-4.7"):
                pass
        assert exc_info.value.provider == "zhipuai"

    # -- available_models ---------------------------------------------------

    def test_available_models(self, _mock_zhipuai_sdk: MagicMock) -> None:
        """available_models() returns the supported GLM models with metadata."""
        provider = _make_provider(_mock_zhipuai_sdk)
        models = provider.available_models()

        assert isinstance(models, list)
        assert len(models) == 11  # 10 chat/vision models + glm-ocr

        model_ids = {m.id for m in models}
        expected_ids = {
            "glm-5", "glm-4.7", "glm-4.6", "glm-4.5",
            "glm-4.7-flash", "glm-4.5-flash", "glm-4.5-air",
            "glm-4.6v-flash", "glm-4.6v", "glm-4.5v",
            "glm-ocr",
        }
        assert model_ids == expected_ids

        for m in models:
            assert isinstance(m, ModelInfo)
            assert m.provider == "zhipuai"

        # Chat models support streaming; glm-ocr does not
        model_map = {m.id: m for m in models}
        assert model_map["glm-4.7"].supports_streaming is True
        assert model_map["glm-ocr"].supports_streaming is False

        # Check a few names
        assert model_map["glm-5"].name == "GLM-5"
        assert model_map["glm-4.7-flash"].name == "GLM-4.7 Flash (Free)"
        assert model_map["glm-ocr"].name == "GLM-OCR (Layout Parsing)"
