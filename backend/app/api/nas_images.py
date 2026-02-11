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

    # Construct NAS image path
    nas_path = f"/note/ns/dv/{note.link_id}/{note.nas_ver}/{att_key}/{filename}"

    try:
        from app.api.sync import _create_sync_service

        service, session, _ = await _create_sync_service()
        try:
            image_bytes, content_type = await service._notestation._client.fetch_binary(nas_path)
        finally:
            await session.close()
    except Exception as exc:
        logger.exception("Failed to fetch NAS image: %s", exc)
        raise HTTPException(status_code=502, detail="NAS 이미지 로드 실패") from exc

    if not image_bytes:
        raise HTTPException(status_code=404, detail="Image not found on NAS")

    # Return with cache headers (images rarely change)
    return StreamingResponse(
        BytesIO(image_bytes),
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
        },
    )
