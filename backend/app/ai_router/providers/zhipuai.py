# @TASK P3-T3.5 - ZhipuAI Provider implementation
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""ZhipuAI (Z.ai) provider for GLM models.

Integrates with the zai-sdk (OpenAI-compatible interface) to provide
access to GLM model series. The SDK is sync-only, so all blocking calls
are wrapped with ``asyncio.to_thread``.

The base URL defaults to the Z.ai Coding endpoint
(``https://api.z.ai/api/coding/paas/v4``) but can be overridden via the
``ZHIPUAI_BASE_URL`` environment variable.

Usage:
    provider = ZhipuAIProvider(api_key="your-key")
    response = await provider.chat(messages, model="glm-4.7-flash")
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from typing import Any

from zai import ZaiClient

from app.ai_router.providers.base import AIProvider
from app.ai_router.schemas import AIResponse, Message, ModelInfo, ProviderError, TokenUsage

_PROVIDER_NAME = "zhipuai"

# Default to Z.ai Coding endpoint (included in Z.ai coding plan).
# Override with ZHIPUAI_BASE_URL env var if using a different plan.
_DEFAULT_BASE_URL = "https://api.z.ai/api/coding/paas/v4"

_AVAILABLE_MODELS = [
    # -- Flagship ($1/$3.2 per M tok) --
    ModelInfo(
        id="glm-5",
        name="GLM-5",
        provider=_PROVIDER_NAME,
        max_tokens=128000,
        supports_streaming=True,
    ),
    # -- General purpose --
    ModelInfo(
        id="glm-4.7",
        name="GLM-4.7",
        provider=_PROVIDER_NAME,
        max_tokens=128000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="glm-4.6",
        name="GLM-4.6",
        provider=_PROVIDER_NAME,
        max_tokens=128000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="glm-4.5",
        name="GLM-4.5",
        provider=_PROVIDER_NAME,
        max_tokens=128000,
        supports_streaming=True,
    ),
    # -- Lightweight --
    ModelInfo(
        id="glm-4.7-flash",
        name="GLM-4.7 Flash (Free)",
        provider=_PROVIDER_NAME,
        max_tokens=128000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="glm-4.5-flash",
        name="GLM-4.5 Flash (Free)",
        provider=_PROVIDER_NAME,
        max_tokens=128000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="glm-4.5-air",
        name="GLM-4.5 Air",
        provider=_PROVIDER_NAME,
        max_tokens=128000,
        supports_streaming=True,
    ),
    # -- Vision --
    ModelInfo(
        id="glm-4.6v-flash",
        name="GLM-4.6V Flash (Vision, Free)",
        provider=_PROVIDER_NAME,
        max_tokens=128000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="glm-4.6v",
        name="GLM-4.6V (Vision)",
        provider=_PROVIDER_NAME,
        max_tokens=128000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="glm-4.5v",
        name="GLM-4.5V (Vision)",
        provider=_PROVIDER_NAME,
        max_tokens=128000,
        supports_streaming=True,
    ),
    # -- OCR (layout_parsing API, not chat completions) --
    ModelInfo(
        id="glm-ocr",
        name="GLM-OCR (Layout Parsing)",
        provider=_PROVIDER_NAME,
        max_tokens=4096,
        supports_streaming=False,
    ),
]


class ZhipuAIProvider(AIProvider):
    """AI provider backed by the zai-sdk.

    The SDK exposes an OpenAI-compatible ``chat.completions.create`` interface,
    so no message format conversion is needed.  Additionally, it provides a
    ``layout_parsing.create`` endpoint for the GLM-OCR model.

    Args:
        api_key: ZhipuAI API key. Falls back to the ``ZHIPUAI_API_KEY``
                 environment variable when *None*.

    Raises:
        ProviderError: If no API key is supplied and the env var is unset.
    """

    def __init__(self, api_key: str | None = None) -> None:
        resolved_key = api_key or os.environ.get("ZHIPUAI_API_KEY")
        if not resolved_key:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message="API key is required. Pass api_key or set ZHIPUAI_API_KEY environment variable.",
            )
        base_url = os.environ.get("ZHIPUAI_BASE_URL", _DEFAULT_BASE_URL)
        self._client: ZaiClient = ZaiClient(api_key=resolved_key, base_url=base_url)

    # -- helpers ------------------------------------------------------------

    @staticmethod
    def _to_dicts(messages: list[Message]) -> list[dict[str, Any]]:
        """Convert Message objects to plain dicts. Supports image content."""
        result: list[dict[str, Any]] = []
        for m in messages:
            if m.images:
                content: list[dict[str, Any]] = [{"type": "text", "text": m.content}]
                for img in m.images:
                    content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:{img.mime_type};base64,{img.data}"},
                    })
                result.append({"role": m.role, "content": content})
            else:
                result.append({"role": m.role, "content": m.content})
        return result

    # -- AIProvider interface -----------------------------------------------

    async def chat(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AIResponse:
        """Send a chat request and return a complete response.

        The synchronous SDK call is offloaded to a thread via
        ``asyncio.to_thread`` to avoid blocking the event loop.
        """
        try:
            response = await asyncio.to_thread(
                self._client.chat.completions.create,
                model=model,
                messages=self._to_dicts(messages),
                **kwargs,
            )
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message=str(exc),
            ) from exc

        choice = response.choices[0]
        usage = response.usage

        return AIResponse(
            content=choice.message.content,
            model=model,
            provider=_PROVIDER_NAME,
            usage=TokenUsage(
                prompt_tokens=usage.prompt_tokens,
                completion_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
            ),
            finish_reason=choice.finish_reason or "stop",
        )

    async def stream(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """Stream the response token by token.

        The ZhipuAI SDK returns a synchronous iterator when ``stream=True``.
        We fetch the iterator in a thread, then consume each chunk via
        ``asyncio.to_thread`` to keep the event loop responsive.
        """
        try:
            sync_iter = await asyncio.to_thread(
                self._client.chat.completions.create,
                model=model,
                messages=self._to_dicts(messages),
                stream=True,
                **kwargs,
            )
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message=str(exc),
            ) from exc

        try:
            for chunk in sync_iter:
                content = chunk.choices[0].delta.content
                if content is not None:
                    yield content
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message=str(exc),
            ) from exc

    async def layout_parsing(self, file: str, **kwargs: Any) -> dict:
        """Call the GLM-OCR layout parsing API.

        Args:
            file: URL or base64 data-URI of the document/image to parse.
            **kwargs: Extra arguments forwarded to ``layout_parsing.create``.

        Returns:
            Raw response dict from the layout parsing API.
        """
        try:
            response = await asyncio.to_thread(
                self._client.layout_parsing.create,
                model="glm-ocr",
                file=file,
                **kwargs,
            )
            return response
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message=str(exc),
            ) from exc

    def available_models(self) -> list[ModelInfo]:
        """Return the list of supported GLM models."""
        return list(_AVAILABLE_MODELS)
