# @TASK P7-T1 - AI-NoteStation native backup
"""AI-NoteStation backup import/export endpoints."""

from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import require_admin
from app.api.settings import _load_from_db, _save_to_db, sync_api_keys_to_env
from app.config import get_settings
from app.database import async_session_factory, get_db
from app.models import Note, NoteAttachment, NoteImage
from app.services.activity_log import get_trigger_name, log_activity
from app.services.auth_service import get_current_user
from app.synology_gateway.notestation import NoteStationService
from app.utils.datetime_utils import datetime_from_iso, datetime_to_iso

router = APIRouter(tags=["backup"])
settings = get_settings()

BACKUP_VERSION = "ainx-1"


class BackupExportResponse(dict):
    pass


def _compute_md5(file_path: Path) -> str:
    digest = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@router.get("/backup/export")
async def export_backup(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> FileResponse:
    """Export notes, images, and attachments as a native backup archive."""
    export_dir = Path(settings.NSX_EXPORTS_PATH) / "backups"
    export_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    export_path = export_dir / f"ainx_backup_{timestamp}.zip"

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
            "content_json": note.content_json,
            "content_text": note.content_text,
            "notebook": note.notebook_name,
            "tags": note.tags,
            "is_todo": note.is_todo,
            "is_shortcut": note.is_shortcut,
            "source_created_at": datetime_to_iso(note.source_created_at),
            "source_updated_at": datetime_to_iso(note.source_updated_at),
            "synced_at": datetime_to_iso(note.synced_at),
        }
        for note in notes
    ]

    images_payload = [
        {
            "note_id": image.synology_note_id,
            "ref": image.ref,
            "name": image.name,
            "md5": image.md5,
            "mime_type": image.mime_type,
            "width": image.width,
            "height": image.height,
            "file_path": f"images/{image.synology_note_id}/{image.ref}",
        }
        for image in images
    ]

    attachments_payload = []
    note_lookup = {note.id: note.synology_note_id for note in notes}
    for att in attachments:
        note_id = note_lookup.get(att.note_id)
        if not note_id:
            continue
        attachments_payload.append(
            {
                "note_id": note_id,
                "file_id": att.file_id,
                "name": att.name,
                "mime_type": att.mime_type,
                "size": att.size,
                "file_path": f"attachments/{att.file_id}",
            }
        )

    manifest = {
        "version": BACKUP_VERSION,
        "created_at": datetime.now(UTC).isoformat(),
        "note_count": len(notes_payload),
        "image_count": len(images_payload),
        "attachment_count": len(attachments_payload),
    }

    with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.writestr("notes.json", json.dumps(notes_payload, ensure_ascii=False, indent=2))
        archive.writestr("note_images.json", json.dumps(images_payload, ensure_ascii=False, indent=2))
        archive.writestr("note_attachments.json", json.dumps(attachments_payload, ensure_ascii=False, indent=2))

        for image in images:
            if not image.file_path:
                continue
            file_path = Path(image.file_path)
            if file_path.exists():
                archive.write(file_path, arcname=f"images/{image.synology_note_id}/{image.ref}")

        uploads_dir = Path(settings.UPLOADS_PATH)
        for att in attachments:
            file_path = uploads_dir / att.file_id
            if file_path.exists():
                archive.write(file_path, arcname=f"attachments/{att.file_id}")

    return FileResponse(
        path=export_path,
        media_type="application/zip",
        filename=export_path.name,
    )


@router.post("/backup/import", status_code=status.HTTP_201_CREATED)
async def import_backup(
    file: UploadFile = File(..., description="AI-NoteStation backup archive"),
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> dict:
    """Import notes, images, and attachments from a native backup archive."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required",
        )

    imports_dir = Path(settings.NSX_EXPORTS_PATH) / "backups"
    imports_dir.mkdir(parents=True, exist_ok=True)
    temp_path = imports_dir / f"import_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.zip"

    try:
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"파일 저장 실패: {exc}",
        ) from exc

    notes_payload: list[dict] = []
    images_payload: list[dict] = []
    attachments_payload: list[dict] = []

    try:
        with zipfile.ZipFile(temp_path, "r") as archive:
            if "manifest.json" not in archive.namelist():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid backup: manifest.json missing",
                )

            if "notes.json" in archive.namelist():
                notes_payload = json.loads(archive.read("notes.json").decode("utf-8"))
            if "note_images.json" in archive.namelist():
                images_payload = json.loads(archive.read("note_images.json").decode("utf-8"))
            if "note_attachments.json" in archive.namelist():
                attachments_payload = json.loads(archive.read("note_attachments.json").decode("utf-8"))

            async with async_session_factory() as session:
                note_map: dict[str, Note] = {}
                if notes_payload:
                    note_ids = [n.get("note_id") for n in notes_payload if n.get("note_id")]
                    existing_result = await session.execute(select(Note).where(Note.synology_note_id.in_(note_ids)))
                    existing = {note.synology_note_id: note for note in existing_result.scalars().all()}

                    for payload in notes_payload:
                        note_id = payload.get("note_id")
                        if not note_id:
                            continue

                        content_html = payload.get("content_html") or ""
                        content_text = payload.get("content_text") or NoteStationService.extract_text(content_html)
                        note = existing.get(note_id)

                        if note:
                            note.title = payload.get("title", "")
                            note.content_html = content_html
                            note.content_json = payload.get("content_json")
                            note.content_text = content_text
                            note.notebook_name = payload.get("notebook")
                            note.tags = payload.get("tags")
                            note.is_todo = bool(payload.get("is_todo"))
                            note.is_shortcut = bool(payload.get("is_shortcut"))
                            note.source_created_at = datetime_from_iso(payload.get("source_created_at"))
                            note.source_updated_at = datetime_from_iso(payload.get("source_updated_at"))
                            note.synced_at = datetime_from_iso(payload.get("synced_at"))
                        else:
                            note = Note(
                                synology_note_id=note_id,
                                title=payload.get("title", ""),
                                content_html=content_html,
                                content_json=payload.get("content_json"),
                                content_text=content_text,
                                notebook_name=payload.get("notebook"),
                                tags=payload.get("tags"),
                                is_todo=bool(payload.get("is_todo")),
                                is_shortcut=bool(payload.get("is_shortcut")),
                                source_created_at=datetime_from_iso(payload.get("source_created_at")),
                                source_updated_at=datetime_from_iso(payload.get("source_updated_at")),
                                synced_at=datetime_from_iso(payload.get("synced_at")),
                            )
                            session.add(note)
                        note_map[note_id] = note

                await session.flush()

                images_dir = Path(settings.NSX_IMAGES_PATH)
                uploads_dir = Path(settings.UPLOADS_PATH)
                images_dir.mkdir(parents=True, exist_ok=True)
                uploads_dir.mkdir(parents=True, exist_ok=True)

                for img in images_payload:
                    note_id = img.get("note_id")
                    ref = img.get("ref")
                    if not note_id or not ref:
                        continue

                    image_rel = img.get("file_path") or f"images/{note_id}/{ref}"
                    if image_rel not in archive.namelist():
                        continue

                    target_dir = images_dir / note_id
                    target_dir.mkdir(parents=True, exist_ok=True)
                    target_path = target_dir / ref

                    with archive.open(image_rel) as src, open(target_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)

                    md5 = img.get("md5") or _compute_md5(target_path)
                    existing_result = await session.execute(
                        select(NoteImage).where(NoteImage.synology_note_id == note_id).where(NoteImage.ref == ref)
                    )
                    existing_img = existing_result.scalar_one_or_none()
                    if existing_img:
                        existing_img.md5 = md5
                        existing_img.name = img.get("name")
                        existing_img.file_path = str(target_path)
                        existing_img.mime_type = img.get("mime_type") or existing_img.mime_type
                        existing_img.width = img.get("width")
                        existing_img.height = img.get("height")
                    else:
                        session.add(
                            NoteImage(
                                synology_note_id=note_id,
                                ref=ref,
                                name=img.get("name") or ref,
                                md5=md5,
                                file_path=str(target_path),
                                mime_type=img.get("mime_type") or "application/octet-stream",
                                width=img.get("width"),
                                height=img.get("height"),
                            )
                        )

                for att in attachments_payload:
                    note_id = att.get("note_id")
                    file_id = att.get("file_id")
                    if not note_id or not file_id:
                        continue
                    note = note_map.get(note_id)
                    if not note:
                        continue

                    att_rel = att.get("file_path") or f"attachments/{file_id}"
                    if att_rel in archive.namelist():
                        target_path = uploads_dir / file_id
                        with archive.open(att_rel) as src, open(target_path, "wb") as dst:
                            shutil.copyfileobj(src, dst)

                    existing_result = await session.execute(
                        select(NoteAttachment)
                        .where(NoteAttachment.note_id == note.id)
                        .where(NoteAttachment.file_id == file_id)
                    )
                    existing_att = existing_result.scalar_one_or_none()
                    if existing_att:
                        existing_att.name = att.get("name") or existing_att.name
                        existing_att.mime_type = att.get("mime_type")
                        existing_att.size = att.get("size")
                    else:
                        session.add(
                            NoteAttachment(
                                note_id=note.id,
                                file_id=file_id,
                                name=att.get("name") or file_id,
                                mime_type=att.get("mime_type"),
                                size=att.get("size"),
                            )
                        )

                await session.commit()

    finally:
        temp_path.unlink(missing_ok=True)

    return {
        "status": "imported",
        "note_count": len(notes_payload),
        "image_count": len(images_payload),
        "attachment_count": len(attachments_payload),
    }


# ---------------------------------------------------------------------------
# Settings backup endpoints
# ---------------------------------------------------------------------------


@router.get("/backup/settings/export")
async def export_settings(
    current_user: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> Response:
    """Export all application settings as a downloadable JSON file.

    Requires admin access. Returns a JSON file containing all current
    settings with metadata (version, timestamp, count).
    """
    all_settings = await _load_from_db(db)

    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    payload = {
        "version": "settings-1",
        "created_at": datetime.now(UTC).isoformat(),
        "setting_count": len(all_settings),
        "settings": all_settings,
    }

    content = json.dumps(payload, ensure_ascii=False, indent=2)
    filename = f"settings_backup_{timestamp}.json"

    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/backup/settings/import")
async def import_settings(
    file: UploadFile = File(..., description="Settings backup JSON file"),  # noqa: B008
    current_user: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Import application settings from a previously exported JSON file.

    Requires admin access. Validates the file structure, then upserts
    each setting and refreshes API key environment variables.
    """
    try:
        raw = await file.read()
        data = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON file: {exc}",
        ) from exc

    if "version" not in data or "settings" not in data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid settings backup: missing 'version' or 'settings' key",
        )

    imported_settings = data["settings"]
    if not isinstance(imported_settings, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid settings backup: 'settings' must be an object",
        )

    count = 0
    for key, value in imported_settings.items():
        await _save_to_db(db, key, value)
        count += 1

    await sync_api_keys_to_env(db)

    await log_activity(
        "settings",
        "completed",
        message=f"설정 백업 복원: {count}개 항목",
        details={"setting_count": count, "version": data.get("version")},
        triggered_by=get_trigger_name(current_user),
    )

    return {
        "status": "imported",
        "setting_count": count,
    }
