# @TASK P2-T2.1 - Embedding service tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine
# @TEST tests/test_embeddings.py

"""Tests for the EmbeddingService.

All OpenAI API calls are mocked. Tests cover:
1. Single text embedding
2. Batch text embedding
3. Chunk splitting (short text -> 1 chunk)
4. Chunk splitting (long text -> multiple chunks with overlap)
5. Empty text handling
6. API error handling (EmbeddingError)
7. embed_chunks integration
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.search.embeddings import EmbeddingError, EmbeddingService

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def embedding_service() -> EmbeddingService:
    """Create an EmbeddingService with a dummy API key."""
    return EmbeddingService(api_key="test-api-key-fake")


@pytest.fixture
def sample_embedding_1536() -> list[float]:
    """Return a deterministic 1536-dimensional embedding vector."""
    return [0.01 * i for i in range(1536)]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_openai_response(embeddings: list[list[float]]):
    """Build a fake OpenAI embeddings.create() response object."""
    data = []
    for idx, emb in enumerate(embeddings):
        item = MagicMock()
        item.embedding = emb
        item.index = idx
        data.append(item)
    response = MagicMock()
    response.data = data
    return response


# ---------------------------------------------------------------------------
# 1. Single text embedding
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_embed_text_single(embedding_service: EmbeddingService, sample_embedding_1536: list[float]):
    """embed_text should return a list[float] of length 1536."""
    fake_response = _make_openai_response([sample_embedding_1536])

    with patch.object(
        embedding_service._client.embeddings, "create", new_callable=AsyncMock, return_value=fake_response
    ):
        result = await embedding_service.embed_text("Hello world")

    assert isinstance(result, list)
    assert len(result) == 1536
    assert result == sample_embedding_1536


# ---------------------------------------------------------------------------
# 2. Batch text embedding
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_embed_texts_batch(embedding_service: EmbeddingService, sample_embedding_1536: list[float]):
    """embed_texts should return one embedding per input text."""
    vec_a = sample_embedding_1536
    vec_b = [x + 1.0 for x in sample_embedding_1536]
    fake_response = _make_openai_response([vec_a, vec_b])

    with patch.object(
        embedding_service._client.embeddings, "create", new_callable=AsyncMock, return_value=fake_response
    ):
        result = await embedding_service.embed_texts(["text one", "text two"])

    assert len(result) == 2
    assert result[0] == vec_a
    assert result[1] == vec_b


# ---------------------------------------------------------------------------
# 3. Chunk splitting - short text (fits in one chunk)
# ---------------------------------------------------------------------------


def test_chunk_text_short(embedding_service: EmbeddingService):
    """A short text (< chunk_size tokens) should produce exactly 1 chunk."""
    short_text = "This is a short text."
    chunks = embedding_service.chunk_text(short_text, chunk_size=500, overlap=50)

    assert len(chunks) == 1
    assert chunks[0] == short_text


# ---------------------------------------------------------------------------
# 4. Chunk splitting - long text (multiple chunks with overlap)
# ---------------------------------------------------------------------------


def test_chunk_text_long_with_overlap(embedding_service: EmbeddingService):
    """A long text should be split into multiple chunks with token overlap."""
    # Create a text that is guaranteed to exceed 500 tokens.
    # Average English word is ~1.3 tokens; 800 words should be ~1000+ tokens.
    long_text = " ".join(f"word{i}" for i in range(800))
    chunks = embedding_service.chunk_text(long_text, chunk_size=500, overlap=50)

    assert len(chunks) >= 2, f"Expected >=2 chunks, got {len(chunks)}"

    # Verify overlap: the end of chunk[0] and start of chunk[1] should share tokens
    # We verify this by checking that the last part of chunk 0 appears in chunk 1
    # (Since we have overlap=50 tokens, the overlap should be present)
    import tiktoken

    enc = tiktoken.encoding_for_model("text-embedding-3-small")
    tokens_chunk0 = enc.encode(chunks[0])
    tokens_chunk1 = enc.encode(chunks[1])

    # The first 50 tokens of chunk1 should equal the last 50 tokens of chunk0
    assert tokens_chunk0[-50:] == tokens_chunk1[:50], "Overlap tokens should match between consecutive chunks"


# ---------------------------------------------------------------------------
# 5. Empty text handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_embed_text_empty(embedding_service: EmbeddingService):
    """embed_text with empty string should return an empty list."""
    result = await embedding_service.embed_text("")
    assert result == []


@pytest.mark.asyncio
async def test_embed_texts_empty_list(embedding_service: EmbeddingService):
    """embed_texts with an empty list should return an empty list."""
    result = await embedding_service.embed_texts([])
    assert result == []


def test_chunk_text_empty(embedding_service: EmbeddingService):
    """chunk_text with empty string should return an empty list."""
    chunks = embedding_service.chunk_text("")
    assert chunks == []


# ---------------------------------------------------------------------------
# 6. API error handling (EmbeddingError)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_embed_text_api_error(embedding_service: EmbeddingService):
    """embed_text should raise EmbeddingError on OpenAI API failures."""
    from openai import APIError

    api_error = APIError(
        message="Rate limit exceeded",
        request=MagicMock(),
        body=None,
    )

    with patch.object(
        embedding_service._client.embeddings, "create", new_callable=AsyncMock, side_effect=api_error
    ), pytest.raises(EmbeddingError, match="Rate limit exceeded"):
        await embedding_service.embed_text("Hello world")


@pytest.mark.asyncio
async def test_embed_texts_api_error(embedding_service: EmbeddingService):
    """embed_texts should raise EmbeddingError on OpenAI API failures."""
    from openai import APIError

    api_error = APIError(
        message="Server error",
        request=MagicMock(),
        body=None,
    )

    with patch.object(
        embedding_service._client.embeddings, "create", new_callable=AsyncMock, side_effect=api_error
    ), pytest.raises(EmbeddingError, match="Server error"):
        await embedding_service.embed_texts(["Hello"])


# ---------------------------------------------------------------------------
# 7. embed_chunks integration test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_embed_chunks_integration(embedding_service: EmbeddingService, sample_embedding_1536: list[float]):
    """embed_chunks should chunk text, embed each chunk, and return (text, embedding) tuples."""
    # Use a short text so it produces exactly 1 chunk
    short_text = "This is a short note about laboratory experiments."
    fake_response = _make_openai_response([sample_embedding_1536])

    with patch.object(
        embedding_service._client.embeddings, "create", new_callable=AsyncMock, return_value=fake_response
    ):
        result = await embedding_service.embed_chunks(short_text)

    assert len(result) == 1
    chunk_text, embedding = result[0]
    assert chunk_text == short_text
    assert len(embedding) == 1536


@pytest.mark.asyncio
async def test_embed_chunks_empty(embedding_service: EmbeddingService):
    """embed_chunks with empty text should return an empty list."""
    result = await embedding_service.embed_chunks("")
    assert result == []


@pytest.mark.asyncio
async def test_embed_chunks_multiple(embedding_service: EmbeddingService, sample_embedding_1536: list[float]):
    """embed_chunks with a long text should return multiple (text, embedding) tuples."""
    long_text = " ".join(f"word{i}" for i in range(800))

    # We need to know how many chunks will be produced to mock the response
    chunks = embedding_service.chunk_text(long_text)
    num_chunks = len(chunks)
    assert num_chunks >= 2

    embeddings = [sample_embedding_1536 for _ in range(num_chunks)]
    fake_response = _make_openai_response(embeddings)

    with patch.object(
        embedding_service._client.embeddings, "create", new_callable=AsyncMock, return_value=fake_response
    ):
        result = await embedding_service.embed_chunks(long_text)

    assert len(result) == num_chunks
    for chunk_text, embedding in result:
        assert isinstance(chunk_text, str)
        assert len(chunk_text) > 0
        assert len(embedding) == 1536
