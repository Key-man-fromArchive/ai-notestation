# @TASK P2-T2.5 - Hybrid search engine tests (RRF merge)
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database
# @TEST tests/test_hybrid_search.py

"""Tests for the hybrid search engine using Reciprocal Rank Fusion (RRF).

Verifies RRF merge algorithm, hybrid search orchestration,
progressive search streaming, and error resilience
without requiring a real PostgreSQL database or OpenAI API.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.search.engine import HybridSearchEngine, SearchResult

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sr(
    note_id: int | str,
    title: str = "Note",
    snippet: str = "snippet",
    score: float = 0.5,
    search_type: str = "fts",
) -> SearchResult:
    """Shortcut to build a SearchResult for tests."""
    return SearchResult(
        note_id=str(note_id) if isinstance(note_id, int) else note_id,
        title=title,
        snippet=snippet,
        score=score,
        search_type=search_type,
    )


def _make_mock_fts_engine(results: list[SearchResult] | None = None, side_effect=None):
    """Build a mock FullTextSearchEngine."""
    engine = AsyncMock()
    if side_effect is not None:
        engine.search = AsyncMock(side_effect=side_effect)
    else:
        engine.search = AsyncMock(return_value=results if results is not None else [])
    return engine


def _make_mock_semantic_engine(results: list[SearchResult] | None = None, side_effect=None):
    """Build a mock SemanticSearchEngine."""
    engine = AsyncMock()
    if side_effect is not None:
        engine.search = AsyncMock(side_effect=side_effect)
    else:
        engine.search = AsyncMock(return_value=results if results is not None else [])
    return engine


# ---------------------------------------------------------------------------
# 1. RRF merge - both sides have results, scores are summed correctly
# ---------------------------------------------------------------------------


class TestRRFMergeBasic:
    """RRF merge combines results from both FTS and semantic search."""

    def test_rrf_merge_combines_both_result_sets(self):
        """RRF merge produces a combined list from FTS and semantic results."""
        fts_results = [
            _sr(1, "Note A", "fts snippet A", 0.9, "fts"),
            _sr(2, "Note B", "fts snippet B", 0.8, "fts"),
        ]
        semantic_results = [
            _sr(3, "Note C", "semantic snippet C", 0.7, "semantic"),
            _sr(4, "Note D", "semantic snippet D", 0.6, "semantic"),
        ]

        merged = HybridSearchEngine.rrf_merge(fts_results, semantic_results, k=60)

        assert len(merged) == 4
        merged_ids = {r.note_id for r in merged}
        assert merged_ids == {"1", "2", "3", "4"}
        assert all(r.search_type == "hybrid" for r in merged)

    def test_rrf_merge_score_calculation(self):
        """RRF score is computed as sum(1/(k+rank)) for each result set.

        With k=60:
          note_id=1: rank 0 in FTS -> score = 1/(60+0) = 1/60
          note_id=2: rank 1 in FTS -> score = 1/(60+1) = 1/61
          note_id=3: rank 0 in semantic -> score = 1/(60+0) = 1/60
        """
        fts_results = [
            _sr(1, score=0.9, search_type="fts"),
            _sr(2, score=0.8, search_type="fts"),
        ]
        semantic_results = [
            _sr(3, score=0.7, search_type="semantic"),
        ]

        merged = HybridSearchEngine.rrf_merge(fts_results, semantic_results, k=60)

        scores_by_id = {r.note_id: r.score for r in merged}
        # note_id=1 only in FTS at rank 0: 1/(60+0) = 1/60
        assert scores_by_id["1"] == pytest.approx(1 / 60, abs=1e-10)
        # note_id=2 only in FTS at rank 1: 1/(60+1) = 1/61
        assert scores_by_id["2"] == pytest.approx(1 / 61, abs=1e-10)
        # note_id=3 only in semantic at rank 0: 1/(60+0) = 1/60
        assert scores_by_id["3"] == pytest.approx(1 / 60, abs=1e-10)


# ---------------------------------------------------------------------------
# 2. RRF merge - duplicate note_id scores are summed
# ---------------------------------------------------------------------------


class TestRRFMergeDuplicates:
    """Duplicate note_ids across FTS and semantic have their RRF scores summed."""

    def test_duplicate_note_id_scores_summed(self):
        """When a note appears in both FTS and semantic, RRF scores are summed."""
        fts_results = [
            _sr(1, "Note A", "fts snippet", 0.9, "fts"),   # rank 0
            _sr(2, "Note B", "fts snippet", 0.8, "fts"),   # rank 1
        ]
        semantic_results = [
            _sr(1, "Note A", "semantic snippet", 0.7, "semantic"),  # rank 0
            _sr(3, "Note C", "semantic snippet", 0.6, "semantic"),  # rank 1
        ]

        merged = HybridSearchEngine.rrf_merge(fts_results, semantic_results, k=60)

        # note_id=1 appears in both: FTS rank 0 + semantic rank 0
        # score = 1/(60+0) + 1/(60+0) = 2/60
        scores_by_id = {r.note_id: r.score for r in merged}
        assert scores_by_id["1"] == pytest.approx(2 / 60, abs=1e-10)
        # note_id=2: only FTS rank 1 -> 1/61
        assert scores_by_id["2"] == pytest.approx(1 / 61, abs=1e-10)
        # note_id=3: only semantic rank 1 -> 1/61
        assert scores_by_id["3"] == pytest.approx(1 / 61, abs=1e-10)

    def test_duplicate_merged_count(self):
        """Duplicate note_ids produce a single entry in the merged result."""
        fts_results = [_sr(1, search_type="fts")]
        semantic_results = [_sr(1, search_type="semantic")]

        merged = HybridSearchEngine.rrf_merge(fts_results, semantic_results, k=60)

        assert len(merged) == 1
        assert merged[0].note_id == "1"
        assert merged[0].search_type == "hybrid"


# ---------------------------------------------------------------------------
# 3. RRF merge - one side has results only
# ---------------------------------------------------------------------------


class TestRRFMergeOneSide:
    """RRF merge works when only one result set has entries."""

    def test_only_fts_results(self):
        """When semantic returns nothing, FTS results are returned with RRF scores."""
        fts_results = [
            _sr(1, score=0.9, search_type="fts"),
            _sr(2, score=0.8, search_type="fts"),
        ]

        merged = HybridSearchEngine.rrf_merge(fts_results, [], k=60)

        assert len(merged) == 2
        assert all(r.search_type == "hybrid" for r in merged)
        scores_by_id = {r.note_id: r.score for r in merged}
        assert scores_by_id["1"] == pytest.approx(1 / 60, abs=1e-10)
        assert scores_by_id["2"] == pytest.approx(1 / 61, abs=1e-10)

    def test_only_semantic_results(self):
        """When FTS returns nothing, semantic results are returned with RRF scores."""
        semantic_results = [
            _sr(3, score=0.7, search_type="semantic"),
        ]

        merged = HybridSearchEngine.rrf_merge([], semantic_results, k=60)

        assert len(merged) == 1
        assert merged[0].search_type == "hybrid"
        assert merged[0].score == pytest.approx(1 / 60, abs=1e-10)


# ---------------------------------------------------------------------------
# 4. RRF merge - both sides empty
# ---------------------------------------------------------------------------


class TestRRFMergeEmpty:
    """RRF merge with no results from either side."""

    def test_both_empty_returns_empty(self):
        """When both FTS and semantic return nothing, merge returns empty list."""
        merged = HybridSearchEngine.rrf_merge([], [], k=60)

        assert merged == []
        assert isinstance(merged, list)


# ---------------------------------------------------------------------------
# 5. RRF merge - results sorted by RRF score descending
# ---------------------------------------------------------------------------


class TestRRFMergeSorting:
    """Merged results are sorted by RRF score in descending order."""

    def test_sorted_by_rrf_score_descending(self):
        """Results with higher RRF scores appear first."""
        fts_results = [
            _sr(1, score=0.9, search_type="fts"),   # rank 0 -> 1/60
            _sr(2, score=0.8, search_type="fts"),   # rank 1 -> 1/61
        ]
        semantic_results = [
            _sr(2, score=0.7, search_type="semantic"),  # rank 0 -> 1/60
            _sr(3, score=0.6, search_type="semantic"),  # rank 1 -> 1/61
        ]

        merged = HybridSearchEngine.rrf_merge(fts_results, semantic_results, k=60)

        # note_id=2: appears in both (FTS rank 1 + semantic rank 0)
        # score = 1/61 + 1/60 = (60+61)/(60*61) > 1/60
        # note_id=1: FTS rank 0 only -> 1/60
        # note_id=3: semantic rank 1 only -> 1/61
        assert merged[0].note_id == "2"  # highest score (both lists)
        assert merged[0].score > merged[1].score
        assert merged[-1].score <= merged[0].score

    def test_all_scores_descending(self):
        """All RRF scores in the merged result are in descending order."""
        fts_results = [
            _sr(1, search_type="fts"),
            _sr(2, search_type="fts"),
            _sr(3, search_type="fts"),
        ]
        semantic_results = [
            _sr(4, search_type="semantic"),
            _sr(5, search_type="semantic"),
        ]

        merged = HybridSearchEngine.rrf_merge(fts_results, semantic_results, k=60)

        for i in range(len(merged) - 1):
            assert merged[i].score >= merged[i + 1].score


# ---------------------------------------------------------------------------
# 6. Hybrid search success (asyncio.gather)
# ---------------------------------------------------------------------------


class TestHybridSearchSuccess:
    """Hybrid search orchestrates FTS + semantic via asyncio.gather."""

    @pytest.mark.asyncio
    async def test_hybrid_search_combines_both_engines(self):
        """search() calls both FTS and semantic engines and merges results."""
        fts_results = [_sr(1, "Note A", "fts A", 0.9, "fts")]
        semantic_results = [_sr(2, "Note B", "sem B", 0.7, "semantic")]

        fts_engine = _make_mock_fts_engine(fts_results)
        sem_engine = _make_mock_semantic_engine(semantic_results)

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        results = await hybrid.search("test query", limit=20)

        assert len(results) == 2
        assert all(r.search_type == "hybrid" for r in results)
        fts_engine.search.assert_awaited_once()
        sem_engine.search.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_hybrid_search_passes_limit(self):
        """search() passes limit parameter to both sub-engines."""
        fts_engine = _make_mock_fts_engine([])
        sem_engine = _make_mock_semantic_engine([])

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        await hybrid.search("test", limit=10)

        fts_engine.search.assert_awaited_once_with("test", limit=10, offset=0)
        sem_engine.search.assert_awaited_once_with("test", limit=10, offset=0)


# ---------------------------------------------------------------------------
# 7. Empty query handling
# ---------------------------------------------------------------------------


class TestHybridEmptyQuery:
    """Empty or whitespace-only queries return an empty list."""

    @pytest.mark.asyncio
    async def test_empty_query_returns_empty(self):
        """An empty string query returns no results without calling sub-engines."""
        fts_engine = _make_mock_fts_engine([])
        sem_engine = _make_mock_semantic_engine([])

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        results = await hybrid.search("")

        assert results == []
        fts_engine.search.assert_not_awaited()
        sem_engine.search.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_whitespace_query_returns_empty(self):
        """A whitespace-only query returns no results."""
        fts_engine = _make_mock_fts_engine([])
        sem_engine = _make_mock_semantic_engine([])

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        results = await hybrid.search("   \t\n  ")

        assert results == []
        fts_engine.search.assert_not_awaited()
        sem_engine.search.assert_not_awaited()


# ---------------------------------------------------------------------------
# 8. Progressive search - Phase 1 (FTS immediate)
# ---------------------------------------------------------------------------


class TestProgressiveSearchPhase1:
    """Progressive search yields FTS results immediately as Phase 1."""

    @pytest.mark.asyncio
    async def test_progressive_first_yield_is_fts(self):
        """The first yield from search_progressive is FTS results."""
        fts_results = [
            _sr(1, "Note A", "fts A", 0.9, "fts"),
            _sr(2, "Note B", "fts B", 0.8, "fts"),
        ]
        semantic_results = [_sr(3, "Note C", "sem C", 0.7, "semantic")]

        fts_engine = _make_mock_fts_engine(fts_results)
        sem_engine = _make_mock_semantic_engine(semantic_results)

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)

        phases = []
        async for batch in hybrid.search_progressive("test query", limit=20):
            phases.append(batch)

        # Phase 1: FTS results
        assert len(phases) >= 1
        phase1 = phases[0]
        assert len(phase1) == 2
        assert all(r.search_type == "fts" for r in phase1)

    @pytest.mark.asyncio
    async def test_progressive_fts_empty_still_yields(self):
        """Even if FTS returns nothing, Phase 1 yields an empty list."""
        fts_engine = _make_mock_fts_engine([])
        sem_engine = _make_mock_semantic_engine([_sr(1, search_type="semantic")])

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)

        phases = []
        async for batch in hybrid.search_progressive("test"):
            phases.append(batch)

        # Phase 1 is still yielded (empty FTS)
        assert len(phases) >= 1


# ---------------------------------------------------------------------------
# 9. Progressive search - Phase 2 (RRF merge)
# ---------------------------------------------------------------------------


class TestProgressiveSearchPhase2:
    """Progressive search yields RRF-merged results as Phase 2."""

    @pytest.mark.asyncio
    async def test_progressive_second_yield_is_hybrid(self):
        """The second yield from search_progressive is RRF-merged hybrid results."""
        fts_results = [_sr(1, "Note A", "fts A", 0.9, "fts")]
        semantic_results = [_sr(2, "Note B", "sem B", 0.7, "semantic")]

        fts_engine = _make_mock_fts_engine(fts_results)
        sem_engine = _make_mock_semantic_engine(semantic_results)

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)

        phases = []
        async for batch in hybrid.search_progressive("test query"):
            phases.append(batch)

        # Phase 2: hybrid merged results
        assert len(phases) == 2
        phase2 = phases[1]
        assert all(r.search_type == "hybrid" for r in phase2)
        merged_ids = {r.note_id for r in phase2}
        assert "1" in merged_ids
        assert "2" in merged_ids

    @pytest.mark.asyncio
    async def test_progressive_empty_query_no_yields(self):
        """Empty query produces no yields from progressive search."""
        fts_engine = _make_mock_fts_engine([])
        sem_engine = _make_mock_semantic_engine([])

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)

        phases = []
        async for batch in hybrid.search_progressive(""):
            phases.append(batch)

        assert len(phases) == 0


# ---------------------------------------------------------------------------
# 10. FTS error - fallback to semantic only
# ---------------------------------------------------------------------------


class TestFTSError:
    """When FTS engine fails, hybrid search falls back to semantic results."""

    @pytest.mark.asyncio
    async def test_fts_error_returns_semantic_only(self):
        """If FTS raises an exception, semantic results are still returned."""
        semantic_results = [
            _sr(1, "Note A", "sem A", 0.8, "semantic"),
        ]

        fts_engine = _make_mock_fts_engine(side_effect=Exception("FTS DB error"))
        sem_engine = _make_mock_semantic_engine(semantic_results)

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        results = await hybrid.search("test query")

        assert len(results) == 1
        assert results[0].search_type == "hybrid"
        assert results[0].note_id == "1"


# ---------------------------------------------------------------------------
# 11. Semantic error - fallback to FTS only
# ---------------------------------------------------------------------------


class TestSemanticError:
    """When semantic engine fails, hybrid search falls back to FTS results."""

    @pytest.mark.asyncio
    async def test_semantic_error_returns_fts_only(self):
        """If semantic raises an exception, FTS results are still returned."""
        fts_results = [
            _sr(1, "Note A", "fts A", 0.9, "fts"),
        ]

        fts_engine = _make_mock_fts_engine(fts_results)
        sem_engine = _make_mock_semantic_engine(side_effect=Exception("Embedding API error"))

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        results = await hybrid.search("test query")

        assert len(results) == 1
        assert results[0].search_type == "hybrid"
        assert results[0].note_id == "1"
