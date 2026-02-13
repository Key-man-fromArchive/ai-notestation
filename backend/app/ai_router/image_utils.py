"""Utilities for extracting images from notes for multimodal AI analysis.

Extracts images from note HTML (NoteStation ref-based images, local NSX images,
NAS proxy images, and uploaded file images), converts them to base64, and returns
ImageContent objects suitable for AI provider APIs.
"""

from __future__ import annotations

import base64
import logging
import mimetypes
import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_router.schemas import ImageContent
from app.models import Note, NoteImage

logger = logging.getLogger(__name__)

# Max size per image (5 MB)
_MAX_IMAGE_BYTES = 5 * 1024 * 1024

# NoteStation-format image tag: <img ... ref="BASE64_NAME" .../>
# This is the raw format stored in content_html.
_NOTESTATION_IMG_RE = re.compile(
    r'<img\b[^>]*?\bref="([^"]+)"[^>]*/?>',
    re.IGNORECASE,
)

# Uploaded file images: <img src="/api/files/{file_id}" .../>
_LOCAL_FILE_IMG_RE = re.compile(
    r'<img\b[^>]*?\bsrc="/api/files/([^"]+)"[^>]*/?>',
    re.IGNORECASE,
)


async def extract_note_images(
    note_id: str,
    db: AsyncSession,
    max_images: int = 5,
) -> list[ImageContent]:
    """Extract images from a note's HTML content and return as base64.

    Handles two image source patterns found in content_html:
    1. NoteStation ref images (``ref="base64name"``) -> lookup in NoteImage DB
       or fetch from NAS
    2. Uploaded file images (``/api/files/{file_id}``)

    Args:
        note_id: The synology_note_id of the note.
        db: Async database session.
        max_images: Maximum number of images to extract (default 5).

    Returns:
        List of ImageContent with base64-encoded image data.
    """
    result = await db.execute(select(Note).where(Note.synology_note_id == note_id))
    note = result.scalar_one_or_none()
    if not note or not note.content_html:
        return []

    html = note.content_html
    images: list[ImageContent] = []

    # Pre-load all NoteImage records for this note
    img_result = await db.execute(select(NoteImage).where(NoteImage.synology_note_id == note_id))
    note_images = img_result.scalars().all()
    # Build lookup: decoded_name -> NoteImage, also name -> NoteImage
    image_by_name: dict[str, NoteImage] = {}
    for ni in note_images:
        if ni.name:
            image_by_name[ni.name] = ni

    # 1. NoteStation ref-based images
    for match in _NOTESTATION_IMG_RE.finditer(html):
        if len(images) >= max_images:
            break
        ref_b64 = match.group(1)
        try:
            decoded_name = base64.b64decode(ref_b64).decode("utf-8")
        except Exception:
            decoded_name = ""

        # Try local NSX image first
        img = _find_local_image(decoded_name, note_images, image_by_name)
        if img:
            images.append(img)
            continue

        # Try NAS proxy if note has NAS data
        if note.link_id and note.nas_ver:
            nas_img = await _load_nas_image_by_ref(note_id, note.link_id, note.nas_ver, decoded_name, db)
            if nas_img:
                images.append(nas_img)

    # 2. Uploaded file images
    if len(images) < max_images:
        for match in _LOCAL_FILE_IMG_RE.finditer(html):
            if len(images) >= max_images:
                break
            img = _load_uploaded_image(match.group(1))
            if img:
                images.append(img)

    if images:
        logger.info("Extracted %d images from note %s", len(images), note_id)
    return images


def _find_local_image(
    decoded_name: str,
    note_images: list[NoteImage],
    image_by_name: dict[str, NoteImage],
) -> ImageContent | None:
    """Try to find and load a local NSX image by decoded name."""
    if not decoded_name:
        return None

    # Direct lookup by name
    img_record = image_by_name.get(decoded_name)

    # Suffix match (decoded name may have timestamp prefix)
    if not img_record:
        for ni in note_images:
            if ni.name and decoded_name.endswith(ni.name):
                img_record = ni
                break

    if not img_record:
        return None

    try:
        file_path = Path(img_record.file_path)
        if not file_path.exists():
            return None

        data = file_path.read_bytes()
        if len(data) > _MAX_IMAGE_BYTES:
            logger.warning("Skipping oversized local image: %s (%d bytes)", decoded_name, len(data))
            return None

        mime_type = img_record.mime_type or "image/png"
        return ImageContent(data=base64.b64encode(data).decode("ascii"), mime_type=mime_type)
    except Exception:
        logger.warning("Failed to load local image: %s", decoded_name, exc_info=True)
        return None


async def _load_nas_image_by_ref(
    note_id: str,
    link_id: str,
    nas_ver: str,
    decoded_name: str,
    db: AsyncSession,
) -> ImageContent | None:
    """Load a NoteStation image from NAS by fetching attachment metadata."""
    try:
        from app.api.sync import _create_sync_service

        # Get attachment data from NAS to find the att_key for this image
        service, session, _ = await _create_sync_service()
        try:
            nas_detail = await service._notestation.get_note(note_id)
            att_raw = nas_detail.get("attachment")
            if not isinstance(att_raw, dict):
                return None

            # Find the attachment matching this decoded name
            for att_key, att in att_raw.items():
                if not isinstance(att, dict):
                    continue
                att_ref = att.get("ref", "")
                att_name = att.get("name", "")
                if (
                    att_name == decoded_name
                    or (att_name and decoded_name.endswith(att_name))
                    or att_ref == decoded_name
                ):
                    filename = att_name or decoded_name
                    nas_path = f"/note/ns/dv/{link_id}/{nas_ver}/{att_key}/{filename}"
                    image_bytes, content_type = await service._notestation._client.fetch_binary(nas_path)

                    if not image_bytes:
                        return None

                    if len(image_bytes) > _MAX_IMAGE_BYTES:
                        logger.warning("Skipping oversized NAS image: %s (%d bytes)", filename, len(image_bytes))
                        return None

                    mime_type = content_type or mimetypes.guess_type(filename)[0] or "image/png"
                    return ImageContent(
                        data=base64.b64encode(image_bytes).decode("ascii"),
                        mime_type=mime_type,
                    )
        finally:
            await session.close()
    except Exception:
        logger.warning("Failed to load NAS image for note %s: %s", note_id, decoded_name, exc_info=True)
    return None


def _load_uploaded_image(file_id: str) -> ImageContent | None:
    """Load an uploaded file image by file_id."""
    try:
        from app.config import get_settings

        settings = get_settings()
        file_path = Path(settings.UPLOADS_PATH) / file_id
        if not file_path.exists():
            return None

        mime_type, _ = mimetypes.guess_type(file_id)
        if not mime_type or not mime_type.startswith("image/"):
            return None

        data = file_path.read_bytes()
        if len(data) > _MAX_IMAGE_BYTES:
            logger.warning("Skipping oversized uploaded image: %s (%d bytes)", file_id, len(data))
            return None

        return ImageContent(data=base64.b64encode(data).decode("ascii"), mime_type=mime_type)
    except Exception:
        logger.warning("Failed to load uploaded image %s", file_id, exc_info=True)
        return None


async def get_cached_image_descriptions(
    note_id: str,
    db: AsyncSession,
) -> str | None:
    """Get cached OCR + Vision text for a note's images.

    Returns a combined text block if any cached descriptions exist,
    or None if no cached data is available (caller should fall back
    to sending raw images).

    Args:
        note_id: The synology_note_id of the note.
        db: Async database session.

    Returns:
        Combined text block or None.
    """
    stmt = select(
        NoteImage.name,
        NoteImage.extracted_text,
        NoteImage.vision_description,
    ).where(
        NoteImage.synology_note_id == note_id,
        (NoteImage.extraction_status == "completed") | (NoteImage.vision_status == "completed"),
    )
    result = await db.execute(stmt)
    rows = result.fetchall()

    if not rows:
        return None

    parts = []
    for name, ocr_text, vision_desc in rows:
        lines = [f"Image: {name}"]
        if ocr_text and ocr_text.strip():
            lines.append(f"OCR: {ocr_text.strip()}")
        if vision_desc and vision_desc.strip():
            lines.append(f"Description: {vision_desc.strip()}")
        if len(lines) > 1:  # has at least some content
            parts.append("\n".join(lines))

    return "\n\n".join(parts) if parts else None
