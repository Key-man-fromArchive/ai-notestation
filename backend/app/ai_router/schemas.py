# @TASK P3-T3.1 - AI Router request/response schemas
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""Pydantic v2 schemas for the AI Router.

Defines the common data structures used across all AI providers:
- Message: Chat message with role and content
- ModelInfo: Available model metadata
- AIRequest: Unified chat/stream request
- AIResponse: Unified chat response
- TokenUsage: Token consumption tracking
- ProviderError: Custom exception for provider failures
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class Message(BaseModel):
    """A single chat message.

    Attributes:
        role: The role of the message sender (system, user, or assistant).
        content: The text content of the message.
    """

    role: Literal["system", "user", "assistant"]
    content: str


class ModelInfo(BaseModel):
    """Metadata about an available AI model.

    Attributes:
        id: Unique model identifier used in API calls (e.g., "gpt-4o").
        name: Human-readable display name.
        provider: Provider name (e.g., "openai", "anthropic").
        max_tokens: Maximum context window size in tokens.
        supports_streaming: Whether the model supports streaming responses.
    """

    id: str
    name: str
    provider: str
    max_tokens: int
    supports_streaming: bool = True


class TokenUsage(BaseModel):
    """Token consumption for a single AI request.

    Attributes:
        prompt_tokens: Number of tokens in the prompt/input.
        completion_tokens: Number of tokens in the completion/output.
        total_tokens: Total tokens consumed (prompt + completion).
    """

    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class AIRequest(BaseModel):
    """Unified request schema for AI chat and streaming endpoints.

    Attributes:
        messages: List of chat messages forming the conversation.
        model: Model identifier. None means auto-select.
        temperature: Sampling temperature (0.0 = deterministic, 1.0 = creative).
        max_tokens: Maximum tokens to generate in the response.
        stream: Whether to stream the response via SSE.
    """

    messages: list[Message]
    model: str | None = None
    temperature: float = 0.7
    max_tokens: int = 4096
    stream: bool = False


class AIResponse(BaseModel):
    """Unified response schema from AI providers.

    Attributes:
        content: The generated text content.
        model: The model that produced this response.
        provider: The provider that served this response.
        usage: Optional token usage statistics.
        finish_reason: Why the generation stopped (e.g., "stop", "length").
    """

    content: str
    model: str
    provider: str
    usage: TokenUsage | None = None
    finish_reason: str = "stop"


class ProviderError(Exception):
    """Custom exception raised when an AI provider request fails.

    Attributes:
        provider: The provider that raised the error.
        message: Human-readable error description.
        status_code: Optional HTTP status code from the provider.
    """

    def __init__(
        self,
        provider: str,
        message: str,
        status_code: int | None = None,
    ) -> None:
        self.provider = provider
        self.message = message
        self.status_code = status_code
        super().__init__(f"[{provider}] {message}" + (f" (HTTP {status_code})" if status_code else ""))
