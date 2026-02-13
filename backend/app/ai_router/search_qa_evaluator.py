"""Search QA response evaluator.

Evaluates Search QA responses for correctness (grounding in source notes)
and utility (relevance to the user's question). Independent from QualityGate —
provides deeper, search_qa-specific evaluation based on the ReSeek paper's
dense reward decomposition pattern.
"""

from __future__ import annotations

import json
import logging
from typing import Literal

from pydantic import BaseModel

from app.ai_router.prompts import search_qa_eval
from app.ai_router.router import AIRouter
from app.ai_router.schemas import AIRequest

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class SourceCoverage(BaseModel):
    """Tracks whether a source note was actually cited in the AI response."""

    note_index: int
    note_title: str
    cited: bool
    relevant_claim: str


class SearchQAEvaluation(BaseModel):
    """Search QA evaluation result with correctness/utility decomposition."""

    correctness: float  # 0.0~1.0 — how well grounded in context
    utility: float  # 0.0~1.0 — how well the question is answered
    confidence: Literal["high", "medium", "low"]
    source_coverage: list[SourceCoverage]
    grounding_issues: list[str]
    summary: str


# ---------------------------------------------------------------------------
# Evaluator
# ---------------------------------------------------------------------------


class SearchQAEvaluator:
    """Evaluates Search QA responses for correctness and utility."""

    def __init__(self, ai_router: AIRouter) -> None:
        self._ai_router = ai_router

    async def evaluate(
        self,
        question: str,
        context_notes: list[str],
        note_titles: list[str],
        ai_response: str,
        lang: str = "ko",
    ) -> SearchQAEvaluation | None:
        """Evaluate a Search QA response.

        Returns None if context_notes is empty or if evaluation fails.
        """
        if not context_notes:
            return None

        try:
            messages = search_qa_eval.build_messages(
                question=question,
                context_notes=context_notes,
                note_titles=note_titles,
                ai_response=ai_response,
                lang=lang,
            )

            ai_request = AIRequest(
                messages=messages,
                temperature=0.1,
                max_tokens=768,
            )

            response = await self._ai_router.chat(ai_request)
            return self._parse_result(response.content, note_titles)

        except Exception:
            logger.exception("Search QA evaluation failed")
            return None

    def _parse_result(
        self,
        raw_content: str,
        note_titles: list[str],
    ) -> SearchQAEvaluation:
        """Parse AI evaluation JSON into SearchQAEvaluation."""
        content = raw_content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            lines = [ln for ln in lines if not ln.strip().startswith("```")]
            content = "\n".join(lines)

        data = json.loads(content)

        correctness = max(0.0, min(1.0, float(data.get("correctness", 0.0))))
        utility = max(0.0, min(1.0, float(data.get("utility", 0.0))))

        # Determine confidence level
        if correctness >= 0.8 and utility >= 0.7:
            confidence: Literal["high", "medium", "low"] = "high"
        elif correctness >= 0.5:
            confidence = "medium"
        else:
            confidence = "low"

        # Parse source coverage
        source_coverage: list[SourceCoverage] = []
        for sc_data in data.get("source_coverage", []):
            idx = sc_data.get("note_index", 0)
            title = ""
            if isinstance(idx, int) and 0 < idx <= len(note_titles):
                title = note_titles[idx - 1]
            source_coverage.append(
                SourceCoverage(
                    note_index=idx,
                    note_title=title or sc_data.get("note_title", ""),
                    cited=bool(sc_data.get("cited", False)),
                    relevant_claim=sc_data.get("relevant_claim", ""),
                )
            )

        grounding_issues = [str(gi) for gi in data.get("grounding_issues", [])]
        summary = str(data.get("summary", ""))

        return SearchQAEvaluation(
            correctness=round(correctness, 2),
            utility=round(utility, 2),
            confidence=confidence,
            source_coverage=source_coverage,
            grounding_issues=grounding_issues,
            summary=summary,
        )
