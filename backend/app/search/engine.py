# @TASK P2-T2.3 - Full-text search engine (PostgreSQL tsvector)
# @TASK P2-T2.4 - Semantic search engine (pgvector cosine similarity)
# @TASK P2-T2.5 - Hybrid search engine (RRF merge)
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database
# @TEST tests/test_fts.py
# @TEST tests/test_semantic.py
# @TEST tests/test_hybrid_search.py

"""Full-text, semantic, and hybrid search engines.

Full-text search: PostgreSQL tsvector + ts_rank (Phase 1 instant results).
Semantic search: pgvector cosine similarity (Phase 2 async results).
Hybrid search: RRF (Reciprocal Rank Fusion) merging FTS + semantic results.
Uses 'simple' text search configuration for Korean/English support.
Title matches are weighted higher (A) than content matches (B).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator

from pydantic import BaseModel, Field
from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Note, NoteEmbedding
from app.search.embeddings import EmbeddingError, EmbeddingService

logger = logging.getLogger(__name__)


class SearchResult(BaseModel):
    """A single search result from full-text or semantic search.

    Attributes:
        note_id: Database ID of the matching note.
        title: Title of the note.
        snippet: Highlighted snippet from ts_headline.
        score: Relevance score from ts_rank.
        search_type: Origin of the result (fts, semantic, or hybrid).
    """

    note_id: str
    title: str
    snippet: str
    score: float
    search_type: str = Field(default="fts")


class FullTextSearchEngine:
    """PostgreSQL tsvector-based full-text search engine.

    Uses plainto_tsquery with 'simple' configuration for Korean/English
    support. Results are ranked by ts_rank with title weight A and
    content weight B.

    Args:
        session: An async SQLAlchemy session for database queries.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
    ) -> list[SearchResult]:
        """Execute a full-text search against the notes table.

        Args:
            query: The search query string.
            limit: Maximum number of results to return (default 20).
            offset: Number of results to skip for pagination (default 0).

        Returns:
            A list of SearchResult ordered by relevance score descending.
            Returns an empty list for empty/whitespace queries or no matches.
        """
        processed_query = self._build_tsquery(query)
        if not processed_query:
            return []

        # Build the tsquery using plainto_tsquery with 'simple' config
        # for Korean + English language support
        tsquery = func.plainto_tsquery(literal_column("'simple'"), processed_query)

        # ts_rank scores relevance using the pre-computed search_vector
        rank = func.ts_rank(Note.search_vector, tsquery).label("score")

        # ts_headline generates a highlighted snippet from content_text
        headline = func.ts_headline(
            literal_column("'simple'"),
            Note.content_text,
            tsquery,
            literal_column("'StartSel=<b>, StopSel=</b>, MaxWords=35, MinWords=15'"),
        ).label("snippet")

        stmt = (
            select(
                Note.synology_note_id.label("note_id"),
                Note.title,
                headline,
                rank,
            )
            .where(Note.search_vector.op("@@")(tsquery))
            .order_by(rank.desc())
            .limit(limit)
            .offset(offset)
        )

        result = await self._session.execute(stmt)
        rows = result.fetchall()

        return [
            SearchResult(
                note_id=row.note_id,
                title=row.title,
                snippet=row.snippet,
                score=float(row.score),
                search_type="fts",
            )
            for row in rows
        ]

    def _build_tsquery(self, query: str) -> str:
        """Preprocess a raw query string for use with plainto_tsquery.

        Strips whitespace. The cleaned string is passed to
        plainto_tsquery('simple', ...) which handles tokenization.

        Args:
            query: Raw query string from the user.

        Returns:
            Cleaned query string, or empty string if input is blank.
        """
        return query.strip()


class SemanticSearchEngine:
    """pgvector-based semantic search engine using cosine similarity.

    Converts the query into a vector embedding via EmbeddingService,
    then performs cosine similarity search on the note_embeddings table.
    Results are JOINed with notes to retrieve title information.

    This provides Phase 2 (async) results in the progressive search pipeline.

    Args:
        session: An async SQLAlchemy session for database queries.
        embedding_service: Service to convert text into vector embeddings.
    """

    _SNIPPET_MAX_LENGTH: int = 200

    def __init__(
        self,
        session: AsyncSession,
        embedding_service: EmbeddingService,
    ) -> None:
        self._session = session
        self._embedding_service = embedding_service

    async def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
    ) -> list[SearchResult]:
        """Execute a semantic search against the note_embeddings table.

        The query is first converted to a vector embedding, then compared
        against stored note chunk embeddings using pgvector cosine distance.
        Results are JOINed with the notes table for title information.

        Args:
            query: The search query string.
            limit: Maximum number of results to return (default 20).
            offset: Number of results to skip for pagination (default 0).

        Returns:
            A list of SearchResult ordered by cosine similarity descending.
            Returns an empty list for empty queries, embedding failures,
            or no matches.
        """
        # Guard: empty/whitespace queries
        stripped = query.strip()
        if not stripped:
            return []

        # Generate query embedding
        try:
            query_embedding = await self._embedding_service.embed_text(stripped)
        except EmbeddingError:
            logger.warning("Embedding service failed for query: %r", stripped)
            return []

        # Guard: empty embedding vector (e.g. empty input to service)
        if not query_embedding:
            return []

        # Build cosine distance expression: embedding <=> :query_vector
        cosine_distance = NoteEmbedding.embedding.cosine_distance(query_embedding)

        stmt = (
            select(
                Note.synology_note_id.label("note_id"),
                Note.title,
                NoteEmbedding.chunk_text,
                cosine_distance.label("cosine_distance"),
            )
            .join(Note, NoteEmbedding.note_id == Note.id)
            .order_by(cosine_distance.asc())
            .limit(limit)
            .offset(offset)
        )

        result = await self._session.execute(stmt)
        rows = result.fetchall()

        return [
            SearchResult(
                note_id=row.note_id,
                title=row.title,
                snippet=self._truncate_snippet(row.chunk_text),
                score=round(1.0 - float(row.cosine_distance), 10),
                search_type="semantic",
            )
            for row in rows
        ]

    def _truncate_snippet(self, text: str) -> str:
        """Truncate chunk_text to at most _SNIPPET_MAX_LENGTH characters.

        Args:
            text: The chunk text to truncate.

        Returns:
            The text as-is if shorter than the limit, otherwise truncated
            with a trailing '...' ellipsis.
        """
        if len(text) <= self._SNIPPET_MAX_LENGTH:
            return text
        return text[: self._SNIPPET_MAX_LENGTH] + "..."


# @TASK P2-T2.5 - Hybrid search engine (RRF merge)
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database
class HybridSearchEngine:
    """Hybrid search engine combining FTS and semantic search via RRF.

    Orchestrates FullTextSearchEngine and SemanticSearchEngine, merging
    their results using Reciprocal Rank Fusion (RRF) to produce a single
    ranked list.

    Supports two modes:
    - ``search()``: parallel execution via asyncio.gather, returns merged list.
    - ``search_progressive()``: yields FTS results immediately (Phase 1),
      then yields RRF-merged results after semantic completes (Phase 2).
      Intended for SSE streaming to the frontend.

    Args:
        fts_engine: A FullTextSearchEngine instance.
        semantic_engine: A SemanticSearchEngine instance.
    """

    def __init__(
        self,
        fts_engine: FullTextSearchEngine,
        semantic_engine: SemanticSearchEngine,
    ) -> None:
        self._fts_engine = fts_engine
        self._semantic_engine = semantic_engine

    async def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
    ) -> list[SearchResult]:
        """Execute hybrid search: FTS + semantic in parallel, merged via RRF.

        Both engines are called concurrently with ``asyncio.gather()``.
        If one engine fails, the other's results are still used.

        Args:
            query: The search query string.
            limit: Maximum number of results to return (default 20).
            offset: Number of results to skip for pagination (default 0).

        Returns:
            A list of SearchResult with search_type="hybrid", sorted by
            RRF score descending. Returns an empty list for empty queries.
        """
        if not query or not query.strip():
            return []

        fts_results, semantic_results = await self._gather_results(
            query, limit=limit, offset=offset
        )

        return self.rrf_merge(fts_results, semantic_results)

    async def search_progressive(
        self,
        query: str,
        limit: int = 20,
    ) -> AsyncIterator[list[SearchResult]]:
        """Progressive search: FTS first, then RRF-merged hybrid results.

        Phase 1: Yields FTS results immediately (search_type="fts").
        Phase 2: Yields RRF-merged results after semantic completes
                 (search_type="hybrid").

        Designed for SSE streaming where the frontend displays FTS results
        instantly and then re-renders with the full merged ranking.

        Args:
            query: The search query string.
            limit: Maximum number of results to return per phase.

        Yields:
            Phase 1: list[SearchResult] from FTS (search_type="fts").
            Phase 2: list[SearchResult] from RRF merge (search_type="hybrid").
        """
        if not query or not query.strip():
            return

        # Phase 1: FTS results immediately
        try:
            fts_results = await self._fts_engine.search(query, limit=limit, offset=0)
        except Exception:
            logger.warning("FTS engine failed during progressive search")
            fts_results = []

        yield fts_results

        # Phase 2: Semantic search, then RRF merge
        try:
            semantic_results = await self._semantic_engine.search(
                query, limit=limit, offset=0
            )
        except Exception:
            logger.warning("Semantic engine failed during progressive search")
            semantic_results = []

        merged = self.rrf_merge(fts_results, semantic_results)
        yield merged

    @staticmethod
    def rrf_merge(
        fts_results: list[SearchResult],
        semantic_results: list[SearchResult],
        k: int = 60,
    ) -> list[SearchResult]:
        """Merge FTS and semantic results using Reciprocal Rank Fusion.

        RRF score for each document across result sets:
            ``rrf_score(d) = sum(1 / (k + rank))``

        Documents appearing in both sets have their scores summed.
        The ``k`` parameter (default 60) is the standard RRF smoothing constant.

        Args:
            fts_results: Results from full-text search, ordered by relevance.
            semantic_results: Results from semantic search, ordered by relevance.
            k: RRF smoothing parameter (default 60).

        Returns:
            A deduplicated list of SearchResult sorted by RRF score descending,
            with search_type="hybrid".
        """
        # Accumulate RRF scores per note_id.
        # Also keep the best metadata (title, snippet) for each note_id.
        scores: dict[str, float] = {}
        metadata: dict[str, tuple[str, str]] = {}  # note_id -> (title, snippet)

        for rank, result in enumerate(fts_results):
            rrf_score = 1.0 / (k + rank)
            scores[result.note_id] = scores.get(result.note_id, 0.0) + rrf_score
            # Keep the first encountered metadata (FTS has highlighted snippets)
            if result.note_id not in metadata:
                metadata[result.note_id] = (result.title, result.snippet)

        for rank, result in enumerate(semantic_results):
            rrf_score = 1.0 / (k + rank)
            scores[result.note_id] = scores.get(result.note_id, 0.0) + rrf_score
            if result.note_id not in metadata:
                metadata[result.note_id] = (result.title, result.snippet)

        # Build merged SearchResult list sorted by RRF score descending
        merged: list[SearchResult] = []
        for note_id, rrf_score in sorted(
            scores.items(), key=lambda item: item[1], reverse=True
        ):
            title, snippet = metadata[note_id]
            merged.append(
                SearchResult(
                    note_id=note_id,
                    title=title,
                    snippet=snippet,
                    score=rrf_score,
                    search_type="hybrid",
                )
            )

        return merged

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _gather_results(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[SearchResult], list[SearchResult]]:
        """Run FTS and semantic searches concurrently.

        If one engine raises an exception, the other's results are
        still returned (graceful degradation).

        Returns:
            A tuple of (fts_results, semantic_results).
        """
        fts_task = self._safe_search(
            self._fts_engine, query, limit=limit, offset=offset, label="FTS"
        )
        sem_task = self._safe_search(
            self._semantic_engine, query, limit=limit, offset=offset, label="Semantic"
        )

        fts_results, semantic_results = await asyncio.gather(fts_task, sem_task)
        return fts_results, semantic_results

    @staticmethod
    async def _safe_search(
        engine: FullTextSearchEngine | SemanticSearchEngine,
        query: str,
        limit: int,
        offset: int,
        label: str,
    ) -> list[SearchResult]:
        """Call engine.search() with error handling.

        On failure, logs a warning and returns an empty list so that
        the other engine's results can still be used.
        """
        try:
            return await engine.search(query, limit=limit, offset=offset)
        except Exception:
            logger.warning("%s engine failed for query: %r", label, query)
            return []
