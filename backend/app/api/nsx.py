# NSX Import and Image Serving API
# Handles NSX file import for image extraction and serves extracted images

"""NSX API endpoints for LabNote AI.

Provides:
- ``POST /nsx/import``          -- Upload and process NSX file
- ``GET  /nsx/status``          -- Get import status
- ``GET  /images/{note_id}/{ref}`` -- Serve extracted images

NSX files are Synology NoteStation export archives containing notes
and their embedded images. This API extracts images and stores them
for serving via the image endpoint.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import async_session_factory, get_db
from app.models import NoteImage
from app.services.auth_service import get_current_user
from app.services.nsx_parser import NsxParser

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["nsx"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class NsxImportResponse(BaseModel):
    """Response for NSX import endpoint."""

    status: str  # "importing" | "already_importing"
    message: str
    filename: str | None = None


class NsxImportStatusResponse(BaseModel):
    """Response for import status endpoint."""

    status: str  # "idle" | "importing" | "completed" | "error"
    last_import_at: str | None = None
    notes_processed: int | None = None
    images_extracted: int | None = None
    error_message: str | None = None
    errors: list[str] = []


# ---------------------------------------------------------------------------
# In-memory import state
# ---------------------------------------------------------------------------


class ImportState:
    """Mutable in-memory tracker for import progress."""

    def __init__(self) -> None:
        self.status: str = "idle"
        self.is_importing: bool = False
        self.last_import_at: str | None = None
        self.notes_processed: int | None = None
        self.images_extracted: int | None = None
        self.error_message: str | None = None
        self.errors: list[str] = []


_import_state = ImportState()


# ---------------------------------------------------------------------------
# Background import runner
# ---------------------------------------------------------------------------


async def _run_import_background(nsx_path: Path, state: ImportState) -> None:
    """Execute NSX import and update state accordingly.

    Args:
        nsx_path: Path to the uploaded NSX file.
        state: ImportState instance to update.
    """
    state.status = "importing"
    state.is_importing = True
    state.error_message = None
    state.errors = []

    try:
        # Parse NSX file
        output_dir = Path(settings.NSX_IMAGES_PATH)
        parser = NsxParser(nsx_path=nsx_path, output_dir=output_dir)
        result = parser.parse()

        state.notes_processed = result.notes_processed
        state.images_extracted = result.images_extracted
        state.errors = result.errors

        # Save image mappings to database
        async with async_session_factory() as session:
            for att in result.attachments:
                # Check if mapping already exists
                existing = await session.execute(
                    select(NoteImage).where(
                        NoteImage.synology_note_id == att.note_id,
                        NoteImage.ref == att.ref,
                    )
                )
                existing_img = existing.scalar_one_or_none()

                if existing_img:
                    # Update existing record
                    existing_img.md5 = att.md5
                    existing_img.name = att.name
                    existing_img.file_path = str(att.file_path)
                    existing_img.mime_type = att.mime_type
                    existing_img.width = att.width
                    existing_img.height = att.height
                else:
                    # Create new record
                    new_img = NoteImage(
                        synology_note_id=att.note_id,
                        ref=att.ref,
                        name=att.name,
                        md5=att.md5,
                        file_path=str(att.file_path),
                        mime_type=att.mime_type,
                        width=att.width,
                        height=att.height,
                    )
                    session.add(new_img)

            await session.commit()

        state.status = "completed"
        state.last_import_at = datetime.now(UTC).isoformat()

        logger.info(
            "NSX import completed: %d notes, %d images, %d errors",
            result.notes_processed,
            result.images_extracted,
            len(result.errors),
        )

    except Exception as exc:
        state.status = "error"
        state.error_message = str(exc)
        logger.exception("NSX import failed: %s", exc)

    finally:
        state.is_importing = False
        # Clean up uploaded NSX file
        try:
            nsx_path.unlink(missing_ok=True)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/nsx/import", response_model=NsxImportResponse)
async def import_nsx(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="NSX export file from NoteStation"),
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> NsxImportResponse:
    """Upload and process an NSX file to extract images.

    The NSX file will be processed in the background. Use the
    ``GET /nsx/status`` endpoint to check progress.

    Requires JWT authentication via Bearer token.
    """
    if _import_state.is_importing:
        return NsxImportResponse(
            status="already_importing",
            message="이미 NSX 가져오기가 진행 중입니다.",
            filename=None,
        )

    # Validate file extension
    if not file.filename or not file.filename.lower().endswith(".nsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="NSX 파일(.nsx)만 업로드할 수 있습니다.",
        )

    # Save uploaded file
    exports_dir = Path(settings.NSX_EXPORTS_PATH)
    exports_dir.mkdir(parents=True, exist_ok=True)

    nsx_path = exports_dir / f"import_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.nsx"

    try:
        with open(nsx_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"파일 저장 실패: {e}",
        ) from e

    # Start background import
    background_tasks.add_task(_run_import_background, nsx_path, _import_state)

    return NsxImportResponse(
        status="importing",
        message="NSX 가져오기를 시작합니다.",
        filename=file.filename,
    )


@router.get("/nsx/status", response_model=NsxImportStatusResponse)
async def get_import_status(
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> NsxImportStatusResponse:
    """Get the current NSX import status.

    Requires JWT authentication via Bearer token.
    """
    return NsxImportStatusResponse(
        status=_import_state.status,
        last_import_at=_import_state.last_import_at,
        notes_processed=_import_state.notes_processed,
        images_extracted=_import_state.images_extracted,
        error_message=_import_state.error_message,
        errors=_import_state.errors[:10],  # Limit to first 10 errors
    )


@router.get("/images/{note_id}/{ref}")
async def get_image(
    note_id: str,
    ref: str,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> FileResponse:
    """Serve an extracted image by note ID and reference.

    This endpoint does NOT require authentication to allow direct
    image embedding in rendered markdown content.

    Args:
        note_id: The Synology note object_id.
        ref: The image reference (original filename from note content).
        db: Database session.

    Returns:
        The image file as a FileResponse.

    Raises:
        HTTPException 404: If the image is not found.
    """
    # Look up image in database
    result = await db.execute(
        select(NoteImage).where(
            NoteImage.synology_note_id == note_id,
            NoteImage.ref == ref,
        )
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Image not found: {note_id}/{ref}",
        )

    # Verify file exists
    file_path = Path(image.file_path)
    if not file_path.exists():
        logger.warning("Image file missing: %s", file_path)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image file not found on disk",
        )

    return FileResponse(
        path=file_path,
        media_type=image.mime_type,
        filename=image.name,
    )


@router.get("/images/by-md5/{md5}")
async def get_image_by_md5(
    md5: str,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> FileResponse:
    """Serve an extracted image by its MD5 hash.

    Useful for cases where the note_id is not known but the
    MD5 hash is available from the attachment metadata.

    Args:
        md5: The MD5 hash of the image file.
        db: Database session.

    Returns:
        The image file as a FileResponse.

    Raises:
        HTTPException 404: If the image is not found.
    """
    result = await db.execute(
        select(NoteImage).where(NoteImage.md5 == md5).limit(1)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Image not found with MD5: {md5}",
        )

    file_path = Path(image.file_path)
    if not file_path.exists():
        logger.warning("Image file missing: %s", file_path)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image file not found on disk",
        )

    return FileResponse(
        path=file_path,
        media_type=image.mime_type,
        filename=image.name,
    )
