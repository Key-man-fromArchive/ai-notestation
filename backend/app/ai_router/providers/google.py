# @TASK P3-T3.4 - Google Gemini Provider implementation
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
# @TEST tests/test_google_provider.py
"""Google Gemini AI provider.

Supports two authentication modes:

1. **API key** (default) -- uses the ``google-genai`` SDK directly.
2. **OAuth token** -- calls the Gemini REST API with ``httpx`` and a
   Bearer token.  This is necessary because the ``google-genai`` SDK
   does not support OAuth credentials for the AI Studio API.

Supported models:
- Gemini 2.0 Flash (gemini-2.0-flash) - 1M context window
- Gemini 1.5 Pro (gemini-1.5-pro) - 2M context window

Usage::

    # API key mode
    provider = GoogleProvider(api_key="your-api-key")

    # OAuth mode
    provider = GoogleProvider(oauth_token="ya29....")

    response = await provider.chat(messages, model="gemini-2.0-flash")
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import AsyncIterator
from typing import Any

import httpx
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

logger = logging.getLogger(__name__)

_PROVIDER_NAME = "google"
_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

_AVAILABLE_MODELS = [
    ModelInfo(
        id="gemini-3-pro-preview",
        name="Gemini 3 Pro",
        provider=_PROVIDER_NAME,
        max_tokens=2_097_152,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gemini-3-flash-preview",
        name="Gemini 3 Flash",
        provider=_PROVIDER_NAME,
        max_tokens=1_048_576,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gemini-2.5-pro",
        name="Gemini 2.5 Pro",
        provider=_PROVIDER_NAME,
        max_tokens=2_097_152,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gemini-2.5-flash",
        name="Gemini 2.5 Flash",
        provider=_PROVIDER_NAME,
        max_tokens=1_048_576,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gemini-2.5-flash-lite",
        name="Gemini 2.5 Flash Lite",
        provider=_PROVIDER_NAME,
        max_tokens=1_048_576,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gemini-2.0-flash",
        name="Gemini 2.0 Flash",
        provider=_PROVIDER_NAME,
        max_tokens=1_048_576,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gemini-1.5-pro",
        name="Gemini 1.5 Pro",
        provider=_PROVIDER_NAME,
        max_tokens=2_097_152,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gemini-1.5-flash",
        name="Gemini 1.5 Flash",
        provider=_PROVIDER_NAME,
        max_tokens=1_048_576,
        supports_streaming=True,
    ),
]


def _convert_messages(
    messages: list[Message],
) -> tuple[list[dict[str, Any]], str | None]:
    """Convert unified Messages to Gemini content format.

    Separates system messages into a system_instruction string and
    converts the remaining messages to Gemini's content format.
    Role "assistant" is mapped to "model".

    Returns:
        A tuple of (contents, system_instruction).
    """
    system_parts: list[str] = []
    contents: list[dict[str, Any]] = []

    for msg in messages:
        if msg.role == "system":
            system_parts.append(msg.content)
        else:
            role = "model" if msg.role == "assistant" else msg.role
            contents.append(
                {
                    "role": role,
                    "parts": [{"text": msg.content}],
                }
            )

    system_instruction = "\n".join(system_parts) if system_parts else None
    return contents, system_instruction


class GoogleProvider(AIProvider):
    """AI provider implementation for Google Gemini models.

    Supports API key mode (via SDK) and OAuth mode (via REST API).
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
            api_key: Google API key.  Falls back to ``GOOGLE_API_KEY`` env var.
            oauth_token: OAuth access token for Bearer auth.
            is_oauth: Whether this provider uses OAuth credentials.

        Raises:
            ProviderError: If neither API key nor OAuth token is available.
        """
        self.is_oauth = bool(oauth_token) or is_oauth

        if oauth_token:
            self._oauth_token: str | None = oauth_token
            self._client = None  # SDK not used in OAuth mode
        else:
            self._oauth_token = None
            resolved_key = api_key or os.environ.get("GOOGLE_API_KEY")
            if not resolved_key:
                raise ProviderError(
                    provider=_PROVIDER_NAME,
                    message="API key is required. Provide api_key argument or set GOOGLE_API_KEY environment variable.",
                )
            self._client = genai.Client(api_key=resolved_key)

    # ------------------------------------------------------------------
    # SDK helpers (API key mode)
    # ------------------------------------------------------------------

    def _build_config(self, system_instruction: str | None, **kwargs: Any) -> types.GenerateContentConfig | None:
        if system_instruction is not None:
            return types.GenerateContentConfig(
                system_instruction=system_instruction,
            )
        return None

    # ------------------------------------------------------------------
    # REST API helpers (OAuth mode)
    # ------------------------------------------------------------------

    def _rest_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._oauth_token}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _rest_body(
        contents: list[dict[str, Any]],
        system_instruction: str | None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"contents": contents}
        if system_instruction:
            body["systemInstruction"] = {
                "parts": [{"text": system_instruction}],
            }
        return body

    # ------------------------------------------------------------------
    # Chat (non-streaming)
    # ------------------------------------------------------------------

    async def chat(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AIResponse:
        contents, system_instruction = _convert_messages(messages)

        if self._oauth_token:
            return await self._chat_rest(contents, system_instruction, model)

        return await self._chat_sdk(contents, system_instruction, model, **kwargs)

    async def _chat_sdk(
        self,
        contents: list[dict[str, Any]],
        system_instruction: str | None,
        model: str,
        **kwargs: Any,
    ) -> AIResponse:
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
            raise ProviderError(provider=_PROVIDER_NAME, message=str(exc)) from exc

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
            provider=_PROVIDER_NAME,
            usage=usage,
        )

    async def _chat_rest(
        self,
        contents: list[dict[str, Any]],
        system_instruction: str | None,
        model: str,
    ) -> AIResponse:
        url = f"{_GEMINI_API_BASE}/models/{model}:generateContent"
        body = self._rest_body(contents, system_instruction)

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, json=body, headers=self._rest_headers())
        except httpx.HTTPError as exc:
            raise ProviderError(provider=_PROVIDER_NAME, message=str(exc)) from exc

        if resp.status_code != 200:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message=f"Gemini REST error: {resp.status_code} {resp.text[:500]}",
                status_code=resp.status_code,
            )

        data = resp.json()

        # Extract text from candidates
        text = ""
        for candidate in data.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                text += part.get("text", "")

        # Extract usage
        usage = None
        usage_meta = data.get("usageMetadata")
        if usage_meta:
            prompt_tokens = usage_meta.get("promptTokenCount", 0)
            completion_tokens = usage_meta.get("candidatesTokenCount", 0)
            usage = TokenUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=usage_meta.get("totalTokenCount", prompt_tokens + completion_tokens),
            )

        return AIResponse(
            content=text,
            model=model,
            provider=_PROVIDER_NAME,
            usage=usage,
        )

    # ------------------------------------------------------------------
    # Stream (SSE)
    # ------------------------------------------------------------------

    async def stream(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        contents, system_instruction = _convert_messages(messages)

        if self._oauth_token:
            async for chunk in self._stream_rest(contents, system_instruction, model):
                yield chunk
        else:
            async for chunk in self._stream_sdk(contents, system_instruction, model, **kwargs):
                yield chunk

    async def _stream_sdk(
        self,
        contents: list[dict[str, Any]],
        system_instruction: str | None,
        model: str,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
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
            raise ProviderError(provider=_PROVIDER_NAME, message=str(exc)) from exc

        for chunk in response_stream:
            if chunk.text:
                yield chunk.text

    async def _stream_rest(
        self,
        contents: list[dict[str, Any]],
        system_instruction: str | None,
        model: str,
    ) -> AsyncIterator[str]:
        url = f"{_GEMINI_API_BASE}/models/{model}:streamGenerateContent?alt=sse"
        body = self._rest_body(contents, system_instruction)

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", url, json=body, headers=self._rest_headers()) as resp:
                    if resp.status_code != 200:
                        error_body = await resp.aread()
                        raise ProviderError(
                            provider=_PROVIDER_NAME,
                            message=f"Gemini stream error: {resp.status_code} {error_body.decode()[:500]}",
                            status_code=resp.status_code,
                        )

                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        payload = line[6:]
                        try:
                            event = json.loads(payload)
                            for candidate in event.get("candidates", []):
                                for part in candidate.get("content", {}).get("parts", []):
                                    text = part.get("text", "")
                                    if text:
                                        yield text
                        except json.JSONDecodeError:
                            continue
        except ProviderError:
            raise
        except httpx.HTTPError as exc:
            raise ProviderError(provider=_PROVIDER_NAME, message=str(exc)) from exc

    # ------------------------------------------------------------------
    # Model discovery
    # ------------------------------------------------------------------

    def available_models(self) -> list[ModelInfo]:
        return list(_AVAILABLE_MODELS)
