"""Thin helper for writing activity log entries."""

import logging
from app.models import ActivityLog
from app.database import async_session_factory

logger = logging.getLogger(__name__)


async def log_activity(
    operation: str,
    status: str,
    message: str | None = None,
    details: dict | None = None,
    triggered_by: str | None = None,
) -> None:
    """Write one row to activity_logs using a fresh session."""
    try:
        async with async_session_factory() as session:
            entry = ActivityLog(
                operation=operation,
                status=status,
                message=message,
                details=details,
                triggered_by=triggered_by,
            )
            session.add(entry)
            await session.commit()
    except Exception:
        logger.exception("Failed to write activity log")
