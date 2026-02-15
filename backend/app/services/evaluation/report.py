"""Report generation for evaluation runs."""

import logging

logger = logging.getLogger(__name__)


class ReportGenerator:
    """Aggregate per-query scores into a comparison report."""

    @staticmethod
    def generate_report(model_scores: dict[str, list[dict]], task_type: str) -> dict:
        """Generate a comparison report from model scores.

        Args:
            model_scores: {model_name: [score_dict, ...]}
            task_type: "search" or "qa"
        """
        if not model_scores:
            return {"winner": None, "summary": "No results", "models": {}}

        metrics = (
            ["precision_at_5", "recall", "mrr"] if task_type == "search" else ["correctness", "utility", "faithfulness"]
        )

        model_averages = {}
        for model, scores in model_scores.items():
            if not scores:
                model_averages[model] = {m: 0 for m in metrics}
                continue

            averages = {}
            for metric in metrics:
                values = [s.get(metric, 0) for s in scores]
                averages[metric] = round(sum(values) / len(values), 3) if values else 0
            averages["overall"] = round(sum(averages.values()) / len(averages), 3)
            model_averages[model] = averages

        # Determine winner by overall score
        winner = max(model_averages, key=lambda m: model_averages[m].get("overall", 0))

        # Summary
        scores_str = ", ".join(f"{m}: {a.get('overall', 0):.3f}" for m, a in model_averages.items())
        summary = f"Winner: {winner} | Scores: {scores_str}"

        return {
            "winner": winner,
            "summary": summary,
            "models": model_averages,
            "metrics": metrics,
            "task_type": task_type,
        }
