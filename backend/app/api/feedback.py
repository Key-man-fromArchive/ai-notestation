"""User feedback API — search relevance + AI quality ratings."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import require_admin
from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.feedback_service import feedback_service

router = APIRouter(prefix="/feedback", tags=["feedback"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class SearchFeedbackRequest(BaseModel):
    search_event_id: int
    note_id: str
    relevant: bool


class AIFeedbackRequest(BaseModel):
    feature: str
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = None
    model_used: str | None = None
    request_summary: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/search")
async def submit_search_feedback(
    body: SearchFeedbackRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Submit thumbs up/down for a search result."""
    user_id = current_user.get("user_id")
    fb = await feedback_service.submit_search_feedback(
        db,
        search_event_id=body.search_event_id,
        note_id=body.note_id,
        relevant=body.relevant,
        user_id=user_id,
    )
    return {"id": fb.id, "relevant": fb.relevant}


@router.post("/ai")
async def submit_ai_feedback(
    body: AIFeedbackRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Submit star rating for an AI response."""
    user_id = current_user.get("user_id")
    fb = await feedback_service.submit_ai_feedback(
        db,
        user_id=user_id,
        feature=body.feature,
        rating=body.rating,
        comment=body.comment,
        model_used=body.model_used,
        request_summary=body.request_summary,
    )
    return {"id": fb.id, "rating": fb.rating}


@router.get("/summary")
async def get_feedback_summary(
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),  # noqa: B008
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Get aggregated feedback summary (admin only)."""
    return await feedback_service.get_feedback_summary(db, period=period)


@router.get("/optimization")
async def get_feedback_optimization(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Get recommended search params based on feedback data (admin only)."""
    return await feedback_service.compute_optimal_params(db)
