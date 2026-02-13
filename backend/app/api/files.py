# @TASK P6-T6.2 - File upload and serving endpoints
"""File upload API for note attachments and images."""

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
from app.models import NoteAttachment
from app.services.activity_log import get_trigger_name, log_activity
from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["files"])
settings = get_settings()


@router.post("/files", status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(..., description="Attachment file"),
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
    """Trigger PDF text extraction in the background."""
    uploads_dir = Path(settings.UPLOADS_PATH)
    file_path = uploads_dir / file_id

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if not file_id.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files can be extracted")

    stmt = select(NoteAttachment).where(NoteAttachment.file_id == file_id)
    result = await db.execute(stmt)
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if attachment.extraction_status == "completed":
        return {"status": "already_completed", "page_count": attachment.page_count}

    attachment.extraction_status = "pending"
    await db.commit()

    background_tasks.add_task(_run_pdf_extraction, file_id, str(file_path))

    return {"status": "pending"}


@router.get("/files/{file_id}/text")
async def get_file_text(
    file_id: str,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Return extracted PDF text for a file."""
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

            await _reindex_note_with_pdf(attachment.note_id, db)

        except Exception:
            logger.exception("PDF extraction failed for %s", file_id)
            attachment.extraction_status = "failed"
            await db.commit()


async def _reindex_note_with_pdf(note_id: int, db: AsyncSession) -> None:
    """Reindex note embeddings including PDF extracted text."""
    from app.search.embeddings import EmbeddingService
    from app.search.indexer import NoteIndexer

    try:
        embedding_service = EmbeddingService()
        indexer = NoteIndexer(session=db, embedding_service=embedding_service)
        await indexer.reindex_note(note_id)
    except Exception:
        logger.exception("Failed to reindex note %d after PDF extraction", note_id)
