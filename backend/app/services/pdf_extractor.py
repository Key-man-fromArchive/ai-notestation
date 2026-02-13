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
        doc.close()

        combined_text = "\n\n".join(pages_text)

        if not combined_text.strip():
            raise ValueError("PDF contains no extractable text (may be image-only)")

        return PDFExtractionResult(
            text=combined_text,
            page_count=page_count,
            metadata=metadata,
        )
