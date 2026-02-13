"""Multi-turn search query refinement.

Uses AI to analyze current search results and generate improved queries
for better search coverage. Based on ReSeek paper's multi-turn approach.
"""

from __future__ import annotations

import json
import logging
import re

from pydantic import BaseModel

from app.ai_router.router import AIRouter
from app.ai_router.schemas import AIRequest

logger = logging.getLogger(__name__)

MAX_TURNS = 4


class RefinementResult(BaseModel):
    """Result of a query refinement step."""

    refined_query: str
    strategy: str  # "broaden" | "narrow" | "related" | "rephrase"
    reasoning: str


class SearchRefiner:
    """Refines search queries using AI analysis of current results."""

    def __init__(self, ai_router: AIRouter) -> None:
        self._ai_router = ai_router

    async def refine_query(
        self,
        original_query: str,
        current_results: list[dict[str, str]],
        user_feedback: str | None = None,
        turn: int = 1,
        lang: str = "ko",
    ) -> RefinementResult:
        """Generate an improved search query based on current results.

        Args:
            original_query: The original search query.
            current_results: List of dicts with 'title' and 'snippet' keys.
            user_feedback: Optional feedback - "broaden", "narrow", "related", or free text.
            turn: Current refinement turn (1-based, max 4).
            lang: Language ("ko" or "en").

        Returns:
            RefinementResult with the refined query, strategy, and reasoning.
        """
        from app.ai_router.prompts.search_refine import build_messages

        messages = build_messages(
            query=original_query,
            results=current_results,
            feedback=user_feedback,
            turn=min(turn, MAX_TURNS),
            lang=lang,
        )

        try:
            response = await self._ai_router.chat(
                AIRequest(
                    messages=messages,
                    temperature=0.3,
                    max_tokens=256,
                )
            )

            return self._parse_response(response.content, original_query)

        except Exception:
            logger.exception("AI refinement failed, falling back to original query")
            return RefinementResult(
                refined_query=original_query,
                strategy="rephrase",
                reasoning=(
                    "AI 호출 실패로 원본 쿼리 유지" if lang == "ko"
                    else "Keeping original query due to AI failure"
                ),
            )

    def _parse_response(self, content: str, fallback_query: str) -> RefinementResult:
        """Parse AI response JSON into RefinementResult."""
        # Try to extract JSON from the response
        try:
            # Handle markdown code blocks
            json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
            raw = json_match.group(1) if json_match else content.strip()
            data = json.loads(raw)

            return RefinementResult(
                refined_query=data.get("refined_query", fallback_query),
                strategy=data.get("strategy", "rephrase"),
                reasoning=data.get("reasoning", ""),
            )
        except (json.JSONDecodeError, KeyError):
            logger.warning("Failed to parse AI refinement response: %s", content[:200])
            return RefinementResult(
                refined_query=fallback_query,
                strategy="rephrase",
                reasoning="응답 파싱 실패",
            )
