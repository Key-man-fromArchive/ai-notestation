# @TASK P4-T4.3 - Search API endpoint tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database
# @TEST tests/test_api_search.py

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.search.engine import SearchResult
from tests.conftest import make_auth_headers


def _make_search_results(count: int = 3, search_type: str = "fts") -> list[SearchResult]:
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


class TestHybridSearch:
    @pytest.mark.asyncio
    async def test_hybrid_search_success(self, test_client: AsyncClient):
        mock_results = _make_search_results(3, search_type="hybrid")
        mock_engine = AsyncMock()
        mock_engine.search = AsyncMock(return_value=mock_results)

        with patch("app.api.search._build_hybrid_engine", return_value=mock_engine):
            response = await test_client.get(
                "/api/search",
                params={"q": "machine learning"},
                headers=make_auth_headers(),
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
    async def test_default_search_type_is_hybrid(self, test_client: AsyncClient):
        mock_engine = AsyncMock()
        mock_engine.search = AsyncMock(return_value=[])

        with patch("app.api.search._build_hybrid_engine", return_value=mock_engine):
            response = await test_client.get(
                "/api/search",
                params={"q": "test query"},
                headers=make_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        assert data["search_type"] == "hybrid"


class TestFullTextSearch:
    @pytest.mark.asyncio
    async def test_fts_search_success(self, test_client: AsyncClient):
        mock_results = _make_search_results(2, search_type="fts")
        mock_engine = AsyncMock()
        mock_engine.search = AsyncMock(return_value=mock_results)

        with patch("app.api.search._build_fts_engine", return_value=mock_engine):
            response = await test_client.get(
                "/api/search",
                params={"q": "python", "type": "fts"},
                headers=make_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        assert data["search_type"] == "fts"
        assert data["total"] == 2


class TestSemanticSearch:
    @pytest.mark.asyncio
    async def test_semantic_search_success(self, test_client: AsyncClient):
        mock_results = _make_search_results(2, search_type="semantic")
        mock_engine = AsyncMock()
        mock_engine.search = AsyncMock(return_value=mock_results)

        with patch("app.api.search._build_semantic_engine", return_value=mock_engine):
            response = await test_client.get(
                "/api/search",
                params={"q": "deep learning concepts", "type": "semantic"},
                headers=make_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        assert data["search_type"] == "semantic"
        assert data["total"] == 2


class TestSearchValidation:
    @pytest.mark.asyncio
    async def test_empty_query_returns_422(self, test_client: AsyncClient):
        response = await test_client.get(
            "/api/search",
            params={"q": ""},
            headers=make_auth_headers(),
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, test_client: AsyncClient):
        response = await test_client.get("/api/search", params={"q": "test"})
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_limit_exceeding_max_returns_422(self, test_client: AsyncClient):
        response = await test_client.get(
            "/api/search",
            params={"q": "test", "limit": 101},
            headers=make_auth_headers(),
        )
        assert response.status_code == 422


class TestSearchEmptyResults:
    @pytest.mark.asyncio
    async def test_no_results_returns_empty_array(self, test_client: AsyncClient):
        mock_engine = AsyncMock()
        mock_engine.search = AsyncMock(return_value=[])

        with patch("app.api.search._build_hybrid_engine", return_value=mock_engine):
            response = await test_client.get(
                "/api/search",
                params={"q": "nonexistent_term_xyz"},
                headers=make_auth_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        assert data["results"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_custom_limit_is_passed_to_engine(self, test_client: AsyncClient):
        mock_engine = AsyncMock()
        mock_engine.search = AsyncMock(return_value=[])

        with patch("app.api.search._build_hybrid_engine", return_value=mock_engine):
            response = await test_client.get(
                "/api/search",
                params={"q": "test", "limit": 50},
                headers=make_auth_headers(),
            )

        assert response.status_code == 200
        mock_engine.search.assert_called_once()
        call_args = mock_engine.search.call_args
        assert call_args[1].get("limit") == 50 or call_args[0][1] == 50
