# @TASK P2-T2.1 - Embedding generation service
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine

"""Embedding service for converting text into vector embeddings.

Uses the OpenAI embeddings API (text-embedding-3-small by default)
to generate 1536-dimensional vectors suitable for pgvector storage
and cosine similarity search.
"""

import logging
import os

import httpx
import tiktoken
from openai import APIError, AsyncOpenAI

logger = logging.getLogger(__name__)


class EmbeddingError(Exception):
    """Raised when an embedding API call fails."""


class EmbeddingService:
    """Generate vector embeddings for text.

    Supports two modes:

    * **OpenAI API mode** (default) -- uses the OpenAI embeddings endpoint.
    * **Local HTTP mode** -- when the ``EMBEDDING_SERVICE_URL`` environment
      variable is set, all requests are forwarded to a local embedding
      service instead.

    Parameters
    ----------
    api_key : str
        OpenAI API key.  Ignored when running in local mode.
    model : str
        Embedding model name (default: ``text-embedding-3-small``).
        Only used in OpenAI mode.
    dimensions : int
        Output vector dimensions (default: 1536).
    """

    def __init__(
        self,
        api_key: str = "",
        model: str = "text-embedding-3-small",
        dimensions: int = 1536,
    ) -> None:
        self._model = model
        self._dimensions = dimensions

        # Decide mode based on environment variable
        self._local_url: str | None = os.environ.get("EMBEDDING_SERVICE_URL") or None

        if self._local_url:
            logger.info(
                "EmbeddingService: local mode enabled (%s)", self._local_url
            )
            self._client = None
            self._encoding = None
        else:
            self._client = AsyncOpenAI(api_key=api_key)
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

        When running in local mode (no tiktoken encoder), falls back to a
        simple character-based chunker using ~2000-character windows with
        ~200-character overlap.

        Parameters
        ----------
        text : str
            The input text to split.
        chunk_size : int
            Maximum number of tokens per chunk (token mode) or ignored
            in local mode where character limits are used instead.
        overlap : int
            Number of overlapping tokens between consecutive chunks
            (token mode only).

        Returns
        -------
        list[str]
            Decoded text chunks.  Returns ``[]`` for empty input.
        """
        if not text or not text.strip():
            return []

        # -- Local mode: character-based fallback --
        if self._encoding is None:
            return self._chunk_text_by_chars(text)

        # -- OpenAI mode: token-based chunking --
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

    @staticmethod
    def _chunk_text_by_chars(
        text: str,
        chunk_size: int = 2000,
        overlap: int = 200,
    ) -> list[str]:
        """Character-based chunker used as a fallback in local mode.

        Parameters
        ----------
        text : str
            The input text to split.
        chunk_size : int
            Maximum number of characters per chunk (default: 2000).
        overlap : int
            Number of overlapping characters between consecutive chunks
            (default: 200).
        """
        if len(text) <= chunk_size:
            return [text]

        chunks: list[str] = []
        start = 0
        step = chunk_size - overlap

        while start < len(text):
            end = start + chunk_size
            chunks.append(text[start:end])
            if end >= len(text):
                break
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
        """Dispatch to the appropriate backend (OpenAI or local HTTP).

        Raises
        ------
        EmbeddingError
            If the underlying API call fails.
        """
        if self._local_url:
            return await self._call_local_api(texts)
        return await self._call_openai_api(texts)

    async def _call_openai_api(self, texts: list[str]) -> list[list[float]]:
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

    async def _call_local_api(self, texts: list[str]) -> list[list[float]]:
        """Call a local HTTP embedding service.

        Expects the service to expose a ``POST /embed`` endpoint that
        accepts ``{"input": [...], "dimensions": N}`` and returns
        ``{"embeddings": [[...], ...]}``.

        Raises
        ------
        EmbeddingError
            If the HTTP request fails or returns an unexpected response.
        """
        url = f"{self._local_url}/embed"
        payload = {"input": texts, "dimensions": self._dimensions}

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                return data["embeddings"]
        except httpx.HTTPStatusError as exc:
            logger.error("Local embedding HTTP error: %s", exc)
            raise EmbeddingError(str(exc)) from exc
        except httpx.RequestError as exc:
            logger.error("Local embedding request error: %s", exc)
            raise EmbeddingError(str(exc)) from exc
        except (KeyError, ValueError) as exc:
            logger.error("Local embedding response parse error: %s", exc)
            raise EmbeddingError(
                f"Unexpected response from local embedding service: {exc}"
            ) from exc
