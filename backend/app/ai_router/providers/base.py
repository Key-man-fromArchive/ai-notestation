# @TASK P3-T3.1 - Abstract AI Provider interface
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""Abstract base class for all AI providers.

Each AI provider (OpenAI, Anthropic, Google, ZhipuAI) must implement
this interface to integrate with the unified AI Router.

Usage:
    class OpenAIProvider(AIProvider):
        async def chat(self, messages, model, **kwargs) -> AIResponse:
            ...
        async def stream(self, messages, model, **kwargs) -> AsyncIterator[str]:
            ...
        def available_models(self) -> list[ModelInfo]:
            ...
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any

from app.ai_router.schemas import AIResponse, Message, ModelInfo


class AIProvider(ABC):
    """Abstract base class defining the interface for AI providers.

    All AI providers must implement three methods:
    - chat: Send messages and receive a complete response.
    - stream: Send messages and receive a streaming response.
    - available_models: Return the list of models offered by this provider.
    """

    @abstractmethod
    async def chat(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AIResponse:
        """Send a chat request and return a complete response.

        Args:
            messages: The conversation history as a list of Messages.
            model: The model identifier to use.
            **kwargs: Additional provider-specific parameters
                      (e.g., temperature, max_tokens).

        Returns:
            AIResponse with the generated content and metadata.

        Raises:
            ProviderError: If the provider request fails.
        """
        ...

    @abstractmethod
    async def stream(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """Send a chat request and stream the response token by token.

        Args:
            messages: The conversation history as a list of Messages.
            model: The model identifier to use.
            **kwargs: Additional provider-specific parameters.

        Yields:
            String chunks of the generated response.

        Raises:
            ProviderError: If the provider request fails.
        """
        ...  # pragma: no cover

    @abstractmethod
    def available_models(self) -> list[ModelInfo]:
        """Return the list of models available from this provider.

        Returns:
            List of ModelInfo with metadata for each supported model.
        """
        ...
