"""PDF text extraction service using PyMuPDF (fitz)."""

from __future__ import annotations

import logging
from pathlib import Path

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Pages with fewer characters than this are considered scan/image pages
# and will be sent to OCR. Filters out blank pages and header/footer-only
# pages (typically 10-30 chars) while keeping real text pages (hundreds+).
MIN_TEXT_LENGTH = 50


class PDFExtractionResult(BaseModel):
    """PDF text extraction result."""

    text: str
    page_count: int
    metadata: dict  # title, author, subject, keywords, etc.


class PDFExtractor:
    """PDF → text extraction service.

    Uses PyMuPDF (fitz) for fast, accurate pure-text extraction.
    Falls back to AI Vision OCR per page for scan/image pages.
    """

    async def extract(self, file_path: str | Path) -> PDFExtractionResult:
        """Extract text from a PDF file.

        Uses a per-page hybrid strategy: PyMuPDF text extraction first,
        OCR fallback only for pages with insufficient text.

        When the OCR engine is ``glm_ocr``, delegates to GLM-OCR's native
        PDF support with automatic chunking for large documents.

        Args:
            file_path: Path to the PDF file.

        Returns:
            PDFExtractionResult with text, page_count, and metadata.

        Raises:
            FileNotFoundError: File does not exist.
            ValueError: Not a valid PDF or contains no extractable text.
        """
        import fitz  # pymupdf  # noqa: S404

        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"PDF file not found: {path}")

        # When GLM-OCR is the engine, use its native PDF support
        engine = await self._get_engine_setting()
        if engine == "glm_ocr":
            return await self._glm_ocr_extract(path)

        try:
            doc = fitz.open(str(path))
        except Exception as exc:
            raise ValueError(f"Failed to open PDF: {exc}") from exc

        pages_text: list[str] = []
        ocr_pages: list[int] = []

        for i, page in enumerate(doc):
            text = page.get_text("text").strip()
            if len(text) >= MIN_TEXT_LENGTH:
                pages_text.append(text)
            else:
                ocr_text = await self._ocr_page(page)
                if ocr_text:
                    pages_text.append(ocr_text)
                    ocr_pages.append(i + 1)  # 1-based page number

        metadata = {}
        if doc.metadata:
            for key in ("title", "author", "subject", "keywords", "creator"):
                val = doc.metadata.get(key)
                if val:
                    metadata[key] = val

        if ocr_pages:
            metadata["ocr"] = True
            metadata["ocr_pages"] = ocr_pages
            logger.info("PDF %s: OCR used on pages %s", path.name, ocr_pages)

        page_count = doc.page_count
        doc.close()

        combined_text = "\n\n".join(pages_text)
        if not combined_text.strip():
            raise ValueError("PDF contains no extractable text (may be image-only)")

        return PDFExtractionResult(
            text=combined_text,
            page_count=page_count,
            metadata=metadata,
        )

    async def _ocr_page(self, page: object, dpi: int = 150) -> str:
        """Render a single page to PNG and run OCR.

        Args:
            page: A fitz.Page instance.
            dpi: Resolution for rendering. Default 150.

        Returns:
            OCR text for the page, or empty string on failure.
        """
        from app.services.ocr_service import OCRService

        try:
            pixmap = page.get_pixmap(dpi=dpi)  # type: ignore[attr-defined]
            png_bytes = pixmap.tobytes("png")
            ocr = OCRService()
            result = await ocr.extract_text(png_bytes, "image/png")
            return result.text.strip() if result.text else ""
        except Exception:
            logger.exception("OCR failed for page")
            return ""

    @staticmethod
    async def _get_engine_setting() -> str:
        """Read ocr_engine from the settings cache."""
        from app.api.settings import _get_store

        store = _get_store()
        return store.get("ocr_engine", "ai_vision")

    async def _glm_ocr_extract(self, path: Path) -> PDFExtractionResult:
        """Extract text from PDF using GLM-OCR native PDF support.

        Falls back to the standard hybrid extraction on failure.
        """
        import fitz  # pymupdf

        from app.services.ocr_service import GlmOcrEngine

        pdf_bytes = path.read_bytes()

        # Get metadata via PyMuPDF before delegating to GLM-OCR
        try:
            doc = fitz.open(str(path))
        except Exception as exc:
            raise ValueError(f"Failed to open PDF: {exc}") from exc

        page_count = doc.page_count
        metadata: dict = {}
        if doc.metadata:
            for key in ("title", "author", "subject", "keywords", "creator"):
                val = doc.metadata.get(key)
                if val:
                    metadata[key] = val
        doc.close()

        try:
            result = await GlmOcrEngine().extract_pdf(pdf_bytes)
        except Exception as exc:
            logger.warning(
                "GLM-OCR native PDF failed for %s: %s — falling back to hybrid",
                path.name, exc,
            )
            # Re-run with default hybrid approach by temporarily overriding engine
            return await self._hybrid_extract(path)

        if not result.text.strip():
            raise ValueError("PDF contains no extractable text (may be image-only)")

        metadata["ocr"] = True
        metadata["ocr_engine"] = "glm-ocr"
        if result.layout_visualization:
            metadata["layout_visualization"] = result.layout_visualization

        return PDFExtractionResult(
            text=result.text,
            page_count=page_count,
            metadata=metadata,
        )

    async def _hybrid_extract(self, path: Path) -> PDFExtractionResult:
        """Hybrid per-page extraction (PyMuPDF text + OCR fallback)."""
        import fitz  # pymupdf

        try:
            doc = fitz.open(str(path))
        except Exception as exc:
            raise ValueError(f"Failed to open PDF: {exc}") from exc

        pages_text: list[str] = []
        ocr_pages: list[int] = []

        for i, page in enumerate(doc):
            text = page.get_text("text").strip()
            if len(text) >= MIN_TEXT_LENGTH:
                pages_text.append(text)
            else:
                ocr_text = await self._ocr_page(page)
                if ocr_text:
                    pages_text.append(ocr_text)
                    ocr_pages.append(i + 1)

        metadata: dict = {}
        if doc.metadata:
            for key in ("title", "author", "subject", "keywords", "creator"):
                val = doc.metadata.get(key)
                if val:
                    metadata[key] = val

        if ocr_pages:
            metadata["ocr"] = True
            metadata["ocr_pages"] = ocr_pages
            logger.info("PDF %s: OCR used on pages %s", path.name, ocr_pages)

        page_count = doc.page_count
        doc.close()

        combined_text = "\n\n".join(pages_text)
        if not combined_text.strip():
            raise ValueError("PDF contains no extractable text (may be image-only)")

        return PDFExtractionResult(
            text=combined_text,
            page_count=page_count,
            metadata=metadata,
        )
