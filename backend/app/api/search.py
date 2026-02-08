# @TASK P4-T4.3 - Search API endpoint
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database
# @TEST tests/test_api_search.py

"""Search API endpoint for LabNote AI.

Provides:
- ``GET /search`` -- Search notes using hybrid, full-text, or semantic search.
- ``POST /search/index`` -- Trigger batch embedding indexing for notes.
- ``GET /search/index/status`` -- Get embedding indexing status.

Supports three search modes:
- **hybrid** (default): RRF-merged FTS + semantic results.
- **fts**: PostgreSQL tsvector full-text search only.
- **semantic**: pgvector cosine similarity only.

All endpoints require JWT Bearer authentication.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from enum import Enum

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import async_session_factory, get_db
from app.models import Note
from app.search.embeddings import EmbeddingService
from app.search.engine import (
    FullTextSearchEngine,
    HybridSearchEngine,
    SearchResult,
    SemanticSearchEngine,
    TrigramSearchEngine,
)
from app.search.indexer import NoteIndexer
from app.services.auth_service import get_current_user
from app.services.oauth_service import OAuthService

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
    trigram = "trigram"


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
    api_key: str | None = None,
) -> SemanticSearchEngine:
    """Create a SemanticSearchEngine with an EmbeddingService.

    Extracted as a function to allow easy mocking in tests.
    """
    if settings is None:
        settings = get_settings()

    effective_key = api_key or settings.OPENAI_API_KEY
    embedding_service = EmbeddingService(
        api_key=effective_key,
        model=settings.EMBEDDING_MODEL,
        dimensions=settings.EMBEDDING_DIMENSION,
    )
    return SemanticSearchEngine(session=session, embedding_service=embedding_service)


def _build_hybrid_engine(
    session: AsyncSession,
    settings: Settings | None = None,
    api_key: str | None = None,
) -> HybridSearchEngine:
    """Create a HybridSearchEngine combining FTS and semantic engines.

    Extracted as a function to allow easy mocking in tests.
    """
    fts = _build_fts_engine(session)
    semantic = _build_semantic_engine(session, settings, api_key)
    return HybridSearchEngine(fts_engine=fts, semantic_engine=semantic)


def _build_trigram_engine(session: AsyncSession) -> TrigramSearchEngine:
    return TrigramSearchEngine(session=session)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


async def _get_openai_api_key(db: AsyncSession, username: str) -> str | None:
    """Get OpenAI API key for embeddings (priority order).

    NOTE: OAuth tokens from ChatGPT don't support Embeddings API,
    so we prioritize user-provided API keys over OAuth.
    """
    from app.api.settings import _load_from_db

    settings = get_settings()

    await _load_from_db(db)
    from app.api.settings import _settings_cache

    settings_api_key = _settings_cache.get("openai_api_key")
    if settings_api_key:
        logger.debug("Using API key from settings database for embeddings")
        return settings_api_key

    if settings.OPENAI_API_KEY:
        logger.debug("Using API key from environment variable for embeddings")
        return settings.OPENAI_API_KEY

    return None


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
    username = current_user.get("username", "")
    logger.info(
        "Search request: user=%s, query=%r, type=%s, limit=%d",
        username,
        q,
        type.value,
        limit,
    )

    api_key = await _get_openai_api_key(db, username)
    results: list[SearchResult] = []

    if type == SearchType.fts:
        engine = _build_fts_engine(db)
        results = await engine.search(q, limit=limit)

    elif type == SearchType.semantic:
        engine = _build_semantic_engine(db, api_key=api_key)
        results = await engine.search(q, limit=limit)

    elif type == SearchType.trigram:
        engine = _build_trigram_engine(db)
        results = await engine.search(q, limit=limit)

    else:  # hybrid (default)
        engine = _build_hybrid_engine(db, api_key=api_key)
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


# ---------------------------------------------------------------------------
# Embedding Index State & Endpoints
# ---------------------------------------------------------------------------


@dataclass
class IndexState:
    status: str = "idle"
    is_indexing: bool = False
    total_notes: int = 0
    indexed: int = 0
    failed: int = 0
    error_message: str | None = None
    api_key: str | None = None


_index_state = IndexState()


class IndexStatusResponse(BaseModel):
    status: str
    total_notes: int
    indexed_notes: int
    pending_notes: int
    failed: int
    error_message: str | None = None


class IndexTriggerResponse(BaseModel):
    status: str
    message: str


async def _run_index_background(state: IndexState) -> None:
    settings = get_settings()
    api_key = state.api_key or settings.OPENAI_API_KEY
    logger.info("Indexer using API key: %s...%s", api_key[:10] if api_key else "None", api_key[-4:] if api_key else "")
    if not api_key:
        state.status = "error"
        state.error_message = "OpenAI API 키가 없습니다. OAuth 로그인 또는 OPENAI_API_KEY 설정이 필요합니다."
        state.is_indexing = False
        return

    state.status = "indexing"
    state.is_indexing = True
    state.error_message = None
    state.indexed = 0
    state.failed = 0

    try:
        async with async_session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT n.id FROM notes n
                    WHERE NOT EXISTS (
                        SELECT 1 FROM note_embeddings ne WHERE ne.note_id = n.id
                    )
                """)
            )
            note_ids = [row[0] for row in result.fetchall()]
            state.total_notes = len(note_ids)

        if not note_ids:
            state.status = "completed"
            state.is_indexing = False
            return

        embedding_service = EmbeddingService(
            api_key=api_key,
            model=settings.EMBEDDING_MODEL,
            dimensions=settings.EMBEDDING_DIMENSION,
        )

        batch_size = 5
        for i in range(0, len(note_ids), batch_size):
            batch = note_ids[i : i + batch_size]
            try:
                async with async_session_factory() as session:
                    indexer = NoteIndexer(session=session, embedding_service=embedding_service)
                    result = await indexer.index_notes(batch)
                    await session.commit()
                    state.indexed += result.indexed
                    state.failed += result.failed
                    logger.info(
                        "Index progress: %d/%d indexed, %d failed",
                        state.indexed,
                        state.total_notes,
                        state.failed,
                    )
            except Exception as exc:
                state.failed += len(batch)
                logger.exception("Batch indexing failed: %s", exc)

            await asyncio.sleep(0.5)

        state.status = "completed"

    except Exception as exc:
        state.status = "error"
        state.error_message = str(exc)
        logger.exception("Indexing failed: %s", exc)

    finally:
        state.is_indexing = False


@router.post("/index", response_model=IndexTriggerResponse)
async def trigger_index(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IndexTriggerResponse:
    """Trigger batch embedding indexing for notes without embeddings.

    Uses OAuth token if user is connected to OpenAI, otherwise falls back
    to server-side OPENAI_API_KEY.
    """
    if _index_state.is_indexing:
        return IndexTriggerResponse(
            status="already_indexing",
            message="임베딩 인덱싱이 이미 진행 중입니다.",
        )

    username = current_user.get("username", "")
    api_key = await _get_openai_api_key(db, username)

    _index_state.api_key = api_key

    if not api_key:
        return IndexTriggerResponse(
            status="error",
            message="OpenAI API 키가 필요합니다. Settings에서 API 키를 입력하거나 OAuth 연결하세요.",
        )

    background_tasks.add_task(_run_index_background, _index_state)

    source = "API 키"
    return IndexTriggerResponse(
        status="indexing",
        message=f"임베딩 인덱싱을 시작합니다. ({source} 사용)",
    )


@router.get("/index/status", response_model=IndexStatusResponse)
async def get_index_status(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IndexStatusResponse:
    """Get the current embedding indexing status."""
    total_result = await db.execute(text("SELECT COUNT(*) FROM notes"))
    total_notes = total_result.scalar() or 0

    indexed_result = await db.execute(text("SELECT COUNT(DISTINCT note_id) FROM note_embeddings"))
    indexed_notes = indexed_result.scalar() or 0

    pending_notes = total_notes - indexed_notes

    return IndexStatusResponse(
        status=_index_state.status,
        total_notes=total_notes,
        indexed_notes=indexed_notes,
        pending_notes=pending_notes,
        failed=_index_state.failed,
        error_message=_index_state.error_message,
    )
