"""PDF text extraction service using PyMuPDF (fitz)."""

from __future__ import annotations

import logging
from pathlib import Path

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class PDFExtractionResult(BaseModel):
    """PDF text extraction result."""

    text: str
    page_count: int
    metadata: dict  # title, author, subject, keywords, etc.


class PDFExtractor:
    """PDF → text extraction service.

    Uses PyMuPDF (fitz) for fast, accurate pure-text extraction.
    Falls back to AI Vision OCR for image-only PDFs.
    """

    async def extract(self, file_path: str | Path) -> PDFExtractionResult:
        """Extract text from a PDF file.

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

        try:
            doc = fitz.open(str(path))
        except Exception as exc:
            raise ValueError(f"Failed to open PDF: {exc}") from exc

        pages_text: list[str] = []
        for page in doc:
            text = page.get_text("text")
            if text.strip():
                pages_text.append(text.strip())

        metadata = {}
        if doc.metadata:
            for key in ("title", "author", "subject", "keywords", "creator"):
                val = doc.metadata.get(key)
                if val:
                    metadata[key] = val

        page_count = doc.page_count
        combined_text = "\n\n".join(pages_text)

        if not combined_text.strip():
            # Image-only PDF → OCR fallback
            logger.info("No text in PDF %s, attempting OCR fallback", path.name)
            ocr_text = await self._ocr_fallback(doc)
            doc.close()
            if ocr_text:
                return PDFExtractionResult(
                    text=ocr_text,
                    page_count=page_count,
                    metadata={**metadata, "ocr": True},
                )
            raise ValueError("PDF contains no extractable text (may be image-only)")

        doc.close()

        return PDFExtractionResult(
            text=combined_text,
            page_count=page_count,
            metadata=metadata,
        )

    async def _ocr_fallback(self, doc: object) -> str:
        """Render each PDF page to an image and run AI Vision OCR.

        Args:
            doc: An open fitz.Document instance.

        Returns:
            Combined OCR text from all pages, or empty string on failure.
        """
        from app.services.ocr_service import OCRService

        ocr = OCRService()
        pages: list[str] = []

        try:
            for page in doc:  # type: ignore[attr-defined]
                pix = page.get_pixmap(dpi=150)
                png_bytes = pix.tobytes("png")
                result = await ocr.extract_text(png_bytes, "image/png")
                if result.text.strip():
                    pages.append(result.text.strip())
        except Exception:
            logger.exception("OCR fallback failed")
            return ""

        return "\n\n".join(pages)
