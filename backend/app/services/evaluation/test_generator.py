"""Synthetic test case generation for evaluation."""

import json
import logging

logger = logging.getLogger(__name__)


class SyntheticTestGenerator:
    """Generate synthetic research notes + test queries with known ground truth."""

    def __init__(self, ai_router):
        self.ai_router = ai_router

    async def generate_test_suite(self, task_type: str, count: int = 10) -> list[dict]:
        """Generate test cases using AI to create realistic scenarios."""
        if task_type == "search":
            return await self._generate_search_tests(count)
        elif task_type == "qa":
            return await self._generate_qa_tests(count)
        return []

    async def _generate_search_tests(self, count: int) -> list[dict]:
        """Generate search evaluation test cases."""
        prompt = f"""Generate {count} search evaluation test cases for a research note-taking app.
Each test case should have:
- "query": a realistic search query
- "expected_topics": list of 2-3 topics that should appear in good results
- "difficulty": "easy", "medium", or "hard"

Return as a JSON array. Only output the JSON, no explanation."""

        try:
            response = await self.ai_router.chat(
                messages=[{"role": "user", "content": prompt}],
                model=None,
            )
            content = response.get("content", "[]")
            # Extract JSON from response
            if "```" in content:
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            return json.loads(content.strip())
        except Exception:
            logger.exception("Failed to generate search test cases")
            return [
                {"query": f"test query {i + 1}", "expected_topics": ["topic"], "difficulty": "easy"}
                for i in range(count)
            ]

    async def _generate_qa_tests(self, count: int) -> list[dict]:
        """Generate QA evaluation test cases."""
        prompt = f"""Generate {count} question-answering evaluation test cases for a research note-taking app.
Each test case should have:
- "context": a short research note paragraph (2-3 sentences)
- "question": a question about the context
- "expected_answer": the correct answer
- "difficulty": "easy", "medium", or "hard"

Return as a JSON array. Only output the JSON, no explanation."""

        try:
            response = await self.ai_router.chat(
                messages=[{"role": "user", "content": prompt}],
                model=None,
            )
            content = response.get("content", "[]")
            if "```" in content:
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            return json.loads(content.strip())
        except Exception:
            logger.exception("Failed to generate QA test cases")
            return [
                {
                    "context": f"Test context {i + 1}.",
                    "question": f"Test question {i + 1}?",
                    "expected_answer": f"Answer {i + 1}",
                    "difficulty": "easy",
                }
                for i in range(count)
            ]
