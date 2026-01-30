# @TASK P3-T3.4 - Google Gemini Provider implementation
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
# @TEST tests/test_google_provider.py
"""Google Gemini AI provider using the google-genai SDK.

Supports:
- Gemini 2.0 Flash (gemini-2.0-flash) - 1M context window
- Gemini 1.5 Pro (gemini-1.5-pro) - 2M context window

The provider converts the unified Message format to Gemini's content
format, separating system messages into system_instruction config.
Role mapping: "assistant" -> "model" (Gemini convention).

Usage:
    provider = GoogleProvider(api_key="your-api-key")
    response = await provider.chat(messages, model="gemini-2.0-flash")
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from typing import Any

from google import genai
from google.genai import types

from app.ai_router.providers.base import AIProvider
from app.ai_router.schemas import (
    AIResponse,
    Message,
    ModelInfo,
    ProviderError,
    TokenUsage,
)


class GoogleProvider(AIProvider):
    """AI provider implementation for Google Gemini models.

    Wraps the google-genai SDK synchronous methods with asyncio.to_thread
    for async compatibility.

    Attributes:
        _client: The google-genai Client instance.
    """

    def __init__(
        self,
        api_key: str | None = None,
        *,
        oauth_token: str | None = None,
        is_oauth: bool = False,
    ) -> None:
        """Initialize the Google Gemini provider.

        Args:
            api_key: Google API key. If not provided, reads from
                     the GOOGLE_API_KEY environment variable.
            oauth_token: OAuth access token for Google OAuth authentication.
            is_oauth: Whether this provider uses OAuth credentials.

        Raises:
            ProviderError: If no API key is available.
        """
        if oauth_token:
            import google.oauth2.credentials as oauth2_credentials

            creds = oauth2_credentials.Credentials(token=oauth_token)
            self._client = genai.Client(credentials=creds)
            self.is_oauth = True
        else:
            resolved_key = api_key or os.environ.get("GOOGLE_API_KEY")
            if not resolved_key:
                raise ProviderError(
                    provider="google",
                    message="API key is required. Provide api_key argument or set GOOGLE_API_KEY environment variable.",
                )
            self._client = genai.Client(api_key=resolved_key)
            self.is_oauth = is_oauth

    def _convert_messages(
        self, messages: list[Message]
    ) -> tuple[list[dict[str, Any]], str | None]:
        """Convert unified Messages to Gemini content format.

        Separates system messages into a system_instruction string and
        converts the remaining messages to Gemini's content format.
        Role "assistant" is mapped to "model".

        Args:
            messages: List of Message objects.

        Returns:
            A tuple of (contents, system_instruction) where contents is
            a list of Gemini content dicts and system_instruction is the
            concatenated system message text (or None if no system messages).
        """
        system_parts: list[str] = []
        contents: list[dict[str, Any]] = []

        for msg in messages:
            if msg.role == "system":
                system_parts.append(msg.content)
            else:
                # Map "assistant" -> "model" for Gemini API
                role = "model" if msg.role == "assistant" else msg.role
                contents.append({
                    "role": role,
                    "parts": [{"text": msg.content}],
                })

        system_instruction = "\n".join(system_parts) if system_parts else None
        return contents, system_instruction

    def _build_config(
        self, system_instruction: str | None, **kwargs: Any
    ) -> types.GenerateContentConfig | None:
        """Build GenerateContentConfig with optional system_instruction.

        Args:
            system_instruction: System instruction text, or None.
            **kwargs: Additional config parameters (reserved for future use).

        Returns:
            A GenerateContentConfig if system_instruction is provided,
            otherwise None.
        """
        if system_instruction is not None:
            return types.GenerateContentConfig(
                system_instruction=system_instruction,
            )
        return None

    async def chat(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AIResponse:
        """Send a chat request to Google Gemini and return a complete response.

        Args:
            messages: The conversation history as a list of Messages.
            model: The Gemini model identifier (e.g., "gemini-2.0-flash").
            **kwargs: Additional provider-specific parameters.

        Returns:
            AIResponse with the generated content and token usage.

        Raises:
            ProviderError: If the Gemini API request fails.
        """
        contents, system_instruction = self._convert_messages(messages)
        config = self._build_config(system_instruction, **kwargs)

        try:
            response = await asyncio.to_thread(
                self._client.models.generate_content,
                model=model,
                contents=contents,
                config=config,
            )
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(
                provider="google",
                message=str(exc),
            ) from exc

        # Extract token usage
        usage = None
        if response.usage_metadata:
            prompt_tokens = response.usage_metadata.prompt_token_count or 0
            completion_tokens = response.usage_metadata.candidates_token_count or 0
            usage = TokenUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
            )

        return AIResponse(
            content=response.text,
            model=model,
            provider="google",
            usage=usage,
        )

    async def stream(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """Stream a chat response from Google Gemini token by token.

        Args:
            messages: The conversation history as a list of Messages.
            model: The Gemini model identifier.
            **kwargs: Additional provider-specific parameters.

        Yields:
            String chunks of the generated response.

        Raises:
            ProviderError: If the Gemini API request fails.
        """
        contents, system_instruction = self._convert_messages(messages)
        config = self._build_config(system_instruction, **kwargs)

        try:
            response_stream = await asyncio.to_thread(
                self._client.models.generate_content_stream,
                model=model,
                contents=contents,
                config=config,
            )
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(
                provider="google",
                message=str(exc),
            ) from exc

        for chunk in response_stream:
            if chunk.text:
                yield chunk.text

    def available_models(self) -> list[ModelInfo]:
        """Return the list of supported Google Gemini models.

        Returns:
            List containing Gemini 2.0 Flash and Gemini 1.5 Pro metadata.
        """
        return [
            ModelInfo(
                id="gemini-2.0-flash",
                name="Gemini 2.0 Flash",
                provider="google",
                max_tokens=1_048_576,  # 1M
                supports_streaming=True,
            ),
            ModelInfo(
                id="gemini-1.5-pro",
                name="Gemini 1.5 Pro",
                provider="google",
                max_tokens=2_097_152,  # 2M
                supports_streaming=True,
            ),
        ]
