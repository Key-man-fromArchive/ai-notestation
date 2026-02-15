"""Search quality metrics service — fire-and-forget event recording + admin dashboard."""

import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models import SearchEvent

logger = logging.getLogger(__name__)


class SearchMetrics:
    """Record search events and compute dashboard metrics."""

    @staticmethod
    async def record_search(
        query: str,
        search_type: str,
        result_count: int,
        duration_ms: int | None = None,
        user_id: int | None = None,
        judge_strategy: str | None = None,
        details: dict | None = None,
    ) -> int | None:
        """Write one row to search_events using a fresh session (fire-and-forget)."""
        try:
            async with async_session_factory() as session:
                event = SearchEvent(
                    user_id=user_id,
                    query=query,
                    search_type=search_type,
                    result_count=result_count,
                    duration_ms=duration_ms,
                    judge_strategy=judge_strategy,
                    details=details,
                )
                session.add(event)
                await session.commit()
                await session.refresh(event)
                return event.id
        except Exception:
            logger.exception("Failed to record search event")
            return None

    @staticmethod
    async def record_click(search_event_id: int, note_id: str) -> None:
        """Update clicked_note_id on a search event."""
        try:
            async with async_session_factory() as session:
                await session.execute(
                    text("UPDATE search_events SET clicked_note_id = :note_id WHERE id = :id"),
                    {"note_id": note_id, "id": search_event_id},
                )
                await session.commit()
        except Exception:
            logger.exception("Failed to record click for event %d", search_event_id)

    @staticmethod
    async def get_dashboard_data(db: AsyncSession, period: str = "7d") -> dict:
        """Aggregate search metrics for the admin dashboard."""
        days = {"1d": 1, "7d": 7, "30d": 30, "90d": 90}.get(period, 7)
        since = datetime.utcnow() - timedelta(days=days)

        # Total searches
        total_result = await db.execute(select(func.count(SearchEvent.id)).where(SearchEvent.created_at >= since))
        total_searches = total_result.scalar() or 0

        # Averages
        avg_result = await db.execute(
            select(
                func.avg(SearchEvent.result_count),
                func.avg(SearchEvent.duration_ms),
            ).where(SearchEvent.created_at >= since)
        )
        row = avg_result.one()
        avg_result_count = round(float(row[0] or 0), 1)
        avg_duration_ms = round(float(row[1] or 0), 1)

        # Zero-result rate
        zero_result = await db.execute(
            select(func.count(SearchEvent.id)).where(
                SearchEvent.created_at >= since,
                SearchEvent.result_count == 0,
            )
        )
        zero_count = zero_result.scalar() or 0
        zero_result_rate = round(zero_count / total_searches * 100, 1) if total_searches else 0

        # Daily volume
        daily_result = await db.execute(
            text("""
                SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS count
                FROM search_events
                WHERE created_at >= :since
                GROUP BY day ORDER BY day
            """),
            {"since": since},
        )
        daily_volume = [{"date": str(r[0]), "count": r[1]} for r in daily_result.fetchall()]

        # Type distribution
        type_result = await db.execute(
            select(SearchEvent.search_type, func.count(SearchEvent.id))
            .where(SearchEvent.created_at >= since)
            .group_by(SearchEvent.search_type)
        )
        type_distribution = [{"type": r[0], "count": r[1]} for r in type_result.fetchall()]

        # Top zero-result queries
        zero_queries_result = await db.execute(
            text("""
                SELECT query, COUNT(*) AS cnt
                FROM search_events
                WHERE created_at >= :since AND result_count = 0
                GROUP BY query ORDER BY cnt DESC LIMIT 10
            """),
            {"since": since},
        )
        top_zero_result_queries = [{"query": r[0], "count": r[1]} for r in zero_queries_result.fetchall()]

        # Response time percentiles
        p_result = await db.execute(
            text("""
                SELECT
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
                    percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95
                FROM search_events
                WHERE created_at >= :since AND duration_ms IS NOT NULL
            """),
            {"since": since},
        )
        p_row = p_result.one()
        response_time_p50 = round(float(p_row[0] or 0), 1)
        response_time_p95 = round(float(p_row[1] or 0), 1)

        return {
            "total_searches": total_searches,
            "avg_result_count": avg_result_count,
            "avg_duration_ms": avg_duration_ms,
            "zero_result_rate": zero_result_rate,
            "daily_volume": daily_volume,
            "type_distribution": type_distribution,
            "top_zero_result_queries": top_zero_result_queries,
            "response_time_p50": response_time_p50,
            "response_time_p95": response_time_p95,
            "period": period,
        }


search_metrics = SearchMetrics()
