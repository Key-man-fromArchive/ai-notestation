# @TASK P3-T3.6 - AI Router unified interface
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
# @TEST tests/test_ai_router.py
"""AI Router - Unified interface for routing requests to multiple AI providers.

The AIRouter auto-detects available providers based on environment variables
and provides a single interface for chat (non-streaming) and stream (SSE)
interactions across all registered providers.

Usage:
    router = AIRouter()  # auto-detects providers from env vars

    # Non-streaming chat
    response = await router.chat(AIRequest(messages=[...], model="gpt-4o"))

    # Streaming SSE
    async for sse_line in router.stream(AIRequest(messages=[...], stream=True)):
        print(sse_line)  # "data: Hello\\n\\n", ..., "data: [DONE]\\n\\n"
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncIterator
from typing import Any

from app.ai_router.providers.base import AIProvider
from app.ai_router.schemas import (
    AIRequest,
    AIResponse,
    ModelInfo,
    ProviderError,
)

logger = logging.getLogger(__name__)

# Mapping of environment variable names to (provider_name, provider_class_path)
_PROVIDER_REGISTRY: list[tuple[str, str, str]] = [
    ("OPENAI_API_KEY", "openai", "app.ai_router.providers.openai.OpenAIProvider"),
    ("ANTHROPIC_API_KEY", "anthropic", "app.ai_router.providers.anthropic.AnthropicProvider"),
    ("GOOGLE_API_KEY", "google", "app.ai_router.providers.google.GoogleProvider"),
    ("ZHIPUAI_API_KEY", "zhipuai", "app.ai_router.providers.zhipuai.ZhipuAIProvider"),
]


class AIRouter:
    """AI unified router -- manages multiple AI providers behind one interface.

    On initialization, the router inspects environment variables to discover
    which API keys are available and automatically registers the corresponding
    providers.  Providers whose keys are missing are silently skipped.

    Attributes:
        _providers: Internal dict mapping provider names to AIProvider instances.
    """

    def __init__(self) -> None:
        """Auto-detect and register providers whose API keys are set."""
        self._providers: dict[str, AIProvider] = {}
        self._auto_detect()

    # ------------------------------------------------------------------
    # Auto-detection
    # ------------------------------------------------------------------

    def _auto_detect(self) -> None:
        """Scan environment variables and register available providers.

        For each known provider, check if the corresponding API key
        environment variable is set (non-empty).  If so, import and
        instantiate the provider class.  Errors during instantiation
        are logged and the provider is skipped.
        """
        for env_var, name, class_path in _PROVIDER_REGISTRY:
            api_key = os.environ.get(env_var, "")
            if not api_key:
                continue

            try:
                module_path, class_name = class_path.rsplit(".", 1)
                import importlib

                module = importlib.import_module(module_path)
                provider_cls = getattr(module, class_name)
                provider = provider_cls(api_key=api_key)
                self._providers[name] = provider
                logger.info("Auto-detected AI provider: %s", name)
            except Exception:
                logger.warning(
                    "Failed to initialize provider %s (key present but init failed)",
                    name,
                    exc_info=True,
                )

    # ------------------------------------------------------------------
    # Provider management
    # ------------------------------------------------------------------

    def register_provider(self, name: str, provider: AIProvider) -> None:
        """Manually register (or replace) a provider.

        Args:
            name: Unique identifier for the provider (e.g. "openai").
            provider: An AIProvider instance.
        """
        self._providers[name] = provider

    def register_oauth_provider(self, name: str, access_token: str, **kwargs: Any) -> None:
        """Register a provider using an OAuth access token.

        Args:
            name: Provider name ("openai" or "google").
            access_token: OAuth access token.
            **kwargs: Extra keyword arguments forwarded to the provider constructor.
        """
        try:
            if name == "openai":
                from app.ai_router.providers.chatgpt_codex import (
                    ChatGPTCodexProvider,
                    extract_chatgpt_account_id,
                )

                account_id = kwargs.get("account_id") or extract_chatgpt_account_id(access_token)
                if not account_id:
                    logger.warning("Cannot extract chatgpt_account_id from token")
                    return
                provider: AIProvider = ChatGPTCodexProvider(access_token=access_token, account_id=account_id)
            elif name == "google":
                from app.ai_router.providers.google import GoogleProvider

                provider = GoogleProvider(oauth_token=access_token, is_oauth=True, **kwargs)
            else:
                logger.warning("OAuth not supported for provider: %s", name)
                return

            self._providers[name] = provider
            logger.info("Registered OAuth provider: %s", name)
        except Exception:
            logger.warning("Failed to register OAuth provider: %s", name, exc_info=True)

    def remove_provider(self, name: str) -> bool:
        """Remove a registered provider.

        Args:
            name: The provider name to remove.

        Returns:
            True if the provider was removed, False if not found.
        """
        if name in self._providers:
            del self._providers[name]
            logger.info("Removed provider: %s", name)
            return True
        return False

    def get_provider(self, provider_name: str) -> AIProvider:
        """Retrieve a registered provider by name.

        Args:
            provider_name: The name used during registration.

        Returns:
            The AIProvider instance.

        Raises:
            ProviderError: If no provider is registered under that name.
        """
        if provider_name not in self._providers:
            raise ProviderError(
                provider=provider_name,
                message=f"Provider '{provider_name}' is not registered. "
                f"Available: {', '.join(self._providers) or 'none'}",
            )
        return self._providers[provider_name]

    def available_providers(self) -> list[str]:
        """Return the names of all registered providers.

        Returns:
            Sorted list of provider name strings.
        """
        return list(self._providers.keys())

    # ------------------------------------------------------------------
    # Model discovery
    # ------------------------------------------------------------------

    def all_models(self) -> list[ModelInfo]:
        """Aggregate model metadata from every registered provider.

        Returns:
            Combined list of ModelInfo from all providers.
        """
        models: list[ModelInfo] = []
        for provider in self._providers.values():
            models.extend(provider.available_models())
        return models

    def resolve_model(self, model: str | None = None) -> tuple[str, AIProvider]:
        """Find the provider that serves a given model.

        Args:
            model: Model identifier (e.g. "gpt-4o").  When *None*, the
                first available provider's first model is selected.

        Returns:
            A tuple of (model_id, provider_instance).

        Raises:
            ProviderError: If no providers are registered or the model
                cannot be found in any provider.
        """
        if not self._providers:
            raise ProviderError(
                provider="router",
                message="No AI providers are registered. "
                "Set at least one API key environment variable.",
            )

        # Auto-select first model from first provider
        if model is None:
            first_provider_name = next(iter(self._providers))
            first_provider = self._providers[first_provider_name]
            models = first_provider.available_models()
            if not models:
                raise ProviderError(
                    provider=first_provider_name,
                    message="Provider has no available models.",
                )
            return models[0].id, first_provider

        # Search all providers for the requested model
        for provider in self._providers.values():
            for model_info in provider.available_models():
                if model_info.id == model:
                    return model, provider

        available_ids = [m.id for m in self.all_models()]
        raise ProviderError(
            provider="router",
            message=f"Model '{model}' not found. Available models: "
            f"{', '.join(available_ids) or 'none'}",
        )

    # ------------------------------------------------------------------
    # Chat (non-streaming)
    # ------------------------------------------------------------------

    async def chat(self, request: AIRequest) -> AIResponse:
        """Send a non-streaming chat request to the appropriate provider.

        Uses :meth:`resolve_model` to determine which provider handles
        the request, then delegates to the provider's ``chat`` method.

        Args:
            request: Unified AI request with messages, model, and parameters.

        Returns:
            AIResponse from the resolved provider.

        Raises:
            ProviderError: If the model or provider cannot be resolved,
                or the underlying provider call fails.
        """
        model_name, provider = self.resolve_model(request.model)

        kwargs: dict[str, Any] = {}
        if request.temperature is not None:
            kwargs["temperature"] = request.temperature
        if request.max_tokens is not None:
            kwargs["max_tokens"] = request.max_tokens

        return await provider.chat(
            messages=request.messages,
            model=model_name,
            **kwargs,
        )

    # ------------------------------------------------------------------
    # Stream (SSE)
    # ------------------------------------------------------------------

    async def stream(self, request: AIRequest) -> AsyncIterator[str]:
        """Stream a chat response in SSE (Server-Sent Events) format.

        Each text chunk from the provider is wrapped as an SSE data line::

            data: {text_chunk}\\n\\n

        After all chunks are consumed, a terminal marker is sent::

            data: [DONE]\\n\\n

        If a :class:`ProviderError` occurs mid-stream, an SSE error event
        is emitted instead::

            event: error\\ndata: {error_message}\\n\\n

        Args:
            request: Unified AI request with messages, model, and parameters.

        Yields:
            SSE-formatted string lines.

        Raises:
            ProviderError: If the model/provider cannot be resolved
                (raised before any yield).
        """
        model_name, provider = self.resolve_model(request.model)

        kwargs: dict[str, Any] = {}
        if request.temperature is not None:
            kwargs["temperature"] = request.temperature
        if request.max_tokens is not None:
            kwargs["max_tokens"] = request.max_tokens

        try:
            async for chunk in provider.stream(
                messages=request.messages,
                model=model_name,
                **kwargs,
            ):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except ProviderError as exc:
            yield f"event: error\ndata: {json.dumps({'error': exc.message})}\n\n"
            return

        yield "data: [DONE]\n\n"
