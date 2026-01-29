# @TASK P3-T3.3 - Anthropic AI Provider implementation
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
# @TEST tests/test_anthropic_provider.py
"""Anthropic (Claude) AI provider.

Integrates with the Anthropic Messages API via the official ``anthropic``
Python SDK.  Supports both synchronous chat and streaming responses.

Supported models:
- Claude 3.5 Sonnet (claude-3-5-sonnet-20241022) -- 200K context
- Claude 3 Haiku   (claude-3-haiku-20240307)      -- 200K context
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from typing import Any

import anthropic

from app.ai_router.providers.base import AIProvider
from app.ai_router.schemas import AIResponse, Message, ModelInfo, ProviderError, TokenUsage

# Default max_tokens for Anthropic API (required parameter)
_DEFAULT_MAX_TOKENS = 4096


class AnthropicProvider(AIProvider):
    """AI provider backed by Anthropic's Claude models.

    Args:
        api_key: Anthropic API key.  Falls back to the ``ANTHROPIC_API_KEY``
            environment variable when *None*.

    Raises:
        ProviderError: If no API key is available.
    """

    # @TASK P3-T3.3 - Constructor with API key validation
    def __init__(self, api_key: str | None = None) -> None:
        resolved_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not resolved_key:
            raise ProviderError(
                provider="anthropic",
                message=(
                    "API key is required. Provide it via the api_key argument "
                    "or the ANTHROPIC_API_KEY environment variable."
                ),
            )
        self._client = anthropic.AsyncAnthropic(api_key=resolved_key)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _separate_system_messages(
        messages: list[Message],
    ) -> tuple[str | anthropic.NotGiven, list[dict[str, str]]]:
        """Extract system messages and return them separately.

        Anthropic requires ``system`` to be passed as a top-level parameter
        rather than inside the ``messages`` list.

        Returns:
            A tuple of (system_text_or_NOT_GIVEN, non_system_messages).
        """
        system_parts: list[str] = []
        api_messages: list[dict[str, str]] = []

        for msg in messages:
            if msg.role == "system":
                system_parts.append(msg.content)
            else:
                api_messages.append({"role": msg.role, "content": msg.content})

        system_text: str | anthropic.NotGiven = (
            "\n\n".join(system_parts) if system_parts else anthropic.NOT_GIVEN
        )
        return system_text, api_messages

    # ------------------------------------------------------------------
    # AIProvider interface
    # ------------------------------------------------------------------

    # @TASK P3-T3.3 - Chat (non-streaming)
    async def chat(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AIResponse:
        """Send a chat request and return a complete response.

        Raises:
            ProviderError: On any Anthropic API error.
        """
        system_text, api_messages = self._separate_system_messages(messages)
        max_tokens = kwargs.pop("max_tokens", _DEFAULT_MAX_TOKENS)

        try:
            response = await self._client.messages.create(
                model=model,
                messages=api_messages,
                system=system_text,
                max_tokens=max_tokens,
                **kwargs,
            )
        except anthropic.APIStatusError as exc:
            raise ProviderError(
                provider="anthropic",
                message=str(exc.message),
                status_code=exc.response.status_code,
            ) from exc
        except anthropic.APIError as exc:
            raise ProviderError(
                provider="anthropic",
                message=str(exc.message),
            ) from exc

        usage = TokenUsage(
            prompt_tokens=response.usage.input_tokens,
            completion_tokens=response.usage.output_tokens,
            total_tokens=response.usage.input_tokens + response.usage.output_tokens,
        )

        return AIResponse(
            content=response.content[0].text,
            model=response.model,
            provider="anthropic",
            usage=usage,
            finish_reason=response.stop_reason or "stop",
        )

    # @TASK P3-T3.3 - Streaming chat
    async def stream(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """Stream the response token-by-token.

        Yields:
            String chunks of the generated response.

        Raises:
            ProviderError: On any Anthropic API error.
        """
        system_text, api_messages = self._separate_system_messages(messages)
        max_tokens = kwargs.pop("max_tokens", _DEFAULT_MAX_TOKENS)

        try:
            async with self._client.messages.stream(
                model=model,
                messages=api_messages,
                system=system_text,
                max_tokens=max_tokens,
                **kwargs,
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except anthropic.APIStatusError as exc:
            raise ProviderError(
                provider="anthropic",
                message=str(exc.message),
                status_code=exc.response.status_code,
            ) from exc
        except anthropic.APIError as exc:
            raise ProviderError(
                provider="anthropic",
                message=str(exc.message),
            ) from exc

    # @TASK P3-T3.3 - Available models list
    def available_models(self) -> list[ModelInfo]:
        """Return the list of supported Claude models."""
        return [
            ModelInfo(
                id="claude-3-5-sonnet-20241022",
                name="Claude 3.5 Sonnet",
                provider="anthropic",
                max_tokens=200_000,
                supports_streaming=True,
            ),
            ModelInfo(
                id="claude-3-haiku-20240307",
                name="Claude 3 Haiku",
                provider="anthropic",
                max_tokens=200_000,
                supports_streaming=True,
            ),
        ]
