# @TASK T-NAS-IMG - NAS image streaming proxy
# @SPEC NoteStation image proxy for secure frontend access

"""NAS image streaming proxy.

Streams NoteStation images through the backend to avoid
exposing NAS auth tokens to the frontend.

NoteStation image URL pattern on the NAS:
    /note/ns/dv/{link_id}/{ver}/{att_key}/{filename}

This endpoint maps:
    GET /api/nas-images/{note_id}/{att_key}/{filename}
    -> NAS /note/ns/dv/{link_id}/{nas_ver}/{att_key}/{filename}
"""

from __future__ import annotations

import asyncio
import logging
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Note

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/nas-images", tags=["nas-images"])

# Limit concurrent NAS image fetches to prevent overwhelming the NAS
# when notes have hundreds of images (e.g. 260 images in one note).
_NAS_FETCH_SEMAPHORE = asyncio.Semaphore(8)

# 1x1 transparent GIF that NoteStation returns for deleted/empty attachments.
# GIF89a header (47 49 46 38 39 61), 1x1 pixel, 43 bytes total.
_PLACEHOLDER_GIF_MD5 = "325472601571f31e1bf00674c368d335"
_MIN_VALID_IMAGE_SIZE = 100  # bytes; anything smaller is likely a placeholder


async def _get_user_flexible(
    request: Request,
    token: str | None = Query(None, description="JWT for img tag auth"),
) -> dict:
    """Accept auth via ``?token=`` query param or ``Authorization: Bearer`` header."""
    from jose import JWTError

    from app.services.auth_service import verify_token

    # Try Bearer header first
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        raw = auth_header[7:]
        try:
            payload = verify_token(raw)
            if payload.get("type") == "access":
                return payload
        except JWTError:
            pass

    # Fall back to query param (used by <img> tags)
    if token:
        try:
            payload = verify_token(token)
            if payload.get("type") == "access":
                return payload
        except JWTError:
            pass

    raise HTTPException(status_code=401, detail="Authentication required")


@router.get("/{note_id}/{att_key}/{filename}")
async def proxy_nas_image(
    note_id: str,
    att_key: str,
    filename: str,
    current_user: dict = Depends(_get_user_flexible),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Stream a NoteStation image through the backend.

    Looks up the note's ``link_id`` and ``nas_ver`` from the database,
    constructs the NAS image path, fetches the binary via the
    authenticated SynologyClient, and streams it back to the caller
    with cache headers.

    If the stored ``nas_ver`` is stale (NAS returns HTML instead of an image),
    automatically fetches the latest version from NAS and retries.

    Args:
        note_id: The synology_note_id of the note.
        att_key: The NAS attachment key (e.g. ``_yDRx9FC8_sWJ3qvjJxat2w``).
        filename: The image filename (e.g. ``photo.png``).

    Raises:
        HTTPException 404: If the note or NAS metadata is not found.
        HTTPException 502: If fetching from the NAS fails.
    """
    # Look up note to get link_id and ver
    result = await db.execute(
        select(Note).where(Note.synology_note_id == note_id)
    )
    note = result.scalar_one_or_none()
    if not note or not note.link_id or not note.nas_ver:
        raise HTTPException(status_code=404, detail="Note or NAS metadata not found")

    # Throttle concurrent NAS fetches to prevent overload
    async with _NAS_FETCH_SEMAPHORE:
        try:
            from app.api.sync import _create_sync_service

            service, session, _ = await _create_sync_service()
            try:
                # Try with stored version first
                nas_path = f"/note/ns/dv/{note.link_id}/{note.nas_ver}/{att_key}/{filename}"
                image_bytes, content_type = await service._notestation._client.fetch_binary(nas_path)

                # If NAS returns HTML, the version is likely stale — refresh and retry
                if content_type and "text/html" in content_type:
                    logger.info("Stale nas_ver for note %s, fetching latest from NAS", note_id)
                    try:
                        nas_note = await service._notestation.get_note(note_id)
                        latest_ver = nas_note.get("ver", "")
                        if latest_ver and latest_ver != note.nas_ver:
                            note.nas_ver = latest_ver
                            await db.commit()
                            nas_path = f"/note/ns/dv/{note.link_id}/{latest_ver}/{att_key}/{filename}"
                            image_bytes, content_type = await service._notestation._client.fetch_binary(nas_path)
                    except Exception:
                        logger.debug("Could not refresh nas_ver for note %s", note_id)
            finally:
                await session.close()
        except Exception as exc:
            logger.exception("Failed to fetch NAS image: %s", exc)
            raise HTTPException(status_code=502, detail="NAS 이미지 로드 실패") from exc

    if not image_bytes or (content_type and "text/html" in content_type):
        raise HTTPException(status_code=404, detail="Image not found on NAS")

    # Detect NoteStation placeholder images (1x1 transparent GIF, ~43 bytes).
    # These are returned for deleted or empty attachments.
    if len(image_bytes) < _MIN_VALID_IMAGE_SIZE and image_bytes[:6] == b"GIF89a":
        raise HTTPException(
            status_code=404,
            detail="Placeholder image (original deleted from NAS)",
        )

    # Return with cache headers (images rarely change)
    return StreamingResponse(
        BytesIO(image_bytes),
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
        },
    )
