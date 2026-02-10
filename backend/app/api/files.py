# @TASK P6-T6.2 - File upload and serving endpoints
"""File upload API for note attachments and images."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.config import get_settings
from app.services.activity_log import get_trigger_name, log_activity
from app.services.auth_service import get_current_user

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
