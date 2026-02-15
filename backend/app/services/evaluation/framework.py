"""Evaluation orchestrator — generates suite, runs each model, scores, reports."""

import json
import logging
from datetime import UTC, datetime

from sqlalchemy import text

from app.database import async_session_factory
from app.services.evaluation.report import ReportGenerator
from app.services.evaluation.scorer import AutoScorer
from app.services.evaluation.test_generator import SyntheticTestGenerator

logger = logging.getLogger(__name__)


class EvaluationFramework:
    """Orchestrate A/B evaluation runs with progress tracking."""

    def __init__(self, ai_router):
        self.ai_router = ai_router
        self.generator = SyntheticTestGenerator(ai_router)
        self.scorer = AutoScorer(ai_router)

    async def run_evaluation(
        self,
        run_id: int,
        task_type: str,
        models: list[str],
        test_count: int = 10,
    ) -> dict:
        """Execute a full evaluation run as a background task."""
        try:
            await self._update_run(run_id, status="running", progress=0)

            # Step 1: Generate test suite (10% progress)
            test_suite = await self.generator.generate_test_suite(task_type, test_count)
            await self._update_run(run_id, progress=10)

            # Step 2: Run each model on each test case
            model_scores: dict[str, list[dict]] = {m: [] for m in models}
            total_tasks = len(models) * len(test_suite)
            completed = 0

            for model in models:
                for test_case in test_suite:
                    try:
                        score = await self._evaluate_single(model, task_type, test_case)
                        model_scores[model].append(score)
                    except Exception:
                        logger.warning("Evaluation failed for model=%s", model, exc_info=True)
                        model_scores[model].append(self._empty_score(task_type))

                    completed += 1
                    progress = 10 + int(completed / total_tasks * 80)
                    await self._update_run(run_id, progress=progress)

            # Step 3: Generate report (90% -> 100%)
            report = ReportGenerator.generate_report(model_scores, task_type)
            await self._update_run(
                run_id,
                status="completed",
                progress=100,
                results=report,
                completed_at=datetime.now(UTC),
            )
            return report

        except Exception as exc:
            logger.exception("Evaluation run %d failed", run_id)
            await self._update_run(run_id, status="failed", error=str(exc))
            return {"error": str(exc)}

    async def _evaluate_single(self, model: str, task_type: str, test_case: dict) -> dict:
        """Evaluate a single test case with a specific model."""
        if task_type == "search":
            return await self.scorer.score_search(
                query=test_case.get("query", ""),
                results=[],
                expected_topics=test_case.get("expected_topics", []),
            )
        else:
            context = test_case.get("context", "")
            question = test_case.get("question", "")
            expected = test_case.get("expected_answer", "")

            response = await self.ai_router.chat(
                messages=[
                    {"role": "system", "content": f"Answer based on this context: {context}"},
                    {"role": "user", "content": question},
                ],
                model=model,
            )
            answer = response.get("content", "")

            return await self.scorer.score_qa(question, answer, expected, context)

    @staticmethod
    def _empty_score(task_type: str) -> dict:
        """Return zero scores for a failed evaluation."""
        if task_type == "search":
            return {"precision_at_5": 0, "recall": 0, "mrr": 0}
        return {"correctness": 0, "utility": 0, "faithfulness": 0}

    @staticmethod
    async def _update_run(run_id: int, **kwargs) -> None:
        """Update evaluation_runs row using a fresh session."""
        try:
            async with async_session_factory() as session:
                sets = []
                params: dict = {"run_id": run_id}
                for key, value in kwargs.items():
                    if key == "results":
                        sets.append("results = :results")
                        params["results"] = json.dumps(value)
                    elif key == "completed_at":
                        sets.append("completed_at = :completed_at")
                        params["completed_at"] = value
                    else:
                        sets.append(f"{key} = :{key}")
                        params[key] = value

                if sets:
                    sql = f"UPDATE evaluation_runs SET {', '.join(sets)} WHERE id = :run_id"  # noqa: S608
                    await session.execute(text(sql), params)
                    await session.commit()
        except Exception:
            logger.exception("Failed to update evaluation run %d", run_id)
