# @TASK P4-T4.3 - Search API endpoint tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database
# @TEST tests/test_api_search.py

"""Tests for the Search API endpoint (GET /api/search).

Covers:
- hybrid / fts / semantic search type success cases
- Empty query returns 422 (validation error)
- Unauthenticated access returns 401
- limit parameter validation (max 100)
- Empty results return an empty array
- All external dependencies are mocked
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.search.engine import SearchResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_search_results(
    count: int = 3,
    search_type: str = "fts",
) -> list[SearchResult]:
    """Create a list of mock SearchResult objects."""
    return [
        SearchResult(
            note_id=f"note_{i + 1}",
            title=f"Note {i + 1}",
            snippet=f"Matching <b>snippet</b> for note {i + 1}",
            score=1.0 - i * 0.1,
            search_type=search_type,
        )
        for i in range(count)
    ]


def _get_app():
    """Import and return the FastAPI app with search router included."""
    from app.main import app

    return app


def _make_auth_header() -> dict[str, str]:
    """Create a valid Authorization header for test requests."""
    from app.services.auth_service import create_access_token

    token = create_access_token(data={"sub": "testuser"})
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Hybrid search (default type)
# ---------------------------------------------------------------------------


class TestHybridSearch:
    """Test GET /api/search with type=hybrid (default)."""

    @pytest.mark.asyncio
    async def test_hybrid_search_success(self):
        """Hybrid search should return merged results."""
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_results = _make_search_results(3, search_type="hybrid")

        mock_engine = AsyncMock()
        mock_engine.search = AsyncMock(return_value=mock_results)

        with patch(
            "app.api.search._build_hybrid_engine",
            return_value=mock_engine,
        ):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/search",
                    params={"q": "machine learning"},
                    headers=_make_auth_header(),
                )

        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "machine learning"
        assert data["search_type"] == "hybrid"
        assert data["total"] == 3
        assert len(data["results"]) == 3
        assert data["results"][0]["note_id"] == "note_1"
        assert data["results"][0]["title"] == "Note 1"
        assert data["results"][0]["search_type"] == "hybrid"

    @pytest.mark.asyncio
    async def test_default_search_type_is_hybrid(self):
        """When no type is specified, search type should default to hybrid."""
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_engine = AsyncMock()
        mock_engine.search = AsyncMock(return_value=[])

        with patch(
            "app.api.search._build_hybrid_engine",
            return_value=mock_engine,
        ):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/search",
                    params={"q": "test query"},
                    headers=_make_auth_header(),
                )

        assert response.status_code == 200
        data = response.json()
        assert data["search_type"] == "hybrid"


# ---------------------------------------------------------------------------
# Full-text search
# ---------------------------------------------------------------------------


class TestFullTextSearch:
    """Test GET /api/search with type=fts."""

    @pytest.mark.asyncio
    async def test_fts_search_success(self):
        """FTS search should return full-text search results."""
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_results = _make_search_results(2, search_type="fts")

        mock_engine = AsyncMock()
        mock_engine.search = AsyncMock(return_value=mock_results)

        with patch(
            "app.api.search._build_fts_engine",
            return_value=mock_engine,
        ):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/search",
                    params={"q": "python", "type": "fts"},
                    headers=_make_auth_header(),
                )

        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "python"
        assert data["search_type"] == "fts"
        assert data["total"] == 2
        assert len(data["results"]) == 2
        assert all(r["search_type"] == "fts" for r in data["results"])


# ---------------------------------------------------------------------------
# Semantic search
# ---------------------------------------------------------------------------


class TestSemanticSearch:
    """Test GET /api/search with type=semantic."""

    @pytest.mark.asyncio
    async def test_semantic_search_success(self):
        """Semantic search should return vector similarity results."""
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_results = _make_search_results(2, search_type="semantic")

        mock_engine = AsyncMock()
        mock_engine.search = AsyncMock(return_value=mock_results)

        with patch(
            "app.api.search._build_semantic_engine",
            return_value=mock_engine,
        ):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/search",
                    params={"q": "neural network", "type": "semantic"},
                    headers=_make_auth_header(),
                )

        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "neural network"
        assert data["search_type"] == "semantic"
        assert data["total"] == 2
        assert len(data["results"]) == 2
        assert all(r["search_type"] == "semantic" for r in data["results"])


# ---------------------------------------------------------------------------
# Validation errors
# ---------------------------------------------------------------------------


class TestSearchValidation:
    """Test input validation for the search endpoint."""

    @pytest.mark.asyncio
    async def test_missing_query_returns_422(self):
        """Missing 'q' parameter should return 422 Validation Error."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/search",
                headers=_make_auth_header(),
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_limit_exceeds_max_is_clamped(self):
        """limit > 100 should be clamped to 100 (le=100 constraint)."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/search",
                params={"q": "test", "limit": 200},
                headers=_make_auth_header(),
            )

        # FastAPI with Query(le=100) will return 422 for limit > 100
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_limit_zero_returns_422(self):
        """limit=0 should return 422 (must be >= 1)."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/search",
                params={"q": "test", "limit": 0},
                headers=_make_auth_header(),
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_search_type_returns_422(self):
        """Invalid search type should return 422."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/search",
                params={"q": "test", "type": "invalid_type"},
                headers=_make_auth_header(),
            )

        assert response.status_code == 422


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


class TestSearchAuthentication:
    """Test JWT authentication requirement for search endpoint."""

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self):
        """Request without Authorization header should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/search",
                params={"q": "test"},
            )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_token_returns_401(self):
        """Request with invalid token should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/search",
                params={"q": "test"},
                headers={"Authorization": "Bearer invalid-garbage-token"},
            )

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Empty results
# ---------------------------------------------------------------------------


class TestSearchEmptyResults:
    """Test behavior when search returns no results."""

    @pytest.mark.asyncio
    async def test_no_results_returns_empty_array(self):
        """Search with no matches should return empty results array."""
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_engine = AsyncMock()
        mock_engine.search = AsyncMock(return_value=[])

        with patch(
            "app.api.search._build_hybrid_engine",
            return_value=mock_engine,
        ):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/search",
                    params={"q": "nonexistent query xyz"},
                    headers=_make_auth_header(),
                )

        assert response.status_code == 200
        data = response.json()
        assert data["results"] == []
        assert data["total"] == 0
        assert data["query"] == "nonexistent query xyz"

    @pytest.mark.asyncio
    async def test_custom_limit_is_passed_to_engine(self):
        """The limit parameter should be forwarded to the search engine."""
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_engine = AsyncMock()
        mock_engine.search = AsyncMock(return_value=[])

        with patch(
            "app.api.search._build_hybrid_engine",
            return_value=mock_engine,
        ):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/search",
                    params={"q": "test", "limit": 50},
                    headers=_make_auth_header(),
                )

        assert response.status_code == 200
        # Verify the engine was called with the correct limit
        mock_engine.search.assert_called_once_with("test", limit=50)
