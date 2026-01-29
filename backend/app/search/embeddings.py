# @TASK P2-T2.1 - Embedding generation service
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine

"""Embedding service for converting text into vector embeddings.

Uses the OpenAI embeddings API (text-embedding-3-small by default)
to generate 1536-dimensional vectors suitable for pgvector storage
and cosine similarity search.
"""

import logging

import tiktoken
from openai import APIError, AsyncOpenAI

logger = logging.getLogger(__name__)


class EmbeddingError(Exception):
    """Raised when an embedding API call fails."""


class EmbeddingService:
    """Generate vector embeddings for text using the OpenAI API.

    Parameters
    ----------
    api_key : str
        OpenAI API key.
    model : str
        Embedding model name (default: ``text-embedding-3-small``).
    dimensions : int
        Output vector dimensions (default: 1536).
    """

    def __init__(
        self,
        api_key: str,
        model: str = "text-embedding-3-small",
        dimensions: int = 1536,
    ) -> None:
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model
        self._dimensions = dimensions
        # Use the tokenizer for the chosen model
        self._encoding = tiktoken.encoding_for_model(model)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def embed_text(self, text: str) -> list[float]:
        """Embed a single text string.

        Returns an empty list when *text* is empty or whitespace-only.

        Raises
        ------
        EmbeddingError
            If the OpenAI API call fails.
        """
        if not text or not text.strip():
            return []

        result = await self._call_api([text])
        return result[0]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple texts in a single API call (batch).

        Returns an empty list when *texts* is empty.

        Raises
        ------
        EmbeddingError
            If the OpenAI API call fails.
        """
        if not texts:
            return []

        return await self._call_api(texts)

    def chunk_text(
        self,
        text: str,
        chunk_size: int = 500,
        overlap: int = 50,
    ) -> list[str]:
        """Split *text* into token-based chunks.

        Parameters
        ----------
        text : str
            The input text to split.
        chunk_size : int
            Maximum number of tokens per chunk.
        overlap : int
            Number of overlapping tokens between consecutive chunks.

        Returns
        -------
        list[str]
            Decoded text chunks.  Returns ``[]`` for empty input.
        """
        if not text or not text.strip():
            return []

        tokens = self._encoding.encode(text)

        # If the text fits in a single chunk, return it as-is.
        if len(tokens) <= chunk_size:
            return [text]

        chunks: list[str] = []
        start = 0
        step = chunk_size - overlap

        while start < len(tokens):
            end = start + chunk_size
            chunk_tokens = tokens[start:end]
            chunks.append(self._encoding.decode(chunk_tokens))
            start += step

        return chunks

    async def embed_chunks(
        self,
        text: str,
    ) -> list[tuple[str, list[float]]]:
        """Chunk *text* and embed each chunk.

        Returns a list of ``(chunk_text, embedding)`` tuples.
        Returns ``[]`` for empty input.

        Raises
        ------
        EmbeddingError
            If the OpenAI API call fails.
        """
        chunks = self.chunk_text(text)
        if not chunks:
            return []

        embeddings = await self.embed_texts(chunks)
        return list(zip(chunks, embeddings, strict=True))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _call_api(self, texts: list[str]) -> list[list[float]]:
        """Call the OpenAI embeddings API.

        Raises
        ------
        EmbeddingError
            Wraps any ``openai.APIError`` into a domain-specific exception.
        """
        try:
            response = await self._client.embeddings.create(
                input=texts,
                model=self._model,
                dimensions=self._dimensions,
            )
        except APIError as exc:
            logger.error("Embedding API error: %s", exc)
            raise EmbeddingError(str(exc)) from exc

        # The response data is ordered by index; sort to be safe.
        sorted_data = sorted(response.data, key=lambda d: d.index)
        return [item.embedding for item in sorted_data]
