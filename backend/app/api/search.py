# @TASK P4-T4.3 - Search API endpoint
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database
# @TEST tests/test_api_search.py

"""Search API endpoint for LabNote AI.

Provides:
- ``GET /search`` -- Search notes using hybrid, full-text, or semantic search.
- ``GET /search/suggestions`` -- Search suggestions (autocomplete).
- ``POST /search/index`` -- Trigger batch embedding indexing for notes.
- ``GET /search/index/status`` -- Get embedding indexing status.

Supports three search modes:
- **hybrid** (default): Weighted RRF-merged FTS + semantic results.
- **fts**: PostgreSQL tsvector full-text search with BM25 scoring.
- **semantic**: pgvector cosine similarity only.

All endpoints require JWT Bearer authentication.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import async_session_factory, get_db
from app.models import Note
from app.search.embeddings import EmbeddingService
from app.search.engine import (
    ExactMatchSearchEngine,
    FullTextSearchEngine,
    HybridSearchEngine,
    JudgeInfo,
    SearchPage,
    SearchResult,
    SemanticSearchEngine,
    TrigramSearchEngine,
    UnifiedSearchEngine,
)
from app.search.indexer import NoteIndexer
from app.services.auth_service import get_current_user
from app.services.oauth_service import OAuthService
from app.utils.i18n import get_language
from app.utils.messages import msg

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])


# ---------------------------------------------------------------------------
# Enums & Response schemas
# ---------------------------------------------------------------------------


class SearchType(str, Enum):
    """Supported search types."""

    search = "search"
    semantic = "semantic"
    exact = "exact"
    # Legacy types kept for backward compatibility
    hybrid = "hybrid"
    fts = "fts"
    trigram = "trigram"


class EngineContributionResponse(BaseModel):
    """A single engine's contribution to a search result."""

    engine: str
    rank: int
    raw_score: float
    rrf_score: float


class MatchExplanationResponse(BaseModel):
    """Explains why a search result matched."""

    engines: list[EngineContributionResponse]
    matched_terms: list[str] = []
    combined_score: float


class SearchResultResponse(BaseModel):
    """A single search result in the API response."""

    note_id: str
    title: str
    snippet: str
    score: float
    search_type: str
    created_at: str | None = None
    updated_at: str | None = None
    match_explanation: MatchExplanationResponse | None = None



class JudgeInfoResponse(BaseModel):
    """Adaptive search strategy decision metadata."""

    strategy: str
    engines: list[str]
    skip_reason: str | None = None
    confidence: float = 0.0

class SearchResponse(BaseModel):
    """Search API response containing results and metadata."""

    results: list[SearchResultResponse]
    query: str
    search_type: str
    total: int
    judge_info: JudgeInfoResponse | None = None


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


def _build_unified_engine(session: AsyncSession) -> UnifiedSearchEngine:
    """Create a UnifiedSearchEngine combining FTS + Trigram."""
    fts = _build_fts_engine(session)
    trigram = _build_trigram_engine(session)
    return UnifiedSearchEngine(fts_engine=fts, trigram_engine=trigram)


def _build_exact_engine(session: AsyncSession) -> ExactMatchSearchEngine:
    return ExactMatchSearchEngine(session=session)


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


class SuggestionResponse(BaseModel):
    """Search suggestion (autocomplete) response."""

    suggestions: list[str]
    prefix: str


def _parse_date(date_str: str | None) -> datetime | None:
    """Parse a date string (YYYY-MM-DD) to datetime, or None."""
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str)
    except ValueError:
        return None


@router.get("", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1, description="Search query"),  # noqa: B008
    type: SearchType = Query(SearchType.search, description="Search type"),  # noqa: A002, B008
    limit: int = Query(20, ge=1, le=100, description="Maximum number of results"),  # noqa: B008
    offset: int = Query(0, ge=0, description="Number of results to skip for pagination"),  # noqa: B008
    notebook: str | None = Query(None, description="Filter by notebook name"),  # noqa: B008
    date_from: str | None = Query(None, description="Filter from date (YYYY-MM-DD)"),  # noqa: B008
    date_to: str | None = Query(None, description="Filter to date (YYYY-MM-DD)"),  # noqa: B008
    rerank: bool = Query(False, description="Apply Cohere reranking"),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> SearchResponse:
    """Search notes using hybrid, full-text, or semantic search.

    Requires JWT Bearer authentication.

    Args:
        q: The search query string (required, min 1 character).
        type: Search mode -- hybrid, fts, or semantic (default: hybrid).
        limit: Maximum number of results (1-100, default: 20).
        offset: Number of results to skip for pagination (default: 0).
        notebook: Optional notebook name to filter results.
        date_from: Optional start date (YYYY-MM-DD) to filter results.
        date_to: Optional end date (YYYY-MM-DD) to filter results.
        rerank: Whether to apply Cohere reranking (default: false).
        current_user: Injected by JWT authentication dependency.
        db: Injected async database session.

    Returns:
        SearchResponse with matching results, query echo, and total count.
    """
    username = current_user.get("username", "")
    logger.info(
        "Search request: user=%s, query=%r, type=%s, limit=%d, offset=%d, notebook=%s",
        username,
        q,
        type.value,
        limit,
        offset,
        notebook,
    )

    api_key = await _get_openai_api_key(db, username)
    page: SearchPage = SearchPage(results=[], total=0)

    # Parse date filters
    parsed_date_from = _parse_date(date_from)
    parsed_date_to = _parse_date(date_to)
    filter_kwargs = {
        "notebook_name": notebook,
        "date_from": parsed_date_from,
        "date_to": parsed_date_to,
    }

    if type == SearchType.exact:
        engine = _build_exact_engine(db)
        page = await engine.search(q, limit=limit, offset=offset, **filter_kwargs)

    elif type == SearchType.semantic:
        engine = _build_semantic_engine(db, api_key=api_key)
        page = await engine.search(q, limit=limit, offset=offset, **filter_kwargs)

    elif type == SearchType.fts:
        engine = _build_fts_engine(db)
        page = await engine.search(q, limit=limit, offset=offset, **filter_kwargs)

    elif type == SearchType.trigram:
        engine = _build_trigram_engine(db)
        page = await engine.search(q, limit=limit, offset=offset, **filter_kwargs)

    elif type == SearchType.hybrid:
        engine = _build_hybrid_engine(db, api_key=api_key)
        page = await engine.search(q, limit=limit, offset=offset, **filter_kwargs)

    else:  # search (default) — unified FTS + Trigram
        engine = _build_unified_engine(db)
        page = await engine.search(q, limit=limit, offset=offset, **filter_kwargs)

    results = page.results

    # Apply reranking if requested
    if rerank and results:
        try:
            from app.search.reranker import get_reranker

            reranker = get_reranker()
            results = await reranker.rerank(q, results)
        except Exception:
            logger.warning("Reranking failed, returning unranked results")

    return SearchResponse(
        results=[
            SearchResultResponse(
                note_id=r.note_id,
                title=r.title,
                snippet=r.snippet,
                score=r.score,
                search_type=r.search_type,
                created_at=r.created_at,
                updated_at=r.updated_at,
                match_explanation=MatchExplanationResponse(
                    engines=[
                        EngineContributionResponse(
                            engine=e.engine,
                            rank=e.rank,
                            raw_score=e.raw_score,
                            rrf_score=e.rrf_score,
                        )
                        for e in r.match_explanation.engines
                    ],
                    matched_terms=r.match_explanation.matched_terms,
                    combined_score=r.match_explanation.combined_score,
                ) if r.match_explanation else None,
            )
            for r in results
        ],
        query=q,
        search_type=type.value,
        total=page.total,
        judge_info=JudgeInfoResponse(
            strategy=page.judge_info.strategy,
            engines=page.judge_info.engines,
            skip_reason=page.judge_info.skip_reason,
            confidence=page.judge_info.confidence,
        ) if page.judge_info else None,
    )


@router.get("/suggestions", response_model=SuggestionResponse)
async def search_suggestions(
    prefix: str = Query(..., min_length=1, max_length=100, description="Search prefix"),  # noqa: B008
    limit: int = Query(5, ge=1, le=10, description="Maximum suggestions"),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> SuggestionResponse:
    """Get search suggestions based on note titles.

    Uses ILIKE prefix matching with similarity scoring for ranking.

    Args:
        prefix: The search prefix to match against.
        limit: Maximum number of suggestions (1-10, default: 5).
        current_user: Injected by JWT authentication dependency.
        db: Injected async database session.

    Returns:
        SuggestionResponse with matching note titles.
    """
    pattern = f"%{prefix}%"

    stmt = (
        select(Note.title)
        .where(Note.title.ilike(pattern))
        .order_by(func.similarity(Note.title, prefix).desc())
        .limit(limit)
        .distinct()
    )

    result = await db.execute(stmt)
    titles = [row[0] for row in result.fetchall() if row[0]]

    return SuggestionResponse(suggestions=titles, prefix=prefix)


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
    triggered_by: str | None = None


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

    from app.services.activity_log import log_activity

    await log_activity("embedding", "started", triggered_by=state.triggered_by)

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
            await log_activity(
                "embedding", "completed",
                message="인덱싱할 노트 없음",
                details={"indexed": 0, "failed": 0},
                triggered_by=state.triggered_by,
            )
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

        # Refresh graph materialized view after indexing
        try:
            from app.services.graph_service import refresh_avg_embeddings
            from app.database import async_session_factory

            async with async_session_factory() as mv_session:
                await refresh_avg_embeddings(mv_session)
        except Exception:
            logger.warning("Failed to refresh graph materialized view after indexing", exc_info=True)

        state.status = "completed"
        await log_activity(
            "embedding",
            "completed",
            message=f"임베딩 완료: {state.indexed}개 인덱싱",
            details={
                "total_notes": state.total_notes,
                "indexed": state.indexed,
                "failed": state.failed,
            },
            triggered_by=state.triggered_by,
        )

    except Exception as exc:
        state.status = "error"
        state.error_message = str(exc)
        logger.exception("Indexing failed: %s", exc)
        await log_activity(
            "embedding",
            "error",
            message=str(exc),
            triggered_by=state.triggered_by,
        )

    finally:
        state.is_indexing = False


@router.post("/index", response_model=IndexTriggerResponse)
async def trigger_index(
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IndexTriggerResponse:
    """Trigger batch embedding indexing for notes without embeddings.

    Uses OAuth token if user is connected to OpenAI, otherwise falls back
    to server-side OPENAI_API_KEY.
    """
    lang = get_language(request)

    if _index_state.is_indexing:
        return IndexTriggerResponse(
            status="already_indexing",
            message=msg("search.index_trigger_already_running", lang),
        )

    username = current_user.get("username", "")
    api_key = await _get_openai_api_key(db, username)

    _index_state.api_key = api_key

    if not api_key:
        return IndexTriggerResponse(
            status="error",
            message=msg("search.index_trigger_no_api_key", lang),
        )

    _index_state.triggered_by = current_user.get("username", "unknown")

    background_tasks.add_task(_run_index_background, _index_state)

    source = "API 키" if lang == "ko" else "API key"
    return IndexTriggerResponse(
        status="indexing",
        message=msg("search.index_trigger_started", lang, source=source),
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
