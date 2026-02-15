"""Automated scoring for evaluation runs."""

import json
import logging

logger = logging.getLogger(__name__)


class AutoScorer:
    """Score model responses using deterministic and AI-assisted methods."""

    def __init__(self, ai_router=None):
        self.ai_router = ai_router

    async def score_search(self, query: str, results: list[dict], expected_topics: list[str]) -> dict:
        """Score search results using deterministic metrics."""
        if not results:
            return {"precision_at_5": 0, "recall": 0, "mrr": 0}

        # Simple topic matching for precision
        relevant = 0
        first_relevant_rank = None
        for i, result in enumerate(results[:5]):
            title = (result.get("title", "") + " " + result.get("snippet", "")).lower()
            if any(topic.lower() in title for topic in expected_topics):
                relevant += 1
                if first_relevant_rank is None:
                    first_relevant_rank = i + 1

        precision_at_5 = relevant / min(5, len(results))
        recall = relevant / len(expected_topics) if expected_topics else 0
        mrr = 1 / first_relevant_rank if first_relevant_rank else 0

        return {
            "precision_at_5": round(precision_at_5, 3),
            "recall": round(recall, 3),
            "mrr": round(mrr, 3),
        }

    async def score_qa(self, question: str, answer: str, expected_answer: str, context: str) -> dict:
        """Score QA response using AI-assisted evaluation."""
        if not self.ai_router:
            # Fallback: simple string similarity
            overlap = len(set(answer.lower().split()) & set(expected_answer.lower().split()))
            total = max(len(set(expected_answer.lower().split())), 1)
            return {
                "correctness": round(overlap / total, 3),
                "utility": 0.5,
                "faithfulness": 0.5,
            }

        prompt = f"""Evaluate this QA response on a scale of 0.0 to 1.0 for each criterion.

Context: {context}
Question: {question}
Expected Answer: {expected_answer}
Model Answer: {answer}

Rate:
1. correctness: How factually correct is the answer?
2. utility: How useful is the answer to the user?
3. faithfulness: How well does the answer stick to the given context?

Return JSON only: {{"correctness": 0.0, "utility": 0.0, "faithfulness": 0.0}}"""

        try:
            response = await self.ai_router.chat(
                messages=[{"role": "user", "content": prompt}],
                model=None,
            )
            content = response.get("content", "{}")
            if "```" in content:
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            scores = json.loads(content.strip())
            return {
                "correctness": round(float(scores.get("correctness", 0)), 3),
                "utility": round(float(scores.get("utility", 0)), 3),
                "faithfulness": round(float(scores.get("faithfulness", 0)), 3),
            }
        except Exception:
            logger.exception("AI-assisted scoring failed")
            return {"correctness": 0.5, "utility": 0.5, "faithfulness": 0.5}
