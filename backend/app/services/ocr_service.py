"""OCR service with pluggable engines: AI Vision (cloud), Tesseract (local), and GLM-OCR."""

from __future__ import annotations

import asyncio
import base64
import logging
import os
from io import BytesIO
from pathlib import Path

import httpx

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Vision-capable models in priority order (cost-optimized)
_VISION_MODELS = [
    "glm-4.6v",          # $0.3/M, better quality, higher rate limit
    "glm-4.6v-flash",    # Free, 14s avg, good quality but lower rate limit
    "glm-4.5v",          # $0.6/M, 60-97s, proven reliable
    "gpt-4o-mini",
    "gemini-2.0-flash",
    "gpt-4o",
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
    method: str
    layout_visualization: list[str] | None = None  # engine/model id used


class TesseractEngine:
    """Local Tesseract OCR engine (CPU, no API key needed).

    Requires ``tesseract-ocr`` and language packs (e.g. ``tesseract-ocr-kor``)
    to be installed via apt. Lightweight and fast on CPU (~1-3s per image).

    NOTE: Text detection + recognition only. No layout/document structure
    analysis (tables, columns, reading order). For layout-aware OCR, use
    GLM-OCR or AI Vision instead.
    """

    # Map common locales to Tesseract lang codes.
    # Multiple langs can be combined with '+' for mixed-language documents.
    _DEFAULT_LANG = os.getenv("TESSERACT_LANG", "kor+eng")

    async def extract(self, image_bytes: bytes, mime_type: str) -> OCRResult:
        """Run Tesseract OCR on image bytes."""
        import pytesseract
        from PIL import Image

        def _run_ocr(data: bytes) -> str:
            img = Image.open(BytesIO(data))
            # Convert to RGB if necessary (e.g. RGBA PNGs, palette GIFs)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            text = pytesseract.image_to_string(img, lang=self._DEFAULT_LANG)
            return text.strip()

        logger.info("Running OCR with Tesseract (local, lang=%s)", self._DEFAULT_LANG)
        text = await asyncio.to_thread(_run_ocr, image_bytes)
        confidence = 0.85 if text else 0.0
        return OCRResult(text=text, confidence=confidence, method="tesseract")


class GlmOcrEngine:
    """GLM-OCR engine using the zai-sdk layout_parsing API.

    Calls ZhipuAIProvider.layout_parsing() with a base64 data-URI and
    extracts markdown text from the ``md_results`` field in the response.
    """

    PDF_CHUNK_SIZE = 50

    @staticmethod
    def _extract_md_results(response: object) -> str:
        if hasattr(response, "md_results"):
            return (response.md_results or "").strip()
        if isinstance(response, dict):
            return (response.get("md_results", "") or "").strip()
        return ""

    @staticmethod
    def _extract_visualization(response: object) -> list[str]:
        viz = None
        if hasattr(response, "layout_visualization"):
            viz = response.layout_visualization
        elif isinstance(response, dict):
            viz = response.get("layout_visualization")
        if viz and isinstance(viz, list):
            return [v for v in viz if isinstance(v, str)]
        return []

    async def extract(self, image_bytes: bytes, mime_type: str) -> OCRResult:
        from app.ai_router.providers.zhipuai import ZhipuAIProvider
        from app.ai_router.schemas import ProviderError

        b64 = base64.b64encode(image_bytes).decode("ascii")
        data_uri = f"data:{mime_type};base64,{b64}"

        try:
            provider = ZhipuAIProvider()
        except ProviderError as exc:
            raise RuntimeError(
                "GLM-OCR requires ZHIPUAI_API_KEY to be set."
            ) from exc

        logger.info("Running OCR with GLM-OCR (layout_parsing API)")
        response = await provider.layout_parsing(
            file=data_uri,
            need_layout_visualization=True,
        )

        text = self._extract_md_results(response)
        viz = self._extract_visualization(response)
        confidence = 0.85 if text else 0.0
        return OCRResult(
            text=text,
            confidence=confidence,
            method="glm-ocr",
            layout_visualization=viz or None,
        )

    async def extract_pdf(self, pdf_bytes: bytes) -> OCRResult:
        """Extract text from PDF using GLM-OCR native PDF support.

        For PDFs with more than 50 pages, processes in chunks of 50 pages
        using ``start_page_id`` / ``end_page_id`` parameters and merges
        the results.
        """
        import fitz  # pymupdf

        from app.ai_router.providers.zhipuai import ZhipuAIProvider
        from app.ai_router.schemas import ProviderError

        try:
            provider = ZhipuAIProvider()
        except ProviderError as exc:
            raise RuntimeError(
                "GLM-OCR requires ZHIPUAI_API_KEY to be set."
            ) from exc

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page_count = doc.page_count
        doc.close()

        b64 = base64.b64encode(pdf_bytes).decode("ascii")
        data_uri = f"data:application/pdf;base64,{b64}"

        all_texts: list[str] = []
        all_viz: list[str] = []

        if page_count <= self.PDF_CHUNK_SIZE:
            logger.info(
                "GLM-OCR PDF: %d pages, single request", page_count,
            )
            response = await provider.layout_parsing(
                file=data_uri,
                need_layout_visualization=True,
            )
            text = self._extract_md_results(response)
            if text:
                all_texts.append(text)
            all_viz.extend(self._extract_visualization(response))
        else:
            for start in range(1, page_count + 1, self.PDF_CHUNK_SIZE):
                end = min(start + self.PDF_CHUNK_SIZE - 1, page_count)
                logger.info(
                    "GLM-OCR PDF chunk: pages %d–%d of %d",
                    start, end, page_count,
                )
                response = await provider.layout_parsing(
                    file=data_uri,
                    start_page_id=start,
                    end_page_id=end,
                    need_layout_visualization=True,
                )
                text = self._extract_md_results(response)
                if text:
                    all_texts.append(text)
                all_viz.extend(self._extract_visualization(response))

        combined = "\n\n".join(all_texts)
        confidence = 0.85 if combined else 0.0
        return OCRResult(
            text=combined,
            confidence=confidence,
            method="glm-ocr",
            layout_visualization=all_viz or None,
        )


class OCRService:
    """OCR service dispatching to the configured engine.

    Engine selection is based on the ``ocr_engine`` setting:
    - ``"ai_vision"`` (default): cloud AI Vision models via AIRouter
    - ``"tesseract"``: local Tesseract OCR on CPU (fast, no layout analysis)
    - ``"glm_ocr"``: GLM-OCR via zai-sdk layout_parsing API
    """

    async def _get_engine_setting(self) -> str:
        """Read ocr_engine from the settings cache."""
        from app.api.settings import _get_store

        store = _get_store()
        engine = store.get("ocr_engine", "ai_vision")
        # Migrate legacy setting
        if engine == "paddleocr_vl":
            return "tesseract"
        return engine

    async def _external_extract(
        self, image_bytes: bytes, mime_type: str
    ) -> OCRResult:
        """Extract text via external OCR container (HTTP multipart upload)."""
        ocr_url = os.getenv("OCR_SERVICE_URL", "")
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{ocr_url}/ocr",
                files={"file": ("image", image_bytes, mime_type)},
                data={"mime_type": mime_type},
            )
            response.raise_for_status()
            data = response.json()
            return OCRResult(
                text=data.get("text", ""),
                confidence=data.get("confidence", 0.0),
                method=data.get("method", "external-ocr"),
            )

    async def extract_text(
        self, image_bytes: bytes, mime_type: str = "image/png"
    ) -> OCRResult:
        """Extract text from image bytes using the configured engine.

        If the selected local engine (Tesseract) fails, the service
        automatically falls back to the cloud AI Vision engine.

        Args:
            image_bytes: Raw image data.
            mime_type: MIME type of the image (e.g. "image/png").

        Returns:
            OCRResult with extracted text and engine info.

        Raises:
            RuntimeError: If all engines fail or no model is available.
        """
        engine = await self._get_engine_setting()

        # If external OCR container is configured, try it first
        ocr_service_url = os.getenv("OCR_SERVICE_URL", "")
        if ocr_service_url:
            try:
                return await self._external_extract(image_bytes, mime_type)
            except Exception as exc:
                logger.warning("External OCR service failed: %s — falling back to configured engine", exc)

        if engine == "glm_ocr":
            try:
                return await GlmOcrEngine().extract(image_bytes, mime_type)
            except Exception as exc:
                logger.warning("GLM-OCR failed: %s — falling back to AI Vision", exc)

            # Fallback to cloud AI Vision
            try:
                return await self._ai_vision_extract(image_bytes, mime_type)
            except Exception as fallback_exc:
                raise RuntimeError(
                    f"GLM-OCR and AI Vision both failed. "
                    f"AI Vision error: {fallback_exc}"
                ) from fallback_exc

        if engine == "tesseract":
            try:
                return await TesseractEngine().extract(image_bytes, mime_type)
            except Exception as exc:
                logger.warning("Tesseract failed: %s — falling back to AI Vision", exc)

            # Fallback to cloud AI Vision
            try:
                return await self._ai_vision_extract(image_bytes, mime_type)
            except Exception as fallback_exc:
                raise RuntimeError(
                    f"Tesseract and AI Vision both failed. "
                    f"AI Vision error: {fallback_exc}"
                ) from fallback_exc

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
