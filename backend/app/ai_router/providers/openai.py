# @TASK P3-T3.2 - OpenAI Provider implementation
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
# @TEST tests/test_openai_provider.py
"""OpenAI provider using the official openai SDK (AsyncOpenAI).

Supports GPT-4o and GPT-4o-mini models with both synchronous chat
and streaming responses via the unified AIProvider interface.

Usage:
    provider = OpenAIProvider(api_key="sk-...")
    response = await provider.chat(messages, model="gpt-4o")

    async for chunk in provider.stream(messages, model="gpt-4o"):
        print(chunk, end="")
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from typing import Any

import openai
from openai import AsyncOpenAI

from app.ai_router.providers.base import AIProvider
from app.ai_router.schemas import (
    AIResponse,
    Message,
    ModelInfo,
    ProviderError,
    TokenUsage,
)

_PROVIDER_NAME = "openai"

_SUPPORTED_MODELS: list[ModelInfo] = [
    # GPT-5 series (2026 Latest)
    ModelInfo(
        id="gpt-5.2",
        name="GPT-5.2",
        provider=_PROVIDER_NAME,
        max_tokens=400_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-5.2-pro",
        name="GPT-5.2 Pro",
        provider=_PROVIDER_NAME,
        max_tokens=400_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-5.1",
        name="GPT-5.1",
        provider=_PROVIDER_NAME,
        max_tokens=400_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-5",
        name="GPT-5",
        provider=_PROVIDER_NAME,
        max_tokens=400_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-5-mini",
        name="GPT-5 mini",
        provider=_PROVIDER_NAME,
        max_tokens=200_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-5-nano",
        name="GPT-5 nano",
        provider=_PROVIDER_NAME,
        max_tokens=128_000,
        supports_streaming=True,
    ),
    # GPT-4.1 series
    ModelInfo(
        id="gpt-4.1",
        name="GPT-4.1",
        provider=_PROVIDER_NAME,
        max_tokens=128_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-4.1-mini",
        name="GPT-4.1 mini",
        provider=_PROVIDER_NAME,
        max_tokens=128_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-4.1-nano",
        name="GPT-4.1 nano",
        provider=_PROVIDER_NAME,
        max_tokens=128_000,
        supports_streaming=True,
    ),
    # o-series reasoning models
    ModelInfo(
        id="o3",
        name="o3",
        provider=_PROVIDER_NAME,
        max_tokens=200_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="o3-pro",
        name="o3 Pro",
        provider=_PROVIDER_NAME,
        max_tokens=200_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="o3-mini",
        name="o3 mini",
        provider=_PROVIDER_NAME,
        max_tokens=200_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="o4-mini",
        name="o4 mini",
        provider=_PROVIDER_NAME,
        max_tokens=200_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="o1",
        name="o1",
        provider=_PROVIDER_NAME,
        max_tokens=200_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="o1-pro",
        name="o1 Pro",
        provider=_PROVIDER_NAME,
        max_tokens=200_000,
        supports_streaming=True,
    ),
    # GPT-4o series (legacy but still available)
    ModelInfo(
        id="gpt-4o",
        name="GPT-4o",
        provider=_PROVIDER_NAME,
        max_tokens=128_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-4o-mini",
        name="GPT-4o mini",
        provider=_PROVIDER_NAME,
        max_tokens=128_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-4-turbo",
        name="GPT-4 Turbo",
        provider=_PROVIDER_NAME,
        max_tokens=128_000,
        supports_streaming=True,
    ),
]

# Models that require max_completion_tokens instead of max_tokens.
_MAX_COMPLETION_TOKENS_PREFIXES = ("o1", "o3", "o4", "gpt-5", "gpt-4.1")
# Reasoning models additionally do not support the temperature parameter.
_REASONING_MODEL_PREFIXES = ("o1", "o3", "o4")


class OpenAIProvider(AIProvider):
    """AI provider backed by the OpenAI API.

    Args:
        api_key: OpenAI API key. Falls back to the ``OPENAI_API_KEY``
            environment variable when *None*.

    Raises:
        ProviderError: If no API key is found.
    """

    def __init__(self, api_key: str | None = None, *, is_oauth: bool = False) -> None:
        resolved_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not resolved_key:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message="API key is required. Pass api_key or set OPENAI_API_KEY environment variable.",
                status_code=None,
            )
        self._client = AsyncOpenAI(api_key=resolved_key)
        self.is_oauth = is_oauth

    @staticmethod
    def _normalize_kwargs(model: str, kwargs: dict[str, Any]) -> dict[str, Any]:
        """Remap kwargs for models with non-standard parameter names.

        Newer OpenAI models (GPT-5.x, GPT-4.1, o-series) require
        ``max_completion_tokens`` instead of ``max_tokens``.
        Reasoning models (o1, o3, o4) additionally do not support
        the ``temperature`` parameter.
        """
        if model.startswith(_MAX_COMPLETION_TOKENS_PREFIXES):
            if "max_tokens" in kwargs:
                kwargs["max_completion_tokens"] = kwargs.pop("max_tokens")
        if model.startswith(_REASONING_MODEL_PREFIXES):
            kwargs.pop("temperature", None)
        return kwargs

    # ------------------------------------------------------------------
    # chat
    # ------------------------------------------------------------------

    async def chat(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AIResponse:
        """Send messages to OpenAI and return a complete response.

        Args:
            messages: Conversation history.
            model: Model identifier (e.g. ``"gpt-4o"``).
            **kwargs: Extra parameters forwarded to the API
                (``temperature``, ``max_tokens``, etc.).

        Returns:
            AIResponse with content, usage, and metadata.

        Raises:
            ProviderError: On any OpenAI API error.
        """
        openai_messages = self._convert_messages(messages)
        kwargs = self._normalize_kwargs(model, kwargs)
        try:
            completion = await self._client.chat.completions.create(
                model=model,
                messages=openai_messages,
                **kwargs,
            )
        except openai.APIStatusError as exc:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message=str(exc),
                status_code=exc.status_code,
            ) from exc
        except openai.APIError as exc:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message=str(exc),
                status_code=None,
            ) from exc

        choice = completion.choices[0]
        usage = None
        if completion.usage is not None:
            usage = TokenUsage(
                prompt_tokens=completion.usage.prompt_tokens,
                completion_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens,
            )

        return AIResponse(
            content=choice.message.content or "",
            model=completion.model,
            provider=_PROVIDER_NAME,
            usage=usage,
            finish_reason=choice.finish_reason or "stop",
        )

    # ------------------------------------------------------------------
    # stream
    # ------------------------------------------------------------------

    async def stream(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """Stream chat completions token-by-token.

        Args:
            messages: Conversation history.
            model: Model identifier.
            **kwargs: Extra parameters forwarded to the API.

        Yields:
            String chunks of the generated text.

        Raises:
            ProviderError: On any OpenAI API error.
        """
        openai_messages = self._convert_messages(messages)
        kwargs = self._normalize_kwargs(model, kwargs)
        try:
            response_stream = await self._client.chat.completions.create(
                model=model,
                messages=openai_messages,
                stream=True,
                **kwargs,
            )
        except openai.APIStatusError as exc:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message=str(exc),
                status_code=exc.status_code,
            ) from exc
        except openai.APIError as exc:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message=str(exc),
                status_code=None,
            ) from exc

        async for chunk in response_stream:
            if chunk.choices and chunk.choices[0].delta.content is not None:
                yield chunk.choices[0].delta.content

    # ------------------------------------------------------------------
    # available_models
    # ------------------------------------------------------------------

    def available_models(self) -> list[ModelInfo]:
        """Return the list of supported OpenAI models.

        Returns:
            List containing GPT-4o (128K) and GPT-4o-mini (128K).
        """
        return list(_SUPPORTED_MODELS)

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _convert_messages(messages: list[Message]) -> list[dict[str, str]]:
        """Convert internal Message objects to OpenAI API format.

        Args:
            messages: List of Message pydantic models.

        Returns:
            List of dicts with ``role`` and ``content`` keys.
        """
        return [{"role": m.role, "content": m.content} for m in messages]
