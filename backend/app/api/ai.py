# @TASK P4-T4.4 - AI API endpoints (chat + SSE stream)
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-API
# @TEST tests/test_api_ai.py

"""AI API endpoints for LabNote AI.

Provides:
- ``POST /ai/chat``       -- Synchronous AI response (non-streaming)
- ``POST /ai/stream``     -- SSE streaming AI response
- ``GET  /ai/models``     -- List available AI models
- ``GET  /ai/providers``  -- List available AI providers

All endpoints require JWT authentication via Bearer token.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_router.prompts import insight, search_qa, spellcheck, template, writing
from app.ai_router.router import AIRouter
from app.ai_router.schemas import AIRequest, AIResponse, ModelInfo, ProviderError
from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.oauth_service import OAuthService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

# ---------------------------------------------------------------------------
# Singleton AIRouter instance (lazy initialization)
# ---------------------------------------------------------------------------

_ai_router: AIRouter | None = None


def get_ai_router() -> AIRouter:
    """Return the singleton AIRouter instance.

    Lazily initialized on first call.  The router auto-detects
    available providers from environment variables.

    Returns:
        AIRouter singleton.
    """
    global _ai_router  # noqa: PLW0603
    if _ai_router is None:
        _ai_router = AIRouter()
    return _ai_router


def _get_oauth_service() -> OAuthService:
    """Return a fresh OAuthService instance for dependency injection."""
    return OAuthService()


def _resolve_provider_name(model: str | None) -> str | None:
    """Map model name to OAuth provider name."""
    if not model:
        return None
    if model.startswith("gpt-"):
        return "openai"
    if model.startswith("gemini"):
        return "google"
    return None


async def _inject_oauth_if_available(
    ai_router: AIRouter,
    model: str | None,
    username: str,
    db: AsyncSession,
    oauth_service: OAuthService,
) -> AIRouter:
    """Create a per-request router copy with OAuth provider if a token is available.

    Returns either the original singleton (no OAuth) or a shallow copy with
    the OAuth provider registered. This avoids mutating the singleton.
    """
    provider_name = _resolve_provider_name(model)
    if not provider_name:
        return ai_router

    token = await oauth_service.get_valid_token(
        username=username,
        provider=provider_name,
        db=db,
    )
    if not token:
        return ai_router

    # Create per-request router to avoid mutating the singleton
    request_router = AIRouter.__new__(AIRouter)
    request_router._providers = dict(ai_router._providers)
    request_router.register_oauth_provider(provider_name, token)
    return request_router


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


FeatureType = Literal["insight", "search_qa", "writing", "spellcheck", "template"]


class AIChatRequest(BaseModel):
    """Request body for /ai/chat and /ai/stream endpoints.

    Attributes:
        feature: The AI feature to invoke.
        content: Primary content or question text.
        model: Optional model identifier. None means auto-select.
        options: Optional feature-specific parameters.
    """

    feature: FeatureType
    content: str = Field(..., min_length=1)
    model: str | None = None
    options: dict | None = None


class AIChatResponse(BaseModel):
    """Response body for /ai/chat endpoint.

    Attributes:
        content: The AI-generated text content.
        model: The model that produced the response.
        provider: The provider that served the response.
        usage: Optional token usage statistics.
    """

    content: str
    model: str
    provider: str
    usage: dict | None = None


class ModelListResponse(BaseModel):
    """Response body for /ai/models endpoint."""

    models: list[ModelInfo]


class ProviderListResponse(BaseModel):
    """Response body for /ai/providers endpoint."""

    providers: list[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_messages_for_feature(
    feature: FeatureType,
    content: str,
    options: dict | None,
) -> list:
    """Build prompt messages based on the requested feature.

    Maps the feature name to the corresponding prompt module and calls
    its ``build_messages`` function with the appropriate arguments.

    Args:
        feature: The AI feature to invoke.
        content: Primary content or question text.
        options: Optional feature-specific parameters.

    Returns:
        List of Message objects for the AI request.

    Raises:
        ValueError: If the prompt module raises a validation error.
    """
    opts = options or {}

    if feature == "insight":
        return insight.build_messages(note_content=content)
    elif feature == "search_qa":
        context_notes = opts.get("context_notes", [])
        if not context_notes:
            context_notes = ["(No context notes provided)"]
        return search_qa.build_messages(
            question=content,
            context_notes=context_notes,
        )
    elif feature == "writing":
        return writing.build_messages(
            topic=content,
            keywords=opts.get("keywords"),
            existing_content=opts.get("existing_content"),
        )
    elif feature == "spellcheck":
        return spellcheck.build_messages(text=content)
    elif feature == "template":
        return template.build_messages(
            template_type=content,
            custom_instructions=opts.get("custom_instructions"),
        )
    else:
        # This should never happen due to Literal type validation
        raise ValueError(f"Unknown feature: {feature}")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(
    request: AIChatRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ai_router: AIRouter = Depends(get_ai_router),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
    oauth_service: OAuthService = Depends(_get_oauth_service),  # noqa: B008
) -> AIChatResponse:
    """Synchronous AI chat endpoint.

    Builds prompt messages from the specified feature, sends them to
    the AI router, and returns the complete response.
    Injects per-user OAuth tokens when available.

    Requires JWT Bearer authentication.
    """
    try:
        messages = _build_messages_for_feature(
            feature=request.feature,
            content=request.content,
            options=request.options,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from None

    # Inject OAuth token if user has one for the target provider
    effective_router = await _inject_oauth_if_available(
        ai_router, request.model, current_user["username"], db, oauth_service,
    )

    ai_request = AIRequest(
        messages=messages,
        model=request.model,
    )

    try:
        ai_response: AIResponse = await effective_router.chat(ai_request)
    except ProviderError as exc:
        logger.error("AI chat error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI provider error: {exc.message}",
        ) from None

    usage_dict = None
    if ai_response.usage is not None:
        usage_dict = {
            "prompt_tokens": ai_response.usage.prompt_tokens,
            "completion_tokens": ai_response.usage.completion_tokens,
            "total_tokens": ai_response.usage.total_tokens,
        }

    return AIChatResponse(
        content=ai_response.content,
        model=ai_response.model,
        provider=ai_response.provider,
        usage=usage_dict,
    )


@router.post("/stream")
async def ai_stream(
    request: AIChatRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ai_router: AIRouter = Depends(get_ai_router),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
    oauth_service: OAuthService = Depends(_get_oauth_service),  # noqa: B008
) -> StreamingResponse:
    """SSE streaming AI endpoint.

    Builds prompt messages from the specified feature and streams the
    AI response as Server-Sent Events.
    Injects per-user OAuth tokens when available.

    SSE format:
        - Text chunks: ``data: {text_chunk}\\n\\n``
        - Completion: ``data: [DONE]\\n\\n``
        - Errors: ``event: error\\ndata: {error_message}\\n\\n``

    Requires JWT Bearer authentication.
    """
    try:
        messages = _build_messages_for_feature(
            feature=request.feature,
            content=request.content,
            options=request.options,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from None

    # Inject OAuth token if user has one for the target provider
    effective_router = await _inject_oauth_if_available(
        ai_router, request.model, current_user["username"], db, oauth_service,
    )

    ai_request = AIRequest(
        messages=messages,
        model=request.model,
        stream=True,
    )

    async def event_generator():
        """Generate SSE events from the AI router stream."""
        try:
            async for sse_line in effective_router.stream(ai_request):
                yield sse_line
        except ProviderError as exc:
            logger.error("AI stream error: %s", exc)
            yield f"event: error\ndata: {exc.message}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/models", response_model=ModelListResponse)
async def list_models(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ai_router: AIRouter = Depends(get_ai_router),  # noqa: B008
) -> ModelListResponse:
    """List available AI models.

    Returns metadata for all models from all registered providers.
    Requires JWT Bearer authentication.
    """
    models = ai_router.all_models()
    return ModelListResponse(models=models)


@router.get("/providers", response_model=ProviderListResponse)
async def list_providers(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ai_router: AIRouter = Depends(get_ai_router),  # noqa: B008
) -> ProviderListResponse:
    """List available AI providers.

    Returns names of all registered/active providers.
    Requires JWT Bearer authentication.
    """
    providers = ai_router.available_providers()
    return ProviderListResponse(providers=providers)
