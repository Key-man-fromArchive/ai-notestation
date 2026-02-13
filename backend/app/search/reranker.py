"""Cohere cross-encoder reranking for search results.

Provides CohereReranker (calls Cohere Rerank API via httpx) and
NoOpReranker (passthrough when API key is not configured).
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class BaseReranker(ABC):
    """Abstract base class for rerankers."""

    @abstractmethod
    async def rerank(
        self,
        query: str,
        results: list,
        top_n: int | None = None,
    ) -> list:
        """Rerank search results by relevance to the query.

        Args:
            query: The search query.
            results: List of SearchResult objects.
            top_n: Maximum number of results to return (None = all).

        Returns:
            Reranked list of SearchResult objects.
        """
        ...


class NoOpReranker(BaseReranker):
    """Passthrough reranker that returns results unchanged."""

    async def rerank(self, query: str, results: list, top_n: int | None = None) -> list:
        if top_n is not None:
            return results[:top_n]
        return results


class CohereReranker(BaseReranker):
    """Cohere Rerank API cross-encoder reranker.

    Uses httpx to call the Cohere Rerank API. No additional
    dependencies required beyond httpx (already in the project).

    Args:
        api_key: Cohere API key.
        model: Rerank model name (default from settings).
    """

    _RERANK_URL = "https://api.cohere.ai/v1/rerank"

    def __init__(self, api_key: str, model: str = "rerank-english-v3.0") -> None:
        self._api_key = api_key
        self._model = model

    async def rerank(
        self,
        query: str,
        results: list,
        top_n: int | None = None,
    ) -> list:
        """Rerank results using Cohere's cross-encoder model.

        Sends note titles + snippets as documents to the Cohere Rerank API,
        then reorders results by the returned relevance scores.

        Args:
            query: The search query.
            results: List of SearchResult objects.
            top_n: Maximum number of results to return.

        Returns:
            Reranked SearchResult list with search_type="reranked".
        """
        if not results:
            return results

        # Build documents for Cohere (title + snippet)
        documents = [f"{r.title}. {r.snippet}" for r in results]

        effective_top_n = top_n or len(results)

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    self._RERANK_URL,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self._model,
                        "query": query,
                        "documents": documents,
                        "top_n": effective_top_n,
                        "return_documents": False,
                    },
                )
                response.raise_for_status()
                data = response.json()

        except Exception:
            logger.warning("Cohere rerank API call failed, returning original results")
            return results

        # Reorder results based on Cohere's ranking
        reranked = []
        for item in data.get("results", []):
            idx = item["index"]
            if idx < len(results):
                original = results[idx]
                # Create new result with reranked score and type
                from app.search.engine import SearchResult

                reranked.append(
                    SearchResult(
                        note_id=original.note_id,
                        title=original.title,
                        snippet=original.snippet,
                        score=float(item["relevance_score"]),
                        search_type="reranked",
                        created_at=original.created_at,
                        updated_at=original.updated_at,
                        match_explanation=original.match_explanation,
                    )
                )

        return reranked


def get_reranker() -> BaseReranker:
    """Get the appropriate reranker based on configuration.

    Returns CohereReranker if COHERE_API_KEY is set, otherwise NoOpReranker.
    """
    settings = get_settings()
    if settings.COHERE_API_KEY:
        return CohereReranker(
            api_key=settings.COHERE_API_KEY,
            model=settings.RERANK_MODEL,
        )
    return NoOpReranker()
