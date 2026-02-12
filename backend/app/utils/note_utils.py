"""Note-specific utility functions."""

from __future__ import annotations

import base64
import hashlib
import html as html_mod
import logging
import re
from typing import TYPE_CHECKING
from urllib.parse import quote, unquote

logger = logging.getLogger(__name__)

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
    nas_attachments: dict[str, dict] | None = None,
) -> str:
    """Replace NoteStation image tags with either real image URLs or placeholders.

    Resolution priority:
    1. **NAS proxy** -- If ``nas_attachments`` is provided and a matching
       attachment is found (by comparing the ``ref`` field with the decoded
       base64 ref from the img tag), produce a
       ``/api/nas-images/{note_id}/{att_key}/{filename}`` URL that streams
       the image through the backend proxy.
    2. **Local NSX image** -- If the image has been extracted from an NSX
       export and exists in the ``image_map``, produce an
       ``/api/images/{note_id}/{ref}`` URL.
    3. **Placeholder** -- Otherwise, produce a placeholder
       ``<img alt="notestation-image:...">`` tag for the frontend.

    Args:
        html: HTML content from NoteStation.
        note_id: The note's object_id for constructing image URLs.
        attachment_lookup: Dict mapping attachment refs/IDs to metadata dicts
                           with keys like ``name``, ``width``, ``height``.
        image_map: Dict mapping image refs to NoteImage DB records (if available).
        nas_attachments: Raw NAS attachment dict keyed by att_key, each value
                         containing ``name``, ``ext``, ``ref``, ``md5``, etc.
                         Used for NAS image proxy URL construction.
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
                att_ref = att.get("ref", "")
                att_name = att.get("name", "")
                if (att_ref == ref_b64 or att_ref == decoded_name
                        or att_name == decoded_name
                        or (att_name and decoded_name.endswith(att_name))):
                    display_name = att_name or decoded_name
                    if att.get("width"):
                        width = str(att["width"])
                    if att.get("height"):
                        height = str(att["height"])
                    break

        # Priority 1: NAS proxy URL (for live-synced notes with NAS attachment data)
        if nas_attachments:
            for att_key, att in nas_attachments.items():
                if not isinstance(att, dict):
                    continue
                # Match by ref (base64), decoded name, or name suffix
                att_ref = att.get("ref", "")
                att_name = att.get("name", "")
                if (att_ref == ref_b64 or att_ref == decoded_name
                        or att_name == decoded_name
                        or (att_name and decoded_name.endswith(att_name))):
                    att_name = att.get("name", decoded_name)
                    if att.get("width"):
                        width = str(att["width"])
                    if att.get("height"):
                        height = str(att["height"])
                    safe_att_key = quote(att_key, safe="")
                    safe_filename = quote(att_name, safe="")
                    parts = [f'<img src="/api/nas-images/{note_id}/{safe_att_key}/{safe_filename}"']
                    # Use decoded_name (original internal name) for alt to preserve
                    # the exact ref for round-trip restoration to NAS format
                    parts.append(f' alt="{decoded_name}"')
                    if width:
                        parts.append(f' width="{width}"')
                    if height:
                        parts.append(f' height="{height}"')
                    parts.append(' class="notestation-image" loading="lazy" />')
                    return "".join(parts)

        # Priority 2: Local NSX-extracted image
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
            # Use decoded_name (original internal name) for round-trip preservation
            parts.append(f' alt="{decoded_name}"')
            if width:
                parts.append(f' width="{width}"')
            if height:
                parts.append(f' height="{height}"')
            parts.append(' class="notestation-image" loading="lazy" />')
            return "".join(parts)

        # Priority 3: No image source available - produce a placeholder
        parts = [f'<img alt="notestation-image:{decoded_name}"']
        if width:
            parts.append(f' width="{width}"')
        if height:
            parts.append(f' height="{height}"')
        parts.append(" />")
        return "".join(parts)

    return _NOTESTATION_IMG_RE.sub(_replace, html)


# Flexible regex to match ANY <img> tag (order-agnostic attribute extraction)
_IMG_TAG_RE = re.compile(r'<img\b([^>]*)/?>', re.IGNORECASE)
_SRC_ATTR_RE = re.compile(r'\bsrc="([^"]*)"', re.IGNORECASE)
_ALT_ATTR_RE = re.compile(r'\balt="([^"]*)"', re.IGNORECASE)

_NAS_IMG_TEMPLATE = (
    '<img class=" syno-notestation-image-object" '
    'src="webman/3rdparty/NoteStation/images/transparent.gif" '
    'border="0" ref="{ref}" adjust="true" />'
)


def _build_nas_ref(name: str) -> str | None:
    """Encode a decoded name into a NAS base64 ref, or None on failure."""
    if not name or name == "image":
        return None
    try:
        return base64.b64encode(name.encode("utf-8")).decode("ascii")
    except Exception:
        return None


def restore_nas_image_urls(html: str) -> str:
    """Convert local ``/api/images/``, ``/api/nas-images/``, and placeholder img tags back to NoteStation format.

    This is the reverse of :func:`rewrite_image_urls`.  It is used when
    pushing edited content back to NAS so that NoteStation can resolve
    the image references.

    Handles three cases (attribute-order agnostic, HTML-entity safe):

    1. ``src`` starts with ``/api/nas-images/`` — use ``alt`` for ref reconstruction
    2. ``src`` starts with ``/api/images/`` — use ``alt`` (fallback: ref from URL path)
    3. No ``src`` but ``alt`` starts with ``notestation-image:`` — extract name, reconstruct ref

    All other ``<img>`` tags pass through unchanged.

    NAS format (restored)::

        <img class=" syno-notestation-image-object"
             src="webman/3rdparty/NoteStation/images/transparent.gif"
             border="0" ref="BASE64_ENCODED_NAME" adjust="true" />
    """
    if not html:
        return html

    def _replace_img(match: re.Match) -> str:
        full_tag = match.group(0)
        attrs = match.group(1)

        src_m = _SRC_ATTR_RE.search(attrs)
        alt_m = _ALT_ATTR_RE.search(attrs)

        src = src_m.group(1) if src_m else ""
        alt = html_mod.unescape(alt_m.group(1)) if alt_m else ""

        # Case 1: NAS proxy URL → restore to NAS ref
        if src.startswith("/api/nas-images/"):
            ref = _build_nas_ref(alt)
            if ref:
                return _NAS_IMG_TEMPLATE.format(ref=ref)
            return full_tag

        # Case 2: Local NSX image URL → restore to NAS ref
        if src.startswith("/api/images/"):
            name = alt
            if not name or name == "image":
                # Fallback: extract ref from URL path (last segment, URL-decoded)
                parts = src.split("/")
                if len(parts) >= 4:
                    name = unquote(parts[-1])
            ref = _build_nas_ref(name)
            if ref:
                return _NAS_IMG_TEMPLATE.format(ref=ref)
            return full_tag

        # Case 3: Placeholder image (no src or empty src) with notestation-image: alt
        if (not src or src == "") and alt.startswith("notestation-image:"):
            name = alt[len("notestation-image:"):]
            ref = _build_nas_ref(name)
            if ref:
                return _NAS_IMG_TEMPLATE.format(ref=ref)
            return full_tag

        # All other images (external URLs, data URIs, etc.) pass through unchanged
        return full_tag

    return _IMG_TAG_RE.sub(_replace_img, html)


# Regex to match local file upload image tags: <img src="/api/files/{file_id}" ...>
_LOCAL_FILE_IMG_RE = re.compile(
    r'<img\b([^>]*?)\bsrc="/api/files/([^"]+)"([^>]*)/?>', re.IGNORECASE
)


def inline_local_file_images(html: str) -> str:
    """Convert ``/api/files/{file_id}`` image tags to inline data URIs.

    This is used when pushing content to NAS so that locally-uploaded
    images are embedded directly in the HTML and render without needing
    access to the AI-Note server.

    Args:
        html: HTML content that may contain ``/api/files/`` image references.

    Returns:
        HTML with local file images replaced by ``data:`` URIs.
    """
    if not html:
        return html

    import mimetypes
    from pathlib import Path

    from app.config import get_settings

    settings = get_settings()
    uploads_dir = Path(settings.UPLOADS_PATH)

    def _replace_file(match: re.Match) -> str:
        before_src = match.group(1)
        file_id = match.group(2)
        after_src = match.group(3)

        file_path = uploads_dir / file_id
        if not file_path.exists():
            return match.group(0)  # leave unchanged

        mime_type, _ = mimetypes.guess_type(file_id)
        if not mime_type or not mime_type.startswith("image/"):
            return match.group(0)  # skip non-images

        try:
            data = file_path.read_bytes()
            b64 = base64.b64encode(data).decode("ascii")
            return f'<img{before_src}src="data:{mime_type};base64,{b64}"{after_src}/>'
        except Exception:
            return match.group(0)

    return _LOCAL_FILE_IMG_RE.sub(_replace_file, html)


# Regex to match data URI img tags: <img ... src="data:image/...;base64,..." ...>
_DATA_URI_IMG_RE = re.compile(
    r'<img\b([^>]*?)\bsrc="(data:image/([^;]+);base64,([^"]+))"([^>]*)/?>', re.IGNORECASE
)


def extract_data_uri_images(html: str) -> str:
    """Extract inline ``data:`` URI images, save them to disk, and replace with ``/api/files/`` URLs.

    This is the reverse of :func:`inline_local_file_images`.  ``rehype-raw``
    (parse5) cannot handle very large attribute values, so data URI images
    must be converted to regular file URLs for the frontend to display them.

    When pushing back to NAS, :func:`inline_local_file_images` will convert
    these ``/api/files/`` URLs back to data URIs, preserving round-trip fidelity.

    Args:
        html: HTML content that may contain ``data:`` URI images.

    Returns:
        HTML with data URI images replaced by ``/api/files/`` URLs.
    """
    if not html or "data:image/" not in html:
        return html

    from pathlib import Path

    from app.config import get_settings

    settings = get_settings()
    uploads_dir = Path(settings.UPLOADS_PATH)
    uploads_dir.mkdir(parents=True, exist_ok=True)

    def _replace_data_uri(match: re.Match) -> str:
        full_tag = match.group(0)
        img_format = match.group(3)  # e.g. "jpeg", "png"
        b64_data = match.group(4)

        # Determine file extension from MIME type
        ext_map = {"jpeg": ".jpg", "png": ".png", "gif": ".gif", "webp": ".webp", "svg+xml": ".svg"}
        ext = ext_map.get(img_format, f".{img_format}")

        try:
            data = base64.b64decode(b64_data)
        except Exception:
            return full_tag  # leave unchanged if decode fails

        # Generate deterministic filename from content hash
        content_hash = hashlib.md5(data).hexdigest()  # noqa: S324
        file_id = f"{content_hash}{ext}"
        file_path = uploads_dir / file_id

        try:
            if not file_path.exists():
                file_path.write_bytes(data)
                logger.debug("Saved data URI image to %s (%d bytes)", file_id, len(data))
        except Exception:
            logger.warning("Failed to save data URI image to %s", file_id)
            return full_tag

        # Extract alt from existing attributes
        alt_match = re.search(r'alt="([^"]*)"', full_tag)
        alt = alt_match.group(1) if alt_match else file_id

        return f'<img src="/api/files/{file_id}" alt="{alt}" />'

    return _DATA_URI_IMG_RE.sub(_replace_data_uri, html)
