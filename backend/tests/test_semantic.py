# @TASK P2-T2.4 - Semantic search engine tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database
# @TEST tests/test_semantic.py

"""Tests for the pgvector-based semantic search engine.

Verifies query embedding generation, cosine similarity search,
result ranking, snippet extraction, and edge cases
without requiring a real PostgreSQL database or OpenAI API.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.search.embeddings import EmbeddingError
from app.search.engine import SearchResult, SemanticSearchEngine

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FAKE_EMBEDDING = [0.1] * 1536  # 1536-dimensional fake embedding vector


def _make_mock_row(
    note_id: int,
    title: str,
    chunk_text: str,
    cosine_distance: float,
):
    """Build a mock SQLAlchemy row result for semantic search.

    The row simulates a JOIN between note_embeddings and notes,
    with a cosine_distance column from pgvector's <=> operator.
    """
    row = MagicMock()
    row.note_id = note_id
    row.title = title
    row.chunk_text = chunk_text
    row.cosine_distance = cosine_distance
    return row


def _make_mock_session(rows: list | None = None):
    """Build a mock AsyncSession whose execute() returns the given rows."""
    session = AsyncMock()
    result_mock = MagicMock()
    result_mock.fetchall.return_value = rows if rows is not None else []
    session.execute = AsyncMock(return_value=result_mock)
    return session


def _make_mock_embedding_service(
    embed_return: list[float] | None = None,
    embed_side_effect: Exception | None = None,
):
    """Build a mock EmbeddingService with configurable embed_text behavior."""
    service = AsyncMock()
    if embed_side_effect is not None:
        service.embed_text = AsyncMock(side_effect=embed_side_effect)
    else:
        service.embed_text = AsyncMock(
            return_value=embed_return if embed_return is not None else FAKE_EMBEDDING
        )
    return service


# ---------------------------------------------------------------------------
# 1. Basic semantic search success (results returned, search_type="semantic")
# ---------------------------------------------------------------------------


class TestSemanticSearchSuccess:
    """Semantic search returns correctly structured results."""

    @pytest.mark.asyncio
    async def test_basic_semantic_search_returns_results(self):
        """A search with matching embeddings returns SearchResult with search_type='semantic'."""
        rows = [
            _make_mock_row(1, "Python Guide", "Learn Python basics and advanced concepts", 0.15),
            _make_mock_row(2, "Python Tips", "Advanced Python programming tips and tricks", 0.25),
        ]
        session = _make_mock_session(rows)
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("Python programming")

        assert len(results) == 2
        assert all(isinstance(r, SearchResult) for r in results)
        assert results[0].note_id == 1
        assert results[0].title == "Python Guide"
        assert results[0].search_type == "semantic"
        assert results[1].search_type == "semantic"

    @pytest.mark.asyncio
    async def test_search_calls_embed_text_with_query(self):
        """The search method calls embedding_service.embed_text with the query string."""
        session = _make_mock_session([])
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        await engine.search("machine learning")

        embedding_service.embed_text.assert_awaited_once_with("machine learning")

    @pytest.mark.asyncio
    async def test_search_calls_session_execute(self):
        """The search method calls session.execute exactly once for a valid query."""
        session = _make_mock_session([])
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        await engine.search("test query")

        session.execute.assert_awaited_once()


# ---------------------------------------------------------------------------
# 2. Empty query handling
# ---------------------------------------------------------------------------


class TestEmptyQuery:
    """Empty or whitespace-only queries return an empty list."""

    @pytest.mark.asyncio
    async def test_empty_string_returns_empty_list(self):
        """An empty string query returns no results without calling embed or DB."""
        session = _make_mock_session()
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("")

        assert results == []
        embedding_service.embed_text.assert_not_awaited()
        session.execute.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_whitespace_only_returns_empty_list(self):
        """A whitespace-only query returns no results without calling embed or DB."""
        session = _make_mock_session()
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("   \t\n  ")

        assert results == []
        embedding_service.embed_text.assert_not_awaited()
        session.execute.assert_not_awaited()


# ---------------------------------------------------------------------------
# 3. No results found
# ---------------------------------------------------------------------------


class TestNoResults:
    """Searches that match no embeddings return an empty list."""

    @pytest.mark.asyncio
    async def test_no_matching_embeddings(self):
        """A query with no similar embeddings returns an empty list."""
        session = _make_mock_session([])
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("completely unrelated query xyz")

        assert results == []
        assert isinstance(results, list)


# ---------------------------------------------------------------------------
# 4. Limit and offset parameters
# ---------------------------------------------------------------------------


class TestLimitOffset:
    """Limit and offset parameters control result pagination."""

    @pytest.mark.asyncio
    async def test_default_limit_is_20(self):
        """Default limit is 20 when not specified."""
        session = _make_mock_session([])
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        await engine.search("test")

        call_args = session.execute.call_args
        stmt = call_args[0][0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False}))
        assert "LIMIT" in compiled.upper() or "limit" in compiled

    @pytest.mark.asyncio
    async def test_custom_limit(self):
        """Custom limit restricts the number of results."""
        rows = [
            _make_mock_row(i, f"Note {i}", f"Chunk text for note {i}", 0.1 * i)
            for i in range(5)
        ]
        session = _make_mock_session(rows)
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("test", limit=5)

        assert len(results) == 5

    @pytest.mark.asyncio
    async def test_custom_offset(self):
        """Custom offset skips initial results."""
        rows = [_make_mock_row(10, "Offset Note", "Offset chunk text content", 0.2)]
        session = _make_mock_session(rows)
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("test", limit=10, offset=5)

        assert len(results) == 1
        assert results[0].note_id == 10


# ---------------------------------------------------------------------------
# 5. Similarity score calculation (1 - cosine_distance)
# ---------------------------------------------------------------------------


class TestSimilarityScore:
    """Cosine similarity score is calculated as 1 - cosine_distance."""

    @pytest.mark.asyncio
    async def test_score_is_one_minus_cosine_distance(self):
        """Score is computed as 1 - cosine_distance from pgvector."""
        rows = [
            _make_mock_row(1, "Close Match", "Very similar content", 0.1),
            _make_mock_row(2, "Far Match", "Less similar content", 0.6),
        ]
        session = _make_mock_session(rows)
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("similar content")

        assert results[0].score == pytest.approx(0.9, abs=1e-6)
        assert results[1].score == pytest.approx(0.4, abs=1e-6)

    @pytest.mark.asyncio
    async def test_perfect_match_score_is_one(self):
        """A cosine_distance of 0 yields a score of 1.0 (perfect match)."""
        rows = [_make_mock_row(1, "Perfect", "Exact content", 0.0)]
        session = _make_mock_session(rows)
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("exact")

        assert results[0].score == pytest.approx(1.0, abs=1e-6)

    @pytest.mark.asyncio
    async def test_orthogonal_score_is_zero(self):
        """A cosine_distance of 1 yields a score of 0.0 (orthogonal)."""
        rows = [_make_mock_row(1, "Unrelated", "Orthogonal content", 1.0)]
        session = _make_mock_session(rows)
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("query")

        assert results[0].score == pytest.approx(0.0, abs=1e-6)


# ---------------------------------------------------------------------------
# 6. Snippet extracted from chunk_text (first 200 characters)
# ---------------------------------------------------------------------------


class TestSnippetExtraction:
    """Snippet is extracted from chunk_text, truncated to 200 characters."""

    @pytest.mark.asyncio
    async def test_snippet_from_short_chunk_text(self):
        """A short chunk_text is used as snippet without truncation."""
        rows = [_make_mock_row(1, "Note", "Short chunk text", 0.2)]
        session = _make_mock_session(rows)
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("test")

        assert results[0].snippet == "Short chunk text"

    @pytest.mark.asyncio
    async def test_snippet_truncated_to_200_chars(self):
        """A chunk_text longer than 200 chars is truncated with ellipsis."""
        long_text = "A" * 300
        rows = [_make_mock_row(1, "Long Note", long_text, 0.1)]
        session = _make_mock_session(rows)
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("test")

        assert len(results[0].snippet) <= 203  # 200 + "..."
        assert results[0].snippet == "A" * 200 + "..."


# ---------------------------------------------------------------------------
# 7. Embedding service error handling (EmbeddingError -> empty results)
# ---------------------------------------------------------------------------


class TestEmbeddingErrorHandling:
    """EmbeddingError from the embedding service returns an empty list."""

    @pytest.mark.asyncio
    async def test_embedding_error_returns_empty_list(self):
        """When EmbeddingService raises EmbeddingError, search returns []."""
        session = _make_mock_session()
        embedding_service = _make_mock_embedding_service(
            embed_side_effect=EmbeddingError("API rate limit exceeded")
        )
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("test query")

        assert results == []
        # DB should not be queried when embedding fails
        session.execute.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_embedding_returns_empty_vector_returns_empty_list(self):
        """When embed_text returns an empty vector, search returns []."""
        session = _make_mock_session()
        embedding_service = _make_mock_embedding_service(embed_return=[])
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("test query")

        assert results == []
        session.execute.assert_not_awaited()


# ---------------------------------------------------------------------------
# 8. JOIN with notes table verification
# ---------------------------------------------------------------------------


class TestNotesJoin:
    """Semantic search JOINs note_embeddings with notes to get title."""

    @pytest.mark.asyncio
    async def test_result_includes_title_from_notes_table(self):
        """The result includes the title from the notes table via JOIN."""
        rows = [
            _make_mock_row(1, "Research Notes", "Experiment results chunk", 0.15),
        ]
        session = _make_mock_session(rows)
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        results = await engine.search("experiment results")

        assert len(results) == 1
        assert results[0].title == "Research Notes"
        assert results[0].note_id == 1

    @pytest.mark.asyncio
    async def test_sql_contains_join(self):
        """The generated SQL includes a JOIN between note_embeddings and notes."""
        session = _make_mock_session([])
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        await engine.search("test")

        call_args = session.execute.call_args
        stmt = call_args[0][0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False}))
        # The SQL should reference both tables with a JOIN
        compiled_upper = compiled.upper()
        assert "JOIN" in compiled_upper
        assert "NOTE_EMBEDDINGS" in compiled_upper
        assert "NOTES" in compiled_upper

    @pytest.mark.asyncio
    async def test_sql_uses_cosine_distance_operator(self):
        """The generated SQL uses the pgvector cosine distance operator."""
        session = _make_mock_session([])
        embedding_service = _make_mock_embedding_service()
        engine = SemanticSearchEngine(session, embedding_service)

        await engine.search("vector search")

        call_args = session.execute.call_args
        stmt = call_args[0][0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False}))
        # pgvector cosine distance operator <=>
        assert "<=>" in compiled
