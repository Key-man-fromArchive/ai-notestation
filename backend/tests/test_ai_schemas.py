# @TASK P3-T3.1 - AI Provider schemas and ABC tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""Tests for AI Router schemas and abstract provider interface.

Covers:
- Message schema validation (valid/invalid roles)
- ModelInfo defaults and serialization
- AIRequest default values
- AIResponse field validation
- TokenUsage total computation
- ProviderError exception attributes
- AIProvider ABC cannot be instantiated directly
- AIProvider subclass implementation works correctly
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
from pydantic import ValidationError

from app.ai_router.providers.base import AIProvider
from app.ai_router.schemas import (
    AIRequest,
    AIResponse,
    Message,
    ModelInfo,
    ProviderError,
    TokenUsage,
)

# ---------------------------------------------------------------------------
# Message schema tests
# ---------------------------------------------------------------------------


class TestMessage:
    """Message schema validation tests."""

    def test_valid_system_role(self) -> None:
        msg = Message(role="system", content="You are a helpful assistant.")
        assert msg.role == "system"
        assert msg.content == "You are a helpful assistant."

    def test_valid_user_role(self) -> None:
        msg = Message(role="user", content="Hello!")
        assert msg.role == "user"

    def test_valid_assistant_role(self) -> None:
        msg = Message(role="assistant", content="Hi there!")
        assert msg.role == "assistant"

    def test_invalid_role_raises_validation_error(self) -> None:
        with pytest.raises(ValidationError):
            Message(role="admin", content="test")

    def test_invalid_role_function_raises(self) -> None:
        with pytest.raises(ValidationError):
            Message(role="function", content="test")

    def test_empty_content_allowed(self) -> None:
        msg = Message(role="user", content="")
        assert msg.content == ""

    def test_model_dump(self) -> None:
        msg = Message(role="user", content="Hello!")
        dumped = msg.model_dump()
        assert dumped == {"role": "user", "content": "Hello!"}

    def test_model_validate(self) -> None:
        msg = Message.model_validate({"role": "assistant", "content": "Hi"})
        assert msg.role == "assistant"
        assert msg.content == "Hi"


# ---------------------------------------------------------------------------
# ModelInfo schema tests
# ---------------------------------------------------------------------------


class TestModelInfo:
    """ModelInfo schema tests with defaults and serialization."""

    def test_required_fields(self) -> None:
        info = ModelInfo(
            id="gpt-4o",
            name="GPT-4o",
            provider="openai",
            max_tokens=128000,
        )
        assert info.id == "gpt-4o"
        assert info.name == "GPT-4o"
        assert info.provider == "openai"
        assert info.max_tokens == 128000

    def test_supports_streaming_default_true(self) -> None:
        info = ModelInfo(id="m", name="M", provider="p", max_tokens=1000)
        assert info.supports_streaming is True

    def test_supports_streaming_explicit_false(self) -> None:
        info = ModelInfo(
            id="m",
            name="M",
            provider="p",
            max_tokens=1000,
            supports_streaming=False,
        )
        assert info.supports_streaming is False

    def test_model_dump_serialization(self) -> None:
        info = ModelInfo(
            id="claude-3-sonnet",
            name="Claude 3 Sonnet",
            provider="anthropic",
            max_tokens=200000,
            supports_streaming=True,
        )
        dumped = info.model_dump()
        assert dumped == {
            "id": "claude-3-sonnet",
            "name": "Claude 3 Sonnet",
            "provider": "anthropic",
            "max_tokens": 200000,
            "supports_streaming": True,
        }

    def test_model_validate_from_dict(self) -> None:
        data = {
            "id": "gemini-2.0-flash",
            "name": "Gemini 2.0 Flash",
            "provider": "google",
            "max_tokens": 1048576,
        }
        info = ModelInfo.model_validate(data)
        assert info.id == "gemini-2.0-flash"
        assert info.supports_streaming is True


# ---------------------------------------------------------------------------
# AIRequest schema tests
# ---------------------------------------------------------------------------


class TestAIRequest:
    """AIRequest schema tests with default values."""

    def test_defaults(self) -> None:
        req = AIRequest(
            messages=[Message(role="user", content="Hi")],
        )
        assert req.model is None
        assert req.temperature == pytest.approx(0.7)
        assert req.max_tokens == 4096
        assert req.stream is False

    def test_custom_values(self) -> None:
        req = AIRequest(
            messages=[
                Message(role="system", content="Be brief."),
                Message(role="user", content="Summarize."),
            ],
            model="gpt-4o",
            temperature=0.0,
            max_tokens=256,
            stream=True,
        )
        assert req.model == "gpt-4o"
        assert req.temperature == pytest.approx(0.0)
        assert req.max_tokens == 256
        assert req.stream is True
        assert len(req.messages) == 2

    def test_messages_required(self) -> None:
        with pytest.raises(ValidationError):
            AIRequest()  # type: ignore[call-arg]

    def test_empty_messages_list(self) -> None:
        # Empty messages list should be valid at the schema level
        req = AIRequest(messages=[])
        assert req.messages == []

    def test_model_validate(self) -> None:
        data = {
            "messages": [{"role": "user", "content": "Hello"}],
            "model": "claude-3-sonnet",
            "temperature": 0.5,
        }
        req = AIRequest.model_validate(data)
        assert req.model == "claude-3-sonnet"
        assert req.temperature == pytest.approx(0.5)
        assert req.max_tokens == 4096
        assert req.stream is False


# ---------------------------------------------------------------------------
# TokenUsage schema tests
# ---------------------------------------------------------------------------


class TestTokenUsage:
    """TokenUsage schema tests."""

    def test_fields(self) -> None:
        usage = TokenUsage(prompt_tokens=100, completion_tokens=50, total_tokens=150)
        assert usage.prompt_tokens == 100
        assert usage.completion_tokens == 50
        assert usage.total_tokens == 150

    def test_total_equals_sum(self) -> None:
        usage = TokenUsage(prompt_tokens=200, completion_tokens=300, total_tokens=500)
        assert usage.total_tokens == usage.prompt_tokens + usage.completion_tokens

    def test_zero_tokens(self) -> None:
        usage = TokenUsage(prompt_tokens=0, completion_tokens=0, total_tokens=0)
        assert usage.total_tokens == 0

    def test_model_dump(self) -> None:
        usage = TokenUsage(prompt_tokens=10, completion_tokens=20, total_tokens=30)
        dumped = usage.model_dump()
        assert dumped == {
            "prompt_tokens": 10,
            "completion_tokens": 20,
            "total_tokens": 30,
        }


# ---------------------------------------------------------------------------
# AIResponse schema tests
# ---------------------------------------------------------------------------


class TestAIResponse:
    """AIResponse schema tests."""

    def test_required_and_defaults(self) -> None:
        resp = AIResponse(content="Hello!", model="gpt-4o", provider="openai")
        assert resp.content == "Hello!"
        assert resp.model == "gpt-4o"
        assert resp.provider == "openai"
        assert resp.usage is None
        assert resp.finish_reason == "stop"

    def test_with_usage(self) -> None:
        usage = TokenUsage(prompt_tokens=10, completion_tokens=5, total_tokens=15)
        resp = AIResponse(
            content="Answer",
            model="claude-3-sonnet",
            provider="anthropic",
            usage=usage,
            finish_reason="stop",
        )
        assert resp.usage is not None
        assert resp.usage.total_tokens == 15

    def test_custom_finish_reason(self) -> None:
        resp = AIResponse(
            content="",
            model="gpt-4o",
            provider="openai",
            finish_reason="length",
        )
        assert resp.finish_reason == "length"

    def test_model_dump_with_usage(self) -> None:
        usage = TokenUsage(prompt_tokens=1, completion_tokens=2, total_tokens=3)
        resp = AIResponse(
            content="test",
            model="m",
            provider="p",
            usage=usage,
        )
        dumped = resp.model_dump()
        assert dumped["usage"]["total_tokens"] == 3

    def test_model_dump_without_usage(self) -> None:
        resp = AIResponse(content="test", model="m", provider="p")
        dumped = resp.model_dump()
        assert dumped["usage"] is None


# ---------------------------------------------------------------------------
# ProviderError exception tests
# ---------------------------------------------------------------------------


class TestProviderError:
    """ProviderError exception tests."""

    def test_basic_attributes(self) -> None:
        err = ProviderError(provider="openai", message="Rate limit exceeded")
        assert err.provider == "openai"
        assert err.message == "Rate limit exceeded"
        assert err.status_code is None

    def test_with_status_code(self) -> None:
        err = ProviderError(
            provider="anthropic",
            message="Unauthorized",
            status_code=401,
        )
        assert err.provider == "anthropic"
        assert err.message == "Unauthorized"
        assert err.status_code == 401

    def test_is_exception(self) -> None:
        err = ProviderError(provider="google", message="Server error", status_code=500)
        assert isinstance(err, Exception)

    def test_str_representation(self) -> None:
        err = ProviderError(provider="openai", message="Bad request", status_code=400)
        err_str = str(err)
        assert "openai" in err_str
        assert "Bad request" in err_str

    def test_can_be_raised_and_caught(self) -> None:
        with pytest.raises(ProviderError) as exc_info:
            raise ProviderError(provider="zhipuai", message="Timeout", status_code=504)
        assert exc_info.value.provider == "zhipuai"
        assert exc_info.value.status_code == 504


# ---------------------------------------------------------------------------
# AIProvider ABC tests
# ---------------------------------------------------------------------------


class TestAIProviderABC:
    """AIProvider abstract base class tests."""

    def test_cannot_instantiate_directly(self) -> None:
        with pytest.raises(TypeError):
            AIProvider()  # type: ignore[abstract]

    def test_subclass_must_implement_all_methods(self) -> None:
        # A subclass that does not implement all abstract methods
        class IncompleteProvider(AIProvider):
            async def chat(self, messages: list[Message], model: str, **kwargs: Any) -> AIResponse:
                return AIResponse(content="", model=model, provider="test")

        with pytest.raises(TypeError):
            IncompleteProvider()  # type: ignore[abstract]

    def test_complete_subclass_instantiation(self) -> None:
        class MockProvider(AIProvider):
            async def chat(self, messages: list[Message], model: str, **kwargs: Any) -> AIResponse:
                return AIResponse(content="mock", model=model, provider="mock")

            async def stream(self, messages: list[Message], model: str, **kwargs: Any) -> AsyncIterator[str]:
                yield "hello"

            def available_models(self) -> list[ModelInfo]:
                return [
                    ModelInfo(id="mock-1", name="Mock Model", provider="mock", max_tokens=4096),
                ]

        provider = MockProvider()
        assert provider is not None

    @pytest.mark.asyncio
    async def test_subclass_chat_works(self) -> None:
        class MockProvider(AIProvider):
            async def chat(self, messages: list[Message], model: str, **kwargs: Any) -> AIResponse:
                content = " ".join(m.content for m in messages if m.role == "user")
                return AIResponse(content=content, model=model, provider="mock")

            async def stream(self, messages: list[Message], model: str, **kwargs: Any) -> AsyncIterator[str]:
                for m in messages:
                    if m.role == "user":
                        yield m.content

            def available_models(self) -> list[ModelInfo]:
                return []

        provider = MockProvider()
        messages = [
            Message(role="system", content="Be helpful."),
            Message(role="user", content="Hello world"),
        ]
        response = await provider.chat(messages, model="mock-1")
        assert response.content == "Hello world"
        assert response.model == "mock-1"
        assert response.provider == "mock"

    @pytest.mark.asyncio
    async def test_subclass_stream_works(self) -> None:
        class MockProvider(AIProvider):
            async def chat(self, messages: list[Message], model: str, **kwargs: Any) -> AIResponse:
                return AIResponse(content="", model=model, provider="mock")

            async def stream(self, messages: list[Message], model: str, **kwargs: Any) -> AsyncIterator[str]:
                for token in ["Hello", " ", "World"]:
                    yield token

            def available_models(self) -> list[ModelInfo]:
                return []

        provider = MockProvider()
        messages = [Message(role="user", content="Hi")]
        chunks: list[str] = []
        async for chunk in provider.stream(messages, model="mock-1"):
            chunks.append(chunk)
        assert chunks == ["Hello", " ", "World"]

    def test_subclass_available_models(self) -> None:
        class MockProvider(AIProvider):
            async def chat(self, messages: list[Message], model: str, **kwargs: Any) -> AIResponse:
                return AIResponse(content="", model=model, provider="mock")

            async def stream(self, messages: list[Message], model: str, **kwargs: Any) -> AsyncIterator[str]:
                yield ""

            def available_models(self) -> list[ModelInfo]:
                return [
                    ModelInfo(id="mock-fast", name="Mock Fast", provider="mock", max_tokens=4096),
                    ModelInfo(
                        id="mock-pro",
                        name="Mock Pro",
                        provider="mock",
                        max_tokens=128000,
                        supports_streaming=False,
                    ),
                ]

        provider = MockProvider()
        models = provider.available_models()
        assert len(models) == 2
        assert models[0].id == "mock-fast"
        assert models[0].supports_streaming is True
        assert models[1].id == "mock-pro"
        assert models[1].supports_streaming is False
