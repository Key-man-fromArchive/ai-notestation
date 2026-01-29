# @TASK P3-T3.4 - Google Gemini Provider tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
# @TEST tests/test_google_provider.py
"""Tests for the Google Gemini AI provider.

Covers:
- chat success with mocked genai.Client
- system message separation and system_instruction passing
- role conversion (assistant -> model)
- chat TokenUsage conversion
- stream success
- available_models validation
- ProviderError when API key is missing
- API error -> ProviderError conversion
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.ai_router.schemas import (
    AIResponse,
    Message,
    ModelInfo,
    ProviderError,
)

# ---------------------------------------------------------------------------
# Helpers: build mock objects that mimic google-genai responses
# ---------------------------------------------------------------------------


def _make_usage_metadata(prompt_tokens: int = 10, candidates_tokens: int = 20) -> MagicMock:
    """Create a mock UsageMetadata matching the genai response structure."""
    meta = MagicMock()
    meta.prompt_token_count = prompt_tokens
    meta.candidates_token_count = candidates_tokens
    return meta


def _make_generate_response(text: str = "Hello!", prompt_tokens: int = 10, candidates_tokens: int = 20) -> MagicMock:
    """Create a mock GenerateContentResponse."""
    resp = MagicMock()
    resp.text = text
    resp.usage_metadata = _make_usage_metadata(prompt_tokens, candidates_tokens)
    return resp


def _make_stream_chunks(texts: list[str]) -> list[MagicMock]:
    """Create a list of mock stream chunks."""
    chunks = []
    for t in texts:
        chunk = MagicMock()
        chunk.text = t
        chunks.append(chunk)
    return chunks


# ---------------------------------------------------------------------------
# TestGoogleProviderInit
# ---------------------------------------------------------------------------


class TestGoogleProviderInit:
    """Tests for GoogleProvider initialization."""

    def test_init_with_explicit_api_key(self) -> None:
        """Provider initializes with an explicit API key."""
        with patch("app.ai_router.providers.google.genai") as mock_genai:
            from app.ai_router.providers.google import GoogleProvider

            GoogleProvider(api_key="test-key-123")
            mock_genai.Client.assert_called_once_with(api_key="test-key-123")

    def test_init_with_env_variable(self) -> None:
        """Provider reads API key from GOOGLE_API_KEY env var."""
        with (
            patch("app.ai_router.providers.google.genai") as mock_genai,
            patch.dict("os.environ", {"GOOGLE_API_KEY": "env-key-456"}),
        ):
            from app.ai_router.providers.google import GoogleProvider

            GoogleProvider()
            mock_genai.Client.assert_called_once_with(api_key="env-key-456")

    def test_init_no_api_key_raises_provider_error(self) -> None:
        """ProviderError raised when no API key is available."""
        with (
            patch("app.ai_router.providers.google.genai"),
            patch.dict("os.environ", {}, clear=True),
        ):
            # Ensure GOOGLE_API_KEY is not set
            import os

            os.environ.pop("GOOGLE_API_KEY", None)

            from app.ai_router.providers.google import GoogleProvider

            with pytest.raises(ProviderError) as exc_info:
                GoogleProvider()
            assert exc_info.value.provider == "google"


# ---------------------------------------------------------------------------
# TestGoogleProviderChat
# ---------------------------------------------------------------------------


class TestGoogleProviderChat:
    """Tests for GoogleProvider.chat()."""

    @pytest.mark.asyncio
    async def test_chat_success(self) -> None:
        """chat() returns AIResponse with correct content and usage."""
        mock_response = _make_generate_response(
            text="The answer is 42.",
            prompt_tokens=15,
            candidates_tokens=8,
        )

        with patch("app.ai_router.providers.google.genai") as mock_genai:
            mock_client = MagicMock()
            mock_client.models.generate_content.return_value = mock_response
            mock_genai.Client.return_value = mock_client

            from app.ai_router.providers.google import GoogleProvider

            provider = GoogleProvider(api_key="test-key")

            messages = [
                Message(role="user", content="What is the meaning of life?"),
            ]
            result = await provider.chat(messages, model="gemini-2.0-flash")

            assert isinstance(result, AIResponse)
            assert result.content == "The answer is 42."
            assert result.model == "gemini-2.0-flash"
            assert result.provider == "google"
            assert result.usage is not None
            assert result.usage.prompt_tokens == 15
            assert result.usage.completion_tokens == 8
            assert result.usage.total_tokens == 23

    @pytest.mark.asyncio
    async def test_chat_system_message_separated(self) -> None:
        """System messages are extracted and passed as system_instruction."""
        mock_response = _make_generate_response(text="Sure!")

        with patch("app.ai_router.providers.google.genai") as mock_genai:
            mock_client = MagicMock()
            mock_client.models.generate_content.return_value = mock_response
            mock_genai.Client.return_value = mock_client

            from app.ai_router.providers.google import GoogleProvider

            provider = GoogleProvider(api_key="test-key")

            messages = [
                Message(role="system", content="You are a scientist."),
                Message(role="user", content="Explain DNA."),
            ]
            await provider.chat(messages, model="gemini-2.0-flash")

            # Verify generate_content was called
            call_args = mock_client.models.generate_content.call_args

            # The contents should NOT include the system message
            contents = call_args.kwargs.get("contents", call_args[1].get("contents") if len(call_args) > 1 else None)
            if contents is None:
                contents = call_args[0][0] if call_args[0] else None

            # Check that system message is not in contents
            for content_item in contents:
                assert content_item["role"] != "system"

            # Check that config has system_instruction
            config = call_args.kwargs.get("config", None)
            assert config is not None
            assert config.system_instruction == "You are a scientist."

    @pytest.mark.asyncio
    async def test_chat_role_conversion_assistant_to_model(self) -> None:
        """Assistant role is converted to 'model' for Gemini API."""
        mock_response = _make_generate_response(text="Continued.")

        with patch("app.ai_router.providers.google.genai") as mock_genai:
            mock_client = MagicMock()
            mock_client.models.generate_content.return_value = mock_response
            mock_genai.Client.return_value = mock_client

            from app.ai_router.providers.google import GoogleProvider

            provider = GoogleProvider(api_key="test-key")

            messages = [
                Message(role="user", content="Hello"),
                Message(role="assistant", content="Hi there!"),
                Message(role="user", content="Continue"),
            ]
            await provider.chat(messages, model="gemini-2.0-flash")

            call_args = mock_client.models.generate_content.call_args
            contents = call_args.kwargs.get("contents", None)

            # Find the message that was originally "assistant"
            model_messages = [c for c in contents if c["role"] == "model"]
            assert len(model_messages) == 1
            assert model_messages[0]["parts"][0]["text"] == "Hi there!"

    @pytest.mark.asyncio
    async def test_chat_token_usage_conversion(self) -> None:
        """Token usage from Gemini API is correctly converted to TokenUsage."""
        mock_response = _make_generate_response(
            text="Result",
            prompt_tokens=100,
            candidates_tokens=50,
        )

        with patch("app.ai_router.providers.google.genai") as mock_genai:
            mock_client = MagicMock()
            mock_client.models.generate_content.return_value = mock_response
            mock_genai.Client.return_value = mock_client

            from app.ai_router.providers.google import GoogleProvider

            provider = GoogleProvider(api_key="test-key")

            messages = [Message(role="user", content="Test")]
            result = await provider.chat(messages, model="gemini-1.5-pro")

            assert result.usage is not None
            assert result.usage.prompt_tokens == 100
            assert result.usage.completion_tokens == 50
            assert result.usage.total_tokens == 150

    @pytest.mark.asyncio
    async def test_chat_api_error_raises_provider_error(self) -> None:
        """Google API errors are converted to ProviderError."""
        with patch("app.ai_router.providers.google.genai") as mock_genai:
            mock_client = MagicMock()
            mock_client.models.generate_content.side_effect = Exception("API rate limit exceeded")
            mock_genai.Client.return_value = mock_client

            from app.ai_router.providers.google import GoogleProvider

            provider = GoogleProvider(api_key="test-key")

            messages = [Message(role="user", content="Test")]
            with pytest.raises(ProviderError) as exc_info:
                await provider.chat(messages, model="gemini-2.0-flash")

            assert exc_info.value.provider == "google"
            assert "API rate limit exceeded" in exc_info.value.message


# ---------------------------------------------------------------------------
# TestGoogleProviderStream
# ---------------------------------------------------------------------------


class TestGoogleProviderStream:
    """Tests for GoogleProvider.stream()."""

    @pytest.mark.asyncio
    async def test_stream_success(self) -> None:
        """stream() yields text chunks from the Gemini streaming response."""
        chunks = _make_stream_chunks(["Hello", " world", "!"])

        with patch("app.ai_router.providers.google.genai") as mock_genai:
            mock_client = MagicMock()
            mock_client.models.generate_content_stream.return_value = iter(chunks)
            mock_genai.Client.return_value = mock_client

            from app.ai_router.providers.google import GoogleProvider

            provider = GoogleProvider(api_key="test-key")

            messages = [Message(role="user", content="Say hello")]
            collected: list[str] = []
            async for text in provider.stream(messages, model="gemini-2.0-flash"):
                collected.append(text)

            assert collected == ["Hello", " world", "!"]

    @pytest.mark.asyncio
    async def test_stream_api_error_raises_provider_error(self) -> None:
        """Google API errors during streaming are converted to ProviderError."""
        with patch("app.ai_router.providers.google.genai") as mock_genai:
            mock_client = MagicMock()
            mock_client.models.generate_content_stream.side_effect = Exception("Stream failed")
            mock_genai.Client.return_value = mock_client

            from app.ai_router.providers.google import GoogleProvider

            provider = GoogleProvider(api_key="test-key")

            messages = [Message(role="user", content="Test")]
            with pytest.raises(ProviderError) as exc_info:
                async for _ in provider.stream(messages, model="gemini-2.0-flash"):
                    pass

            assert exc_info.value.provider == "google"
            assert "Stream failed" in exc_info.value.message


# ---------------------------------------------------------------------------
# TestGoogleProviderAvailableModels
# ---------------------------------------------------------------------------


class TestGoogleProviderAvailableModels:
    """Tests for GoogleProvider.available_models()."""

    def test_available_models_returns_expected(self) -> None:
        """available_models() returns Gemini 2.0 Flash and 1.5 Pro."""
        with patch("app.ai_router.providers.google.genai") as mock_genai:
            mock_genai.Client.return_value = MagicMock()

            from app.ai_router.providers.google import GoogleProvider

            provider = GoogleProvider(api_key="test-key")
            models = provider.available_models()

            assert len(models) == 2
            assert all(isinstance(m, ModelInfo) for m in models)

            # Gemini 2.0 Flash
            flash = next(m for m in models if m.id == "gemini-2.0-flash")
            assert flash.name == "Gemini 2.0 Flash"
            assert flash.provider == "google"
            assert flash.max_tokens == 1_048_576  # 1M
            assert flash.supports_streaming is True

            # Gemini 1.5 Pro
            pro = next(m for m in models if m.id == "gemini-1.5-pro")
            assert pro.name == "Gemini 1.5 Pro"
            assert pro.provider == "google"
            assert pro.max_tokens == 2_097_152  # 2M
            assert pro.supports_streaming is True
