# @TASK P6-T6.2 - File upload and serving endpoints
"""File upload API for note attachments, images, and OCR."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import NoteAttachment, NoteImage
from app.services.activity_log import get_trigger_name, log_activity
from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["files"])
settings = get_settings()

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}


@router.post("/files", status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(..., description="Attachment file"),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> dict:
    """Upload a file and return its API URL."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required",
        )

    uploads_dir = Path(settings.UPLOADS_PATH)
    uploads_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(file.filename).suffix
    file_id = f"{uuid4().hex}{suffix}"
    target_path = uploads_dir / file_id

    try:
        with open(target_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"File upload failed: {exc}",
        ) from exc

    await log_activity(
        "note", "completed",
        message=f"파일 업로드: {file.filename}",
        details={"file_id": file_id},
        triggered_by=get_trigger_name(current_user),
    )

    return {
        "id": file_id,
        "name": file.filename,
        "url": f"/api/files/{file_id}",
        "uploaded_at": datetime.now(UTC).isoformat(),
    }


@router.get("/files/{file_id}")
async def get_file(file_id: str) -> FileResponse:
    """Serve an uploaded file by its identifier."""
    uploads_dir = Path(settings.UPLOADS_PATH)
    file_path = uploads_dir / file_id

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    return FileResponse(path=file_path, filename=file_id)


@router.post("/files/{file_id}/extract")
async def extract_file_text(
    file_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Trigger text extraction (PDF or image OCR) in the background."""
    uploads_dir = Path(settings.UPLOADS_PATH)
    file_path = uploads_dir / file_id

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    is_pdf = file_id.lower().endswith(".pdf")
    is_image = any(file_id.lower().endswith(ext) for ext in _IMAGE_EXTENSIONS)

    if not is_pdf and not is_image:
        raise HTTPException(status_code=400, detail="Only PDF and image files can be extracted")

    stmt = select(NoteAttachment).where(NoteAttachment.file_id == file_id)
    result = await db.execute(stmt)
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if attachment.extraction_status == "completed":
        return {"status": "already_completed", "page_count": attachment.page_count}

    attachment.extraction_status = "pending"
    await db.commit()

    if is_pdf:
        background_tasks.add_task(_run_pdf_extraction, file_id, str(file_path))
    else:
        background_tasks.add_task(_run_ocr_extraction, file_id, str(file_path))

    return {"status": "pending"}


@router.get("/files/{file_id}/text")
async def get_file_text(
    file_id: str,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Return extracted text (PDF or OCR) for a file."""
    stmt = select(NoteAttachment).where(NoteAttachment.file_id == file_id)
    result = await db.execute(stmt)
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    return {
        "file_id": file_id,
        "name": attachment.name,
        "extraction_status": attachment.extraction_status,
        "page_count": attachment.page_count,
        "text": attachment.extracted_text,
    }


# -- NoteImage OCR endpoints -----------------------------------------------


@router.post("/images/{image_id}/extract")
async def extract_image_text(
    image_id: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Trigger OCR extraction for a NoteImage (NSX extracted image)."""
    stmt = select(NoteImage).where(NoteImage.id == image_id)
    result = await db.execute(stmt)
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    if image.extraction_status == "completed":
        return {"status": "already_completed"}

    image.extraction_status = "pending"
    await db.commit()

    background_tasks.add_task(_run_image_ocr, image_id)

    return {"status": "pending"}


@router.get("/images/{image_id}/text")
async def get_image_text(
    image_id: int,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Return OCR-extracted text for a NoteImage."""
    stmt = select(NoteImage).where(NoteImage.id == image_id)
    result = await db.execute(stmt)
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    return {
        "image_id": image.id,
        "name": image.name,
        "extraction_status": image.extraction_status,
        "text": image.extracted_text,
    }


# -- NoteImage Vision endpoints -----------------------------------------------


@router.post("/images/{image_id}/vision")
async def trigger_image_vision(
    image_id: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Trigger Vision analysis for a NoteImage."""
    stmt = select(NoteImage).where(NoteImage.id == image_id)
    result = await db.execute(stmt)
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    if image.vision_status == "completed":
        return {"status": "already_completed"}

    image.vision_status = "pending"
    await db.commit()

    background_tasks.add_task(_run_image_vision, image_id)

    return {"status": "pending"}


@router.get("/images/{image_id}/vision-text")
async def get_image_vision_text(
    image_id: int,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Return Vision description for a NoteImage."""
    stmt = select(NoteImage).where(NoteImage.id == image_id)
    result = await db.execute(stmt)
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    return {
        "image_id": image.id,
        "name": image.name,
        "vision_status": image.vision_status,
        "description": image.vision_description,
    }


# -- Background tasks -------------------------------------------------------


async def _run_pdf_extraction(file_id: str, file_path: str) -> None:
    """Background task: extract PDF text and reindex the note."""
    from app.database import async_session_factory
    from app.services.pdf_extractor import PDFExtractor

    async with async_session_factory() as db:
        stmt = select(NoteAttachment).where(NoteAttachment.file_id == file_id)
        result = await db.execute(stmt)
        attachment = result.scalar_one_or_none()
        if not attachment:
            return

        try:
            extractor = PDFExtractor()
            extraction = await extractor.extract(file_path)

            attachment.extracted_text = extraction.text
            attachment.extraction_status = "completed"
            attachment.page_count = extraction.page_count
            await db.commit()

            await _reindex_note(attachment.note_id, db)

        except Exception:
            logger.exception("PDF extraction failed for %s", file_id)
            attachment.extraction_status = "failed"
            await db.commit()


async def _run_ocr_extraction(file_id: str, file_path: str) -> None:
    """Background task: OCR an image attachment and reindex the note."""
    from app.database import async_session_factory
    from app.services.ocr_service import OCRService

    async with async_session_factory() as db:
        stmt = select(NoteAttachment).where(NoteAttachment.file_id == file_id)
        result = await db.execute(stmt)
        attachment = result.scalar_one_or_none()
        if not attachment:
            return

        try:
            ocr = OCRService()
            ocr_result = await ocr.extract_text_from_file(file_path)

            attachment.extracted_text = ocr_result.text
            attachment.extraction_status = "completed"
            await db.commit()

            await _reindex_note(attachment.note_id, db)

        except Exception:
            logger.exception("OCR extraction failed for %s", file_id)
            attachment.extraction_status = "failed"
            await db.commit()


async def _run_image_ocr(image_id: int) -> None:
    """Background task: OCR a NoteImage and reindex its parent note."""
    from app.database import async_session_factory
    from app.models import Note
    from app.services.ocr_service import OCRService

    async with async_session_factory() as db:
        stmt = select(NoteImage).where(NoteImage.id == image_id)
        result = await db.execute(stmt)
        image = result.scalar_one_or_none()
        if not image:
            return

        try:
            ocr = OCRService()
            ocr_result = await ocr.extract_text_from_file(image.file_path)

            image.extracted_text = ocr_result.text
            image.extraction_status = "completed"
            await db.commit()

            # Find the note by synology_note_id to reindex
            note_stmt = select(Note.id).where(
                Note.synology_note_id == image.synology_note_id
            )
            note_result = await db.execute(note_stmt)
            note_id = note_result.scalar_one_or_none()
            if note_id:
                await _reindex_note(note_id, db)

        except Exception:
            logger.exception("Image OCR failed for image %d", image_id)
            image.extraction_status = "failed"
            await db.commit()


_VISION_PROMPT = (
    "Describe this image concisely in 2-3 sentences. "
    "Focus on: main content, objects, text, diagrams, charts, or notable features. "
    "If this is a scientific image (gel, blot, microscopy, etc.), "
    "describe the experimental content."
)

_VISION_MODEL = "glm-4.6v"


async def _run_image_vision(image_id: int) -> None:
    """Background task: run Vision analysis on a NoteImage and reindex its parent note."""
    import base64

    from app.ai_router.router import AIRouter
    from app.ai_router.schemas import AIRequest, ImageContent, Message
    from app.database import async_session_factory
    from app.models import Note

    async with async_session_factory() as db:
        stmt = select(NoteImage).where(NoteImage.id == image_id)
        result = await db.execute(stmt)
        image = result.scalar_one_or_none()
        if not image:
            return

        try:
            file_path = Path(image.file_path)
            if not file_path.exists():
                raise FileNotFoundError(f"Image file not found: {image.file_path}")

            image_bytes = file_path.read_bytes()
            b64 = base64.b64encode(image_bytes).decode("ascii")
            mime_type = image.mime_type or "image/png"

            router = AIRouter()
            message = Message(
                role="user",
                content=_VISION_PROMPT,
                images=[ImageContent(data=b64, mime_type=mime_type)],
            )
            request = AIRequest(
                messages=[message],
                model=_VISION_MODEL,
                temperature=0.3,
            )
            response = await router.chat(request)

            image.vision_description = response.content.strip()
            image.vision_status = "completed"
            await db.commit()

            # Find the note by synology_note_id to reindex
            note_stmt = select(Note.id).where(
                Note.synology_note_id == image.synology_note_id
            )
            note_result = await db.execute(note_stmt)
            note_id = note_result.scalar_one_or_none()
            if note_id:
                await _reindex_note(note_id, db)

        except Exception:
            logger.exception("Image Vision failed for image %d", image_id)
            image.vision_status = "failed"
            await db.commit()


async def _reindex_note(note_id: int, db: AsyncSession) -> None:
    """Reindex note embeddings including extracted text."""
    from app.search.embeddings import EmbeddingService
    from app.search.indexer import NoteIndexer

    try:
        embedding_service = EmbeddingService()
        indexer = NoteIndexer(session=db, embedding_service=embedding_service)
        await indexer.reindex_note(note_id)
    except Exception:
        logger.exception("Failed to reindex note %d after extraction", note_id)
