# @TASK P4-T4.3 - Search API endpoint
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database
# @TEST tests/test_api_search.py

"""Search API endpoint for LabNote AI.

Provides:
- ``GET /search`` -- Search notes using hybrid, full-text, or semantic search.

Supports three search modes:
- **hybrid** (default): RRF-merged FTS + semantic results.
- **fts**: PostgreSQL tsvector full-text search only.
- **semantic**: pgvector cosine similarity only.

All endpoints require JWT Bearer authentication.
"""

from __future__ import annotations

import logging
from enum import Enum

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import get_db
from app.search.embeddings import EmbeddingService
from app.search.engine import (
    FullTextSearchEngine,
    HybridSearchEngine,
    SearchResult,
    SemanticSearchEngine,
)
from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])


# ---------------------------------------------------------------------------
# Enums & Response schemas
# ---------------------------------------------------------------------------


class SearchType(str, Enum):
    """Supported search types."""

    hybrid = "hybrid"
    fts = "fts"
    semantic = "semantic"


class SearchResultResponse(BaseModel):
    """A single search result in the API response."""

    note_id: str
    title: str
    snippet: str
    score: float
    search_type: str


class SearchResponse(BaseModel):
    """Search API response containing results and metadata."""

    results: list[SearchResultResponse]
    query: str
    search_type: str
    total: int


# ---------------------------------------------------------------------------
# Engine factory helpers (extracted for easy mocking in tests)
# ---------------------------------------------------------------------------


def _build_fts_engine(session: AsyncSession) -> FullTextSearchEngine:
    """Create a FullTextSearchEngine instance.

    Extracted as a function to allow easy mocking in tests.
    """
    return FullTextSearchEngine(session=session)


def _build_semantic_engine(
    session: AsyncSession,
    settings: Settings | None = None,
) -> SemanticSearchEngine:
    """Create a SemanticSearchEngine with an EmbeddingService.

    Extracted as a function to allow easy mocking in tests.
    """
    if settings is None:
        settings = get_settings()

    embedding_service = EmbeddingService(
        api_key=settings.OPENAI_API_KEY,
        model=settings.EMBEDDING_MODEL,
        dimensions=settings.EMBEDDING_DIMENSION,
    )
    return SemanticSearchEngine(session=session, embedding_service=embedding_service)


def _build_hybrid_engine(
    session: AsyncSession,
    settings: Settings | None = None,
) -> HybridSearchEngine:
    """Create a HybridSearchEngine combining FTS and semantic engines.

    Extracted as a function to allow easy mocking in tests.
    """
    fts = _build_fts_engine(session)
    semantic = _build_semantic_engine(session, settings)
    return HybridSearchEngine(fts_engine=fts, semantic_engine=semantic)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.get("", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1, description="Search query"),  # noqa: B008
    type: SearchType = Query(SearchType.hybrid, description="Search type"),  # noqa: A002, B008
    limit: int = Query(20, ge=1, le=100, description="Maximum number of results"),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> SearchResponse:
    """Search notes using hybrid, full-text, or semantic search.

    Requires JWT Bearer authentication.

    Args:
        q: The search query string (required, min 1 character).
        type: Search mode -- hybrid, fts, or semantic (default: hybrid).
        limit: Maximum number of results (1-100, default: 20).
        current_user: Injected by JWT authentication dependency.
        db: Injected async database session.

    Returns:
        SearchResponse with matching results, query echo, and total count.
    """
    logger.info(
        "Search request: user=%s, query=%r, type=%s, limit=%d",
        current_user.get("username"),
        q,
        type.value,
        limit,
    )

    results: list[SearchResult] = []

    if type == SearchType.fts:
        engine = _build_fts_engine(db)
        results = await engine.search(q, limit=limit)

    elif type == SearchType.semantic:
        engine = _build_semantic_engine(db)
        results = await engine.search(q, limit=limit)

    else:  # hybrid (default)
        engine = _build_hybrid_engine(db)
        results = await engine.search(q, limit=limit)

    return SearchResponse(
        results=[
            SearchResultResponse(
                note_id=r.note_id,
                title=r.title,
                snippet=r.snippet,
                score=r.score,
                search_type=r.search_type,
            )
            for r in results
        ],
        query=q,
        search_type=type.value,
        total=len(results),
    )
