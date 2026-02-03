# NSX Parser Service - NoteStation 내보내기 파일에서 이미지 추출
# NSX 파일 구조:
#   - config.json: 노트북/노트 ID 목록
#   - {note_id}: 노트별 JSON (title, content, attachments)
#   - file_{md5}: 첨부파일들 (이미지 포함)

"""NSX file parser for extracting images from NoteStation exports.

NSX files are ZIP archives exported from Synology NoteStation.
This service parses NSX files and extracts embedded images,
mapping them to their respective notes for serving via API.

Usage::

    parser = NsxParser(nsx_path="/path/to/export.nsx", output_dir="/path/to/images")
    result = parser.parse()
    # result contains note_id -> image mappings
"""

from __future__ import annotations

import json
import logging
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class AttachmentInfo:
    """Information about an extracted attachment."""

    note_id: str
    ref: str  # Original reference in note content
    name: str  # Human-readable filename
    md5: str  # MD5 hash used in NSX file
    file_path: Path  # Path where file was extracted
    width: int | None = None
    height: int | None = None
    mime_type: str = "application/octet-stream"


@dataclass
class NsxParseResult:
    """Result of parsing an NSX file."""

    notes_processed: int = 0
    images_extracted: int = 0
    errors: list[str] = field(default_factory=list)
    attachments: list[AttachmentInfo] = field(default_factory=list)


class NsxParser:
    """Parser for Synology NoteStation NSX export files.

    NSX files are ZIP archives containing:
    - config.json: Index of notebook and note IDs
    - {note_id}: JSON file for each note with content and attachment metadata
    - file_{md5}: Actual attachment files (images, documents, etc.)

    Args:
        nsx_path: Path to the NSX file to parse.
        output_dir: Directory where extracted images will be saved.
    """

    def __init__(self, nsx_path: str | Path, output_dir: str | Path) -> None:
        self.nsx_path = Path(nsx_path)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def parse(self) -> NsxParseResult:
        """Parse the NSX file and extract all images.

        Returns:
            NsxParseResult with extraction statistics and attachment mappings.
        """
        result = NsxParseResult()

        if not self.nsx_path.exists():
            result.errors.append(f"NSX file not found: {self.nsx_path}")
            return result

        try:
            with zipfile.ZipFile(self.nsx_path, "r") as nsx:
                # Parse config.json to get note IDs
                config = self._parse_config(nsx)
                if config is None:
                    result.errors.append("Failed to parse config.json")
                    return result

                note_ids = config.get("note", [])
                logger.info("Found %d notes in NSX file", len(note_ids))

                # Process each note
                for note_id in note_ids:
                    try:
                        attachments = self._process_note(nsx, note_id)
                        result.attachments.extend(attachments)
                        result.images_extracted += len(attachments)
                        result.notes_processed += 1
                    except Exception as e:
                        result.errors.append(f"Error processing note {note_id}: {e}")
                        logger.warning("Error processing note %s: %s", note_id, e)

        except zipfile.BadZipFile:
            result.errors.append(f"Invalid ZIP/NSX file: {self.nsx_path}")
        except Exception as e:
            result.errors.append(f"Unexpected error: {e}")
            logger.exception("Unexpected error parsing NSX file")

        logger.info(
            "NSX parsing complete: %d notes, %d images, %d errors",
            result.notes_processed,
            result.images_extracted,
            len(result.errors),
        )
        return result

    def _parse_config(self, nsx: zipfile.ZipFile) -> dict | None:
        """Parse config.json from the NSX archive."""
        try:
            config_data = nsx.read("config.json")
            return json.loads(config_data.decode("utf-8"))
        except (KeyError, json.JSONDecodeError) as e:
            logger.error("Failed to parse config.json: %s", e)
            return None

    def _process_note(
        self, nsx: zipfile.ZipFile, note_id: str
    ) -> list[AttachmentInfo]:
        """Process a single note and extract its attachments.

        Args:
            nsx: Open ZipFile object.
            note_id: The note ID to process.

        Returns:
            List of extracted AttachmentInfo objects.
        """
        attachments: list[AttachmentInfo] = []

        try:
            note_data = nsx.read(note_id)
            note = json.loads(note_data.decode("utf-8"))
        except (KeyError, json.JSONDecodeError) as e:
            logger.warning("Failed to read note %s: %s", note_id, e)
            return attachments

        # Get attachment metadata
        att_dict = note.get("attachment", {})
        if not att_dict:
            return attachments

        # Process each attachment
        for ref, att_meta in att_dict.items():
            if not isinstance(att_meta, dict):
                continue

            md5 = att_meta.get("md5", "")
            name = att_meta.get("name", ref)

            if not md5:
                continue

            # Check if this is an image
            mime_type = att_meta.get("type", "")
            if not self._is_image(mime_type, name):
                continue

            # Extract the file
            try:
                file_key = f"file_{md5}"
                file_data = nsx.read(file_key)

                # Create output path: output_dir/note_id/filename
                note_dir = self.output_dir / note_id
                note_dir.mkdir(parents=True, exist_ok=True)

                # Use ref as filename to maintain consistency
                safe_ref = self._sanitize_filename(ref)
                file_path = note_dir / safe_ref
                file_path.write_bytes(file_data)

                attachments.append(
                    AttachmentInfo(
                        note_id=note_id,
                        ref=ref,
                        name=name,
                        md5=md5,
                        file_path=file_path,
                        width=att_meta.get("width"),
                        height=att_meta.get("height"),
                        mime_type=mime_type or self._guess_mime_type(name),
                    )
                )
                logger.debug("Extracted image: %s -> %s", ref, file_path)

            except KeyError:
                logger.warning("Attachment file not found in NSX: file_%s", md5)
            except Exception as e:
                logger.warning("Failed to extract attachment %s: %s", ref, e)

        return attachments

    @staticmethod
    def _is_image(mime_type: str, filename: str) -> bool:
        """Check if the attachment is an image."""
        if mime_type and mime_type.startswith("image/"):
            return True

        ext = Path(filename).suffix.lower()
        return ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}

    @staticmethod
    def _guess_mime_type(filename: str) -> str:
        """Guess MIME type from filename extension."""
        ext = Path(filename).suffix.lower()
        mime_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
            ".svg": "image/svg+xml",
        }
        return mime_map.get(ext, "application/octet-stream")

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        """Sanitize filename to be safe for filesystem."""
        # Replace problematic characters
        unsafe_chars = '<>:"/\\|?*'
        result = filename
        for char in unsafe_chars:
            result = result.replace(char, "_")
        return result
