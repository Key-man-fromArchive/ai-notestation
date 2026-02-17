"""HWP/HWPX text extraction service.

HWP (binary): delegates to openhwp-extract Rust CLI (OpenHWP project).
HWPX (ZIP+XML): extracts Preview/PrvText.txt via Python zipfile,
falls back to parsing <hp:t> tags from section XML.

Embedded images are extracted and OCR'd via OCRService (best-effort).
"""

from __future__ import annotations

import asyncio
import logging
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Resolve the openhwp-extract binary path (backend/bin/)
_BIN_DIR = Path(__file__).resolve().parent.parent.parent / "bin"
_OPENHWP_BIN = _BIN_DIR / "openhwp-extract"

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tiff", ".tif"}

_MIME_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
}


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
        metadata: dict = {"format": suffix.lstrip(".")}

        if suffix == ".hwpx":
            text = self._extract_hwpx(path)
            images = self._extract_hwpx_images(path)
        elif suffix == ".hwp":
            text = await self._extract_hwp(path)
            images = await self._extract_hwp_images(path)
        else:
            raise ValueError(f"Unsupported format: {suffix}")

        # OCR embedded images (best-effort)
        ocr_text, ocr_meta = await self._ocr_images(images)
        metadata.update(ocr_meta)

        # Combine body text + OCR text
        parts = [t for t in [text.strip(), ocr_text] if t]
        combined = "\n\n".join(parts)

        if not combined:
            raise ValueError("HWP/HWPX contains no extractable text")

        return HwpExtractionResult(
            text=combined,
            page_count=1,
            metadata=metadata,
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

    async def _extract_hwp_images(self, path: Path) -> list[tuple[str, bytes]]:
        """Extract embedded images from HWP via Rust CLI --images flag."""
        if not _OPENHWP_BIN.exists():
            return []

        with tempfile.TemporaryDirectory(prefix="hwp_img_") as tmpdir:
            proc = await asyncio.create_subprocess_exec(
                str(_OPENHWP_BIN),
                str(path),
                "--images",
                tmpdir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                await asyncio.wait_for(proc.communicate(), timeout=30)
            except TimeoutError:
                proc.kill()
                logger.warning("HWP image extraction timed out: %s", path.name)
                return []

            # Collect image files (best-effort, ignore returncode)
            return [
                (f.name, f.read_bytes())
                for f in sorted(Path(tmpdir).iterdir())
                if f.suffix.lower() in _IMAGE_EXTENSIONS and f.stat().st_size > 0
            ]

    def _extract_hwpx_images(self, path: Path) -> list[tuple[str, bytes]]:
        """Extract embedded images from HWPX ZIP BinData/ folder."""
        images: list[tuple[str, bytes]] = []
        try:
            with zipfile.ZipFile(path, "r") as zf:
                for name in sorted(zf.namelist()):
                    if not name.startswith("BinData/"):
                        continue
                    if Path(name).suffix.lower() not in _IMAGE_EXTENSIONS:
                        continue
                    data = zf.read(name)
                    if data:
                        images.append((Path(name).name, data))
        except (zipfile.BadZipFile, OSError):
            logger.warning("Failed to extract images from HWPX: %s", path.name)
        return images

    async def _ocr_images(
        self, images: list[tuple[str, bytes]]
    ) -> tuple[str, dict]:
        """Run OCR on extracted images and return combined text + metadata."""
        if not images:
            return "", {}

        from app.services.ocr_service import OCRService

        ocr = OCRService()
        texts: list[str] = []
        errors = 0

        for filename, data in images:
            mime = _MIME_MAP.get(Path(filename).suffix.lower(), "image/png")
            try:
                result = await ocr.extract_text(data, mime)
                if result.text and result.text.strip():
                    texts.append(result.text.strip())
            except Exception:
                logger.warning("OCR failed for embedded image: %s", filename)
                errors += 1

        meta: dict = {}
        if texts:
            meta["ocr"] = True
            meta["ocr_image_count"] = len(texts)
        if errors:
            meta["ocr_errors"] = errors
        return "\n\n".join(texts), meta

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
