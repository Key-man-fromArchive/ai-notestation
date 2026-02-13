"""AI Vision-based OCR service for extracting text from images."""

from __future__ import annotations

import base64
import logging
from pathlib import Path

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Vision-capable models in priority order
_VISION_MODELS = [
    "glm-5",
    "gpt-4o",
    "gpt-4o-mini",
    "gemini-2.0-flash",
    "claude-sonnet-4-5-20250929",
]

_OCR_PROMPT = (
    "Extract all text from this image exactly as written. "
    "Preserve the original layout and line breaks where possible. "
    "Return only the extracted text, nothing else. "
    "If there is no text in the image, return an empty string."
)


class OCRResult(BaseModel):
    """Result of an OCR extraction."""

    text: str
    confidence: float  # 0.0~1.0 (AI model self-assessment)
    method: str  # model id used, e.g. "glm-5"


class OCRService:
    """AI Vision-based OCR service.

    Uses the AIRouter to select an available Vision-capable model
    and extract text from images.
    """

    async def extract_text(
        self, image_bytes: bytes, mime_type: str = "image/png"
    ) -> OCRResult:
        """Extract text from image bytes via AI Vision.

        Args:
            image_bytes: Raw image data.
            mime_type: MIME type of the image (e.g. "image/png").

        Returns:
            OCRResult with extracted text and model info.

        Raises:
            RuntimeError: If no Vision-capable model is available.
        """
        from app.ai_router.router import AIRouter
        from app.ai_router.schemas import ImageContent, Message

        router = AIRouter()
        available_ids = {m.id for m in router.all_models()}

        # Pick first available vision model
        model_id: str | None = None
        for candidate in _VISION_MODELS:
            if candidate in available_ids:
                model_id = candidate
                break

        if model_id is None:
            raise RuntimeError(
                "No Vision-capable AI model available. "
                f"Configure one of: {', '.join(_VISION_MODELS)}"
            )

        b64 = base64.b64encode(image_bytes).decode("ascii")
        message = Message(
            role="user",
            content=_OCR_PROMPT,
            images=[ImageContent(data=b64, mime_type=mime_type)],
        )

        logger.info("Running OCR with model %s", model_id)
        response = await router.chat(messages=[message], model=model_id)

        text = response.content.strip()
        # Simple confidence heuristic: non-empty => 0.8, empty => 0.0
        confidence = 0.8 if text else 0.0

        return OCRResult(text=text, confidence=confidence, method=model_id)

    async def extract_text_from_file(self, file_path: str | Path) -> OCRResult:
        """Load an image file and extract text via OCR.

        Args:
            file_path: Path to the image file.

        Returns:
            OCRResult with extracted text.

        Raises:
            FileNotFoundError: If the file does not exist.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Image file not found: {path}")

        suffix = path.suffix.lower()
        mime_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
        }
        mime_type = mime_map.get(suffix, "image/png")

        image_bytes = path.read_bytes()
        return await self.extract_text(image_bytes, mime_type)
