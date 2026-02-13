# @TASK P2-T2.5 - Hybrid search engine tests (RRF merge)
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database
# @TEST tests/test_hybrid_search.py

"""Tests for the hybrid search engine using Reciprocal Rank Fusion (RRF).

Verifies RRF merge algorithm, post-retrieval judge integration,
progressive search streaming, and error resilience
without requiring a real PostgreSQL database or OpenAI API.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.search.engine import HybridSearchEngine, SearchPage, SearchResult

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


def _page(results: list[SearchResult] | None = None) -> SearchPage:
    """Wrap results in a SearchPage."""
    results = results or []
    return SearchPage(results=results, total=len(results))


def _make_mock_fts_engine(results: list[SearchResult] | None = None, side_effect=None):
    """Build a mock FullTextSearchEngine that returns SearchPage."""
    engine = AsyncMock()
    if side_effect is not None:
        engine.search = AsyncMock(side_effect=side_effect)
    else:
        engine.search = AsyncMock(return_value=_page(results))
    return engine


def _make_mock_semantic_engine(results: list[SearchResult] | None = None, side_effect=None):
    """Build a mock SemanticSearchEngine that returns SearchPage."""
    engine = AsyncMock()
    if side_effect is not None:
        engine.search = AsyncMock(side_effect=side_effect)
    else:
        engine.search = AsyncMock(return_value=_page(results))
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

    def test_rrf_merge_score_calculation_default_weights(self):
        """RRF score with default weights (1.0) is sum(1/(k+rank)).

        With k=60, fts_weight=1.0, semantic_weight=1.0:
          note_id=1: rank 0 in FTS -> score = 1.0 * 1/(60+0) = 1/60
          note_id=2: rank 1 in FTS -> score = 1.0 * 1/(60+1) = 1/61
          note_id=3: rank 0 in semantic -> score = 1.0 * 1/(60+0) = 1/60
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
        assert scores_by_id["1"] == pytest.approx(1 / 60, abs=1e-10)
        assert scores_by_id["2"] == pytest.approx(1 / 61, abs=1e-10)
        assert scores_by_id["3"] == pytest.approx(1 / 60, abs=1e-10)

    def test_rrf_merge_weighted_scores(self):
        """Weighted RRF correctly applies fts_weight and semantic_weight.

        With k=60, fts_weight=0.7, semantic_weight=0.3:
          note_id=1: FTS rank 0 -> 0.7 * 1/60
          note_id=2: semantic rank 0 -> 0.3 * 1/60
        """
        fts_results = [_sr(1, score=0.9, search_type="fts")]
        semantic_results = [_sr(2, score=0.7, search_type="semantic")]

        merged = HybridSearchEngine.rrf_merge(
            fts_results, semantic_results, k=60,
            fts_weight=0.7, semantic_weight=0.3,
        )

        scores_by_id = {r.note_id: r.score for r in merged}
        assert scores_by_id["1"] == pytest.approx(0.7 / 60, abs=1e-10)
        assert scores_by_id["2"] == pytest.approx(0.3 / 60, abs=1e-10)


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
# 6. Post-retrieval judge: FTS 0 results → semantic runs
# ---------------------------------------------------------------------------


class TestPostRetrievalJudgeNoResults:
    """When FTS returns zero results, judge triggers semantic search."""

    @pytest.mark.asyncio
    async def test_fts_empty_triggers_semantic(self):
        """FTS returns nothing → judge says run semantic → hybrid results returned."""
        semantic_results = [_sr(1, "Note A", "sem A", 0.8, "semantic")]

        fts_engine = _make_mock_fts_engine([])
        sem_engine = _make_mock_semantic_engine(semantic_results)

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        page = await hybrid.search("obscure quantum query", limit=20)

        # Semantic should have been called
        sem_engine.search.assert_awaited_once()
        assert len(page.results) > 0
        assert page.judge_info is not None
        assert page.judge_info.strategy == "hybrid"
        assert "fts" in page.judge_info.engines
        assert "semantic" in page.judge_info.engines
        assert page.judge_info.fts_result_count == 0


# ---------------------------------------------------------------------------
# 7. Post-retrieval judge: high-quality FTS → semantic skipped
# ---------------------------------------------------------------------------


class TestPostRetrievalJudgeHighQuality:
    """When FTS returns high-quality results, judge skips semantic."""

    @pytest.mark.asyncio
    async def test_high_quality_fts_skips_semantic(self):
        """Many high-scoring FTS results with good term coverage → semantic skipped."""
        fts_results = [
            _sr(1, "Research Note", "<b>research</b> methods", 0.9, "fts"),
            _sr(2, "Lab Research", "<b>research</b> protocol", 0.85, "fts"),
            _sr(3, "Research Data", "<b>research</b> data analysis", 0.8, "fts"),
            _sr(4, "Study Research", "<b>research</b> study design", 0.75, "fts"),
        ]

        fts_engine = _make_mock_fts_engine(fts_results)
        sem_engine = _make_mock_semantic_engine([])

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        page = await hybrid.search("research", limit=20)

        # Semantic should NOT have been called
        sem_engine.search.assert_not_awaited()
        assert len(page.results) == 4
        assert page.judge_info is not None
        assert page.judge_info.strategy == "fts_only"
        assert page.judge_info.engines == ["fts"]
        assert page.judge_info.fts_result_count == 4
        # All results are plain FTS (not hybrid-merged)
        assert all(r.search_type == "fts" for r in page.results)


# ---------------------------------------------------------------------------
# 8. Post-retrieval judge: low-quality FTS → semantic runs
# ---------------------------------------------------------------------------


class TestPostRetrievalJudgeLowQuality:
    """When FTS returns low-quality results, judge triggers semantic."""

    @pytest.mark.asyncio
    async def test_low_score_fts_triggers_semantic(self):
        """Few FTS results with low scores → judge triggers semantic."""
        fts_results = [
            _sr(1, "Note", "some snippet", 0.02, "fts"),
        ]
        semantic_results = [
            _sr(2, "Better Result", "semantic match", 0.7, "semantic"),
        ]

        fts_engine = _make_mock_fts_engine(fts_results)
        sem_engine = _make_mock_semantic_engine(semantic_results)

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        page = await hybrid.search("complex natural language question about experiments", limit=20)

        # Semantic should have been called
        sem_engine.search.assert_awaited_once()
        assert page.judge_info is not None
        assert page.judge_info.strategy == "hybrid"
        assert "semantic" in page.judge_info.engines


# ---------------------------------------------------------------------------
# 9. Hybrid search: empty query handling
# ---------------------------------------------------------------------------


class TestHybridEmptyQuery:
    """Empty or whitespace-only queries return an empty list."""

    @pytest.mark.asyncio
    async def test_empty_query_returns_empty(self):
        """An empty string query returns no results without calling sub-engines."""
        fts_engine = _make_mock_fts_engine([])
        sem_engine = _make_mock_semantic_engine([])

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        page = await hybrid.search("")

        assert page.results == []
        fts_engine.search.assert_not_awaited()
        sem_engine.search.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_whitespace_query_returns_empty(self):
        """A whitespace-only query returns no results."""
        fts_engine = _make_mock_fts_engine([])
        sem_engine = _make_mock_semantic_engine([])

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        page = await hybrid.search("   \t\n  ")

        assert page.results == []
        fts_engine.search.assert_not_awaited()
        sem_engine.search.assert_not_awaited()


# ---------------------------------------------------------------------------
# 10. Progressive search - Phase 1 (FTS immediate)
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
        async for batch in hybrid.search_progressive("test query phrase for semantic", limit=20):
            phases.append(batch)

        # Phase 1: FTS results
        assert len(phases) >= 1
        phase1 = phases[0]
        assert len(phase1) == 2
        assert all(r.search_type == "fts" for r in phase1)


# ---------------------------------------------------------------------------
# 11. Progressive search - Phase 2 skip when FTS sufficient
# ---------------------------------------------------------------------------


class TestProgressiveSearchPhase2Skip:
    """Progressive search skips Phase 2 when FTS quality is sufficient."""

    @pytest.mark.asyncio
    async def test_progressive_skips_phase2_when_fts_sufficient(self):
        """High-quality FTS results → only Phase 1 yielded, no Phase 2."""
        fts_results = [
            _sr(1, "Research Note", "<b>research</b> methods", 0.9, "fts"),
            _sr(2, "Lab Research", "<b>research</b> protocol", 0.85, "fts"),
            _sr(3, "Research Data", "<b>research</b> data analysis", 0.8, "fts"),
            _sr(4, "Study Research", "<b>research</b> study design", 0.75, "fts"),
        ]

        fts_engine = _make_mock_fts_engine(fts_results)
        sem_engine = _make_mock_semantic_engine([_sr(5, search_type="semantic")])

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)

        phases = []
        async for batch in hybrid.search_progressive("research", limit=20):
            phases.append(batch)

        # Only Phase 1 should be yielded
        assert len(phases) == 1
        assert len(phases[0]) == 4
        # Semantic engine should NOT have been called
        sem_engine.search.assert_not_awaited()


# ---------------------------------------------------------------------------
# 12. Progressive search - Phase 2 runs when FTS insufficient
# ---------------------------------------------------------------------------


class TestProgressiveSearchPhase2Runs:
    """Progressive search yields Phase 2 when FTS quality is insufficient."""

    @pytest.mark.asyncio
    async def test_progressive_yields_phase2_when_fts_insufficient(self):
        """Empty FTS results → Phase 2 is yielded with hybrid results."""
        fts_engine = _make_mock_fts_engine([])
        semantic_results = [_sr(1, "Note A", "sem A", 0.8, "semantic")]
        sem_engine = _make_mock_semantic_engine(semantic_results)

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)

        phases = []
        async for batch in hybrid.search_progressive("obscure query"):
            phases.append(batch)

        # Phase 1 (empty FTS) + Phase 2 (hybrid merged)
        assert len(phases) == 2
        assert len(phases[0]) == 0  # empty FTS
        assert len(phases[1]) > 0  # hybrid results
        assert all(r.search_type == "hybrid" for r in phases[1])

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
# 13. adaptive_enabled=False → always full hybrid
# ---------------------------------------------------------------------------


class TestAdaptiveDisabled:
    """When adaptive_enabled=0, always runs both FTS and semantic."""

    @pytest.mark.asyncio
    async def test_adaptive_disabled_always_runs_semantic(self):
        """With adaptive disabled, semantic always runs even with good FTS results."""
        fts_results = [
            _sr(1, "Research Note", "<b>research</b> methods", 0.9, "fts"),
            _sr(2, "Lab Research", "<b>research</b> protocol", 0.85, "fts"),
            _sr(3, "Research Data", "<b>research</b> analysis", 0.8, "fts"),
            _sr(4, "Study", "<b>research</b> design", 0.75, "fts"),
        ]
        semantic_results = [_sr(5, "Semantic Result", "sem", 0.7, "semantic")]

        fts_engine = _make_mock_fts_engine(fts_results)
        sem_engine = _make_mock_semantic_engine(semantic_results)

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)

        with patch("app.search.judge.get_search_params", return_value={
            "adaptive_enabled": 0,
            "judge_min_results": 3,
            "judge_min_avg_score": 0.1,
            "judge_min_avg_score_ko": 0.08,
            "judge_min_term_coverage": 0.5,
            "judge_confidence_threshold": 0.7,
        }):
            page = await hybrid.search("research", limit=20)

        # Semantic should have been called (adaptive disabled = always hybrid)
        sem_engine.search.assert_awaited_once()
        assert page.judge_info is not None
        assert page.judge_info.strategy == "hybrid"


# ---------------------------------------------------------------------------
# 14. FTS error → semantic fallback
# ---------------------------------------------------------------------------


class TestFTSError:
    """When FTS engine fails, semantic still runs as fallback."""

    @pytest.mark.asyncio
    async def test_fts_error_returns_semantic_only(self):
        """If FTS raises an exception, semantic results are still returned."""
        semantic_results = [
            _sr(1, "Note A", "sem A", 0.8, "semantic"),
        ]

        fts_engine = _make_mock_fts_engine(side_effect=Exception("FTS DB error"))
        sem_engine = _make_mock_semantic_engine(semantic_results)

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        page = await hybrid.search("test query")

        # FTS failed (0 results) → judge says run semantic
        assert len(page.results) > 0
        sem_engine.search.assert_awaited_once()


# ---------------------------------------------------------------------------
# 15. Semantic error → FTS results preserved
# ---------------------------------------------------------------------------


class TestSemanticError:
    """When semantic engine fails, FTS results are still returned."""

    @pytest.mark.asyncio
    async def test_semantic_error_returns_fts_only(self):
        """If semantic raises an exception, FTS results are still returned."""
        fts_results = [
            _sr(1, "Note A", "snippet", 0.02, "fts"),
        ]

        fts_engine = _make_mock_fts_engine(fts_results)
        sem_engine = _make_mock_semantic_engine(side_effect=Exception("Embedding API error"))

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        page = await hybrid.search("test query")

        # Even if semantic fails, we get the hybrid merge result (fts only in the merge)
        assert len(page.results) >= 1


# ---------------------------------------------------------------------------
# 16. Dynamic RRF parameters
# ---------------------------------------------------------------------------


class TestDynamicRRFParams:
    """_compute_rrf_params returns correct (k, fts_w, sem_w) per query type."""

    def test_korean_query(self):
        from app.search.query_preprocessor import analyze_query

        analysis = analyze_query("연구")
        k, fts_w, sem_w = HybridSearchEngine._compute_rrf_params(analysis)
        # Korean queries get korean weights
        assert fts_w == pytest.approx(0.70)
        assert sem_w == pytest.approx(0.30)

    def test_english_query(self):
        from app.search.query_preprocessor import analyze_query

        analysis = analyze_query("protein analysis method")
        k, fts_w, sem_w = HybridSearchEngine._compute_rrf_params(analysis)
        assert k == 60
        assert fts_w == pytest.approx(0.60)
        assert sem_w == pytest.approx(0.40)


# ---------------------------------------------------------------------------
# 17. Weighted RRF duplicate scores
# ---------------------------------------------------------------------------


class TestWeightedRRFDuplicates:
    """Weighted RRF correctly sums scores for duplicates across result sets."""

    def test_weighted_duplicate_scores_summed(self):
        """When a note appears in both sets, weighted RRF scores are summed."""
        fts_results = [_sr(1, "Note A", "fts", 0.9, "fts")]  # rank 0
        semantic_results = [_sr(1, "Note A", "sem", 0.7, "semantic")]  # rank 0

        merged = HybridSearchEngine.rrf_merge(
            fts_results, semantic_results, k=60,
            fts_weight=0.7, semantic_weight=0.3,
        )

        assert len(merged) == 1
        expected = 0.7 * (1 / 60) + 0.3 * (1 / 60)
        assert merged[0].score == pytest.approx(expected, abs=1e-10)


# ---------------------------------------------------------------------------
# 18. JudgeInfo contains post-retrieval metrics
# ---------------------------------------------------------------------------


class TestJudgeInfoMetrics:
    """JudgeInfo includes post-retrieval quality metrics."""

    @pytest.mark.asyncio
    async def test_judge_info_has_quality_metrics(self):
        """JudgeInfo includes fts_result_count, fts_avg_score, term_coverage."""
        fts_results = [
            _sr(1, "Note A", "<b>test</b> snippet", 0.5, "fts"),
            _sr(2, "Note B", "<b>test</b> data", 0.3, "fts"),
        ]

        fts_engine = _make_mock_fts_engine(fts_results)
        sem_engine = _make_mock_semantic_engine([])

        hybrid = HybridSearchEngine(fts_engine=fts_engine, semantic_engine=sem_engine)
        page = await hybrid.search("test query analysis", limit=20)

        assert page.judge_info is not None
        assert page.judge_info.fts_result_count is not None
        assert page.judge_info.fts_avg_score is not None
        assert page.judge_info.term_coverage is not None
        assert page.judge_info.fts_result_count == 2
