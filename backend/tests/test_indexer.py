# @TASK P2-T2.2 - Note indexer tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine
# @TEST tests/test_indexer.py

"""Tests for the NoteIndexer service.

All DB session and EmbeddingService calls are mocked. Tests cover:
1-12: Original tests (updated for new segment-based indexing)
13-16: Context prefix (_build_context_prefix)
17-19: Per-source chunking (attachment/image segments, chunk_type)
20-24: Summary generation (AI router, failure, caching)
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.search.indexer import IndexResult, NoteIndexer

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_session() -> AsyncMock:
    """Create a mock AsyncSession."""
    return AsyncMock()


@pytest.fixture
def mock_embedding_service() -> AsyncMock:
    """Create a mock EmbeddingService."""
    return AsyncMock()


@pytest.fixture
def indexer(mock_session: AsyncMock, mock_embedding_service: AsyncMock) -> NoteIndexer:
    """Create a NoteIndexer with mocked dependencies (no AI router)."""
    return NoteIndexer(session=mock_session, embedding_service=mock_embedding_service)


@pytest.fixture
def mock_ai_router() -> AsyncMock:
    """Create a mock AI router for summary generation."""
    router = AsyncMock()
    response = MagicMock()
    response.content = "This note discusses PCR optimization experiments using gradient thermal cycling."
    router.chat.return_value = response
    return router


@pytest.fixture
def indexer_with_ai(
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
    mock_ai_router: AsyncMock,
) -> NoteIndexer:
    """Create a NoteIndexer with AI router for summary generation."""
    return NoteIndexer(
        session=mock_session,
        embedding_service=mock_embedding_service,
        ai_router=mock_ai_router,
    )


def _make_note(
    note_id: int = 1,
    title: str = "Test Note",
    content_text: str = "This is a test note with some content for embedding.",
    notebook_name: str | None = "분자생물학",
    source_created_at: datetime | None = datetime(2026, 1, 15, tzinfo=UTC),
    synology_note_id: str | None = "note_001",
    summary: str | None = None,
) -> MagicMock:
    """Create a sample Note mock with all required attributes."""
    note = MagicMock()
    note.id = note_id
    note.title = title
    note.content_text = content_text
    note.notebook_name = notebook_name
    note.source_created_at = source_created_at
    note.synology_note_id = synology_note_id
    note.summary = summary
    note.updated_at = datetime(2026, 1, 29, tzinfo=UTC)
    return note


@pytest.fixture
def sample_note() -> MagicMock:
    """Create a sample Note with all metadata fields set."""
    return _make_note()


@pytest.fixture
def sample_note_empty() -> MagicMock:
    """Create a sample Note with empty content_text and title fallback."""
    return _make_note(note_id=2, title="Empty Note", content_text="")


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


def _mock_fetchall(rows):
    """Set up mock_session.execute to return fetchall with rows."""
    mock_result = MagicMock()
    mock_result.fetchall.return_value = rows
    return mock_result


def _setup_index_note_mocks(mock_session, note, attachment_rows=None, image_rows=None):
    """Set up mock_session.execute side effects for index_note.

    index_note calls execute 3 times:
    1. _get_note: SELECT note
    2. _get_attachment_segments: SELECT attachments
    3. _get_image_segments: SELECT images (only if synology_note_id is set)
    """
    effects = [
        _mock_scalar_one_or_none(note),
        _mock_fetchall(attachment_rows or []),
    ]
    if note.synology_note_id:
        effects.append(_mock_fetchall(image_rows or []))
    mock_session.execute.side_effect = effects


# ---------------------------------------------------------------------------
# 1. Single note indexing success (with context prefix)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_note_success(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
    sample_note: MagicMock,
    sample_embeddings: list[tuple[str, list[float]]],
):
    """index_note should prepend context prefix and create NoteEmbedding records."""
    _setup_index_note_mocks(mock_session, sample_note)
    mock_embedding_service.embed_chunks.return_value = sample_embeddings

    result = await indexer.index_note(note_id=1)

    assert result == 2  # 2 embeddings created
    # Verify embed_chunks received text WITH context prefix
    called_text = mock_embedding_service.embed_chunks.call_args[0][0]
    assert called_text.startswith("[Note: Test Note | Notebook: 분자생물학 | Date: 2026-01-15]")
    assert "This is a test note" in called_text
    # Verify session.add was called for each embedding
    assert mock_session.add.call_count == 2
    mock_session.flush.assert_awaited_once()


# ---------------------------------------------------------------------------
# 2. Empty content_text note uses title fallback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_note_empty_content(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
    sample_note_empty: MagicMock,
):
    """index_note with empty content but non-empty title should still index."""
    _setup_index_note_mocks(mock_session, sample_note_empty)
    vec = [0.01] * 1536
    mock_embedding_service.embed_chunks.return_value = [("Empty Note", vec)]

    result = await indexer.index_note(note_id=2)

    # Title fallback means it indexes using the title
    assert result == 1
    called_text = mock_embedding_service.embed_chunks.call_args[0][0]
    assert "Empty Note" in called_text


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
    note1 = _make_note(note_id=1, content_text="Content for note 1")
    note2 = _make_note(note_id=2, content_text="Content for note 2")
    vec = [0.01] * 1536

    with patch.object(indexer, "needs_indexing", new_callable=AsyncMock, return_value=True):
        mock_session.execute.side_effect = [
            # note1: get_note, attachments, images
            _mock_scalar_one_or_none(note1),
            _mock_fetchall([]),
            _mock_fetchall([]),
            # note2: get_note, attachments, images
            _mock_scalar_one_or_none(note2),
            _mock_fetchall([]),
            _mock_fetchall([]),
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
    note1 = _make_note(note_id=1, content_text="Content for note 1")
    vec = [0.01] * 1536

    with patch.object(indexer, "needs_indexing", new_callable=AsyncMock, return_value=True):
        mock_session.execute.side_effect = [
            # note1 succeeds: get_note, attachments, images
            _mock_scalar_one_or_none(note1),
            _mock_fetchall([]),
            _mock_fetchall([]),
            # note2 not found -> ValueError
            _mock_scalar_one_or_none(None),
        ]
        mock_embedding_service.embed_chunks.return_value = [("chunk1", vec)]

        result = await indexer.index_notes(note_ids=[1, 2])

    assert result.indexed == 1
    assert result.failed == 1
    assert result.total_embeddings == 1


# ---------------------------------------------------------------------------
# 12. index_note with whitespace-only content_text and empty title
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_note_whitespace_content(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
):
    """index_note should return 0 for notes with whitespace-only content and empty title."""
    note = _make_note(note_id=3, title="", content_text="   \n\t  ")

    _setup_index_note_mocks(mock_session, note)

    result = await indexer.index_note(note_id=3)

    assert result == 0
    mock_embedding_service.embed_chunks.assert_not_awaited()


# ---------------------------------------------------------------------------
# 13. Context prefix: all fields present
# ---------------------------------------------------------------------------


def test_build_context_prefix_all_fields():
    """Prefix should include Note, Notebook, and Date when all fields are present."""
    note = _make_note()
    prefix = NoteIndexer._build_context_prefix(note)
    assert prefix == "[Note: Test Note | Notebook: 분자생물학 | Date: 2026-01-15]\n"


# ---------------------------------------------------------------------------
# 14. Context prefix: missing notebook_name
# ---------------------------------------------------------------------------


def test_build_context_prefix_no_notebook():
    """Prefix should omit Notebook when notebook_name is None."""
    note = _make_note(notebook_name=None)
    prefix = NoteIndexer._build_context_prefix(note)
    assert prefix == "[Note: Test Note | Date: 2026-01-15]\n"
    assert "Notebook" not in prefix


# ---------------------------------------------------------------------------
# 15. Context prefix: missing source_created_at
# ---------------------------------------------------------------------------


def test_build_context_prefix_no_date():
    """Prefix should omit Date when source_created_at is None."""
    note = _make_note(source_created_at=None)
    prefix = NoteIndexer._build_context_prefix(note)
    assert prefix == "[Note: Test Note | Notebook: 분자생물학]\n"
    assert "Date" not in prefix


# ---------------------------------------------------------------------------
# 16. Context prefix: empty note (no metadata)
# ---------------------------------------------------------------------------


def test_build_context_prefix_empty():
    """Prefix should be empty string when no metadata is available."""
    note = _make_note(title="", notebook_name=None, source_created_at=None)
    prefix = NoteIndexer._build_context_prefix(note)
    assert prefix == ""


# ---------------------------------------------------------------------------
# 17. Per-source chunking: attachment segments
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_attachment_segments(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
):
    """_get_attachment_segments should return per-file (text, type) tuples."""
    rows = [
        ("PDF content here", "report.pdf"),
        ("HWP content here", "paper.hwp"),
        ("Word content", "doc.docx"),
    ]
    mock_session.execute.return_value = _mock_fetchall(rows)

    segments = await indexer._get_attachment_segments(note_id=1)

    assert len(segments) == 3
    assert segments[0] == ("[PDF: report.pdf]\nPDF content here", "pdf")
    assert segments[1] == ("[HWP: paper.hwp]\nHWP content here", "hwp")
    assert segments[2] == ("[DOCX: doc.docx]\nWord content", "docx")


# ---------------------------------------------------------------------------
# 18. Per-source chunking: image segments
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_image_segments(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
):
    """_get_image_segments should return per-image (text, type) tuples."""
    note = _make_note()
    rows = [
        ("OCR extracted text", "Vision analysis desc", "photo.png"),
        (None, "Another vision desc", "diagram.jpg"),
    ]
    mock_session.execute.return_value = _mock_fetchall(rows)

    segments = await indexer._get_image_segments(note)

    assert len(segments) == 3  # OCR + Vision for photo, Vision for diagram
    assert segments[0] == ("[OCR: photo.png]\nOCR extracted text", "ocr")
    assert segments[1] == ("[Vision: photo.png]\nVision analysis desc", "vision")
    assert segments[2] == ("[Vision: diagram.jpg]\nAnother vision desc", "vision")


# ---------------------------------------------------------------------------
# 19. Per-source chunking: chunk_type in NoteEmbedding records
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_note_with_attachments_and_images(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
):
    """index_note should set chunk_type per segment in NoteEmbedding records."""
    note = _make_note()
    vec = [0.01] * 1536

    mock_session.execute.side_effect = [
        _mock_scalar_one_or_none(note),
        _mock_fetchall([("PDF text", "report.pdf")]),  # 1 attachment
        _mock_fetchall([("OCR text", None, "photo.png")]),  # 1 OCR image
    ]
    # 3 segments: content + pdf + ocr, each producing 1 chunk
    mock_embedding_service.embed_chunks.side_effect = [
        [("content chunk", vec)],
        [("pdf chunk", vec)],
        [("ocr chunk", vec)],
    ]

    result = await indexer.index_note(note_id=1)

    assert result == 3
    # Verify chunk_type was set on each NoteEmbedding
    add_calls = mock_session.add.call_args_list
    assert add_calls[0][0][0].chunk_type == "content"
    assert add_calls[1][0][0].chunk_type == "pdf"
    assert add_calls[2][0][0].chunk_type == "ocr"


# ---------------------------------------------------------------------------
# 20. Summary generation with AI router
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_note_with_summary(
    indexer_with_ai: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
    mock_ai_router: AsyncMock,
):
    """index_note should generate AI summary when router is available."""
    note = _make_note(summary=None)
    vec = [0.01] * 1536

    _setup_index_note_mocks(mock_session, note)
    mock_embedding_service.embed_chunks.side_effect = [
        [("content chunk", vec)],  # main content
        [("summary chunk", vec)],  # summary embedding
    ]

    result = await indexer_with_ai.index_note(note_id=1)

    assert result == 2  # 1 content + 1 summary
    mock_ai_router.chat.assert_awaited_once()
    # Summary should be cached on the note
    assert note.summary == "This note discusses PCR optimization experiments using gradient thermal cycling."
    # Last add call should be summary chunk with chunk_index=-1
    summary_record = mock_session.add.call_args_list[-1][0][0]
    assert summary_record.chunk_type == "summary"
    assert summary_record.chunk_index == -1


# ---------------------------------------------------------------------------
# 21. Summary generation failure is non-fatal
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_note_summary_failure_nonfatal(
    indexer_with_ai: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
    mock_ai_router: AsyncMock,
):
    """Summary generation failure should not prevent indexing."""
    note = _make_note(summary=None)
    vec = [0.01] * 1536

    _setup_index_note_mocks(mock_session, note)
    mock_embedding_service.embed_chunks.return_value = [("content chunk", vec)]
    mock_ai_router.chat.side_effect = RuntimeError("API unavailable")

    result = await indexer_with_ai.index_note(note_id=1)

    assert result == 1  # Only content chunk, no summary
    assert note.summary is None


# ---------------------------------------------------------------------------
# 22. Summary skipped when already cached
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_note_summary_cached(
    indexer_with_ai: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
    mock_ai_router: AsyncMock,
):
    """index_note should skip summary generation when note.summary already exists."""
    note = _make_note(summary="Existing cached summary")
    vec = [0.01] * 1536

    _setup_index_note_mocks(mock_session, note)
    mock_embedding_service.embed_chunks.return_value = [("content chunk", vec)]

    result = await indexer_with_ai.index_note(note_id=1)

    assert result == 1  # Only content chunk
    mock_ai_router.chat.assert_not_awaited()


# ---------------------------------------------------------------------------
# 23. Indexer without AI router skips summary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_note_no_ai_router(
    indexer: NoteIndexer,
    mock_session: AsyncMock,
    mock_embedding_service: AsyncMock,
):
    """index_note without AI router should not attempt summary generation."""
    note = _make_note(summary=None)
    vec = [0.01] * 1536

    _setup_index_note_mocks(mock_session, note)
    mock_embedding_service.embed_chunks.return_value = [("content chunk", vec)]

    result = await indexer.index_note(note_id=1)

    assert result == 1
    assert note.summary is None


# ---------------------------------------------------------------------------
# 24. _detect_attachment_type mapping
# ---------------------------------------------------------------------------


def test_detect_attachment_type():
    """_detect_attachment_type should map file suffixes correctly."""
    assert NoteIndexer._detect_attachment_type("report.pdf") == "pdf"
    assert NoteIndexer._detect_attachment_type("paper.hwp") == "hwp"
    assert NoteIndexer._detect_attachment_type("paper.hwpx") == "hwp"
    assert NoteIndexer._detect_attachment_type("doc.docx") == "docx"
    assert NoteIndexer._detect_attachment_type("doc.doc") == "docx"
    assert NoteIndexer._detect_attachment_type("data.csv") == "file"
    assert NoteIndexer._detect_attachment_type(None) == "file"
