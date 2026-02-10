# @TASK T5 - Activity log API endpoints
# @SPEC docs/plans/2026-02-10-ops-dashboard.md

"""Activity log API endpoints.

Provides:
- ``GET /activity-log`` -- Paginated activity logs with optional operation filter
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ActivityLog
from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/activity-log", tags=["activity-log"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class ActivityLogItem(BaseModel):
    id: int
    operation: str
    status: str
    message: str | None
    details: dict | None
    triggered_by: str | None
    created_at: datetime


class ActivityLogResponse(BaseModel):
    items: list[ActivityLogItem]
    total: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=ActivityLogResponse)
async def get_activity_logs(
    operation: str | None = Query(None, description="Filter by operation type"),  # noqa: B008
    limit: int = Query(20, ge=1, le=100),  # noqa: B008
    offset: int = Query(0, ge=0),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> ActivityLogResponse:
    """Return paginated activity logs, newest first."""
    query = select(ActivityLog).order_by(desc(ActivityLog.created_at))
    count_query = select(func.count(ActivityLog.id))

    if operation:
        query = query.where(ActivityLog.operation == operation)
        count_query = count_query.where(ActivityLog.operation == operation)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    return ActivityLogResponse(
        items=[
            ActivityLogItem(
                id=log.id,
                operation=log.operation,
                status=log.status,
                message=log.message,
                details=log.details,
                triggered_by=log.triggered_by,
                created_at=log.created_at,
            )
            for log in logs
        ],
        total=total,
    )
