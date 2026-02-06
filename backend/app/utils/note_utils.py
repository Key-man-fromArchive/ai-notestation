"""Note-specific utility functions."""

from __future__ import annotations

import base64
import re
from typing import TYPE_CHECKING
from urllib.parse import quote

if TYPE_CHECKING:
    from app.models import NoteImage


_NOTESTATION_IMG_RE = re.compile(
    r'<img\b[^>]*?\bref="([^"]+)"[^>]*/?>',
    re.IGNORECASE,
)


def normalize_tags(raw: dict) -> list[str]:
    """Normalize Synology tag field to a flat list of strings.

    Synology may return tags as a list, a dict, or None.
    """
    tag_raw = raw.get("tag", [])
    if isinstance(tag_raw, dict):
        return list(tag_raw.values()) if tag_raw else []
    if isinstance(tag_raw, list):
        return tag_raw
    return []


def normalize_db_tags(tags: list[str] | dict | None) -> list[str]:
    """Normalize DB tag field to a flat list of strings."""
    if tags is None:
        return []
    if isinstance(tags, dict):
        return list(tags.values()) if tags else []
    if isinstance(tags, list):
        return tags
    return []


def truncate_snippet(text: str | None, limit: int = 200) -> str:
    """Trim text to a short snippet for list views."""
    if not text:
        return ""
    stripped = " ".join(text.split())
    if len(stripped) <= limit:
        return stripped
    return stripped[:limit].rstrip() + "..."


def rewrite_image_urls(
    html: str,
    note_id: str,
    attachment_lookup: dict[str, dict] | None = None,
    image_map: dict[str, "NoteImage"] | None = None,
) -> str:
    """Replace NoteStation image tags with either real image URLs or placeholders.

    If an image has been extracted from an NSX export and exists in the database,
    we produce an ``<img src="/api/images/{note_id}/{ref}">`` tag. Otherwise,
    we produce a placeholder ``<img alt="notestation-image:...">`` tag for the
    frontend to render as a styled card.

    Args:
        html: HTML content from NoteStation.
        note_id: The note's object_id for constructing image URLs.
        attachment_lookup: Dict mapping attachment refs/IDs to metadata dicts
                           with keys like ``name``, ``width``, ``height``.
        image_map: Dict mapping image refs to NoteImage DB records (if available).
    """
    if not html:
        return html

    def _replace(match: re.Match) -> str:
        ref_b64 = match.group(1)
        try:
            decoded_name = base64.b64decode(ref_b64).decode("utf-8")
        except Exception:
            decoded_name = "image"

        # Look up attachment metadata for a human-readable name & dimensions
        display_name = decoded_name
        width = ""
        height = ""
        if attachment_lookup:
            for att in attachment_lookup.values():
                if not isinstance(att, dict):
                    continue
                if att.get("ref") == decoded_name or att.get("name") == decoded_name:
                    display_name = att.get("name", decoded_name)
                    if att.get("width"):
                        width = str(att["width"])
                    if att.get("height"):
                        height = str(att["height"])
                    break

        # Check if we have an extracted image for this ref
        img_record = None
        if image_map:
            # Direct lookup by decoded name or attachment name
            img_record = image_map.get(decoded_name)
            # Decoded name may have a timestamp prefix (e.g. "1770102482260ns_attach_...")
            # Try matching by suffix against known image names
            if not img_record:
                for candidate in image_map.values():
                    if candidate.name and decoded_name.endswith(candidate.name):
                        img_record = candidate
                        break

        if img_record:
            # Use dimensions from DB if available (more reliable than attachment metadata)
            if img_record.width:
                width = str(img_record.width)
            if img_record.height:
                height = str(img_record.height)

            # Produce a real <img> tag with API URL
            # Use the DB ref (NSX attachment key) for the URL path
            safe_ref = quote(img_record.ref, safe="")
            parts = [f'<img src="/api/images/{note_id}/{safe_ref}"']
            parts.append(f' alt="{display_name}"')
            if width:
                parts.append(f' width="{width}"')
            if height:
                parts.append(f' height="{height}"')
            parts.append(' class="notestation-image" loading="lazy" />')
            return "".join(parts)

        # No extracted image available - produce a placeholder
        parts = [f'<img alt="notestation-image:{display_name}"']
        if width:
            parts.append(f' width="{width}"')
        if height:
            parts.append(f' height="{height}"')
        parts.append(" />")
        return "".join(parts)

    return _NOTESTATION_IMG_RE.sub(_replace, html)
