"""Post-retrieval adaptive search judge.

Evaluates FTS results quality and decides whether semantic search
should be run as a self-correction step (ReSeek JUDGE pattern).

Flow: FTS always runs first (~50ms) → JUDGE evaluates results →
      if insufficient, semantic search is triggered → RRF merge.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.search.params import get_search_params
from app.search.query_preprocessor import QueryAnalysis

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class JudgeDecision:
    """Result of post-retrieval quality evaluation.

    Attributes:
        should_run_semantic: Whether semantic search should be triggered.
        reason: Human-readable explanation of the decision.
        confidence: 0-1 confidence in the decision.
        fts_result_count: Number of FTS results evaluated.
        avg_score: Average FTS score of the results.
        term_coverage: Fraction of query morphemes found in FTS snippets.
    """

    should_run_semantic: bool
    reason: str
    confidence: float
    fts_result_count: int
    avg_score: float
    term_coverage: float


class SearchJudge:
    """Post-retrieval judge that evaluates FTS result quality.

    Decides whether semantic search is needed based on:
    1. Result count (zero or too few results)
    2. Average FTS score (below threshold)
    3. Query term coverage (morphemes matched in snippets)
    """

    def judge_results(
        self,
        analysis: QueryAnalysis,
        fts_results: list,
    ) -> JudgeDecision:
        """Evaluate FTS results and decide if semantic search is needed.

        Uses max_score (best FTS hit) instead of avg_score to avoid
        penalizing queries where one strong match exists alongside weaker ones.
        Formula: quality = 0.4 * max_score_factor + 0.6 * coverage_factor

        Args:
            analysis: Query analysis from the preprocessor.
            fts_results: List of SearchResult from FTS engine.

        Returns:
            JudgeDecision with the evaluation outcome.
        """
        params = get_search_params()

        # If adaptive is disabled, always run semantic
        if not params.get("adaptive_enabled", 1):
            return JudgeDecision(
                should_run_semantic=True,
                reason="adaptive disabled",
                confidence=1.0,
                fts_result_count=len(fts_results),
                avg_score=0.0,
                term_coverage=0.0,
            )

        result_count = len(fts_results)
        min_results = int(params.get("judge_min_results", 3))
        lang = analysis.language
        min_score = float(
            params.get("judge_min_avg_score_ko", 0.05)
            if lang in ("ko", "mixed")
            else params.get("judge_min_avg_score", 0.05)
        )
        min_term_coverage = float(params.get("judge_min_term_coverage", 0.5))
        confidence_threshold = float(params.get("judge_confidence_threshold", 0.7))

        # Rule 1: Zero results → always run semantic
        if result_count == 0:
            decision = JudgeDecision(
                should_run_semantic=True,
                reason="no FTS results",
                confidence=1.0,
                fts_result_count=0,
                avg_score=0.0,
                term_coverage=0.0,
            )
            self._log(analysis, decision)
            return decision

        # Compute quality metrics using max_score (best hit)
        max_score = max(r.score for r in fts_results)
        term_coverage = self._compute_term_coverage(analysis, fts_results)

        # Compute per-factor scores (0.0 = bad, 1.0 = good)
        max_score_factor = min(max_score / min_score, 1.0) if min_score > 0 else 1.0
        coverage_factor = min(term_coverage / min_term_coverage, 1.0) if min_term_coverage > 0 else 1.0

        # Weighted average: max_score 40%, coverage 60%
        quality = 0.4 * max_score_factor + 0.6 * coverage_factor

        should_run = quality < confidence_threshold
        reasons = []
        if result_count < min_results:
            reasons.append(f"few results ({result_count}<{min_results})")
        if max_score < min_score:
            reasons.append(f"low max score ({max_score:.3f}<{min_score})")
        if term_coverage < min_term_coverage:
            reasons.append(f"low term coverage ({term_coverage:.2f}<{min_term_coverage})")

        if should_run:
            reason = "FTS quality insufficient: " + "; ".join(reasons) if reasons else "below threshold"
        else:
            reason = "FTS quality sufficient"

        decision = JudgeDecision(
            should_run_semantic=should_run,
            reason=reason,
            confidence=quality,
            fts_result_count=result_count,
            avg_score=max_score,
            term_coverage=term_coverage,
        )
        self._log(analysis, decision)
        return decision

    @staticmethod
    def _compute_term_coverage(analysis: QueryAnalysis, fts_results: list) -> float:
        """Compute what fraction of query morphemes appear in FTS snippets.

        Args:
            analysis: Query analysis containing morphemes.
            fts_results: FTS search results with snippets.

        Returns:
            Float between 0.0 and 1.0.
        """
        morphemes = analysis.morphemes
        if not morphemes:
            return 1.0  # No morphemes to check → assume full coverage

        # Combine all snippets + titles into one lowercase text
        combined = " ".join((r.snippet + " " + r.title).lower() for r in fts_results)

        matched = sum(1 for m in morphemes if m.lower() in combined)
        return matched / len(morphemes)

    @staticmethod
    def _log(analysis: QueryAnalysis, decision: JudgeDecision) -> None:
        logger.info(
            "SearchJudge: query=%r lang=%s → semantic=%s reason=%r confidence=%.2f "
            "fts_count=%d avg_score=%.3f coverage=%.2f",
            analysis.original,
            analysis.language,
            decision.should_run_semantic,
            decision.reason,
            decision.confidence,
            decision.fts_result_count,
            decision.avg_score,
            decision.term_coverage,
        )
