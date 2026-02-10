# @TASK P2-T2.3 - Full-text search engine (PostgreSQL tsvector)
# @TASK P2-T2.4 - Semantic search engine (pgvector cosine similarity)
# @TASK P2-T2.5 - Hybrid search engine (RRF merge)
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database
# @TEST tests/test_fts.py
# @TEST tests/test_semantic.py
# @TEST tests/test_hybrid_search.py

"""Full-text, semantic, and hybrid search engines.

Full-text search: PostgreSQL tsvector + BM25-approximated ts_rank scoring.
Semantic search: pgvector cosine similarity (Phase 2 async results).
Hybrid search: Weighted RRF (Reciprocal Rank Fusion) with dynamic k.
Uses 'simple' text search configuration for Korean/English support.
Title matches are weighted 3x higher than content matches.
Korean morpheme analysis via kiwipiepy for better tokenization.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from datetime import datetime

from pydantic import BaseModel, Field
from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Note, NoteEmbedding
from app.search.embeddings import EmbeddingError, EmbeddingService
from app.search.query_preprocessor import QueryAnalysis, analyze_query

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
    """PostgreSQL tsvector-based full-text search engine with BM25-approximated scoring.

    Uses to_tsquery with Korean morpheme analysis (kiwipiepy) for better
    tokenization. Results are ranked using BM25-approximated scoring with
    title weight 3x and content weight 1x, plus document length normalization.

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
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[SearchResult]:
        """Execute a full-text search against the notes table.

        Uses Korean morpheme analysis to build an OR-joined tsquery,
        then ranks with BM25-approximated scoring (title 3x, content 1x).

        Args:
            query: The search query string.
            limit: Maximum number of results to return (default 20).
            offset: Number of results to skip for pagination (default 0).
            notebook_name: Optional notebook name filter.
            date_from: Optional start date filter.
            date_to: Optional end date filter.

        Returns:
            A list of SearchResult ordered by relevance score descending.
            Returns an empty list for empty/whitespace queries or no matches.
        """
        analysis = self._build_tsquery_expr(query)
        if not analysis.tsquery_expr:
            return []

        # Build tsquery using to_tsquery with OR-joined morphemes
        tsquery = func.to_tsquery(literal_column("'simple'"), analysis.tsquery_expr)

        # BM25-approximated scoring with field boosting:
        # - Title (weight A): 3x boost
        # - Content (weight B): 1x, with document length normalization (flag=1)
        title_rank = func.ts_rank(
            func.setweight(func.to_tsvector(literal_column("'simple'"), func.coalesce(Note.title, "")), "A"),
            tsquery,
        )
        content_rank = func.ts_rank(
            func.setweight(func.to_tsvector(literal_column("'simple'"), func.coalesce(Note.content_text, "")), "B"),
            tsquery,
            1,  # normalization: divide by document length
        )
        score = (3.0 * title_rank + 1.0 * content_rank).label("score")

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
                score,
            )
            .where(Note.search_vector.op("@@")(tsquery))
            .order_by(score.desc())
            .limit(limit)
            .offset(offset)
        )

        # Apply optional filters
        if notebook_name is not None:
            stmt = stmt.where(Note.notebook_name == notebook_name)
        if date_from is not None:
            stmt = stmt.where(Note.source_updated_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Note.source_updated_at <= date_to)

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

    def _build_tsquery_expr(self, query: str) -> QueryAnalysis:
        """Analyze a raw query string using Korean morpheme analysis.

        Uses kiwipiepy to extract morphemes from Korean text, then
        builds an OR-joined tsquery expression.

        Args:
            query: Raw query string from the user.

        Returns:
            QueryAnalysis with morphemes and tsquery expression.
        """
        return analyze_query(query)


class TrigramSearchEngine:
    """PostgreSQL pg_trgm-based fuzzy search engine.

    Uses trigram similarity for Korean/CJK text search where
    traditional full-text search with stemming doesn't work well.
    Falls back to ILIKE for short queries.

    Language-aware thresholds:
    - Korean: 0.15 (trigrams work less well with Hangul syllable blocks)
    - English: 0.1

    Title matches are boosted 3x over content matches.

    Args:
        session: An async SQLAlchemy session for database queries.
        similarity_threshold: Minimum similarity score override (default auto-detect).
    """

    _SNIPPET_MAX_LENGTH: int = 200

    def __init__(
        self,
        session: AsyncSession,
        similarity_threshold: float | None = None,
    ) -> None:
        self._session = session
        self._threshold_override = similarity_threshold

    def _get_threshold(self, query: str) -> float:
        """Get language-appropriate similarity threshold."""
        if self._threshold_override is not None:
            return self._threshold_override
        language = analyze_query(query).language
        if language in ("ko", "mixed"):
            return 0.15
        return 0.1

    async def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[SearchResult]:
        """Execute a trigram similarity search against notes.

        For short queries (< 3 chars), uses ILIKE for prefix matching.
        For longer queries, uses pg_trgm similarity scoring.

        Args:
            query: The search query string.
            limit: Maximum number of results to return (default 20).
            offset: Number of results to skip for pagination (default 0).
            notebook_name: Optional notebook name filter.
            date_from: Optional start date filter.
            date_to: Optional end date filter.

        Returns:
            A list of SearchResult ordered by similarity score descending.
        """
        stripped = query.strip()
        if not stripped:
            return []

        if len(stripped) < 3:
            return await self._ilike_search(stripped, limit, offset, notebook_name, date_from, date_to)

        return await self._similarity_search(stripped, limit, offset, notebook_name, date_from, date_to)

    async def _similarity_search(
        self,
        query: str,
        limit: int,
        offset: int,
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[SearchResult]:
        """Trigram similarity search using pg_trgm with 3x title boost."""
        threshold = self._get_threshold(query)

        title_sim = func.similarity(Note.title, query).label("title_sim")
        content_sim = func.similarity(Note.content_text, query).label("content_sim")
        combined_score = (title_sim * 3.0 + content_sim).label("score")

        stmt = (
            select(
                Note.synology_note_id.label("note_id"),
                Note.title,
                func.left(Note.content_text, self._SNIPPET_MAX_LENGTH).label("snippet"),
                combined_score,
            )
            .where(
                (func.similarity(Note.title, query) >= threshold)
                | (func.similarity(Note.content_text, query) >= threshold)
            )
            .order_by(combined_score.desc())
            .limit(limit)
            .offset(offset)
        )

        if notebook_name is not None:
            stmt = stmt.where(Note.notebook_name == notebook_name)
        if date_from is not None:
            stmt = stmt.where(Note.source_updated_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Note.source_updated_at <= date_to)

        result = await self._session.execute(stmt)
        rows = result.fetchall()

        return [
            SearchResult(
                note_id=row.note_id,
                title=row.title,
                snippet=row.snippet or "",
                score=float(row.score),
                search_type="trigram",
            )
            for row in rows
        ]

    async def _ilike_search(
        self,
        query: str,
        limit: int,
        offset: int,
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[SearchResult]:
        """ILIKE prefix search for short queries."""
        pattern = f"%{query}%"

        stmt = (
            select(
                Note.synology_note_id.label("note_id"),
                Note.title,
                func.left(Note.content_text, self._SNIPPET_MAX_LENGTH).label("snippet"),
                literal_column("1.0").label("score"),
            )
            .where((Note.title.ilike(pattern)) | (Note.content_text.ilike(pattern)))
            .order_by(Note.source_updated_at.desc())
            .limit(limit)
            .offset(offset)
        )

        if notebook_name is not None:
            stmt = stmt.where(Note.notebook_name == notebook_name)
        if date_from is not None:
            stmt = stmt.where(Note.source_updated_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Note.source_updated_at <= date_to)

        result = await self._session.execute(stmt)
        rows = result.fetchall()

        return [
            SearchResult(
                note_id=row.note_id,
                title=row.title,
                snippet=row.snippet or "",
                score=float(row.score),
                search_type="trigram",
            )
            for row in rows
        ]


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
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[SearchResult]:
        """Execute a semantic search against the note_embeddings table.

        The query is first converted to a vector embedding, then compared
        against stored note chunk embeddings using pgvector cosine distance.
        Results are JOINed with the notes table for title information.

        Args:
            query: The search query string.
            limit: Maximum number of results to return (default 20).
            offset: Number of results to skip for pagination (default 0).
            notebook_name: Optional notebook name filter.
            date_from: Optional start date filter.
            date_to: Optional end date filter.

        Returns:
            A list of SearchResult ordered by cosine similarity descending.
            Returns an empty list for empty queries, embedding failures,
            or no matches.
        """
        # Guard: empty/whitespace queries
        stripped = query.strip()
        if not stripped:
            return []

        # Use normalized text from query analysis for embedding
        analysis = analyze_query(stripped)
        embed_text = analysis.normalized or stripped

        # Generate query embedding
        try:
            query_embedding = await self._embedding_service.embed_text(embed_text)
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

        # Apply optional filters
        if notebook_name is not None:
            stmt = stmt.where(Note.notebook_name == notebook_name)
        if date_from is not None:
            stmt = stmt.where(Note.source_updated_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Note.source_updated_at <= date_to)

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
    """Hybrid search engine combining FTS and semantic search via weighted RRF.

    Orchestrates FullTextSearchEngine and SemanticSearchEngine, merging
    their results using Weighted Reciprocal Rank Fusion (RRF) with
    dynamic k parameter based on query analysis.

    Weight table by query type:
    | Query Type       | k  | FTS Weight | Semantic Weight |
    |-----------------|----|-----------:|----------------:|
    | Korean single   | 40 |       0.70 |            0.30 |
    | Korean multi    | 60 |       0.55 |            0.45 |
    | English single  | 50 |       0.65 |            0.35 |
    | Mixed           | 60 |       0.50 |            0.50 |
    | Default         | 60 |       0.60 |            0.40 |

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
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[SearchResult]:
        """Execute hybrid search: FTS + semantic in parallel, merged via weighted RRF.

        Both engines are called concurrently with ``asyncio.gather()``.
        If one engine fails, the other's results are still used.
        RRF parameters (k, weights) are dynamically computed from query analysis.

        Args:
            query: The search query string.
            limit: Maximum number of results to return (default 20).
            offset: Number of results to skip for pagination (default 0).
            notebook_name: Optional notebook name filter.
            date_from: Optional start date filter.
            date_to: Optional end date filter.

        Returns:
            A list of SearchResult with search_type="hybrid", sorted by
            weighted RRF score descending. Returns an empty list for empty queries.
        """
        if not query or not query.strip():
            return []

        analysis = analyze_query(query)
        k, fts_weight, sem_weight = self._compute_rrf_params(analysis)

        fts_results, semantic_results = await self._gather_results(
            query, limit=limit, offset=offset,
            notebook_name=notebook_name, date_from=date_from, date_to=date_to,
        )

        return self.rrf_merge(fts_results, semantic_results, k=k, fts_weight=fts_weight, semantic_weight=sem_weight)

    async def search_progressive(
        self,
        query: str,
        limit: int = 20,
    ) -> AsyncIterator[list[SearchResult]]:
        """Progressive search: FTS first, then weighted RRF-merged hybrid results.

        Phase 1: Yields FTS results immediately (search_type="fts").
        Phase 2: Yields weighted RRF-merged results after semantic completes
                 (search_type="hybrid").

        Designed for SSE streaming where the frontend displays FTS results
        instantly and then re-renders with the full merged ranking.

        Args:
            query: The search query string.
            limit: Maximum number of results to return per phase.

        Yields:
            Phase 1: list[SearchResult] from FTS (search_type="fts").
            Phase 2: list[SearchResult] from weighted RRF merge (search_type="hybrid").
        """
        if not query or not query.strip():
            return

        analysis = analyze_query(query)
        k, fts_weight, sem_weight = self._compute_rrf_params(analysis)

        # Phase 1: FTS results immediately
        try:
            fts_results = await self._fts_engine.search(query, limit=limit, offset=0)
        except Exception:
            logger.warning("FTS engine failed during progressive search")
            fts_results = []

        yield fts_results

        # Phase 2: Semantic search, then weighted RRF merge
        try:
            semantic_results = await self._semantic_engine.search(query, limit=limit, offset=0)
        except Exception:
            logger.warning("Semantic engine failed during progressive search")
            semantic_results = []

        merged = self.rrf_merge(fts_results, semantic_results, k=k, fts_weight=fts_weight, semantic_weight=sem_weight)
        yield merged

    @staticmethod
    def _compute_rrf_params(analysis: QueryAnalysis) -> tuple[int, float, float]:
        """Compute dynamic RRF parameters based on query analysis.

        Args:
            analysis: QueryAnalysis from the query preprocessor.

        Returns:
            Tuple of (k, fts_weight, semantic_weight).
        """
        lang = analysis.language
        single = analysis.is_single_term

        if lang == "ko" and single:
            return 40, 0.70, 0.30
        if lang == "ko":
            return 60, 0.55, 0.45
        if lang == "en" and single:
            return 50, 0.65, 0.35
        if lang == "mixed":
            return 60, 0.50, 0.50
        # Default (English multi-word, etc.)
        return 60, 0.60, 0.40

    @staticmethod
    def rrf_merge(
        fts_results: list[SearchResult],
        semantic_results: list[SearchResult],
        k: int = 60,
        fts_weight: float = 1.0,
        semantic_weight: float = 1.0,
    ) -> list[SearchResult]:
        """Merge FTS and semantic results using Weighted Reciprocal Rank Fusion.

        RRF score for each document across result sets:
            ``rrf_score(d) = fts_weight * (1 / (k + rank_fts)) + semantic_weight * (1 / (k + rank_sem))``

        Documents appearing in both sets have their weighted scores summed.

        Args:
            fts_results: Results from full-text search, ordered by relevance.
            semantic_results: Results from semantic search, ordered by relevance.
            k: RRF smoothing parameter (default 60).
            fts_weight: Weight multiplier for FTS RRF scores (default 1.0).
            semantic_weight: Weight multiplier for semantic RRF scores (default 1.0).

        Returns:
            A deduplicated list of SearchResult sorted by weighted RRF score descending,
            with search_type="hybrid".
        """
        scores: dict[str, float] = {}
        metadata: dict[str, tuple[str, str]] = {}  # note_id -> (title, snippet)

        for rank, result in enumerate(fts_results):
            rrf_score = fts_weight * (1.0 / (k + rank))
            scores[result.note_id] = scores.get(result.note_id, 0.0) + rrf_score
            if result.note_id not in metadata:
                metadata[result.note_id] = (result.title, result.snippet)

        for rank, result in enumerate(semantic_results):
            rrf_score = semantic_weight * (1.0 / (k + rank))
            scores[result.note_id] = scores.get(result.note_id, 0.0) + rrf_score
            if result.note_id not in metadata:
                metadata[result.note_id] = (result.title, result.snippet)

        merged: list[SearchResult] = []
        for note_id, rrf_score in sorted(scores.items(), key=lambda item: item[1], reverse=True):
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
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> tuple[list[SearchResult], list[SearchResult]]:
        """Run FTS and semantic searches concurrently.

        If one engine raises an exception, the other's results are
        still returned (graceful degradation).

        Returns:
            A tuple of (fts_results, semantic_results).
        """
        fts_task = self._safe_search(
            self._fts_engine, query, limit=limit, offset=offset, label="FTS",
            notebook_name=notebook_name, date_from=date_from, date_to=date_to,
        )
        sem_task = self._safe_search(
            self._semantic_engine, query, limit=limit, offset=offset, label="Semantic",
            notebook_name=notebook_name, date_from=date_from, date_to=date_to,
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
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[SearchResult]:
        """Call engine.search() with error handling.

        On failure, logs a warning and returns an empty list so that
        the other engine's results can still be used.
        """
        try:
            return await engine.search(
                query, limit=limit, offset=offset,
                notebook_name=notebook_name, date_from=date_from, date_to=date_to,
            )
        except Exception:
            logger.warning("%s engine failed for query: %r", label, query)
            return []
