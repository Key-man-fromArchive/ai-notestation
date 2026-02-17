"""HWP/HWPX text extraction service.

HWP (binary): delegates to openhwp-extract Rust CLI (OpenHWP project).
HWPX (ZIP+XML): extracts Preview/PrvText.txt via Python zipfile,
falls back to parsing <hp:t> tags from section XML.
"""

from __future__ import annotations

import asyncio
import logging
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Resolve the openhwp-extract binary path (backend/bin/)
_BIN_DIR = Path(__file__).resolve().parent.parent.parent / "bin"
_OPENHWP_BIN = _BIN_DIR / "openhwp-extract"


class HwpExtractionResult(BaseModel):
    """HWP/HWPX text extraction result."""

    text: str
    page_count: int
    metadata: dict


class HwpExtractor:
    """HWP/HWPX text extraction service."""

    async def extract(self, file_path: str | Path) -> HwpExtractionResult:
        """Extract text from a HWP or HWPX file."""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"HWP file not found: {path}")

        suffix = path.suffix.lower()
        if suffix == ".hwpx":
            text = self._extract_hwpx(path)
        elif suffix == ".hwp":
            text = await self._extract_hwp(path)
        else:
            raise ValueError(f"Unsupported format: {suffix}")

        if not text.strip():
            raise ValueError("HWP/HWPX contains no extractable text")

        return HwpExtractionResult(
            text=text.strip(),
            page_count=1,
            metadata={"format": suffix.lstrip(".")},
        )

    async def _extract_hwp(self, path: Path) -> str:
        """Extract text from HWP binary via openhwp-extract CLI."""
        if not _OPENHWP_BIN.exists():
            raise RuntimeError(f"openhwp-extract binary not found at {_OPENHWP_BIN}")

        proc = await asyncio.create_subprocess_exec(
            str(_OPENHWP_BIN),
            str(path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)

        if proc.returncode != 0:
            err_msg = stderr.decode("utf-8", errors="replace").strip()
            raise ValueError(f"HWP extraction failed: {err_msg}")

        return stdout.decode("utf-8", errors="replace")

    def _extract_hwpx(self, path: Path) -> str:
        """Extract text from HWPX (ZIP+XML) file.

        Strategy:
        1. Try Preview/PrvText.txt (pre-rendered plain text by Hancom)
        2. Fall back to parsing <hp:t> tags from Contents/section*.xml
        """
        try:
            with zipfile.ZipFile(path, "r") as zf:
                # Strategy 1: PrvText.txt
                if "Preview/PrvText.txt" in zf.namelist():
                    text = zf.read("Preview/PrvText.txt").decode("utf-8", errors="replace")
                    if text.strip():
                        return text

                # Strategy 2: Parse section XML for <hp:t> tags
                return self._parse_hwpx_sections(zf)
        except zipfile.BadZipFile as exc:
            raise ValueError(f"Invalid HWPX file: {exc}") from exc

    def _parse_hwpx_sections(self, zf: zipfile.ZipFile) -> str:
        """Parse <hp:t> text elements from HWPX section XML files."""
        ns = {"hp": "http://www.hancom.co.kr/hwpml/2011/paragraph"}
        paragraphs: list[str] = []

        section_files = sorted(
            name for name in zf.namelist() if name.startswith("Contents/section") and name.endswith(".xml")
        )

        for section_file in section_files:
            xml_data = zf.read(section_file)
            try:
                root = ET.fromstring(xml_data)  # noqa: S314
            except ET.ParseError:
                logger.warning("Failed to parse %s", section_file)
                continue

            for para in root.iter("{http://www.hancom.co.kr/hwpml/2011/paragraph}p"):
                texts = [t.text for t in para.findall(".//hp:t", ns) if t.text]
                if texts:
                    paragraphs.append("".join(texts))

        return "\n".join(paragraphs)
