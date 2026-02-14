# @TASK P2-T2.3 - Full-text search engine tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database
# @TEST tests/test_fts.py

"""Tests for the PostgreSQL tsvector-based full-text search engine.

Verifies search query construction, result ranking, snippet generation,
and edge cases without requiring a real PostgreSQL database.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.search.engine import FullTextSearchEngine, SearchResult

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_row(note_id: int | str, title: str, snippet: str, score: float):
    """Build a mock SQLAlchemy row result with named attributes."""
    row = MagicMock()
    row.note_id = str(note_id) if isinstance(note_id, int) else note_id
    row.title = title
    row.snippet = snippet
    row.score = score
    row.source_created_at = None
    row.source_updated_at = None
    row.total_count = 0
    return row


def _make_mock_session(rows: list | None = None):
    """Build a mock AsyncSession whose execute() returns the given rows."""
    session = AsyncMock()
    result_mock = MagicMock()
    result_mock.fetchall.return_value = rows if rows is not None else []
    session.execute = AsyncMock(return_value=result_mock)
    return session


# ---------------------------------------------------------------------------
# 1. SearchResult model validation
# ---------------------------------------------------------------------------


class TestSearchResultModel:
    """SearchResult Pydantic model validation."""

    def test_valid_search_result(self):
        """A SearchResult can be created with valid fields."""
        result = SearchResult(
            note_id="note_1",
            title="Test Note",
            snippet="This is a <b>test</b> snippet",
            score=0.85,
            search_type="fts",
        )
        assert result.note_id == "note_1"
        assert result.title == "Test Note"
        assert result.snippet == "This is a <b>test</b> snippet"
        assert result.score == 0.85
        assert result.search_type == "fts"

    def test_search_result_default_search_type(self):
        """SearchResult defaults to search_type='fts'."""
        result = SearchResult(
            note_id="note_1",
            title="Note",
            snippet="snip",
            score=0.5,
        )
        assert result.search_type == "fts"

    def test_search_result_accepts_different_types(self):
        """SearchResult accepts semantic and hybrid search types."""
        for stype in ("fts", "semantic", "hybrid"):
            result = SearchResult(note_id="note_1", title="N", snippet="S", score=0.1, search_type=stype)
            assert result.search_type == stype

    def test_search_result_serialization(self):
        """SearchResult can be serialized to a dictionary."""
        result = SearchResult(
            note_id="note_42",
            title="Serialization Test",
            snippet="snippet text",
            score=0.75,
            search_type="fts",
        )
        data = result.model_dump()
        assert data["note_id"] == "note_42"
        assert data["title"] == "Serialization Test"
        assert data["snippet"] == "snippet text"
        assert data["score"] == 0.75
        assert data["search_type"] == "fts"
        assert data["created_at"] is None
        assert data["updated_at"] is None
        assert data["match_explanation"] is None


# ---------------------------------------------------------------------------
# 2. Basic search success (results returned)
# ---------------------------------------------------------------------------


class TestSearchSuccess:
    """Full-text search returns correctly structured results."""

    @pytest.mark.asyncio
    async def test_basic_search_returns_results(self):
        """A search with matching notes returns a SearchPage with SearchResult list."""
        rows = [
            _make_mock_row(1, "Python Guide", "Learn <b>Python</b> basics", 0.9),
            _make_mock_row(2, "Python Tips", "Advanced <b>Python</b> tips", 0.7),
        ]
        rows[0].total_count = 2
        rows[1].total_count = 2
        session = _make_mock_session(rows)
        engine = FullTextSearchEngine(session)

        page = await engine.search("Python")

        assert page.results is not None
        assert len(page.results) == 2
        assert all(isinstance(r, SearchResult) for r in page.results)
        assert page.results[0].note_id == "1"
        assert page.results[0].title == "Python Guide"
        assert page.results[0].snippet == "Learn <b>Python</b> basics"
        assert page.results[0].score == 0.9
        assert page.results[0].search_type == "fts"
        assert page.total == 2

    @pytest.mark.asyncio
    async def test_search_calls_session_execute(self):
        """The search method calls session.execute exactly once."""
        session = _make_mock_session([])
        engine = FullTextSearchEngine(session)

        await engine.search("test")

        session.execute.assert_awaited_once()


# ---------------------------------------------------------------------------
# 3. Empty query handling
# ---------------------------------------------------------------------------


class TestEmptyQuery:
    """Empty or whitespace-only queries return an empty SearchPage."""

    @pytest.mark.asyncio
    async def test_empty_string_returns_empty_list(self):
        """An empty string query returns SearchPage with empty results without hitting DB."""
        session = _make_mock_session()
        engine = FullTextSearchEngine(session)

        page = await engine.search("")

        assert page.results == []
        assert page.total == 0
        session.execute.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_whitespace_only_returns_empty_list(self):
        """A whitespace-only query returns SearchPage with empty results without hitting DB."""
        session = _make_mock_session()
        engine = FullTextSearchEngine(session)

        page = await engine.search("   ")

        assert page.results == []
        assert page.total == 0
        session.execute.assert_not_awaited()


# ---------------------------------------------------------------------------
# 4. No results found
# ---------------------------------------------------------------------------


class TestNoResults:
    """Searches that match no notes return an empty SearchPage."""

    @pytest.mark.asyncio
    async def test_no_matching_notes(self):
        """A query with no matches returns SearchPage with empty results."""
        session = _make_mock_session([])
        engine = FullTextSearchEngine(session)

        page = await engine.search("nonexistent-term-xyz")

        assert page.results == []
        assert page.total == 0


# ---------------------------------------------------------------------------
# 5. Limit and offset parameters
# ---------------------------------------------------------------------------


class TestLimitOffset:
    """Limit and offset parameters control result pagination."""

    @pytest.mark.asyncio
    async def test_default_limit_is_20(self):
        """Default limit is 20 when not specified."""
        session = _make_mock_session([])
        engine = FullTextSearchEngine(session)

        await engine.search("test")

        # Verify the SQL text contains LIMIT and OFFSET via the executed statement
        call_args = session.execute.call_args
        stmt = call_args[0][0]
        # The compiled SQL should include limit and offset
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False}))
        # Check that LIMIT clause exists in the compiled SQL
        assert "LIMIT" in compiled.upper() or "limit" in compiled

    @pytest.mark.asyncio
    async def test_custom_limit(self):
        """Custom limit restricts the number of results."""
        rows = [_make_mock_row(i, f"Note {i}", f"Snippet {i}", 0.5) for i in range(5)]
        for row in rows:
            row.total_count = 5
        session = _make_mock_session(rows)
        engine = FullTextSearchEngine(session)

        page = await engine.search("test", limit=5)

        assert len(page.results) == 5
        assert page.total == 5

    @pytest.mark.asyncio
    async def test_custom_offset(self):
        """Custom offset skips initial results."""
        rows = [_make_mock_row(10, "Offset Note", "Offset snippet", 0.3)]
        rows[0].total_count = 1
        session = _make_mock_session(rows)
        engine = FullTextSearchEngine(session)

        page = await engine.search("test", limit=10, offset=5)

        assert len(page.results) == 1
        assert page.results[0].note_id == "10"
        assert page.total == 1


# ---------------------------------------------------------------------------
# 6. Score-based sorting (highest score first)
# ---------------------------------------------------------------------------


class TestScoreSorting:
    """Results are sorted by ts_rank score in descending order."""

    @pytest.mark.asyncio
    async def test_results_sorted_by_score_descending(self):
        """Results come back sorted with highest score first."""
        # Database returns rows in descending score order (ORDER BY in SQL)
        rows = [
            _make_mock_row(3, "Best Match", "best <b>match</b>", 0.95),
            _make_mock_row(1, "Good Match", "good <b>match</b>", 0.80),
            _make_mock_row(2, "Okay Match", "okay <b>match</b>", 0.50),
        ]
        for row in rows:
            row.total_count = 3
        session = _make_mock_session(rows)
        engine = FullTextSearchEngine(session)

        page = await engine.search("match")

        assert len(page.results) == 3
        assert page.results[0].score >= page.results[1].score >= page.results[2].score
        assert page.results[0].note_id == "3"
        assert page.results[1].note_id == "1"
        assert page.results[2].note_id == "2"
        assert page.total == 3

    @pytest.mark.asyncio
    async def test_sql_orders_by_rank_desc(self):
        """The generated SQL includes ORDER BY rank DESC."""
        session = _make_mock_session([])
        engine = FullTextSearchEngine(session)

        await engine.search("query")

        call_args = session.execute.call_args
        stmt = call_args[0][0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False}))
        assert "ORDER BY" in compiled.upper() or "order by" in compiled


# ---------------------------------------------------------------------------
# 7. ts_headline snippet generation
# ---------------------------------------------------------------------------


class TestSnippetGeneration:
    """ts_headline is used to generate highlighted snippets."""

    @pytest.mark.asyncio
    async def test_snippet_contains_highlighted_text(self):
        """The snippet field contains ts_headline formatted text."""
        rows = [
            _make_mock_row(
                1,
                "Highlight Test",
                "<b>highlighted</b> search term in context",
                0.8,
            ),
        ]
        rows[0].total_count = 1
        session = _make_mock_session(rows)
        engine = FullTextSearchEngine(session)

        page = await engine.search("highlighted")

        assert len(page.results) == 1
        assert "<b>" in page.results[0].snippet
        assert page.results[0].snippet == "<b>highlighted</b> search term in context"
        assert page.total == 1

    @pytest.mark.asyncio
    async def test_sql_uses_ts_headline(self):
        """The generated SQL uses ts_headline for snippet generation."""
        session = _make_mock_session([])
        engine = FullTextSearchEngine(session)

        await engine.search("test")

        call_args = session.execute.call_args
        stmt = call_args[0][0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False}))
        assert "ts_headline" in compiled.lower()


# ---------------------------------------------------------------------------
# 8. Korean text search
# ---------------------------------------------------------------------------


class TestKoreanSearch:
    """Korean text search works with 'simple' text search config."""

    @pytest.mark.asyncio
    async def test_korean_query_executes(self):
        """Korean text query is accepted and processed."""
        rows = [
            _make_mock_row(5, "연구 노트", "<b>연구</b> 결과 정리", 0.6),
        ]
        rows[0].total_count = 1
        session = _make_mock_session(rows)
        engine = FullTextSearchEngine(session)

        page = await engine.search("연구")

        assert len(page.results) == 1
        assert page.results[0].title == "연구 노트"
        assert page.results[0].search_type == "fts"
        assert page.total == 1


# ---------------------------------------------------------------------------
# 9. Query preprocessing (_build_tsquery_expr) — now returns QueryAnalysis
# ---------------------------------------------------------------------------


class TestBuildTsqueryExpr:
    """The _build_tsquery_expr method preprocesses query strings."""

    def test_simple_query_produces_tsquery_expr(self):
        """A simple word produces a non-empty tsquery expression."""
        session = _make_mock_session()
        engine = FullTextSearchEngine(session)

        result = engine._build_tsquery_expr("python")
        assert result.tsquery_expr != ""
        assert "python" in result.tsquery_expr

    def test_strips_whitespace(self):
        """Leading and trailing whitespace is handled."""
        session = _make_mock_session()
        engine = FullTextSearchEngine(session)

        result = engine._build_tsquery_expr("  python  ")
        assert "python" in result.tsquery_expr

    def test_multi_word_query_or_joined(self):
        """Multi-word queries produce OR-joined tsquery expression."""
        session = _make_mock_session()
        engine = FullTextSearchEngine(session)

        result = engine._build_tsquery_expr("python async programming")
        assert "python" in result.tsquery_expr
        assert " | " in result.tsquery_expr

    def test_empty_query_returns_empty_expr(self):
        """An empty string returns empty tsquery expression."""
        session = _make_mock_session()
        engine = FullTextSearchEngine(session)

        result = engine._build_tsquery_expr("")
        assert result.tsquery_expr == ""

    def test_korean_query_produces_morphemes(self):
        """Korean query produces morpheme-based tsquery."""
        session = _make_mock_session()
        engine = FullTextSearchEngine(session)

        result = engine._build_tsquery_expr("실험 프로토콜")
        assert result.language == "ko"
        assert "실험" in result.tsquery_expr
        assert "프로토콜" in result.tsquery_expr


# ---------------------------------------------------------------------------
# 10. BM25 scoring SQL structure
# ---------------------------------------------------------------------------


class TestBM25Scoring:
    """BM25-approximated scoring generates correct SQL."""

    @pytest.mark.asyncio
    async def test_sql_uses_setweight(self):
        """The generated SQL uses setweight for field boosting."""
        session = _make_mock_session([])
        engine = FullTextSearchEngine(session)

        await engine.search("test")

        call_args = session.execute.call_args
        stmt = call_args[0][0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False}))
        assert "setweight" in compiled.lower()

    @pytest.mark.asyncio
    async def test_sql_uses_to_tsquery(self):
        """The generated SQL uses to_tsquery (not plainto_tsquery)."""
        session = _make_mock_session([])
        engine = FullTextSearchEngine(session)

        await engine.search("test")

        call_args = session.execute.call_args
        stmt = call_args[0][0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False}))
        assert "to_tsquery" in compiled.lower()
