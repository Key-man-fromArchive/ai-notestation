"""Search quality metrics API — admin dashboard + click tracking."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import require_admin
from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.search_metrics import search_metrics

router = APIRouter(prefix="/admin/metrics", tags=["metrics"])


@router.get("/search")
async def get_search_metrics(
    period: str = Query("7d", pattern="^(1d|7d|30d|90d)$"),  # noqa: B008
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Get aggregated search quality metrics for the admin dashboard."""
    return await search_metrics.get_dashboard_data(db, period=period)


@router.post("/search/{event_id}/click")
async def record_search_click(
    event_id: int,
    note_id: str = Query(...),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> dict:
    """Record that a user clicked a specific search result."""
    await search_metrics.record_click(event_id, note_id)
    return {"status": "ok"}
