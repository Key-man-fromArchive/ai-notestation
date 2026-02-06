# @TASK P6-T6.1 - Notes export endpoint
"""Export notes and attachments from the local database."""

from __future__ import annotations

import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import Note, NoteAttachment, NoteImage
from app.services.auth_service import get_current_user
from app.utils.datetime_utils import datetime_to_iso

router = APIRouter(tags=["export"])
settings = get_settings()


@router.get("/export/notes")
async def export_notes(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> FileResponse:
    """Export notes and extracted images as a ZIP archive."""
    export_dir = Path(settings.NSX_EXPORTS_PATH) / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    zip_path = export_dir / f"notes_export_{timestamp}.zip"

    notes_result = await db.execute(select(Note))
    notes = notes_result.scalars().all()

    images_result = await db.execute(select(NoteImage))
    images = images_result.scalars().all()

    attachments_result = await db.execute(select(NoteAttachment))
    attachments = attachments_result.scalars().all()

    notes_payload = [
        {
            "note_id": note.synology_note_id,
            "title": note.title,
            "content_html": note.content_html,
            "content_text": note.content_text,
            "notebook": note.notebook_name,
            "tags": note.tags,
            "is_todo": note.is_todo,
            "source_created_at": datetime_to_iso(note.source_created_at),
            "source_updated_at": datetime_to_iso(note.source_updated_at),
            "synced_at": datetime_to_iso(note.synced_at),
            "created_at": datetime_to_iso(note.created_at),
            "updated_at": datetime_to_iso(note.updated_at),
        }
        for note in notes
    ]

    images_payload = [
        {
            "note_id": image.synology_note_id,
            "ref": image.ref,
            "name": image.name,
            "md5": image.md5,
            "file_path": image.file_path,
            "mime_type": image.mime_type,
            "width": image.width,
            "height": image.height,
            "created_at": datetime_to_iso(image.created_at),
        }
        for image in images
    ]

    attachments_payload = [
        {
            "note_id": att.note_id,
            "file_id": att.file_id,
            "name": att.name,
            "mime_type": att.mime_type,
            "size": att.size,
            "created_at": datetime_to_iso(att.created_at),
        }
        for att in attachments
    ]

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("notes.json", json.dumps(notes_payload, ensure_ascii=False, indent=2))
        archive.writestr("note_images.json", json.dumps(images_payload, ensure_ascii=False, indent=2))
        archive.writestr("note_attachments.json", json.dumps(attachments_payload, ensure_ascii=False, indent=2))

        uploads_dir = Path(settings.UPLOADS_PATH)
        if uploads_dir.exists():
            for file_path in uploads_dir.iterdir():
                if file_path.is_file():
                    archive.write(file_path, arcname=f"uploads/{file_path.name}")

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=zip_path.name,
    )
