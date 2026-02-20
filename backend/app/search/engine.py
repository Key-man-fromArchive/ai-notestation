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
import re
from collections.abc import AsyncIterator
from datetime import datetime

from pydantic import BaseModel, Field
from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Note, NoteEmbedding
from app.search.embeddings import EmbeddingError, EmbeddingService
from app.search.judge import SearchJudge
from app.search.params import get_search_params
from app.search.query_preprocessor import QueryAnalysis, analyze_query

logger = logging.getLogger(__name__)


def _dt_to_iso(dt: datetime | None) -> str | None:
    """Convert a datetime to ISO 8601 string, or None."""
    return dt.isoformat() if dt else None


class EngineContribution(BaseModel):
    """A single engine's contribution to a search result's score."""

    engine: str  # "fts", "semantic", "trigram"
    rank: int  # rank within that engine (0-based)
    raw_score: float  # engine's original score
    rrf_score: float  # RRF contribution: weight * 1/(k+rank)


class MatchExplanation(BaseModel):
    """Explains why a search result matched."""

    engines: list[EngineContribution]
    matched_terms: list[str] = []  # keywords extracted from <b> tags
    combined_score: float  # final RRF combined score


_BOLD_TAG_RE = re.compile(r"<b>(.*?)</b>", re.IGNORECASE)


def _extract_matched_terms(snippet: str) -> list[str]:
    """Extract unique matched keywords from <b> tags in a snippet."""
    terms = _BOLD_TAG_RE.findall(snippet)
    seen: set[str] = set()
    unique: list[str] = []
    for term in terms:
        lower = term.lower().strip()
        if lower and lower not in seen:
            seen.add(lower)
            unique.append(term.strip())
    return unique


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
    created_at: str | None = None
    updated_at: str | None = None
    match_explanation: MatchExplanation | None = None


class JudgeInfo(BaseModel):
    """Metadata about the adaptive search strategy decision."""

    strategy: str
    engines: list[str]
    skip_reason: str | None = None
    confidence: float = 0.0
    fts_result_count: int | None = None
    fts_avg_score: float | None = None
    term_coverage: float | None = None


class SearchPage(BaseModel):
    """Paginated search results with total count."""

    results: list[SearchResult]
    total: int
    judge_info: JudgeInfo | None = None


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
    ) -> SearchPage:
        """Execute a full-text search against the notes table.

        Uses Korean morpheme analysis to build an OR-joined tsquery,
        then ranks with BM25-approximated scoring (title 3x, content 1x).
        """
        analysis = self._build_tsquery_expr(query)
        if not analysis.tsquery_expr:
            return SearchPage(results=[], total=0)

        params = get_search_params()

        # Build tsquery using websearch_to_tsquery (safe against special characters)
        tsquery = func.websearch_to_tsquery(literal_column("'simple'"), analysis.tsquery_expr)

        # BM25-approximated scoring with field boosting:
        # - Title (weight A): configurable boost (default 3x)
        # - Content (weight B): configurable weight (default 1x), with document length normalization (flag=1)
        title_rank = func.ts_rank(
            func.setweight(
                func.to_tsvector(literal_column("'simple'"), func.coalesce(Note.title, "")), literal_column("'A'")
            ),
            tsquery,
        )
        content_rank = func.ts_rank(
            func.setweight(
                func.to_tsvector(literal_column("'simple'"), func.coalesce(Note.content_text, "")),
                literal_column("'B'"),
            ),
            tsquery,
            1,  # normalization: divide by document length
        )
        score = (params["title_weight"] * title_rank + params["content_weight"] * content_rank).label("score")

        # ts_headline generates a highlighted snippet from content_text
        headline = func.ts_headline(
            literal_column("'simple'"),
            Note.content_text,
            tsquery,
            literal_column("'StartSel=<b>, StopSel=</b>, MaxWords=35, MinWords=15'"),
        ).label("snippet")

        # COUNT(*) OVER() gives total matching rows without a separate query
        total_count = func.count().over().label("total_count")

        stmt = (
            select(
                Note.synology_note_id.label("note_id"),
                Note.title,
                headline,
                score,
                total_count,
                Note.source_created_at,
                Note.source_updated_at,
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

        total = rows[0].total_count if rows else 0
        results = [
            SearchResult(
                note_id=row.note_id,
                title=row.title,
                snippet=row.snippet,
                score=float(row.score),
                search_type="fts",
                created_at=_dt_to_iso(row.source_created_at),
                updated_at=_dt_to_iso(row.source_updated_at),
                match_explanation=MatchExplanation(
                    engines=[
                        EngineContribution(
                            engine="fts", rank=rank, raw_score=float(row.score), rrf_score=float(row.score)
                        )
                    ],
                    matched_terms=_extract_matched_terms(row.snippet or ""),
                    combined_score=float(row.score),
                ),
            )
            for rank, row in enumerate(rows)
        ]
        return SearchPage(results=results, total=total)

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
        params = get_search_params()
        language = analyze_query(query).language
        if language in ("ko", "mixed"):
            return params["trigram_threshold_ko"]
        return params["trigram_threshold_en"]

    async def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> SearchPage:
        """Execute a trigram similarity search against notes.

        For short queries (< 3 chars), uses ILIKE for prefix matching.
        For longer queries, uses pg_trgm similarity scoring.
        """
        stripped = query.strip()
        if not stripped:
            return SearchPage(results=[], total=0)

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
    ) -> SearchPage:
        """Trigram similarity search using pg_trgm with configurable title boost."""
        threshold = self._get_threshold(query)
        params = get_search_params()

        title_sim = func.similarity(Note.title, query).label("title_sim")
        content_sim = func.similarity(Note.content_text, query).label("content_sim")
        combined_score = (title_sim * params["trigram_title_weight"] + content_sim).label("score")
        total_count = func.count().over().label("total_count")

        stmt = (
            select(
                Note.synology_note_id.label("note_id"),
                Note.title,
                func.left(Note.content_text, self._SNIPPET_MAX_LENGTH).label("snippet"),
                combined_score,
                total_count,
                Note.source_created_at,
                Note.source_updated_at,
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

        total = rows[0].total_count if rows else 0
        results = [
            SearchResult(
                note_id=row.note_id,
                title=row.title,
                snippet=row.snippet or "",
                score=float(row.score),
                search_type="trigram",
                created_at=_dt_to_iso(row.source_created_at),
                updated_at=_dt_to_iso(row.source_updated_at),
                match_explanation=MatchExplanation(
                    engines=[
                        EngineContribution(
                            engine="trigram", rank=rank, raw_score=float(row.score), rrf_score=float(row.score)
                        )
                    ],
                    matched_terms=[],
                    combined_score=float(row.score),
                ),
            )
            for rank, row in enumerate(rows)
        ]
        return SearchPage(results=results, total=total)

    async def _ilike_search(
        self,
        query: str,
        limit: int,
        offset: int,
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> SearchPage:
        """ILIKE prefix search for short queries."""
        pattern = f"%{query}%"
        total_count = func.count().over().label("total_count")

        stmt = (
            select(
                Note.synology_note_id.label("note_id"),
                Note.title,
                func.left(Note.content_text, self._SNIPPET_MAX_LENGTH).label("snippet"),
                literal_column("1.0").label("score"),
                total_count,
                Note.source_created_at,
                Note.source_updated_at,
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

        total = rows[0].total_count if rows else 0
        results = [
            SearchResult(
                note_id=row.note_id,
                title=row.title,
                snippet=row.snippet or "",
                score=float(row.score),
                search_type="trigram",
                created_at=_dt_to_iso(row.source_created_at),
                updated_at=_dt_to_iso(row.source_updated_at),
                match_explanation=MatchExplanation(
                    engines=[
                        EngineContribution(
                            engine="trigram", rank=rank, raw_score=float(row.score), rrf_score=float(row.score)
                        )
                    ],
                    matched_terms=[],
                    combined_score=float(row.score),
                ),
            )
            for rank, row in enumerate(rows)
        ]
        return SearchPage(results=results, total=total)


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
    ) -> SearchPage:
        """Execute a semantic search against the note_embeddings table.

        The query is first converted to a vector embedding, then compared
        against stored note chunk embeddings using pgvector cosine distance.

        Uses DISTINCT ON (note_id) to ensure each note appears at most once,
        keeping only the best-matching chunk per note.
        """
        # Guard: empty/whitespace queries
        stripped = query.strip()
        if not stripped:
            return SearchPage(results=[], total=0)

        # Use normalized text from query analysis for embedding
        analysis = analyze_query(stripped)
        embed_text = analysis.normalized or stripped

        # Generate query embedding
        try:
            query_embedding = await self._embedding_service.embed_text(embed_text)
        except EmbeddingError:
            logger.warning("Embedding service failed for query: %r", stripped)
            return SearchPage(results=[], total=0)

        # Guard: empty embedding vector (e.g. empty input to service)
        if not query_embedding:
            return SearchPage(results=[], total=0)

        # Build cosine distance expression: embedding <=> :query_vector
        cosine_distance = NoteEmbedding.embedding.cosine_distance(query_embedding)

        # Inner subquery: DISTINCT ON (note_id) keeps only the best chunk per note
        inner = (
            select(
                NoteEmbedding.note_id,
                NoteEmbedding.chunk_text,
                cosine_distance.label("cosine_distance"),
            )
            .distinct(NoteEmbedding.note_id)
            .join(Note, NoteEmbedding.note_id == Note.id)
            .order_by(NoteEmbedding.note_id, cosine_distance.asc())
        )

        # Apply optional filters in the inner subquery to reduce work
        if notebook_name is not None:
            inner = inner.where(Note.notebook_name == notebook_name)
        if date_from is not None:
            inner = inner.where(Note.source_updated_at >= date_from)
        if date_to is not None:
            inner = inner.where(Note.source_updated_at <= date_to)

        inner = inner.subquery("best_chunks")

        # Outer query: join back to Note for metadata, sort by distance, paginate
        total_count = func.count().over().label("total_count")

        stmt = (
            select(
                Note.synology_note_id.label("note_id"),
                Note.title,
                inner.c.chunk_text,
                inner.c.cosine_distance,
                total_count,
                Note.source_created_at,
                Note.source_updated_at,
            )
            .join(inner, Note.id == inner.c.note_id)
            .order_by(inner.c.cosine_distance.asc())
            .limit(limit)
            .offset(offset)
        )

        result = await self._session.execute(stmt)
        rows = result.fetchall()

        total = rows[0].total_count if rows else 0
        results = []
        for rank, row in enumerate(rows):
            raw_score = round(1.0 - float(row.cosine_distance), 10)
            results.append(
                SearchResult(
                    note_id=row.note_id,
                    title=row.title,
                    snippet=self._truncate_snippet(row.chunk_text),
                    score=raw_score,
                    search_type="semantic",
                    created_at=_dt_to_iso(row.source_created_at),
                    updated_at=_dt_to_iso(row.source_updated_at),
                    match_explanation=MatchExplanation(
                        engines=[
                            EngineContribution(
                                engine="semantic",
                                rank=rank,
                                raw_score=raw_score,
                                rrf_score=raw_score,
                            ),
                        ],
                        matched_terms=[],
                        combined_score=raw_score,
                    ),
                )
            )
        return SearchPage(results=results, total=total)

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
        self._judge = SearchJudge()

    async def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> SearchPage:
        """Execute hybrid search: FTS first → judge quality → conditional semantic.

        Post-retrieval flow:
        1. Always run FTS (~50ms)
        2. Judge evaluates FTS result quality
        3. If insufficient, run semantic and merge via RRF
        4. If sufficient, return FTS results directly

        Pagination uses merge-then-slice: each engine fetches offset+limit
        results (offset=0), merged results are sliced at [offset:offset+limit].
        """
        if not query or not query.strip():
            return SearchPage(results=[], total=0)

        analysis = analyze_query(query)
        k, fts_weight, sem_weight = self._compute_rrf_params(analysis)

        filter_kwargs = {
            "notebook_name": notebook_name,
            "date_from": date_from,
            "date_to": date_to,
        }

        # Fetch enough results for merge-then-slice pagination
        fetch_limit = offset + limit

        # Step 1: Always run FTS first
        fts_page = await self._safe_search(
            self._fts_engine,
            query,
            limit=fetch_limit,
            offset=0,
            label="FTS",
            **filter_kwargs,
        )

        # Step 2: Judge evaluates FTS results
        decision = self._judge.judge_results(analysis, fts_page.results)

        # Step 3: Build judge_info from decision
        if not decision.should_run_semantic:
            judge_info = JudgeInfo(
                strategy="fts_only",
                engines=["fts"],
                skip_reason=decision.reason,
                confidence=decision.confidence,
                fts_result_count=decision.fts_result_count,
                fts_avg_score=decision.avg_score,
                term_coverage=decision.term_coverage,
            )
            # Slice FTS results for requested page
            sliced = fts_page.results[offset : offset + limit]
            return SearchPage(results=sliced, total=fts_page.total, judge_info=judge_info)

        # Step 4: Semantic needed — run and merge
        sem_page = await self._safe_search(
            self._semantic_engine,
            query,
            limit=fetch_limit,
            offset=0,
            label="Semantic",
            **filter_kwargs,
        )

        merged = self.rrf_merge(
            fts_page.results,
            sem_page.results,
            k=k,
            fts_weight=fts_weight,
            semantic_weight=sem_weight,
        )
        # Slice merged results for requested page
        sliced = merged[offset : offset + limit]
        total = max(fts_page.total, sem_page.total)

        judge_info = JudgeInfo(
            strategy="hybrid",
            engines=["fts", "semantic"],
            skip_reason=decision.reason,
            confidence=decision.confidence,
            fts_result_count=decision.fts_result_count,
            fts_avg_score=decision.avg_score,
            term_coverage=decision.term_coverage,
        )
        return SearchPage(results=sliced, total=total, judge_info=judge_info)

    async def search_progressive(
        self,
        query: str,
        limit: int = 20,
    ) -> AsyncIterator[list[SearchResult]]:
        """Progressive search: FTS first → judge quality → conditional semantic.

        Phase 1: Yields FTS results immediately (search_type="fts").
        Phase 2: If judge deems FTS insufficient, yields weighted RRF-merged
                 results after semantic completes (search_type="hybrid").
                 Skipped if FTS quality is sufficient.

        Args:
            query: The search query string.
            limit: Maximum number of results to return per phase.

        Yields:
            Phase 1: list[SearchResult] from FTS (search_type="fts").
            Phase 2: list[SearchResult] from weighted RRF merge (search_type="hybrid"),
                     only if judge decides semantic is needed.
        """
        if not query or not query.strip():
            return

        analysis = analyze_query(query)
        k, fts_weight, sem_weight = self._compute_rrf_params(analysis)

        # Phase 1: FTS results immediately
        try:
            fts_page = await self._fts_engine.search(query, limit=limit, offset=0)
            fts_results = fts_page.results if hasattr(fts_page, "results") else fts_page
        except Exception:
            logger.warning("FTS engine failed during progressive search")
            fts_results = []

        yield fts_results

        # Post-retrieval judge evaluates FTS quality
        decision = self._judge.judge_results(analysis, fts_results)

        # FTS sufficient → skip Phase 2
        if not decision.should_run_semantic:
            return

        # Phase 2: Semantic search, then weighted RRF merge
        try:
            semantic_page = await self._semantic_engine.search(query, limit=limit, offset=0)
            semantic_results = semantic_page.results if hasattr(semantic_page, "results") else semantic_page
        except Exception:
            logger.warning("Semantic engine failed during progressive search")
            semantic_results = []

        merged = self.rrf_merge(fts_results, semantic_results, k=k, fts_weight=fts_weight, semantic_weight=sem_weight)
        yield merged

    @staticmethod
    def _compute_rrf_params(analysis: QueryAnalysis) -> tuple[int, float, float]:
        """Compute dynamic RRF parameters based on query analysis.

        Uses configurable base weights from search params. Korean queries
        use dedicated Korean weights; other languages use default weights.

        Args:
            analysis: QueryAnalysis from the query preprocessor.

        Returns:
            Tuple of (k, fts_weight, semantic_weight).
        """
        params = get_search_params()
        k = int(params["rrf_k"])
        lang = analysis.language

        if lang in ("ko", "mixed"):
            return k, params["fts_weight_korean"], params["semantic_weight_korean"]
        # English / default
        return k, params["fts_weight"], params["semantic_weight"]

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
        # note_id -> (title, snippet, created_at, updated_at)
        metadata: dict[str, tuple[str, str, str | None, str | None]] = {}
        contributions: dict[str, list[EngineContribution]] = {}
        matched_terms_map: dict[str, list[str]] = {}

        for rank, result in enumerate(fts_results):
            rrf_score = fts_weight * (1.0 / (k + rank))
            scores[result.note_id] = scores.get(result.note_id, 0.0) + rrf_score
            if result.note_id not in metadata:
                metadata[result.note_id] = (result.title, result.snippet, result.created_at, result.updated_at)
            contributions.setdefault(result.note_id, []).append(
                EngineContribution(engine="fts", rank=rank, raw_score=result.score, rrf_score=rrf_score)
            )
            if result.note_id not in matched_terms_map:
                matched_terms_map[result.note_id] = _extract_matched_terms(result.snippet)

        for rank, result in enumerate(semantic_results):
            rrf_score = semantic_weight * (1.0 / (k + rank))
            scores[result.note_id] = scores.get(result.note_id, 0.0) + rrf_score
            if result.note_id not in metadata:
                metadata[result.note_id] = (result.title, result.snippet, result.created_at, result.updated_at)
            contributions.setdefault(result.note_id, []).append(
                EngineContribution(engine="semantic", rank=rank, raw_score=result.score, rrf_score=rrf_score)
            )

        merged: list[SearchResult] = []
        for note_id, rrf_score in sorted(scores.items(), key=lambda item: item[1], reverse=True):
            title, snippet, created_at, updated_at = metadata[note_id]
            merged.append(
                SearchResult(
                    note_id=note_id,
                    title=title,
                    snippet=snippet,
                    score=rrf_score,
                    search_type="hybrid",
                    created_at=created_at,
                    updated_at=updated_at,
                    match_explanation=MatchExplanation(
                        engines=contributions.get(note_id, []),
                        matched_terms=matched_terms_map.get(note_id, []),
                        combined_score=rrf_score,
                    ),
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
    ) -> tuple[SearchPage, SearchPage]:
        """Run FTS and semantic searches concurrently.

        If one engine raises an exception, the other's results are
        still returned (graceful degradation).
        """
        fts_task = self._safe_search(
            self._fts_engine,
            query,
            limit=limit,
            offset=offset,
            label="FTS",
            notebook_name=notebook_name,
            date_from=date_from,
            date_to=date_to,
        )
        sem_task = self._safe_search(
            self._semantic_engine,
            query,
            limit=limit,
            offset=offset,
            label="Semantic",
            notebook_name=notebook_name,
            date_from=date_from,
            date_to=date_to,
        )

        fts_page, sem_page = await asyncio.gather(fts_task, sem_task)
        return fts_page, sem_page

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
    ) -> SearchPage:
        """Call engine.search() with error handling."""
        try:
            return await engine.search(
                query,
                limit=limit,
                offset=offset,
                notebook_name=notebook_name,
                date_from=date_from,
                date_to=date_to,
            )
        except Exception:
            logger.warning("%s engine failed for query: %r", label, query)
            return SearchPage(results=[], total=0)


class UnifiedSearchEngine:
    """Unified text search engine combining FTS + Trigram via RRF merge.

    Runs FTS (tsvector) and Trigram (pg_trgm) in parallel, then merges
    results using Reciprocal Rank Fusion. FTS is weighted higher for
    exact matches; trigram provides fuzzy fallback.
    """

    def __init__(
        self,
        fts_engine: FullTextSearchEngine,
        trigram_engine: TrigramSearchEngine,
    ) -> None:
        self._fts_engine = fts_engine
        self._trigram_engine = trigram_engine

    async def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> SearchPage:
        """Execute unified search: FTS + Trigram in parallel, merged via RRF.

        Pagination uses merge-then-slice: each engine fetches offset+limit
        results (offset=0), merged results are sliced at [offset:offset+limit].
        """
        if not query or not query.strip():
            return SearchPage(results=[], total=0)

        # Fetch enough results for merge-then-slice pagination
        fetch_limit = offset + limit

        fts_task = self._safe_search(
            self._fts_engine,
            query,
            limit=fetch_limit,
            offset=0,
            label="FTS",
            notebook_name=notebook_name,
            date_from=date_from,
            date_to=date_to,
        )
        trigram_task = self._safe_search(
            self._trigram_engine,
            query,
            limit=fetch_limit,
            offset=0,
            label="Trigram",
            notebook_name=notebook_name,
            date_from=date_from,
            date_to=date_to,
        )

        fts_page, trigram_page = await asyncio.gather(fts_task, trigram_task)

        params = get_search_params()
        merged = self._rrf_merge(
            fts_page.results,
            trigram_page.results,
            k=int(params["rrf_k"]),
            fts_weight=params["unified_fts_weight"],
            trigram_weight=params["unified_trigram_weight"],
        )
        # Slice merged results for requested page
        sliced = merged[offset : offset + limit]
        # Use max of both totals as conservative estimate (there's overlap)
        total = max(fts_page.total, trigram_page.total)
        return SearchPage(results=sliced, total=total)

    @staticmethod
    def _rrf_merge(
        fts_results: list[SearchResult],
        trigram_results: list[SearchResult],
        k: int = 60,
        fts_weight: float = 1.0,
        trigram_weight: float = 0.0,
    ) -> list[SearchResult]:
        """Merge FTS and Trigram results using Weighted RRF."""
        scores: dict[str, float] = {}
        # note_id -> (title, snippet, created_at, updated_at)
        metadata: dict[str, tuple[str, str, str | None, str | None]] = {}
        contributions: dict[str, list[EngineContribution]] = {}
        matched_terms_map: dict[str, list[str]] = {}

        for rank, result in enumerate(fts_results):
            rrf_score = fts_weight * (1.0 / (k + rank))
            scores[result.note_id] = scores.get(result.note_id, 0.0) + rrf_score
            if result.note_id not in metadata:
                metadata[result.note_id] = (result.title, result.snippet, result.created_at, result.updated_at)
            contributions.setdefault(result.note_id, []).append(
                EngineContribution(engine="fts", rank=rank, raw_score=result.score, rrf_score=rrf_score)
            )
            if result.note_id not in matched_terms_map:
                matched_terms_map[result.note_id] = _extract_matched_terms(result.snippet)

        for rank, result in enumerate(trigram_results):
            rrf_score = trigram_weight * (1.0 / (k + rank))
            scores[result.note_id] = scores.get(result.note_id, 0.0) + rrf_score
            if result.note_id not in metadata:
                metadata[result.note_id] = (result.title, result.snippet, result.created_at, result.updated_at)
            contributions.setdefault(result.note_id, []).append(
                EngineContribution(engine="trigram", rank=rank, raw_score=result.score, rrf_score=rrf_score)
            )

        merged: list[SearchResult] = []
        for note_id, rrf_score in sorted(scores.items(), key=lambda item: item[1], reverse=True):
            title, snippet, created_at, updated_at = metadata[note_id]
            merged.append(
                SearchResult(
                    note_id=note_id,
                    title=title,
                    snippet=snippet,
                    score=rrf_score,
                    search_type="search",
                    created_at=created_at,
                    updated_at=updated_at,
                    match_explanation=MatchExplanation(
                        engines=contributions.get(note_id, []),
                        matched_terms=matched_terms_map.get(note_id, []),
                        combined_score=rrf_score,
                    ),
                )
            )

        return merged

    @staticmethod
    async def _safe_search(
        engine: FullTextSearchEngine | TrigramSearchEngine,
        query: str,
        limit: int,
        offset: int,
        label: str,
        notebook_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> SearchPage:
        """Call engine.search() with error handling."""
        try:
            return await engine.search(
                query,
                limit=limit,
                offset=offset,
                notebook_name=notebook_name,
                date_from=date_from,
                date_to=date_to,
            )
        except Exception:
            logger.warning("%s engine failed for query: %r", label, query)
            return SearchPage(results=[], total=0)


class ExactMatchSearchEngine:
    """Exact substring match search using ILIKE.

    Finds notes where the exact query string appears as-is in the title
    or content, without morpheme analysis or tokenization. Matched text
    is highlighted with <b> tags. Results are sorted by updated date.
    """

    _SNIPPET_MAX_LENGTH: int = 200

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
    ) -> SearchPage:
        """Execute an exact substring match search against notes."""
        stripped = query.strip()
        if not stripped:
            return SearchPage(results=[], total=0)

        pattern = f"%{stripped}%"
        total_count = func.count().over().label("total_count")

        # Use regexp_replace for case-insensitive highlighting
        # Escape regex metacharacters in user input to prevent regex injection
        escaped = re.escape(stripped)
        highlighted_snippet = func.regexp_replace(
            func.left(Note.content_text, self._SNIPPET_MAX_LENGTH),
            f"({escaped})",
            r"<b>\1</b>",
            literal_column("'gi'"),
        ).label("snippet")

        stmt = (
            select(
                Note.synology_note_id.label("note_id"),
                Note.title,
                highlighted_snippet,
                literal_column("1.0").label("score"),
                total_count,
                Note.source_created_at,
                Note.source_updated_at,
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

        total = rows[0].total_count if rows else 0
        results = [
            SearchResult(
                note_id=row.note_id,
                title=row.title,
                snippet=row.snippet or "",
                score=float(row.score),
                search_type="exact",
                created_at=_dt_to_iso(row.source_created_at),
                updated_at=_dt_to_iso(row.source_updated_at),
            )
            for row in rows
        ]
        return SearchPage(results=results, total=total)
