"""Batch OCR + Vision analysis service for note images.

Processes all note images in the database, running OCR text extraction
and Vision description generation concurrently with rate limiting.
"""

from __future__ import annotations

import asyncio
import base64
import logging
from pathlib import Path

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models import NoteImage

logger = logging.getLogger(__name__)

# Vision prompt for image description
_VISION_PROMPT = (
    "Describe this image concisely in 2-3 sentences. "
    "Focus on: main content, objects, text, diagrams, charts, or notable features. "
    "If this is a scientific image (gel, blot, microscopy, etc.), "
    "describe the experimental content."
)

def _get_vision_model() -> str:
    """Read vision_model from the settings cache."""
    from app.api.settings import _get_store

    store = _get_store()
    return store.get("vision_model", "glm-4.6v")


class ImageAnalysisService:
    """Batch processor for OCR and Vision analysis of note images."""

    OCR_CONCURRENCY = 3  # glm-ocr is paid → conservative
    VISION_CONCURRENCY = 10  # glm-4.6v supports 10 concurrent

    def __init__(self) -> None:
        self._ocr_sem = asyncio.Semaphore(self.OCR_CONCURRENCY)
        self._vision_sem = asyncio.Semaphore(self.VISION_CONCURRENCY)

    async def get_stats(self) -> dict:
        """Get overall image analysis statistics."""
        async with async_session_factory() as db:
            total = await db.scalar(select(func.count()).select_from(NoteImage))
            ocr_done = await db.scalar(
                select(func.count()).select_from(NoteImage).where(
                    NoteImage.extraction_status.in_(["completed", "empty"])
                )
            )
            vision_done = await db.scalar(
                select(func.count()).select_from(NoteImage).where(NoteImage.vision_status == "completed")
            )
            ocr_failed = await db.scalar(
                select(func.count()).select_from(NoteImage).where(NoteImage.extraction_status == "failed")
            )
            vision_failed = await db.scalar(
                select(func.count()).select_from(NoteImage).where(NoteImage.vision_status == "failed")
            )

        return {
            "total": total or 0,
            "ocr_done": ocr_done or 0,
            "vision_done": vision_done or 0,
            "ocr_failed": ocr_failed or 0,
            "vision_failed": vision_failed or 0,
            "pending": (total or 0) - (ocr_done or 0) - (ocr_failed or 0),
            "vision_pending": (total or 0) - (vision_done or 0) - (vision_failed or 0),
        }

    async def run_batch(self, on_progress: callable | None = None) -> dict:
        """Run batch OCR + Vision analysis on all unprocessed images.

        Args:
            on_progress: Optional callback(processed, total, ocr_done, vision_done, failed)

        Returns:
            Summary dict with counts.
        """
        async with async_session_factory() as db:
            # Find images needing OCR or Vision
            # NULL status means never processed — must be included
            stmt = select(NoteImage.id).where(
                or_(
                    NoteImage.extraction_status.is_(None),
                    ~NoteImage.extraction_status.in_(["completed", "empty"]),
                    NoteImage.vision_status.is_(None),
                    NoteImage.vision_status != "completed",
                )
            )
            result = await db.execute(stmt)
            image_ids = [row[0] for row in result.fetchall()]

        if not image_ids:
            return {"processed": 0, "ocr_done": 0, "vision_done": 0, "failed": 0}

        total = len(image_ids)
        processed = 0
        ocr_done = 0
        vision_done = 0
        failed = 0

        # Limit concurrency to avoid DB connection pool exhaustion
        semaphore = asyncio.Semaphore(5)

        async def _bounded(image_id: int) -> dict:
            async with semaphore:
                return await self._process_single(image_id)

        tasks = [_bounded(image_id) for image_id in image_ids]

        for coro in asyncio.as_completed(tasks):
            result = await coro
            processed += 1
            if result.get("ocr"):
                ocr_done += 1
            if result.get("vision"):
                vision_done += 1
            if result.get("error"):
                failed += 1
            if on_progress:
                on_progress(processed, total, ocr_done, vision_done, failed)

        # Re-index affected notes
        await self._reindex_affected_notes(image_ids)

        return {
            "processed": processed,
            "ocr_done": ocr_done,
            "vision_done": vision_done,
            "failed": failed,
        }

    async def _process_single(self, image_id: int) -> dict:
        """Process a single image: OCR then Vision."""
        result = {"ocr": False, "vision": False, "error": False}

        async with async_session_factory() as db:
            img = await db.get(NoteImage, image_id)
            if not img:
                return result

            file_path = Path(img.file_path)
            if not file_path.exists():
                logger.warning("Image file not found: %s", img.file_path)
                result["error"] = True
                return result

            image_bytes = file_path.read_bytes()
            mime_type = img.mime_type or "image/png"

            # Step 1: OCR if needed
            if img.extraction_status not in ("completed", "empty"):
                ocr_ok = await self._run_ocr(db, img, image_bytes, mime_type)
                if ocr_ok:
                    result["ocr"] = True
                else:
                    result["error"] = True

            # Step 2: Vision if needed
            if img.vision_status != "completed":
                vision_ok = await self._run_vision(db, img, image_bytes, mime_type)
                if vision_ok:
                    result["vision"] = True
                elif not result["ocr"]:
                    # Only mark error if both failed
                    result["error"] = True

            await db.commit()

        return result

    async def _run_ocr(self, db: AsyncSession, img: NoteImage, image_bytes: bytes, mime_type: str) -> bool:
        """Run OCR on a single image with semaphore limiting."""
        async with self._ocr_sem:
            try:
                from app.services.ocr_service import OCRService

                service = OCRService()
                ocr_result = await service.extract_text(image_bytes, mime_type)

                img.extracted_text = ocr_result.text
                img.extraction_status = "completed" if ocr_result.text and ocr_result.text.strip() else "empty"
                await db.flush()
                logger.debug("OCR %s for image %d", img.extraction_status, img.id)
                return True
            except Exception as exc:
                logger.warning("OCR failed for image %d: %s", img.id, exc)
                img.extraction_status = "failed"
                await db.flush()
                return False

    async def _run_vision(self, db: AsyncSession, img: NoteImage, image_bytes: bytes, mime_type: str) -> bool:
        """Run Vision analysis on a single image with semaphore limiting."""
        async with self._vision_sem:
            try:
                from app.ai_router.router import AIRouter
                from app.ai_router.schemas import AIRequest, ImageContent, Message

                router = AIRouter()

                # Check if vision model is available
                available_ids = {m.id for m in router.all_models()}
                if _get_vision_model() not in available_ids:
                    logger.warning("Vision model %s not available", _get_vision_model())
                    img.vision_status = "failed"
                    await db.flush()
                    return False

                b64 = base64.b64encode(image_bytes).decode("ascii")
                message = Message(
                    role="user",
                    content=_VISION_PROMPT,
                    images=[ImageContent(data=b64, mime_type=mime_type)],
                )
                request = AIRequest(
                    messages=[message],
                    model=_get_vision_model(),
                    temperature=0.3,
                )
                response = await router.chat(request)

                description = response.content.strip()
                if description:
                    img.vision_description = description
                    img.vision_status = "completed"
                else:
                    img.vision_status = "failed"

                await db.flush()
                logger.debug("Vision completed for image %d", img.id)
                return bool(description)
            except Exception as exc:
                logger.warning("Vision failed for image %d: %s", img.id, exc)
                img.vision_status = "failed"
                await db.flush()
                return False

    async def _reindex_affected_notes(self, image_ids: list[int]) -> None:
        """Re-index notes that had images processed."""
        try:
            async with async_session_factory() as db:
                # Find distinct note IDs from processed images
                stmt = select(NoteImage.synology_note_id).where(NoteImage.id.in_(image_ids)).distinct()
                result = await db.execute(stmt)
                note_synology_ids = [row[0] for row in result.fetchall()]

                if not note_synology_ids:
                    return

                from app.models import Note
                from app.search.embeddings import EmbeddingService
                from app.search.indexer import NoteIndexer

                embedding_service = EmbeddingService()
                indexer = NoteIndexer(db, embedding_service)

                # Find note DB IDs
                note_stmt = select(Note.id).where(Note.synology_note_id.in_(note_synology_ids))
                note_result = await db.execute(note_stmt)
                note_ids = [row[0] for row in note_result.fetchall()]

                for note_id in note_ids:
                    try:
                        await indexer.reindex_note(note_id)
                    except Exception as exc:
                        logger.warning("Failed to re-index note %d: %s", note_id, exc)

                await db.commit()

            logger.info("Re-indexed %d notes after image analysis", len(note_ids))
        except Exception as exc:
            logger.warning("Failed to re-index notes: %s", exc)
