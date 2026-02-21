"""Handwriting recognition API endpoint.

Accepts an image of handwriting and returns recognized text,
search-indexable descriptions, or LaTeX via AI Vision providers.
"""

from __future__ import annotations

import base64
import logging
import re
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_router.prompts.handwriting import build_messages
from app.ai_router.router import AIRouter
from app.ai_router.schemas import AIRequest, ImageContent, ProviderError
from app.database import get_db
from app.services.auth_service import get_current_user
from app.utils.i18n import get_language

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/handwriting", tags=["handwriting"])

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB


class RecognizeResponse(BaseModel):
    """Response from handwriting recognition."""

    text: str
    latex: str | None = None
    mode: str
    model: str
    provider: str


def _extract_latex(content: str) -> str | None:
    """Extract LaTeX from AI response content.

    Tries multiple patterns in order:
    1. $$ ... $$
    2. \\[ ... \\]
    3. ```latex ... ```
    """
    # $$ ... $$
    m = re.search(r"\$\$(.+?)\$\$", content, re.DOTALL)
    if m:
        return f"$${m.group(1).strip()}$$"

    # \[ ... \]
    m = re.search(r"\\\[(.+?)\\\]", content, re.DOTALL)
    if m:
        return f"$${m.group(1).strip()}$$"

    # ```latex ... ```
    m = re.search(r"```latex\s*\n(.+?)```", content, re.DOTALL)
    if m:
        return f"$${m.group(1).strip()}$$"

    return None


@router.post("/recognize", response_model=RecognizeResponse)
async def recognize_handwriting(
    request: Request,
    image: UploadFile = File(...),  # noqa: B008
    mode: Literal["text", "ink", "math"] = Form("text"),  # noqa: B008
    model: str | None = Form(None),  # noqa: B008
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> RecognizeResponse:
    """Recognize handwriting from an uploaded image.

    Args:
        image: PNG/JPEG image file (max 10MB).
        mode: Recognition mode — "text", "ink", or "math".
        model: Optional model ID. Auto-selects if omitted.

    Returns:
        Recognized text and optional LaTeX.
    """
    # Validate content type
    if image.content_type not in ("image/png", "image/jpeg", "image/webp"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only PNG, JPEG, and WebP images are supported.",
        )

    # Read and validate size
    data = await image.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image size exceeds {MAX_IMAGE_SIZE // (1024 * 1024)}MB limit.",
        )

    lang = get_language(request)

    # Build image content
    image_content = ImageContent(
        data=base64.b64encode(data).decode("ascii"),
        mime_type=image.content_type or "image/png",
    )

    messages = build_messages(image=image_content, mode=mode, lang=lang)

    # Get AI router with OAuth if available
    from app.api.ai import _get_oauth_service, _inject_oauth_if_available, get_ai_router

    ai_router: AIRouter = await get_ai_router()
    oauth_service = _get_oauth_service()
    effective_router = await _inject_oauth_if_available(
        ai_router, model, current_user["username"], db, oauth_service,
    )

    ai_request = AIRequest(
        messages=messages,
        model=model,
        temperature=0.1,
        max_tokens=4096,
    )

    try:
        ai_response = await effective_router.chat(ai_request)
    except ProviderError as exc:
        logger.error("Handwriting recognition error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI provider error: {exc.message}",
        ) from None

    content = ai_response.content.strip()
    latex = _extract_latex(content) if mode == "math" else None

    return RecognizeResponse(
        text=content,
        latex=latex,
        mode=mode,
        model=ai_response.model,
        provider=ai_response.provider,
    )
