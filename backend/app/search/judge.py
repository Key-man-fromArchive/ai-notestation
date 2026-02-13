"""Adaptive search strategy judge.

Analyzes query characteristics and decides the optimal search strategy,
skipping unnecessary engines to save API costs and improve latency.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.search.params import get_search_params
from app.search.query_preprocessor import QueryAnalysis

logger = logging.getLogger(__name__)

# Patterns for detecting natural-language questions
_QUESTION_WORDS_EN = re.compile(
    r"\b(how|what|why|when|where|which|who|can|does|is|are|should|could|would)\b",
    re.IGNORECASE,
)
_QUESTION_WORDS_KO = re.compile(r"(어떻게|무엇|왜|언제|어디|누가|어떤|할\s*수)")


@dataclass(frozen=True, slots=True)
class SearchStrategy:
    """Result of the judge's decision.

    Attributes:
        engines: Which engines to run (e.g. ["fts"], ["semantic"], ["fts", "semantic"]).
        strategy_name: Human-readable label (fts_only, semantic_only, hybrid).
        skip_reason: Why an engine was skipped, or None.
        confidence: 0-1 confidence in the decision.
    """

    engines: list[str]
    strategy_name: str
    skip_reason: str | None = None
    confidence: float = 0.8


class SearchJudge:
    """Decides the optimal search strategy based on query analysis."""

    def judge(self, analysis: QueryAnalysis) -> SearchStrategy:
        """Analyze the query and return an optimal search strategy.

        Rules (evaluated in order):
        1. Short exact keyword (1-2 Latin words) → FTS only
        2. Long English question (5+ words, question word) → Semantic priority
        3. Korean morphemes (2-3) without question → FTS + Trigram
        4. English natural-language phrase (3-4 words) → Hybrid
        5. Default → Hybrid
        """
        params = get_search_params()
        if not params.get("adaptive_enabled", True):
            return SearchStrategy(
                engines=["fts", "semantic"],
                strategy_name="hybrid",
                skip_reason="adaptive disabled",
                confidence=1.0,
            )

        tokens = analysis.normalized.split() if analysis.normalized else []
        word_count = len(tokens)
        lang = analysis.language
        max_short = int(params.get("adaptive_short_query_max_words", 2))
        min_semantic = int(params.get("adaptive_semantic_min_words", 3))

        strategy = self._decide(analysis, tokens, word_count, lang, max_short, min_semantic)

        logger.info(
            "SearchJudge: query=%r lang=%s words=%d → strategy=%s engines=%s skip=%s conf=%.2f",
            analysis.original,
            lang,
            word_count,
            strategy.strategy_name,
            strategy.engines,
            strategy.skip_reason,
            strategy.confidence,
        )
        return strategy

    def _decide(
        self,
        analysis: QueryAnalysis,
        tokens: list[str],
        word_count: int,
        lang: str,
        max_short: int,
        min_semantic: int,
    ) -> SearchStrategy:
        # Rule 1: Short exact keyword (Latin) → FTS only
        if word_count <= max_short and lang == "en" and analysis.is_single_term or (
            word_count <= max_short and lang == "en" and all(t.isascii() for t in tokens)
        ):
            return SearchStrategy(
                engines=["fts"],
                strategy_name="fts_only",
                skip_reason=f"short keyword query ({word_count} words, Latin)",
                confidence=0.9,
            )

        # Rule 2: Long English question → Semantic priority
        if lang == "en" and word_count >= 5 and _QUESTION_WORDS_EN.search(analysis.normalized):
            return SearchStrategy(
                engines=["semantic"],
                strategy_name="semantic_only",
                skip_reason=f"natural-language question ({word_count} words)",
                confidence=0.85,
            )

        # Rule 3: Korean short query → FTS (semantic is weaker for Korean)
        if lang in ("ko", "mixed") and word_count < min_semantic:
            return SearchStrategy(
                engines=["fts"],
                strategy_name="fts_only",
                skip_reason=f"short Korean query ({word_count} words, semantic weak for Korean)",
                confidence=0.85,
            )

        # Rule 4: Korean question → Hybrid (still benefit from semantic)
        if lang in ("ko", "mixed") and _QUESTION_WORDS_KO.search(analysis.normalized):
            return SearchStrategy(
                engines=["fts", "semantic"],
                strategy_name="hybrid",
                confidence=0.8,
            )

        # Rule 5: Medium English phrase (below semantic-only threshold) → Hybrid
        if lang == "en" and word_count >= min_semantic:
            return SearchStrategy(
                engines=["fts", "semantic"],
                strategy_name="hybrid",
                confidence=0.75,
            )

        # Default: Hybrid
        return SearchStrategy(
            engines=["fts", "semantic"],
            strategy_name="hybrid",
            confidence=0.7,
        )
