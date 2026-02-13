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

import json
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_router.image_utils import extract_note_images, get_cached_image_descriptions
from app.ai_router.prompts import insight, search_qa, spellcheck, summarize, template, writing
from app.ai_router.router import AIRouter
from app.ai_router.schemas import AIRequest, AIResponse, Message, ModelInfo, ProviderError
from app.database import get_db
from app.models import Note
from app.search.engine import FullTextSearchEngine
from app.services.auth_service import get_current_user
from app.services.oauth_service import OAuthService
from app.utils.i18n import get_language
from app.utils.messages import msg

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

# ---------------------------------------------------------------------------
# Singleton AIRouter instance (lazy initialization)
# ---------------------------------------------------------------------------

_ai_router: AIRouter | None = None


def _inject_settings_keys() -> None:
    """Push API keys from the settings store into environment variables.

    The settings store holds runtime overrides set via the Settings UI.
    The AIRouter reads ``os.environ`` during ``_auto_detect``, so we
    sync the two before creating the router.
    """
    import os

    from app.api.settings import _get_store

    store = _get_store()
    mapping = {
        "openai_api_key": "OPENAI_API_KEY",
        "anthropic_api_key": "ANTHROPIC_API_KEY",
        "google_api_key": "GOOGLE_API_KEY",
        "zhipuai_api_key": "ZHIPUAI_API_KEY",
    }
    for store_key, env_key in mapping.items():
        val = store.get(store_key, "")
        if val:
            os.environ[env_key] = val


def get_ai_router() -> AIRouter:
    """Return the singleton AIRouter instance.

    Lazily initialized on first call.  Before creation, API keys from
    the in-memory settings store are synced to environment variables so
    the router's auto-detection picks them up.

    Returns:
        AIRouter singleton.
    """
    global _ai_router  # noqa: PLW0603
    if _ai_router is None:
        _inject_settings_keys()
        _ai_router = AIRouter()
    return _ai_router


def reset_ai_router() -> None:
    """Invalidate the AIRouter singleton so it is re-created on next use."""
    global _ai_router  # noqa: PLW0603
    _ai_router = None


def _get_oauth_service() -> OAuthService:
    """Return a fresh OAuthService instance for dependency injection."""
    return OAuthService()


_OAUTH_PROVIDER_MODELS: dict[str, list[ModelInfo]] = {
    "anthropic": [
        ModelInfo(id="claude-sonnet-4-5", name="Claude Sonnet 4.5 (OAuth)", provider="anthropic", max_tokens=200_000, supports_streaming=True),
        ModelInfo(id="claude-haiku-4-5", name="Claude Haiku 4.5 (OAuth)", provider="anthropic", max_tokens=200_000, supports_streaming=True),
        ModelInfo(id="claude-sonnet-4-0", name="Claude Sonnet 4 (OAuth)", provider="anthropic", max_tokens=200_000, supports_streaming=True),
    ],
    "google": [
        ModelInfo(id="gemini-2.0-flash", name="Gemini 2.0 Flash", provider="google", max_tokens=1_048_576, supports_streaming=True),
        ModelInfo(id="gemini-1.5-pro", name="Gemini 1.5 Pro", provider="google", max_tokens=2_097_152, supports_streaming=True),
    ],
    "openai": [
        ModelInfo(id="gpt-4o", name="GPT-4o (OAuth)", provider="openai", max_tokens=128000, supports_streaming=True),
        ModelInfo(id="gpt-4o-mini", name="GPT-4o mini (OAuth)", provider="openai", max_tokens=128000, supports_streaming=True),
    ],
}


async def _get_oauth_provider_models(
    username: str,
    db: AsyncSession,
    oauth_service: OAuthService,
    exclude_providers: set[str],
) -> list[ModelInfo]:
    """Return model metadata for OAuth-connected providers not in exclude set."""
    from app.models import OAuthToken
    from sqlalchemy import select

    models: list[ModelInfo] = []
    for provider_name, provider_models in _OAUTH_PROVIDER_MODELS.items():
        if provider_name in exclude_providers:
            continue
        try:
            stmt = select(OAuthToken).where(
                OAuthToken.username == username,
                OAuthToken.provider == provider_name,
            )
            result = await db.execute(stmt)
            token_row = result.scalar_one_or_none()
            if token_row and token_row.access_token_encrypted:
                models.extend(provider_models)
        except Exception:
            # DB unavailable or schema mismatch -- skip OAuth models
            continue
    return models


def _resolve_provider_name(model: str | None) -> str | None:
    """Map model name to OAuth provider name."""
    if not model:
        return None
    if model.startswith("claude"):
        return "anthropic"
    if model.startswith("gpt-") or model.startswith(("o1", "o3", "o4")):
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


FeatureType = Literal["insight", "search_qa", "writing", "spellcheck", "template", "summarize"]


class AIChatRequest(BaseModel):
    """Request body for /ai/chat and /ai/stream endpoints.

    Attributes:
        feature: The AI feature to invoke.
        content: Primary content or question text.
        model: Optional model identifier. None means auto-select.
        options: Optional feature-specific parameters.
        note_id: Optional note ID for multimodal image extraction.
    """

    feature: FeatureType
    content: str = Field(..., min_length=1)
    model: str | None = None
    options: dict | None = None
    note_id: str | None = None


class AIChatResponse(BaseModel):
    """Response body for /ai/chat endpoint.

    Attributes:
        content: The AI-generated text content.
        model: The model that produced the response.
        provider: The provider that served the response.
        usage: Optional token usage statistics.
        quality: Optional quality evaluation result (when quality gate enabled).
    """

    content: str
    model: str
    provider: str
    usage: dict | None = None
    quality: dict | None = None


class ModelListResponse(BaseModel):
    """Response body for /ai/models endpoint."""

    models: list[ModelInfo]


class ProviderListResponse(BaseModel):
    """Response body for /ai/providers endpoint."""

    providers: list[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _is_quality_gate_enabled(db: AsyncSession) -> bool:
    """Check if quality gate is enabled in settings."""
    from app.api.settings import _load_from_db

    settings = await _load_from_db(db)
    return bool(settings.get("quality_gate_enabled", False))


async def _is_quality_gate_auto_retry(db: AsyncSession) -> bool:
    """Check if quality gate auto-retry is enabled in settings."""
    from app.api.settings import _load_from_db

    settings = await _load_from_db(db)
    return bool(settings.get("quality_gate_auto_retry", True))


def _is_quality_gate_enabled_sync() -> bool:
    """Check quality gate setting from in-memory cache (sync, for streaming)."""
    from app.api.settings import _get_store

    store = _get_store()
    return bool(store.get("quality_gate_enabled", False))


_SEARCH_CONTENT_MAX_CHARS = 12_000

# Features that support multimodal (image) analysis
_MULTIMODAL_FEATURES: set[str] = {"insight", "summarize"}


async def _search_and_fetch_notes(
    query: str,
    db: AsyncSession,
    limit: int = 5,
) -> tuple[list[dict], str]:
    """Search notes by query and return their content for AI analysis.

    Uses FullTextSearchEngine (always available, no API key required).

    Args:
        query: The user's search query.
        db: Async database session.
        limit: Maximum number of notes to fetch.

    Returns:
        A tuple of (notes_metadata, combined_content).
        notes_metadata: list of dicts with note_id, title, score.
        combined_content: concatenated note texts, capped at 12k chars.
    """
    fts = FullTextSearchEngine(session=db)
    search_page = await fts.search(query, limit=limit)
    results = search_page.results

    if not results:
        return [], ""

    # Fetch full content_text for matched notes
    from sqlalchemy import select

    note_ids = [r.note_id for r in results]
    stmt = select(Note.synology_note_id, Note.title, Note.content_text).where(
        Note.synology_note_id.in_(note_ids)
    )
    rows = await db.execute(stmt)
    content_map: dict[str, tuple[str, str]] = {}
    for row in rows.fetchall():
        content_map[row.synology_note_id] = (row.title, row.content_text or "")

    # Build metadata and combined content (ranked order, 12k char limit)
    notes_metadata: list[dict] = []
    parts: list[str] = []
    remaining = _SEARCH_CONTENT_MAX_CHARS

    for r in results:
        title, text = content_map.get(r.note_id, (r.title, ""))
        notes_metadata.append({
            "note_id": r.note_id,
            "title": title,
            "score": r.score,
        })
        if remaining > 0 and text:
            chunk = text[:remaining]
            parts.append(f"## {title}\n{chunk}")
            remaining -= len(chunk)

    combined = "\n\n---\n\n".join(parts)
    return notes_metadata, combined


def _build_messages_for_feature(
    feature: FeatureType,
    content: str,
    options: dict | None,
    lang: str = "ko",
) -> list:
    """Build prompt messages based on the requested feature.

    Maps the feature name to the corresponding prompt module and calls
    its ``build_messages`` function with the appropriate arguments.

    Args:
        feature: The AI feature to invoke.
        content: Primary content or question text.
        options: Optional feature-specific parameters.
        lang: Language code for prompt messages.

    Returns:
        List of Message objects for the AI request.

    Raises:
        ValueError: If the prompt module raises a validation error.
    """
    opts = options or {}

    if feature == "insight":
        search_query = opts.get("search_query")
        return insight.build_messages(
            note_content=content,
            additional_context=f"사용자 검색 쿼리: {search_query}" if search_query else None,
            lang=lang,
        )
    elif feature == "search_qa":
        context_notes = opts.get("context_notes", [])
        if not context_notes:
            context_notes = ["(No context notes provided)"]
        return search_qa.build_messages(
            question=content,
            context_notes=context_notes,
            lang=lang,
        )
    elif feature == "writing":
        return writing.build_messages(
            topic=content,
            keywords=opts.get("keywords"),
            existing_content=opts.get("existing_content"),
            lang=lang,
        )
    elif feature == "spellcheck":
        return spellcheck.build_messages(text=content, lang=lang)
    elif feature == "template":
        return template.build_messages(
            template_type=content,
            custom_instructions=opts.get("custom_instructions"),
            lang=lang,
        )
    elif feature == "summarize":
        return summarize.build_messages(note_content=content, lang=lang)
    else:
        # This should never happen due to Literal type validation
        raise ValueError(f"Unknown feature: {feature}")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(
    request: AIChatRequest,
    http_request: Request,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ai_router: AIRouter = Depends(get_ai_router),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
    oauth_service: OAuthService = Depends(_get_oauth_service),  # noqa: B008
) -> AIChatResponse:
    """Synchronous AI chat endpoint.

    Builds prompt messages from the specified feature, sends them to
    the AI router, and returns the complete response.
    Injects per-user OAuth tokens when available.

    When ``feature == "insight"`` and ``options.mode == "search"``, the
    user's content is treated as a search query: matching notes are fetched
    and their text is analysed instead of the raw input.

    Requires JWT Bearer authentication.
    """
    lang = get_language(http_request)
    opts = request.options or {}
    content = request.content
    effective_options = dict(opts)

    # Search mode: search notes first, then analyze their content
    is_search_mode = (
        request.feature == "insight" and opts.get("mode") == "search"
    )
    if is_search_mode:
        notes_meta, combined = await _search_and_fetch_notes(content, db)
        if not combined:
            return AIChatResponse(
                content=msg("search.no_results", lang),
                model=request.model or "",
                provider="",
                usage=None,
            )
        effective_options["search_query"] = content
        content = combined

    try:
        messages = _build_messages_for_feature(
            feature=request.feature,
            content=content,
            options=effective_options,
            lang=lang,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from None

    # Inject images from note for multimodal features
    if request.note_id and request.feature in _MULTIMODAL_FEATURES:
        # Try cached descriptions first (cheaper, works with any model)
        cached_desc = await get_cached_image_descriptions(request.note_id, db)
        if cached_desc:
            for i in range(len(messages) - 1, -1, -1):
                if messages[i].role == "user":
                    messages[i] = Message(
                        role="user",
                        content=f"{messages[i].content}\n\n[Image Analysis]\n{cached_desc}",
                    )
                    break
        else:
            # Fallback: send raw images for Vision-capable models
            images = await extract_note_images(request.note_id, db)
            if images:
                for i in range(len(messages) - 1, -1, -1):
                    if messages[i].role == "user":
                        messages[i] = Message(
                            role="user", content=messages[i].content, images=images
                        )
                        break

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

    # Quality gate evaluation
    quality_dict = None
    quality_gate_on = await _is_quality_gate_enabled(db)
    if quality_gate_on:
        from app.ai_router.quality_gate import QualityGate

        gate = QualityGate(effective_router)
        quality_result = await gate.evaluate(
            task=request.feature,
            original_request=request.content,
            ai_response=ai_response.content,
            lang=lang,
        )

        # Auto-retry once if failed and auto-retry enabled
        if quality_result and not quality_result.passed and await _is_quality_gate_auto_retry(db):
            ai_response = await effective_router.chat(ai_request)
            quality_result = await gate.evaluate(
                task=request.feature,
                original_request=request.content,
                ai_response=ai_response.content,
                lang=lang,
            )
            # Update usage if available
            if ai_response.usage is not None:
                usage_dict = {
                    "prompt_tokens": ai_response.usage.prompt_tokens,
                    "completion_tokens": ai_response.usage.completion_tokens,
                    "total_tokens": ai_response.usage.total_tokens,
                }

        if quality_result:
            quality_dict = quality_result.model_dump()

    # Search QA specific evaluation (correctness + utility)
    if request.feature == "search_qa" and quality_gate_on:
        from app.ai_router.search_qa_evaluator import SearchQAEvaluator

        eval_context = effective_options.get("context_notes", [])
        eval_notes = [str(n) for n in eval_context] if isinstance(eval_context, list) else []
        evaluator = SearchQAEvaluator(effective_router)
        qa_result = await evaluator.evaluate(
            question=request.content,
            context_notes=eval_notes,
            note_titles=[],
            ai_response=ai_response.content,
            lang=lang,
        )
        if qa_result:
            if quality_dict is None:
                quality_dict = {}
            quality_dict["qa_evaluation"] = qa_result.model_dump()

    return AIChatResponse(
        content=ai_response.content,
        model=ai_response.model,
        provider=ai_response.provider,
        usage=usage_dict,
        quality=quality_dict,
    )


@router.post("/stream")
async def ai_stream(
    request: AIChatRequest,
    http_request: Request,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    ai_router: AIRouter = Depends(get_ai_router),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
    oauth_service: OAuthService = Depends(_get_oauth_service),  # noqa: B008
) -> StreamingResponse:
    """SSE streaming AI endpoint.

    Builds prompt messages from the specified feature and streams the
    AI response as Server-Sent Events.
    Injects per-user OAuth tokens when available.

    When ``feature == "insight"`` and ``options.mode == "search"``, the
    user's content is treated as a search query.  An ``event: metadata``
    SSE event is emitted before the AI chunks with matched-note info.

    SSE format:
        - Metadata:   ``event: metadata\\ndata: {json}\\n\\n``
        - Text chunks: ``data: {text_chunk}\\n\\n``
        - Completion: ``data: [DONE]\\n\\n``
        - Errors: ``event: error\\ndata: {error_message}\\n\\n``

    Requires JWT Bearer authentication.
    """
    lang = get_language(http_request)
    opts = request.options or {}
    content = request.content
    effective_options = dict(opts)
    notes_metadata: list[dict] | None = None

    # Search mode: search notes first, then analyze their content
    is_search_mode = (
        request.feature == "insight" and opts.get("mode") == "search"
    )
    if is_search_mode:
        notes_meta, combined = await _search_and_fetch_notes(content, db)
        notes_metadata = notes_meta
        if not combined:
            async def no_results_generator():
                message = json.dumps({"chunk": msg("search.no_results", lang)})
                yield f"data: {message}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(
                no_results_generator(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )
        effective_options["search_query"] = content
        content = combined

    try:
        messages = _build_messages_for_feature(
            feature=request.feature,
            content=content,
            options=effective_options,
            lang=lang,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from None

    # Inject images from note for multimodal features
    if request.note_id and request.feature in _MULTIMODAL_FEATURES:
        # Try cached descriptions first (cheaper, works with any model)
        cached_desc = await get_cached_image_descriptions(request.note_id, db)
        if cached_desc:
            for i in range(len(messages) - 1, -1, -1):
                if messages[i].role == "user":
                    messages[i] = Message(
                        role="user",
                        content=f"{messages[i].content}\n\n[Image Analysis]\n{cached_desc}",
                    )
                    break
        else:
            # Fallback: send raw images for Vision-capable models
            images = await extract_note_images(request.note_id, db)
            if images:
                for i in range(len(messages) - 1, -1, -1):
                    if messages[i].role == "user":
                        messages[i] = Message(
                            role="user", content=messages[i].content, images=images
                        )
                        break

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
        # Emit matched-notes metadata before AI chunks
        if notes_metadata:
            yield f"event: metadata\ndata: {json.dumps({'matched_notes': notes_metadata}, ensure_ascii=False)}\n\n"

        # StreamMonitor initialization (only when quality gate enabled)
        quality_gate_on = _is_quality_gate_enabled_sync()
        stream_monitor = None
        if quality_gate_on:
            from app.ai_router.stream_monitor import StreamAction, StreamMonitor

            stream_monitor = StreamMonitor(task=request.feature, lang=lang)

        accumulated_content = ""
        retry_count = 0
        max_retries = 1

        while True:
            accumulated_content = ""
            should_retry = False

            try:
                async for sse_line in effective_router.stream(ai_request):
                    yield sse_line
                    # Accumulate text chunks for quality evaluation
                    if sse_line.startswith("data: ") and "[DONE]" not in sse_line:
                        try:
                            chunk_data = json.loads(sse_line[6:])
                            chunk_text = chunk_data.get("chunk", "")
                            accumulated_content += chunk_text

                            # Mid-stream quality check
                            if stream_monitor:
                                check = stream_monitor.process_chunk(chunk_text)

                                if check.action == StreamAction.WARN:
                                    warn_data = json.dumps(
                                        {"reason": check.reason, "issue_type": check.issue_type},
                                        ensure_ascii=False,
                                    )
                                    yield f"event: stream_warning\ndata: {warn_data}\n\n"

                                elif check.action == StreamAction.ABORT and retry_count < max_retries:
                                    retry_data = json.dumps(
                                        {"reason": check.reason, "issue_type": check.issue_type},
                                        ensure_ascii=False,
                                    )
                                    yield f"event: retry\ndata: {retry_data}\n\n"
                                    should_retry = True
                                    retry_count += 1
                                    break
                        except (json.JSONDecodeError, KeyError):
                            pass
            except ProviderError as exc:
                logger.error("AI stream error: %s", exc)
                yield f"event: error\ndata: {exc.message}\n\n"
                return

            if should_retry:
                # Reset monitor for retry attempt
                if stream_monitor:
                    stream_monitor = StreamMonitor(task=request.feature, lang=lang)
                continue

            break

        # Quality gate evaluation after streaming complete
        if quality_gate_on and accumulated_content:
            try:
                from app.ai_router.quality_gate import QualityGate

                gate = QualityGate(effective_router)
                quality_result = await gate.evaluate(
                    task=request.feature,
                    original_request=request.content,
                    ai_response=accumulated_content,
                    lang=lang,
                )
                if quality_result:
                    yield f"event: quality\ndata: {json.dumps(quality_result.model_dump(), ensure_ascii=False)}\n\n"
            except Exception:
                logger.exception("Stream quality gate evaluation failed")

            # Search QA specific evaluation (correctness + utility)
            if request.feature == "search_qa":
                try:
                    from app.ai_router.search_qa_evaluator import SearchQAEvaluator

                    eval_context = effective_options.get("context_notes", [])
                    eval_notes = [str(n) for n in eval_context] if isinstance(eval_context, list) else []
                    evaluator = SearchQAEvaluator(effective_router)
                    qa_result = await evaluator.evaluate(
                        question=request.content,
                        context_notes=eval_notes,
                        note_titles=[],
                        ai_response=accumulated_content,
                        lang=lang,
                    )
                    if qa_result:
                        qa_json = json.dumps(qa_result.model_dump(), ensure_ascii=False)
                        yield f"event: qa_evaluation\ndata: {qa_json}\n\n"
                except Exception:
                    logger.exception("Stream search QA evaluation failed")

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
    db: AsyncSession = Depends(get_db),  # noqa: B008
    oauth_service: OAuthService = Depends(_get_oauth_service),  # noqa: B008
) -> ModelListResponse:
    """List available AI models.

    Returns metadata for all models from all registered providers,
    plus models from OAuth-connected providers.
    Requires JWT Bearer authentication.
    """
    models = ai_router.all_models()
    existing_providers = {m.provider for m in models}

    # Include models from OAuth-connected providers not already registered
    oauth_models = await _get_oauth_provider_models(
        username=current_user["username"],
        db=db,
        oauth_service=oauth_service,
        exclude_providers=existing_providers,
    )
    models.extend(oauth_models)

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
