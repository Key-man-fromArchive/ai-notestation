# @TASK P4-T4.4 - AI API endpoint tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-API
# @TEST tests/test_api_ai.py

"""Tests for AI API endpoints (chat, stream, models, providers).

Covers:
- POST /api/ai/chat: 5 features (insight, search_qa, writing, spellcheck, template)
- POST /api/ai/stream: SSE format verification
- GET /api/ai/models: Model listing
- GET /api/ai/providers: Provider listing
- Auth: 401 without token
- Validation: 422 for invalid feature
- Error: AI Router error handling (502 response)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from httpx import ASGITransport, AsyncClient

from app.ai_router.schemas import (
    AIResponse,
    ModelInfo,
    ProviderError,
    TokenUsage,
)
from app.services.auth_service import create_access_token

# ---------------------------------------------------------------------------
# Fixtures and Helpers
# ---------------------------------------------------------------------------

_VALID_TOKEN: str | None = None


def _get_valid_token() -> str:
    """Create a valid JWT access token for test authentication."""
    global _VALID_TOKEN  # noqa: PLW0603
    if _VALID_TOKEN is None:
        _VALID_TOKEN = create_access_token(data={"sub": "testuser"})
    return _VALID_TOKEN


def _auth_headers() -> dict[str, str]:
    """Return Authorization header with a valid Bearer token."""
    return {"Authorization": f"Bearer {_get_valid_token()}"}


def _mock_ai_router() -> MagicMock:
    """Create a fully configured mock AIRouter."""
    mock = MagicMock()

    # Mock chat method
    mock.chat = AsyncMock(
        return_value=AIResponse(
            content="AI generated response",
            model="gpt-4o",
            provider="openai",
            usage=TokenUsage(
                prompt_tokens=50,
                completion_tokens=100,
                total_tokens=150,
            ),
        )
    )

    # Mock stream method - returns an async iterator of SSE lines
    async def mock_stream(request):
        yield "data: Hello\n\n"
        yield "data: World\n\n"
        yield "data: [DONE]\n\n"

    mock.stream = mock_stream

    # Mock all_models
    mock.all_models.return_value = [
        ModelInfo(
            id="gpt-4o",
            name="GPT-4o",
            provider="openai",
            max_tokens=128000,
            supports_streaming=True,
        ),
        ModelInfo(
            id="claude-sonnet-4-20250514",
            name="Claude Sonnet 4",
            provider="anthropic",
            max_tokens=200000,
            supports_streaming=True,
        ),
    ]

    # Mock available_providers
    mock.available_providers.return_value = ["openai", "anthropic"]

    return mock


def _get_test_app(mock_ai_router: MagicMock):
    """Create the FastAPI app with the AI router and mock dependencies."""
    from app.api.ai import get_ai_router
    from app.api.ai import router as ai_router
    from app.main import app

    # Ensure AI router is included
    route_paths = [route.path for route in app.routes]
    if "/api/ai/chat" not in route_paths:
        app.include_router(ai_router, prefix="/api")

    # Override the AI router dependency
    app.dependency_overrides[get_ai_router] = lambda: mock_ai_router

    return app


def _cleanup_app(app):
    """Remove dependency overrides after test."""
    from app.api.ai import get_ai_router

    app.dependency_overrides.pop(get_ai_router, None)


# ---------------------------------------------------------------------------
# POST /api/ai/chat - Feature Tests
# ---------------------------------------------------------------------------


class TestAIChatInsight:
    """Test POST /api/ai/chat with feature='insight'."""

    async def test_insight_success(self):
        """Insight feature should return AI-generated content."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={"feature": "insight", "content": "Experiment results show..."},
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            data = response.json()
            assert data["content"] == "AI generated response"
            assert data["model"] == "gpt-4o"
            assert data["provider"] == "openai"
            assert data["usage"]["prompt_tokens"] == 50
            assert data["usage"]["completion_tokens"] == 100
            assert data["usage"]["total_tokens"] == 150
            mock.chat.assert_awaited_once()
        finally:
            _cleanup_app(app)


class TestAIChatSearchQA:
    """Test POST /api/ai/chat with feature='search_qa'."""

    async def test_search_qa_with_context(self):
        """search_qa with context_notes should build proper messages."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={
                        "feature": "search_qa",
                        "content": "What is the result?",
                        "options": {
                            "context_notes": ["Note 1 content", "Note 2 content"],
                        },
                    },
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            data = response.json()
            assert data["content"] == "AI generated response"
            mock.chat.assert_awaited_once()
        finally:
            _cleanup_app(app)

    async def test_search_qa_without_context(self):
        """search_qa without context_notes should still work (fallback)."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={
                        "feature": "search_qa",
                        "content": "What is the result?",
                    },
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            mock.chat.assert_awaited_once()
        finally:
            _cleanup_app(app)


class TestAIChatWriting:
    """Test POST /api/ai/chat with feature='writing'."""

    async def test_writing_success(self):
        """Writing feature should accept topic with optional keywords."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={
                        "feature": "writing",
                        "content": "Gene expression analysis",
                        "options": {
                            "keywords": ["PCR", "RNA", "sequencing"],
                            "existing_content": "Previous findings showed...",
                        },
                    },
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            data = response.json()
            assert data["content"] == "AI generated response"
            mock.chat.assert_awaited_once()
        finally:
            _cleanup_app(app)


class TestAIChatSpellcheck:
    """Test POST /api/ai/chat with feature='spellcheck'."""

    async def test_spellcheck_success(self):
        """Spellcheck feature should accept text for correction."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={
                        "feature": "spellcheck",
                        "content": "맞춤법이 틀린 문장입니다",
                    },
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            data = response.json()
            assert data["content"] == "AI generated response"
            mock.chat.assert_awaited_once()
        finally:
            _cleanup_app(app)


class TestAIChatTemplate:
    """Test POST /api/ai/chat with feature='template'."""

    async def test_template_success(self):
        """Template feature should accept template_type as content."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={
                        "feature": "template",
                        "content": "experiment_log",
                        "options": {
                            "custom_instructions": "Include safety section",
                        },
                    },
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            data = response.json()
            assert data["content"] == "AI generated response"
            mock.chat.assert_awaited_once()
        finally:
            _cleanup_app(app)


class TestAIChatWithModel:
    """Test POST /api/ai/chat with explicit model selection."""

    async def test_chat_with_specific_model(self):
        """Chat with a specific model should pass model to AIRequest."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={
                        "feature": "insight",
                        "content": "Test content",
                        "model": "claude-sonnet-4-20250514",
                    },
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            # Verify the AIRequest passed to chat() had the model set
            call_args = mock.chat.call_args
            ai_request = call_args[0][0]
            assert ai_request.model == "claude-sonnet-4-20250514"
        finally:
            _cleanup_app(app)


class TestAIChatNoUsage:
    """Test POST /api/ai/chat when usage is None."""

    async def test_chat_without_usage(self):
        """Response with no usage stats should return usage=null."""
        mock = _mock_ai_router()
        mock.chat = AsyncMock(
            return_value=AIResponse(
                content="Response without usage",
                model="gpt-4o",
                provider="openai",
                usage=None,
            )
        )
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={"feature": "insight", "content": "Test content"},
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            data = response.json()
            assert data["usage"] is None
        finally:
            _cleanup_app(app)


# ---------------------------------------------------------------------------
# POST /api/ai/stream - SSE Tests
# ---------------------------------------------------------------------------


class TestAIStream:
    """Test POST /api/ai/stream SSE endpoint."""

    async def test_stream_sse_format(self):
        """Stream endpoint should return text/event-stream with proper SSE format."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/stream",
                    json={"feature": "insight", "content": "Test content for streaming"},
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/event-stream")

            body = response.text
            # Verify SSE format: data lines followed by [DONE]
            assert "data: Hello" in body
            assert "data: World" in body
            assert "data: [DONE]" in body
        finally:
            _cleanup_app(app)

    async def test_stream_cache_control_headers(self):
        """Stream response should include proper cache-control headers."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/stream",
                    json={"feature": "spellcheck", "content": "test text"},
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            assert response.headers.get("cache-control") == "no-cache"
        finally:
            _cleanup_app(app)

    async def test_stream_error_event(self):
        """Stream should emit SSE error event when ProviderError occurs."""
        mock = _mock_ai_router()

        async def error_stream(request):
            yield "data: partial\n\n"
            raise ProviderError(provider="openai", message="Rate limit exceeded")

        mock.stream = error_stream
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/stream",
                    json={"feature": "insight", "content": "Test content"},
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            body = response.text
            assert "data: partial" in body
            assert "event: error" in body
            assert "Rate limit exceeded" in body
        finally:
            _cleanup_app(app)


# ---------------------------------------------------------------------------
# GET /api/ai/models
# ---------------------------------------------------------------------------


class TestAIModels:
    """Test GET /api/ai/models endpoint."""

    async def test_models_list(self):
        """Models endpoint should return list of available models."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/ai/models",
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            data = response.json()
            assert "models" in data
            assert len(data["models"]) == 2

            model_ids = [m["id"] for m in data["models"]]
            assert "gpt-4o" in model_ids
            assert "claude-sonnet-4-20250514" in model_ids

            # Verify model structure
            gpt_model = next(m for m in data["models"] if m["id"] == "gpt-4o")
            assert gpt_model["name"] == "GPT-4o"
            assert gpt_model["provider"] == "openai"
            assert gpt_model["max_tokens"] == 128000
            assert gpt_model["supports_streaming"] is True
        finally:
            _cleanup_app(app)

    async def test_models_empty(self):
        """Models endpoint should return empty list when no providers configured."""
        mock = _mock_ai_router()
        mock.all_models.return_value = []
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/ai/models",
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            data = response.json()
            assert data["models"] == []
        finally:
            _cleanup_app(app)


# ---------------------------------------------------------------------------
# GET /api/ai/providers
# ---------------------------------------------------------------------------


class TestAIProviders:
    """Test GET /api/ai/providers endpoint."""

    async def test_providers_list(self):
        """Providers endpoint should return list of available providers."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/ai/providers",
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            data = response.json()
            assert "providers" in data
            assert "openai" in data["providers"]
            assert "anthropic" in data["providers"]
        finally:
            _cleanup_app(app)

    async def test_providers_empty(self):
        """Providers endpoint should return empty list when none configured."""
        mock = _mock_ai_router()
        mock.available_providers.return_value = []
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/ai/providers",
                    headers=_auth_headers(),
                )

            assert response.status_code == 200
            data = response.json()
            assert data["providers"] == []
        finally:
            _cleanup_app(app)


# ---------------------------------------------------------------------------
# Authentication Tests (401)
# ---------------------------------------------------------------------------


class TestAIAuthRequired:
    """Test that all AI endpoints require JWT authentication."""

    async def test_chat_no_auth_returns_401(self):
        """POST /api/ai/chat without token should return 401."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={"feature": "insight", "content": "test"},
                )

            assert response.status_code == 401
        finally:
            _cleanup_app(app)

    async def test_stream_no_auth_returns_401(self):
        """POST /api/ai/stream without token should return 401."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/stream",
                    json={"feature": "insight", "content": "test"},
                )

            assert response.status_code == 401
        finally:
            _cleanup_app(app)

    async def test_models_no_auth_returns_401(self):
        """GET /api/ai/models without token should return 401."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/ai/models")

            assert response.status_code == 401
        finally:
            _cleanup_app(app)

    async def test_providers_no_auth_returns_401(self):
        """GET /api/ai/providers without token should return 401."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/ai/providers")

            assert response.status_code == 401
        finally:
            _cleanup_app(app)

    async def test_chat_invalid_token_returns_401(self):
        """POST /api/ai/chat with invalid token should return 401."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={"feature": "insight", "content": "test"},
                    headers={"Authorization": "Bearer invalid-token"},
                )

            assert response.status_code == 401
        finally:
            _cleanup_app(app)


# ---------------------------------------------------------------------------
# Validation Tests (422)
# ---------------------------------------------------------------------------


class TestAIValidation:
    """Test request validation for AI endpoints."""

    async def test_invalid_feature_returns_422(self):
        """Invalid feature value should return 422."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={"feature": "nonexistent_feature", "content": "test"},
                    headers=_auth_headers(),
                )

            assert response.status_code == 422
        finally:
            _cleanup_app(app)

    async def test_empty_content_returns_422(self):
        """Empty content string should return 422."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={"feature": "insight", "content": ""},
                    headers=_auth_headers(),
                )

            assert response.status_code == 422
        finally:
            _cleanup_app(app)

    async def test_missing_feature_returns_422(self):
        """Missing feature field should return 422."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={"content": "test"},
                    headers=_auth_headers(),
                )

            assert response.status_code == 422
        finally:
            _cleanup_app(app)

    async def test_missing_content_returns_422(self):
        """Missing content field should return 422."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={"feature": "insight"},
                    headers=_auth_headers(),
                )

            assert response.status_code == 422
        finally:
            _cleanup_app(app)

    async def test_invalid_template_type_returns_422(self):
        """Invalid template_type should return 422 from prompt validation."""
        mock = _mock_ai_router()
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={"feature": "template", "content": "invalid_type"},
                    headers=_auth_headers(),
                )

            assert response.status_code == 422
        finally:
            _cleanup_app(app)


# ---------------------------------------------------------------------------
# Error Handling Tests (502)
# ---------------------------------------------------------------------------


class TestAIErrorHandling:
    """Test AI Router error handling."""

    async def test_chat_provider_error_returns_502(self):
        """ProviderError during chat should return 502."""
        mock = _mock_ai_router()
        mock.chat = AsyncMock(
            side_effect=ProviderError(
                provider="openai",
                message="API rate limit exceeded",
                status_code=429,
            )
        )
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={"feature": "insight", "content": "Test content"},
                    headers=_auth_headers(),
                )

            assert response.status_code == 502
            data = response.json()
            assert "AI provider error" in data["detail"]
            assert "API rate limit exceeded" in data["detail"]
        finally:
            _cleanup_app(app)

    async def test_chat_provider_not_registered_returns_502(self):
        """ProviderError for missing provider should return 502."""
        mock = _mock_ai_router()
        mock.chat = AsyncMock(
            side_effect=ProviderError(
                provider="router",
                message="No AI providers are registered.",
            )
        )
        app = _get_test_app(mock)
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/ai/chat",
                    json={"feature": "insight", "content": "Test content"},
                    headers=_auth_headers(),
                )

            assert response.status_code == 502
            data = response.json()
            assert "No AI providers are registered" in data["detail"]
        finally:
            _cleanup_app(app)
