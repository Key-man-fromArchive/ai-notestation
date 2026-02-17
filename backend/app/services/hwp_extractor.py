"""HWP/HWPX text extraction service using hwp-hwpx-parser."""

from __future__ import annotations

import logging
from pathlib import Path

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class HwpExtractionResult(BaseModel):
    """HWP/HWPX text extraction result."""

    text: str
    page_count: int
    metadata: dict


class HwpExtractor:
    """HWP/HWPX text extraction service.

    Uses hwp-hwpx-parser for both legacy HWP (OLE binary) and
    modern HWPX (ZIP+XML) formats.
    """

    async def extract(self, file_path: str | Path) -> HwpExtractionResult:
        """Extract text from a HWP or HWPX file.

        Args:
            file_path: Path to the HWP/HWPX file.

        Returns:
            HwpExtractionResult with text, page_count, and metadata.

        Raises:
            FileNotFoundError: File does not exist.
            ValueError: Not a valid HWP/HWPX or contains no extractable text.
        """
        from hwp_hwpx_parser import Reader

        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"HWP file not found: {path}")

        try:
            reader = Reader(str(path))
        except Exception as exc:
            raise ValueError(f"Failed to open HWP/HWPX: {exc}") from exc

        # Extract body text
        body_text = reader.text.strip() if reader.text else ""

        # Extract tables as markdown (best-effort)
        table_text = ""
        try:
            tables_md = reader.get_tables_as_markdown()
            if tables_md:
                table_text = tables_md.strip()
        except Exception:
            logger.debug("Table extraction skipped for %s", path.name)

        # Combine body + tables
        parts = [p for p in (body_text, table_text) if p]
        combined = "\n\n".join(parts)

        if not combined:
            raise ValueError("HWP/HWPX contains no extractable text")

        suffix = path.suffix.lower()
        metadata: dict = {
            "format": "hwpx" if suffix == ".hwpx" else "hwp",
        }

        return HwpExtractionResult(
            text=combined,
            page_count=1,
            metadata=metadata,
        )
