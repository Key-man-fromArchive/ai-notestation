"""A/B evaluation framework API -- admin-only endpoints."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import require_admin
from app.database import async_session_factory, get_db
from app.models import EvaluationRun

router = APIRouter(prefix="/admin/evaluation", tags=["evaluation"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class EvaluationRunRequest(BaseModel):
    task_type: str = Field("qa", pattern="^(search|qa)$")
    models: list[str] = Field(..., min_length=1)
    test_count: int = Field(10, ge=1, le=50)


class EvaluationRunResponse(BaseModel):
    run_id: int
    status: str


class EvaluationRunDetail(BaseModel):
    id: int
    status: str
    task_type: str
    models: list | dict
    test_count: int
    progress: int
    results: dict | None
    error: str | None
    triggered_by: str | None
    created_at: str | None
    completed_at: str | None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/run")
async def start_evaluation(
    body: EvaluationRunRequest,
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> EvaluationRunResponse:
    """Start a new evaluation run as a background task."""
    run = EvaluationRun(
        task_type=body.task_type,
        models=body.models,
        test_count=body.test_count,
        triggered_by=admin.get("username", "unknown"),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # Launch background evaluation
    asyncio.create_task(_run_evaluation_background(run.id, body.task_type, body.models, body.test_count))

    return EvaluationRunResponse(run_id=run.id, status="pending")


@router.get("/list")
async def list_evaluation_runs(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """List all evaluation runs (most recent first)."""
    result = await db.execute(select(EvaluationRun).order_by(EvaluationRun.created_at.desc()).limit(50))
    runs = result.scalars().all()
    return {
        "runs": [
            {
                "id": r.id,
                "status": r.status,
                "task_type": r.task_type,
                "models": r.models,
                "test_count": r.test_count,
                "progress": r.progress,
                "triggered_by": r.triggered_by,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "winner": r.results.get("winner") if r.results else None,
            }
            for r in runs
        ],
        "total": len(runs),
    }


@router.get("/{run_id}")
async def get_evaluation_run(
    run_id: int,
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> EvaluationRunDetail:
    """Get details of a specific evaluation run."""
    result = await db.execute(select(EvaluationRun).where(EvaluationRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation run not found")

    return EvaluationRunDetail(
        id=run.id,
        status=run.status,
        task_type=run.task_type,
        models=run.models,
        test_count=run.test_count,
        progress=run.progress,
        results=run.results,
        error=run.error,
        triggered_by=run.triggered_by,
        created_at=run.created_at.isoformat() if run.created_at else None,
        completed_at=run.completed_at.isoformat() if run.completed_at else None,
    )


async def _run_evaluation_background(run_id: int, task_type: str, models: list[str], test_count: int) -> None:
    """Background task to execute evaluation."""
    try:
        from app.api.ai import get_ai_router

        ai_router = get_ai_router()
        from app.services.evaluation.framework import EvaluationFramework

        framework = EvaluationFramework(ai_router)
        await framework.run_evaluation(run_id, task_type, models, test_count)
    except Exception:
        import logging

        logging.getLogger(__name__).exception("Background evaluation failed for run %d", run_id)
        # Update run status to failed
        try:
            async with async_session_factory() as session:
                await session.execute(
                    text("UPDATE evaluation_runs SET status = 'failed', error = :error WHERE id = :id"),
                    {"error": "Background task failed", "id": run_id},
                )
                await session.commit()
        except Exception:
            logging.getLogger(__name__).exception("Failed to update run %d status", run_id)
