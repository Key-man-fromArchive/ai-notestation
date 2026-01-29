# @TASK P2-T2.1 - Search engine package
# @TASK P2-T2.3 - Full-text search engine
# @TASK P2-T2.4 - Semantic search engine
# @TASK P2-T2.5 - Hybrid search engine (RRF merge)
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine--database

"""Search engine package for hybrid full-text and semantic search."""

from app.search.embeddings import EmbeddingError, EmbeddingService
from app.search.engine import (
    FullTextSearchEngine,
    HybridSearchEngine,
    SearchResult,
    SemanticSearchEngine,
)
from app.search.indexer import IndexResult, NoteIndexer

__all__ = [
    "EmbeddingError",
    "EmbeddingService",
    "FullTextSearchEngine",
    "HybridSearchEngine",
    "IndexResult",
    "NoteIndexer",
    "SearchResult",
    "SemanticSearchEngine",
]
