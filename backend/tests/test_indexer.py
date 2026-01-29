# @TASK P2-T2.2 - Note indexer tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine
# @TEST tests/test_indexer.py

"""Tests for the NoteIndexer service.

All DB session and EmbeddingService calls are mocked. Tests cover:
1. Single note indexing success
2. Empty content_text note is skipped
3. Note not found raises error
4. Batch indexing (multiple notes)
5. Existing embeddings cause skip
6. reindex_note: delete then recreate
7. delete_embeddings success
8. needs_indexing: no embeddings -> True
9. needs_indexing: has embeddings -> False
10. IndexResult aggregation
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.search.indexer import IndexResult, NoteIndexer


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_session() -> AsyncMock:
    """Create a mock AsyncSession."""
    session = AsyncMock()
    return session


@pytest.fixture
def mock_embedding_service() -> AsyncMock:
    """Create a mock EmbeddingService."""
    service = AsyncMock()
    return service


@pytest.fixture
def indexer(mock_session: AsyncMock, mock_embedding_service: AsyncMock) -> NoteIndexer:
    """Create a NoteIndexer with mocked dependencies."""
    return NoteIndexer(session=mock_session, embedding_service=mock_embedding_service)


@pytest.fixture
def sample_note() -> MagicMock:
    """Create a sample Note object with content."""
    note = MagicMock()
    note.id = 1
    note.title = "Test Note"
    note.content_text = "This is a test note with some content for embedding."
    note.updated_at = datetime(2026, 1, 29, tzinfo=timezone.utc)
    return note


@pytest.fixture
def sample_note_empty() -> MagicMock:
    """Create a sample Note object with empty content_text."""
    note = MagicMock()
    note.id = 2
    note.title = "Empty Note"
    note.content_text = ""
    note.updated_at = datetime(2026, 1, 29, tzinfo=timezone.utc)
    return note


@pytest.fixture
def sample_embeddings() -> list[tuple[str, list[float]]]:
    """Return sample (chunk_text, embedding) tuples."""
    vec = [0.01 * i for i in range(1536)]
    return [
        ("This is a test note", vec),
        ("with some content for embedding.", vec),
    ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_scalar_one_or_none(result_value):
    """Set up mock_session.execute to return scalar_one_or_none with a value."""
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = result_value
    return mock_result


def _mock_scalar(result_value):
    """Set up mock_session.execute to return scalar with a value."""
    mock_result = MagicMock()
    mock_result.scalar.return_value = result_value
    return mock_result


# ---------------------------------------------------------------------------
# 1. Single note indexing success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_note_success(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
    sample_note: MagicMock,
    sample_embeddings: list[tuple[str, list[float]]],
):
    """index_note should create NoteEmbedding records for each chunk."""
    # Mock: session.execute for Note query returns the sample note
    mock_session.execute.return_value = _mock_scalar_one_or_none(sample_note)
    # Mock: embed_chunks returns 2 chunks
    mock_embedding_service.embed_chunks.return_value = sample_embeddings

    result = await indexer.index_note(note_id=1)

    assert result == 2  # 2 embeddings created
    mock_embedding_service.embed_chunks.assert_awaited_once_with(sample_note.content_text)
    # Verify session.add was called for each embedding
    assert mock_session.add.call_count == 2
    mock_session.flush.assert_awaited_once()


# ---------------------------------------------------------------------------
# 2. Empty content_text note is skipped
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_note_empty_content(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
    sample_note_empty: MagicMock,
):
    """index_note should return 0 for notes with empty content_text."""
    mock_session.execute.return_value = _mock_scalar_one_or_none(sample_note_empty)

    result = await indexer.index_note(note_id=2)

    assert result == 0
    mock_embedding_service.embed_chunks.assert_not_awaited()


# ---------------------------------------------------------------------------
# 3. Note not found raises error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_note_not_found(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
):
    """index_note should raise ValueError when the note does not exist."""
    mock_session.execute.return_value = _mock_scalar_one_or_none(None)

    with pytest.raises(ValueError, match="Note .* not found"):
        await indexer.index_note(note_id=999)


# ---------------------------------------------------------------------------
# 4. Batch indexing (multiple notes)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_notes_batch(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
):
    """index_notes should index multiple notes and return IndexResult."""
    # Create two notes with content
    note1 = MagicMock()
    note1.id = 1
    note1.content_text = "Content for note 1"
    note1.updated_at = datetime(2026, 1, 29, tzinfo=timezone.utc)

    note2 = MagicMock()
    note2.id = 2
    note2.content_text = "Content for note 2"
    note2.updated_at = datetime(2026, 1, 29, tzinfo=timezone.utc)

    vec = [0.01] * 1536

    # Mock needs_indexing to return True for both notes
    with patch.object(indexer, "needs_indexing", new_callable=AsyncMock, return_value=True):
        # Mock session.execute: first call for note1, second for note2
        mock_session.execute.side_effect = [
            _mock_scalar_one_or_none(note1),
            _mock_scalar_one_or_none(note2),
        ]
        mock_embedding_service.embed_chunks.side_effect = [
            [("chunk1", vec)],
            [("chunk2a", vec), ("chunk2b", vec)],
        ]

        result = await indexer.index_notes(note_ids=[1, 2])

    assert isinstance(result, IndexResult)
    assert result.indexed == 2
    assert result.skipped == 0
    assert result.failed == 0
    assert result.total_embeddings == 3


# ---------------------------------------------------------------------------
# 5. Existing embeddings cause skip
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_notes_skip_existing(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
):
    """index_notes should skip notes that already have embeddings."""
    # needs_indexing returns False -> note is skipped
    with patch.object(indexer, "needs_indexing", new_callable=AsyncMock, return_value=False):
        result = await indexer.index_notes(note_ids=[1])

    assert result.indexed == 0
    assert result.skipped == 1
    assert result.total_embeddings == 0
    mock_embedding_service.embed_chunks.assert_not_awaited()


# ---------------------------------------------------------------------------
# 6. reindex_note: delete then recreate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reindex_note(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
    sample_note: MagicMock,
    sample_embeddings: list[tuple[str, list[float]]],
):
    """reindex_note should delete existing embeddings and re-create them."""
    with (
        patch.object(indexer, "delete_embeddings", new_callable=AsyncMock, return_value=3) as mock_delete,
        patch.object(indexer, "index_note", new_callable=AsyncMock, return_value=2) as mock_index,
    ):
        result = await indexer.reindex_note(note_id=1)

        assert result == 2
        mock_delete.assert_awaited_once_with(1)
        mock_index.assert_awaited_once_with(1)


# ---------------------------------------------------------------------------
# 7. delete_embeddings success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_embeddings(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
):
    """delete_embeddings should remove all embeddings for a note_id."""
    # Mock the execute result to return rowcount
    mock_result = MagicMock()
    mock_result.rowcount = 5
    mock_session.execute.return_value = mock_result

    result = await indexer.delete_embeddings(note_id=1)

    assert result == 5
    mock_session.execute.assert_awaited_once()


# ---------------------------------------------------------------------------
# 8. needs_indexing: no embeddings -> True
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_needs_indexing_no_embeddings(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
):
    """needs_indexing should return True when no embeddings exist for the note."""
    mock_session.execute.return_value = _mock_scalar(0)

    result = await indexer.needs_indexing(note_id=1)

    assert result is True


# ---------------------------------------------------------------------------
# 9. needs_indexing: has embeddings -> False
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_needs_indexing_has_embeddings(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
):
    """needs_indexing should return False when embeddings exist for the note."""
    mock_session.execute.return_value = _mock_scalar(3)

    result = await indexer.needs_indexing(note_id=1)

    assert result is False


# ---------------------------------------------------------------------------
# 10. IndexResult aggregation
# ---------------------------------------------------------------------------


def test_index_result_defaults():
    """IndexResult should have correct default values."""
    result = IndexResult()
    assert result.indexed == 0
    assert result.skipped == 0
    assert result.failed == 0
    assert result.total_embeddings == 0


def test_index_result_custom_values():
    """IndexResult should hold custom aggregated values."""
    result = IndexResult(indexed=5, skipped=2, failed=1, total_embeddings=15)
    assert result.indexed == 5
    assert result.skipped == 2
    assert result.failed == 1
    assert result.total_embeddings == 15


# ---------------------------------------------------------------------------
# 11. Batch indexing with failures
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_notes_with_failure(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
):
    """index_notes should count failures without stopping the batch."""
    note1 = MagicMock()
    note1.id = 1
    note1.content_text = "Content for note 1"
    note1.updated_at = datetime(2026, 1, 29, tzinfo=timezone.utc)

    vec = [0.01] * 1536

    with patch.object(indexer, "needs_indexing", new_callable=AsyncMock, return_value=True):
        # First note succeeds, second raises
        mock_session.execute.side_effect = [
            _mock_scalar_one_or_none(note1),
            _mock_scalar_one_or_none(None),  # Note 2 not found -> ValueError
        ]
        mock_embedding_service.embed_chunks.return_value = [("chunk1", vec)]

        result = await indexer.index_notes(note_ids=[1, 2])

    assert result.indexed == 1
    assert result.failed == 1
    assert result.total_embeddings == 1


# ---------------------------------------------------------------------------
# 12. index_note with whitespace-only content_text
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_note_whitespace_content(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
):
    """index_note should return 0 for notes with whitespace-only content."""
    note = MagicMock()
    note.id = 3
    note.content_text = "   \n\t  "
    note.updated_at = datetime(2026, 1, 29, tzinfo=timezone.utc)

    mock_session.execute.return_value = _mock_scalar_one_or_none(note)

    result = await indexer.index_note(note_id=3)

    assert result == 0
    mock_embedding_service.embed_chunks.assert_not_awaited()
