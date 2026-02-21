"""Centralized search parameter management.

All search algorithm parameters (RRF weights, title boost, similarity
thresholds) are stored in the settings system and can be tuned at runtime
via the admin Settings UI.

Usage in search engines::

    from app.search.params import get_search_params
    params = get_search_params()
    score = params["title_weight"] * title_rank + params["content_weight"] * content_rank
"""

from __future__ import annotations

from typing import Any

DEFAULT_SEARCH_PARAMS: dict[str, float | int] = {
    # Hybrid RRF
    "rrf_k": 60,
    "fts_weight": 0.6,
    "semantic_weight": 0.4,
    "fts_weight_korean": 0.7,
    "semantic_weight_korean": 0.3,
    # FTS
    "title_weight": 3.0,
    "content_weight": 1.0,
    # Trigram
    "trigram_threshold_ko": 0.15,
    "trigram_threshold_en": 0.1,
    "trigram_title_weight": 3.0,
    # Unified search (trigram disabled — ineffective on content_text)
    "unified_fts_weight": 1.0,
    "unified_trigram_weight": 0.0,
    # Adaptive search strategy (post-retrieval judge)
    "adaptive_enabled": 1,
    "judge_min_results": 3,
    "judge_min_avg_score": 0.15,
    "judge_min_avg_score_ko": 0.20,
    "judge_min_term_coverage": 0.6,
    "judge_confidence_threshold": 0.7,
    # FTS snippet (ts_headline)
    "snippet_max_words": 35,
    "snippet_min_words": 15,
    # Semantic
    "semantic_min_similarity": 0.3,
}


def get_search_params() -> dict[str, Any]:
    """Return current search parameters, merging DB values with defaults.

    Reads from the in-memory settings cache (``_get_store()``), so
    changes made via the Settings API take effect immediately without
    a server restart.
    """
    from app.api.settings import _get_store

    store = _get_store()
    saved: dict[str, Any] = store.get("search_params", {})
    merged = {**DEFAULT_SEARCH_PARAMS}
    if isinstance(saved, dict):
        for key in DEFAULT_SEARCH_PARAMS:
            if key in saved:
                merged[key] = saved[key]
    return merged
