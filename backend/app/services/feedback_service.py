"""User feedback service — search relevance + AI quality ratings."""

import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIFeedback, SearchFeedback

logger = logging.getLogger(__name__)


class FeedbackService:
    """Submit and aggregate user feedback on search and AI quality."""

    @staticmethod
    async def submit_search_feedback(
        db: AsyncSession,
        search_event_id: int,
        note_id: str,
        relevant: bool,
        user_id: int | None = None,
    ) -> SearchFeedback:
        """Upsert search relevance feedback (ON CONFLICT UPDATE)."""
        await db.execute(
            text("""
                INSERT INTO search_feedback (search_event_id, note_id, relevant, user_id)
                VALUES (:event_id, :note_id, :relevant, :user_id)
                ON CONFLICT ON CONSTRAINT uq_search_feedback_event_note_user
                DO UPDATE SET relevant = :relevant
            """),
            {
                "event_id": search_event_id,
                "note_id": note_id,
                "relevant": relevant,
                "user_id": user_id,
            },
        )
        await db.commit()

        result = await db.execute(
            select(SearchFeedback).where(
                SearchFeedback.search_event_id == search_event_id,
                SearchFeedback.note_id == note_id,
                SearchFeedback.user_id == user_id,
            )
        )
        return result.scalar_one()

    @staticmethod
    async def submit_ai_feedback(
        db: AsyncSession,
        user_id: int | None,
        feature: str,
        rating: int,
        comment: str | None = None,
        model_used: str | None = None,
        request_summary: str | None = None,
    ) -> AIFeedback:
        """Insert AI response feedback."""
        entry = AIFeedback(
            user_id=user_id,
            feature=feature,
            rating=rating,
            comment=comment,
            model_used=model_used,
            request_summary=request_summary,
        )
        db.add(entry)
        await db.commit()
        await db.refresh(entry)
        return entry

    @staticmethod
    async def get_feedback_summary(db: AsyncSession, period: str = "30d") -> dict:
        """Aggregate feedback data for admin dashboard."""
        days = {"7d": 7, "30d": 30, "90d": 90}.get(period, 30)
        since = datetime.utcnow() - timedelta(days=days)

        # Search feedback positive rate
        search_total = await db.execute(select(func.count(SearchFeedback.id)).where(SearchFeedback.created_at >= since))
        search_count = search_total.scalar() or 0

        search_positive = await db.execute(
            select(func.count(SearchFeedback.id)).where(
                SearchFeedback.created_at >= since,
                SearchFeedback.relevant == True,  # noqa: E712
            )
        )
        positive_count = search_positive.scalar() or 0
        positive_rate = round(positive_count / search_count * 100, 1) if search_count else 0

        # Search feedback trend (daily)
        search_trend_result = await db.execute(
            text("""
                SELECT
                    date_trunc('day', created_at)::date AS day,
                    COUNT(*) FILTER (WHERE relevant = true) AS positive,
                    COUNT(*) AS total
                FROM search_feedback
                WHERE created_at >= :since
                GROUP BY day ORDER BY day
            """),
            {"since": since},
        )
        search_trend = [
            {
                "date": str(r[0]),
                "positive": r[1],
                "total": r[2],
                "rate": round(r[1] / r[2] * 100, 1) if r[2] else 0,
            }
            for r in search_trend_result.fetchall()
        ]

        # AI feedback avg rating by feature
        ai_by_feature = await db.execute(
            select(
                AIFeedback.feature,
                func.avg(AIFeedback.rating),
                func.count(AIFeedback.id),
            )
            .where(AIFeedback.created_at >= since)
            .group_by(AIFeedback.feature)
        )
        feature_ratings = [
            {"feature": r[0], "avg_rating": round(float(r[1]), 2), "count": r[2]} for r in ai_by_feature.fetchall()
        ]

        # AI feedback avg rating by model
        ai_by_model = await db.execute(
            select(
                AIFeedback.model_used,
                func.avg(AIFeedback.rating),
                func.count(AIFeedback.id),
            )
            .where(AIFeedback.created_at >= since, AIFeedback.model_used.isnot(None))
            .group_by(AIFeedback.model_used)
        )
        model_ratings = [
            {"model": r[0], "avg_rating": round(float(r[1]), 2), "count": r[2]} for r in ai_by_model.fetchall()
        ]

        return {
            "search_feedback": {
                "total": search_count,
                "positive_count": positive_count,
                "positive_rate": positive_rate,
                "trend": search_trend,
            },
            "ai_feedback": {
                "by_feature": feature_ratings,
                "by_model": model_ratings,
            },
            "period": period,
        }

    @staticmethod
    async def compute_optimal_params(db: AsyncSession) -> dict:
        """Analyze engine contributions correlated with thumbs-up rate to recommend RRF weights."""
        result = await db.execute(
            text("""
                WITH feedback_with_details AS (
                    SELECT sf.relevant, se.details, se.search_type
                    FROM search_feedback sf
                    JOIN search_events se ON se.id = sf.search_event_id
                    WHERE se.details IS NOT NULL
                )
                SELECT
                    search_type,
                    COUNT(*) FILTER (WHERE relevant = true) AS positive,
                    COUNT(*) AS total
                FROM feedback_with_details
                GROUP BY search_type
            """)
        )
        rows = result.fetchall()

        recommendations = []
        for r in rows:
            rate = round(r[1] / r[2] * 100, 1) if r[2] else 0
            recommendations.append(
                {
                    "search_type": r[0],
                    "positive_rate": rate,
                    "sample_size": r[2],
                }
            )

        return {
            "recommendations": recommendations,
            "confidence": "low" if sum(r["sample_size"] for r in recommendations) < 50 else "medium",
        }


feedback_service = FeedbackService()
