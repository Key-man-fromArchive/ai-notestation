"""OCR service with pluggable engines: AI Vision (cloud) and PaddleOCR-VL (local)."""

from __future__ import annotations

import asyncio
import base64
import logging
import tempfile
from pathlib import Path

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Vision-capable models in priority order
_VISION_MODELS = [
    "glm-4.7",
    "gpt-4o",
    "gpt-4o-mini",
    "gemini-2.0-flash",
    "claude-sonnet-4-5",
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
    confidence: float  # 0.0~1.0
    method: str  # engine/model id used


class PaddleOCRVLEngine:
    """Local PaddleOCR-VL engine (CPU, no API key needed).

    Model weights (~1.8GB) are downloaded on first use and cached
    in PADDLE_HOME (default: ~/.paddleocr).
    """

    _pipeline = None  # Lazy singleton

    @classmethod
    def _get_pipeline(cls):
        if cls._pipeline is None:
            from paddleocr import PaddleOCRVL

            logger.info("Loading PaddleOCR-VL pipeline (first call — downloading model if needed)...")
            cls._pipeline = PaddleOCRVL(pipeline_version="v1")
            logger.info("PaddleOCR-VL pipeline ready")
        return cls._pipeline

    async def extract(self, image_bytes: bytes, mime_type: str) -> OCRResult:
        """Run PaddleOCR-VL on image bytes.

        PaddleOCR expects a file path, so we write bytes to a temp file.
        Inference is CPU-bound, so we run it in a thread executor.
        """
        suffix_map = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "image/bmp": ".bmp",
        }
        suffix = suffix_map.get(mime_type, ".png")

        def _run_ocr(data: bytes, ext: str) -> str:
            pipeline = PaddleOCRVLEngine._get_pipeline()
            with tempfile.NamedTemporaryFile(suffix=ext, delete=True) as tmp:
                tmp.write(data)
                tmp.flush()
                result = pipeline.predict(tmp.name)
                # result is a generator of dicts with "rec_text" or similar
                texts = []
                for item in result:
                    if isinstance(item, dict):
                        texts.append(item.get("rec_text", ""))
                    elif isinstance(item, str):
                        texts.append(item)
                return "\n".join(texts).strip()

        logger.info("Running OCR with PaddleOCR-VL (local)")
        text = await asyncio.to_thread(_run_ocr, image_bytes, suffix)
        confidence = 0.9 if text else 0.0
        return OCRResult(text=text, confidence=confidence, method="paddleocr-vl")


class OCRService:
    """OCR service dispatching to the configured engine.

    Engine selection is based on the ``ocr_engine`` setting:
    - ``"ai_vision"`` (default): cloud AI Vision models via AIRouter
    - ``"paddleocr_vl"``: local PaddleOCR-VL on CPU
    """

    async def _get_engine_setting(self) -> str:
        """Read ocr_engine from the settings cache."""
        from app.api.settings import _get_store

        store = _get_store()
        return store.get("ocr_engine", "ai_vision")

    async def extract_text(
        self, image_bytes: bytes, mime_type: str = "image/png"
    ) -> OCRResult:
        """Extract text from image bytes using the configured engine.

        Args:
            image_bytes: Raw image data.
            mime_type: MIME type of the image (e.g. "image/png").

        Returns:
            OCRResult with extracted text and engine info.

        Raises:
            RuntimeError: If the engine fails or no model is available.
        """
        engine = await self._get_engine_setting()

        if engine == "paddleocr_vl":
            return await PaddleOCRVLEngine().extract(image_bytes, mime_type)

        return await self._ai_vision_extract(image_bytes, mime_type)

    async def _ai_vision_extract(
        self, image_bytes: bytes, mime_type: str
    ) -> OCRResult:
        """Extract text via AI Vision models (cloud API).

        Tries each available Vision model in priority order,
        falling back to the next on failure.
        """
        from app.ai_router.router import AIRouter
        from app.ai_router.schemas import AIRequest, ImageContent, Message

        router = AIRouter()
        available_ids = {m.id for m in router.all_models()}

        candidates = [m for m in _VISION_MODELS if m in available_ids]
        if not candidates:
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

        last_error: Exception | None = None
        for model_id in candidates:
            try:
                logger.info("Running OCR with model %s", model_id)
                request = AIRequest(
                    messages=[message], model=model_id, temperature=0.1,
                )
                response = await router.chat(request)

                text = response.content.strip()
                confidence = 0.8 if text else 0.0
                return OCRResult(text=text, confidence=confidence, method=model_id)
            except Exception as exc:
                logger.warning("OCR failed with %s: %s", model_id, exc)
                last_error = exc

        raise RuntimeError(
            f"All Vision models failed. Last error: {last_error}"
        )

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
