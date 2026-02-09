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
import base64
import hashlib
import json
import logging
import re
import shutil
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import async_session_factory, get_db
from app.models import Note, NoteAttachment, NoteImage
from app.services.auth_service import get_current_user
from app.services.nsx_parser import NoteRecord, NsxParser
from app.synology_gateway.notestation import NoteStationService

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


class NsxExportResponse(BaseModel):
    """Response for NSX export endpoint."""

    filename: str
    note_count: int
    notebook_count: int


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
# Image sync state (for auto-sync from NAS)
# ---------------------------------------------------------------------------


class ImageSyncState:
    """Mutable in-memory tracker for image sync progress."""

    def __init__(self) -> None:
        self.status: str = "idle"  # idle | syncing | completed | error
        self.is_syncing: bool = False
        self.last_sync_at: str | None = None
        self.total_notes: int = 0
        self.processed_notes: int = 0
        self.images_extracted: int = 0
        self.failed_notes: int = 0
        self.error_message: str | None = None


_image_sync_state = ImageSyncState()


def _unix_to_utc(timestamp: int | float | None) -> datetime | None:
    """Convert Unix timestamp to UTC datetime."""
    if timestamp is None:
        return None
    try:
        return datetime.fromtimestamp(timestamp, tz=UTC)
    except (OSError, TypeError, ValueError):
        return None


def _normalize_tags(tags: list | dict | None) -> list[str] | None:
    """Normalize tag field to a list of strings."""
    if tags is None:
        return None
    if isinstance(tags, dict):
        return list(tags.values()) if tags else None
    if isinstance(tags, list):
        return tags if tags else None
    return None


def _compute_md5(file_path: Path) -> str:
    digest = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _build_notebook_map(notes: list[Note]) -> dict[str, str]:
    notebook_names = sorted({note.notebook_name for note in notes if note.notebook_name})
    return {name: f"notebook_{uuid4().hex}" for name in notebook_names}


def _encode_ref(name: str) -> str:
    return base64.b64encode(name.encode("utf-8")).decode("utf-8")


def _rewrite_content_for_nsx(
    html: str,
    image_map: dict[str, NoteImage],
    attachment_name_map: dict[str, str],
) -> str:
    if not html:
        return html

    def _replace(match: re.Match) -> str:
        src = match.group(1)
        if src.startswith("/api/images/"):
            ref = src.split("/")[-1]
            img = image_map.get(ref)
            if img:
                ref_name = img.name or img.ref
                ref_b64 = _encode_ref(ref_name)
                return (
                    '<img class="syno-notestation-image-object" '
                    'src="webman/3rdparty/NoteStation/images/transparent.gif" '
                    f'ref="{ref_b64}" />'
                )
        if src.startswith("/api/files/"):
            file_id = src.split("/")[-1]
            ref_name = attachment_name_map.get(file_id)
            if ref_name:
                ref_b64 = _encode_ref(ref_name)
                return (
                    '<img class="syno-notestation-image-object" '
                    'src="webman/3rdparty/NoteStation/images/transparent.gif" '
                    f'ref="{ref_b64}" />'
                )
        return match.group(0)

    img_src_re = re.compile(r'<img\b[^>]*?src="([^"]+)"[^>]*/?>', re.IGNORECASE)
    return img_src_re.sub(_replace, html)


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

        # Save notes and image mappings to database
        async with async_session_factory() as session:
            if result.notes:
                await _upsert_notes(session, result.notes)

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


async def _upsert_notes(
    session: AsyncSession,
    notes: list[NoteRecord],
) -> None:
    """Insert or update notes parsed from an NSX export."""
    if not notes:
        return

    note_ids = [note.note_id for note in notes]
    existing_result = await session.execute(select(Note).where(Note.synology_note_id.in_(note_ids)))
    existing_map = {note.synology_note_id: note for note in existing_result.scalars().all()}

    synced_at = datetime.now(UTC)

    for record in notes:
        content_html = record.content_html or ""
        content_text = NoteStationService.extract_text(content_html)
        tags = _normalize_tags(record.tags)
        source_created_at = _unix_to_utc(record.ctime)
        source_updated_at = _unix_to_utc(record.mtime)
        is_todo = record.category == "todo"

        if record.note_id in existing_map:
            db_note = existing_map[record.note_id]
            db_note.title = record.title
            db_note.content_html = content_html
            db_note.content_text = content_text
            db_note.notebook_name = record.notebook_name
            db_note.tags = tags
            db_note.is_todo = is_todo
            db_note.is_shortcut = False
            db_note.source_created_at = source_created_at
            db_note.source_updated_at = source_updated_at
            db_note.synced_at = synced_at
            continue

        session.add(
            Note(
                synology_note_id=record.note_id,
                title=record.title,
                content_html=content_html,
                content_text=content_text,
                notebook_name=record.notebook_name,
                tags=tags,
                is_todo=is_todo,
                is_shortcut=False,
                source_created_at=source_created_at,
                source_updated_at=source_updated_at,
                synced_at=synced_at,
            )
        )


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


@router.get("/nsx/export", response_model=NsxExportResponse)
async def export_nsx(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NsxExportResponse:
    """Export notes and attachments as an NSX archive."""
    export_dir = Path(settings.NSX_EXPORTS_PATH) / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    export_path = export_dir / f"labnote_export_{timestamp}.nsx"

    notes_result = await db.execute(select(Note))
    notes = notes_result.scalars().all()

    attachments_result = await db.execute(select(NoteAttachment))
    attachments = attachments_result.scalars().all()

    images_result = await db.execute(select(NoteImage))
    images = images_result.scalars().all()

    notebook_map = _build_notebook_map(notes)

    attachments_by_note: dict[int, list[NoteAttachment]] = {}
    for att in attachments:
        attachments_by_note.setdefault(att.note_id, []).append(att)

    images_by_note: dict[str, list[NoteImage]] = {}
    for img in images:
        images_by_note.setdefault(img.synology_note_id, []).append(img)

    file_cache: set[str] = set()

    with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        notebook_ids = list(notebook_map.values())
        note_ids = [note.synology_note_id for note in notes]

        config = {
            "note": note_ids,
            "notebook": notebook_ids,
        }
        archive.writestr("config.json", json.dumps(config, ensure_ascii=False))

        for name, nb_id in notebook_map.items():
            notebook_payload = {
                "object_id": nb_id,
                "title": name,
            }
            archive.writestr(nb_id, json.dumps(notebook_payload, ensure_ascii=False))

        for note in notes:
            note_images = images_by_note.get(note.synology_note_id, [])
            image_map = {img.ref: img for img in note_images}

            attachment_name_map: dict[str, str] = {}
            attachment_payload: dict[str, dict] = {}

            for img in note_images:
                if not img.file_path:
                    continue
                file_path = Path(img.file_path)
                if not file_path.exists():
                    continue
                md5 = img.md5 or _compute_md5(file_path)
                file_key = f"file_{md5}"
                if file_key not in file_cache:
                    archive.write(file_path, arcname=file_key)
                    file_cache.add(file_key)

                export_name = img.name or img.ref
                attachment_payload[export_name] = {
                    "md5": md5,
                    "name": export_name,
                    "type": img.mime_type or "image/png",
                    "width": img.width,
                    "height": img.height,
                }

            for att in attachments_by_note.get(note.id, []):
                uploads_dir = Path(settings.UPLOADS_PATH)
                file_path = uploads_dir / att.file_id
                if not file_path.exists():
                    continue
                md5 = _compute_md5(file_path)
                file_key = f"file_{md5}"
                if file_key not in file_cache:
                    archive.write(file_path, arcname=file_key)
                    file_cache.add(file_key)

                export_name = att.name
                attachment_name_map[att.file_id] = export_name
                attachment_payload[export_name] = {
                    "md5": md5,
                    "name": export_name,
                    "type": att.mime_type or "application/octet-stream",
                }

            content = _rewrite_content_for_nsx(
                note.content_html,
                image_map,
                attachment_name_map,
            )

            note_payload = {
                "object_id": note.synology_note_id,
                "title": note.title,
                "content": content,
                "parent_id": notebook_map.get(note.notebook_name or ""),
                "tag": note.tags or [],
                "ctime": int(note.source_created_at.timestamp()) if note.source_created_at else None,
                "mtime": int(note.source_updated_at.timestamp()) if note.source_updated_at else None,
                "category": "note",
                "attachment": attachment_payload,
            }

            archive.writestr(note.synology_note_id, json.dumps(note_payload, ensure_ascii=False))

    return NsxExportResponse(
        filename=export_path.name,
        note_count=len(notes),
        notebook_count=len(notebook_map),
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


class ImageSyncStatusResponse(BaseModel):
    status: str
    total_notes: int = 0
    processed_notes: int = 0
    images_extracted: int = 0
    failed_notes: int = 0
    last_sync_at: str | None = None
    error_message: str | None = None


class ImageSyncTriggerResponse(BaseModel):
    status: str
    message: str
    total_notes: int = 0


SYSTEM_FILES = frozenset({"checked", "unchecked", "shadow_title"})


async def _export_note_images(
    client_url: str,
    sid: str,
    note_id: str,
    output_dir: Path,
) -> tuple[int, str | None]:
    import httpx
    import io

    images_extracted = 0

    try:
        async with httpx.AsyncClient(verify=False, timeout=60.0) as http:
            url = f"{client_url}/webapi/entry.cgi"

            start_resp = await http.post(
                url,
                data={
                    "api": "SYNO.NoteStation.Export.Note",
                    "version": 1,
                    "method": "start",
                    "object_id": note_id,
                    "_sid": sid,
                },
            )
            start_result = start_resp.json()

            if not start_result.get("success"):
                return 0, f"Failed to start export: {start_result}"

            task_id = start_result["data"]["task_id"]

            for _ in range(30):
                await asyncio.sleep(1)
                status_resp = await http.post(
                    url,
                    data={
                        "api": "SYNO.NoteStation.Export.Note",
                        "version": 1,
                        "method": "status",
                        "task_id": task_id,
                        "_sid": sid,
                    },
                )
                if status_resp.json().get("data", {}).get("finish"):
                    break
            else:
                return 0, "Export timeout"

            download_resp = await http.post(
                url,
                data={
                    "api": "SYNO.NoteStation.Export.Note",
                    "version": 1,
                    "method": "download",
                    "task_id": task_id,
                    "_sid": sid,
                },
            )

            if "zip" not in download_resp.headers.get("content-type", ""):
                return 0, f"Invalid response: {download_resp.headers.get('content-type')}"

            with zipfile.ZipFile(io.BytesIO(download_resp.content), "r") as zf:
                for name in zf.namelist():
                    if not name.startswith("files/") or name.endswith("/"):
                        continue

                    filename = name.split("/")[-1]
                    if "." not in filename:
                        continue

                    md5, ext = filename.rsplit(".", 1)
                    if md5 in SYSTEM_FILES:
                        continue

                    output_path = output_dir / f"{md5}.{ext}"
                    if not output_path.exists():
                        output_path.write_bytes(zf.read(name))

                    images_extracted += 1

    except Exception as e:
        logger.warning("Failed to export note %s: %s", note_id, e)
        return 0, str(e)

    return images_extracted, None


async def _sync_note_with_images(
    nas_url: str,
    sid: str,
    note_id: str,
    output_dir: Path,
    notestation,
) -> tuple[int, str | None]:
    images_count, error = await _export_note_images(nas_url, sid, note_id, output_dir)
    if error:
        return 0, error

    if images_count == 0:
        return 0, None

    try:
        note_data = await notestation.get_note(note_id)
        attachments = note_data.get("attachment", {})

        async with async_session_factory() as db:
            for ref, att_info in attachments.items():
                if att_info.get("type") != "image":
                    continue

                md5 = att_info.get("md5")
                if not md5:
                    continue

                ext = att_info.get("ext", "png")
                file_path = output_dir / f"{md5}.{ext}"
                if not file_path.exists():
                    continue

                existing = await db.execute(
                    select(NoteImage).where(
                        NoteImage.synology_note_id == note_id,
                        NoteImage.ref == ref,
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                note_image = NoteImage(
                    synology_note_id=note_id,
                    ref=ref,
                    md5=md5,
                    name=att_info.get("name", f"{md5}.{ext}"),
                    file_path=str(file_path),
                    mime_type=f"image/{ext}",
                    width=att_info.get("width"),
                    height=att_info.get("height"),
                )
                db.add(note_image)

            await db.commit()

    except Exception as e:
        logger.warning("Failed to save image metadata for %s: %s", note_id, e)
        return images_count, str(e)

    return images_count, None


async def _run_image_sync_background(state: ImageSyncState) -> None:
    from sqlalchemy import text

    from app.api.settings import get_nas_config
    from app.synology_gateway.client import SynologyClient
    from app.synology_gateway.notestation import NoteStationService

    state.status = "syncing"
    state.is_syncing = True
    state.processed_notes = 0
    state.images_extracted = 0
    state.failed_notes = 0
    state.error_message = None

    try:
        nas = get_nas_config()
        client = SynologyClient(url=nas["url"], user=nas["user"], password=nas["password"])
        sid = await client.login()
        notestation = NoteStationService(client)

        output_dir = Path(settings.NSX_IMAGES_PATH)
        output_dir.mkdir(parents=True, exist_ok=True)

        async with async_session_factory() as db:
            result = await db.execute(
                text("""
                    SELECT DISTINCT n.synology_note_id
                    FROM notes n
                    WHERE n.content_html ~ '<img[^>]*ref="[^"]+"'
                    AND NOT EXISTS (
                        SELECT 1 FROM note_images ni
                        WHERE ni.synology_note_id = n.synology_note_id
                    )
                    LIMIT 500
                """)
            )
            note_ids = [row[0] for row in result.fetchall()]

        state.total_notes = len(note_ids)
        logger.info("Starting image sync for %d notes", state.total_notes)

        if not note_ids:
            state.status = "completed"
            state.last_sync_at = datetime.now(UTC).isoformat()
            await client.close()
            return

        semaphore = asyncio.Semaphore(5)

        async def process_note(note_id: str) -> None:
            async with semaphore:
                images, error = await _sync_note_with_images(nas["url"], sid, note_id, output_dir, notestation)
                state.processed_notes += 1
                if error:
                    state.failed_notes += 1
                else:
                    state.images_extracted += images

        await asyncio.gather(*[process_note(nid) for nid in note_ids])

        await client.close()

        state.status = "completed"
        state.last_sync_at = datetime.now(UTC).isoformat()
        logger.info(
            "Image sync completed: %d/%d notes, %d images",
            state.processed_notes,
            state.total_notes,
            state.images_extracted,
        )

    except Exception as exc:
        logger.exception("Image sync failed: %s", exc)
        state.status = "error"
        state.error_message = str(exc)
    finally:
        state.is_syncing = False


@router.post("/nsx/sync-images", response_model=ImageSyncTriggerResponse)
async def sync_images_from_nas(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> ImageSyncTriggerResponse:
    """Trigger automatic image sync from NAS.

    Exports notes with missing images from NAS and extracts embedded images.
    Processing happens in the background.
    """
    if _image_sync_state.is_syncing:
        return ImageSyncTriggerResponse(
            status="already_syncing",
            message="이미 이미지 동기화가 진행 중입니다.",
            total_notes=_image_sync_state.total_notes,
        )

    # Get count of notes needing sync
    async with async_session_factory() as db:
        from sqlalchemy import text

        result = await db.execute(
            text("""
                SELECT COUNT(DISTINCT n.synology_note_id)
                FROM notes n
                WHERE n.content_html ~ '<img[^>]*ref="[^"]+"'
                AND NOT EXISTS (
                    SELECT 1 FROM note_images ni
                    WHERE ni.synology_note_id = n.synology_note_id
                )
            """)
        )
        total = result.scalar() or 0

    if total == 0:
        return ImageSyncTriggerResponse(
            status="no_work",
            message="동기화할 이미지가 없습니다.",
            total_notes=0,
        )

    _image_sync_state.total_notes = total
    background_tasks.add_task(_run_image_sync_background, _image_sync_state)

    return ImageSyncTriggerResponse(
        status="syncing",
        message=f"{total}개 노트의 이미지 동기화를 시작합니다.",
        total_notes=total,
    )


@router.get("/nsx/sync-images/status", response_model=ImageSyncStatusResponse)
async def get_image_sync_status(
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> ImageSyncStatusResponse:
    """Get current image sync status."""
    return ImageSyncStatusResponse(
        status=_image_sync_state.status,
        total_notes=_image_sync_state.total_notes,
        processed_notes=_image_sync_state.processed_notes,
        images_extracted=_image_sync_state.images_extracted,
        failed_notes=_image_sync_state.failed_notes,
        last_sync_at=_image_sync_state.last_sync_at,
        error_message=_image_sync_state.error_message,
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
    result = await db.execute(select(NoteImage).where(NoteImage.md5 == md5).limit(1))
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
