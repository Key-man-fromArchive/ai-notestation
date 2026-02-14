"""Image analysis API: batch OCR + Vision processing endpoints."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.image_analysis_service import ImageAnalysisService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/image-analysis", tags=["image-analysis"])


class ImageAnalysisState:
    """In-memory state tracker for batch processing progress."""

    def __init__(self) -> None:
        self.status: str = "idle"  # idle | processing | completed | error
        self.total: int = 0
        self.processed: int = 0
        self.ocr_done: int = 0
        self.vision_done: int = 0
        self.failed: int = 0
        self.error_message: str | None = None
        self.started_at: str | None = None
        self.completed_at: str | None = None


_state = ImageAnalysisState()


class TriggerResponse(BaseModel):
    status: str
    message: str


class StatusResponse(BaseModel):
    status: str
    total: int
    processed: int
    ocr_done: int
    vision_done: int
    failed: int
    error_message: str | None = None
    started_at: str | None = None
    completed_at: str | None = None


class StatsResponse(BaseModel):
    total: int
    ocr_done: int
    vision_done: int
    ocr_failed: int
    vision_failed: int
    pending: int
    vision_pending: int


@router.post("/trigger", response_model=TriggerResponse)
async def trigger_analysis():
    """Start batch image analysis (OCR + Vision).

    Returns 409 if already processing.
    """
    if _state.status == "processing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Batch analysis is already in progress.",
        )

    # Get count of images needing processing
    service = ImageAnalysisService()
    stats = await service.get_stats()

    pending = stats["pending"] + stats["vision_pending"]
    if pending == 0:
        return TriggerResponse(
            status="completed",
            message="All images are already processed.",
        )

    # Reset state
    _state.status = "processing"
    _state.total = stats["total"]
    _state.processed = 0
    _state.ocr_done = 0
    _state.vision_done = 0
    _state.failed = 0
    _state.error_message = None
    _state.started_at = datetime.now(UTC).isoformat()
    _state.completed_at = None

    # Launch background task
    asyncio.create_task(_run_batch_background())

    return TriggerResponse(
        status="processing",
        message=f"Started batch analysis for {stats['total']} images.",
    )


async def _run_batch_background():
    """Background task that runs the batch processing."""
    try:
        service = ImageAnalysisService()

        def on_progress(processed, total, ocr_done, vision_done, failed):
            _state.processed = processed
            _state.total = total
            _state.ocr_done = ocr_done
            _state.vision_done = vision_done
            _state.failed = failed

        result = await service.run_batch(on_progress=on_progress)

        _state.status = "completed"
        _state.processed = result["processed"]
        _state.ocr_done = result["ocr_done"]
        _state.vision_done = result["vision_done"]
        _state.failed = result["failed"]
        _state.completed_at = datetime.now(UTC).isoformat()

        logger.info(
            "Batch analysis completed: %d processed, %d OCR, %d Vision, %d failed",
            result["processed"],
            result["ocr_done"],
            result["vision_done"],
            result["failed"],
        )
    except Exception as exc:
        _state.status = "error"
        _state.error_message = str(exc)
        _state.completed_at = datetime.now(UTC).isoformat()
        logger.error("Batch analysis failed: %s", exc, exc_info=True)


@router.get("/status", response_model=StatusResponse)
async def get_analysis_status():
    """Get current batch analysis progress."""
    return StatusResponse(
        status=_state.status,
        total=_state.total,
        processed=_state.processed,
        ocr_done=_state.ocr_done,
        vision_done=_state.vision_done,
        failed=_state.failed,
        error_message=_state.error_message,
        started_at=_state.started_at,
        completed_at=_state.completed_at,
    )


@router.get("/stats", response_model=StatsResponse)
async def get_analysis_stats():
    """Get overall image analysis statistics from the database."""
    service = ImageAnalysisService()
    stats = await service.get_stats()
    return StatsResponse(**stats)


class FailedImageItem(BaseModel):
    id: int
    name: str | None
    type: str  # "ocr" or "vision"


class FailedImagesResponse(BaseModel):
    items: list[FailedImageItem]
    total: int


@router.get("/failed", response_model=FailedImagesResponse)
async def get_failed_images(limit: int = 50):
    """Get list of images that failed OCR or Vision analysis."""
    from sqlalchemy import select, literal, union_all

    from app.db import async_session_factory
    from app.models import NoteImage

    async with async_session_factory() as db:
        ocr_q = (
            select(
                NoteImage.id,
                NoteImage.name,
                literal("ocr").label("type"),
            )
            .where(NoteImage.extraction_status == "failed")
        )
        vision_q = (
            select(
                NoteImage.id,
                NoteImage.name,
                literal("vision").label("type"),
            )
            .where(NoteImage.vision_status == "failed")
        )
        combined = union_all(ocr_q, vision_q).limit(limit)
        result = await db.execute(combined)
        rows = result.fetchall()

    items = [FailedImageItem(id=r[0], name=r[1], type=r[2]) for r in rows]
    return FailedImagesResponse(items=items, total=len(items))
