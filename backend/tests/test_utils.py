"""Tests for utility modules."""

from datetime import UTC, datetime, timezone

import pytest

from app.utils.datetime_utils import datetime_from_iso, datetime_to_iso, unix_to_iso
from app.utils.note_utils import (
    normalize_db_tags,
    normalize_tags,
    rewrite_image_urls,
    truncate_snippet,
)


class TestDatetimeUtils:
    """Tests for datetime conversion utilities."""

    def test_unix_to_iso_with_valid_timestamp(self):
        """Unix timestamp converts to ISO string."""
        ts = 1704067200  # 2024-01-01 00:00:00 UTC
        result = unix_to_iso(ts)
        assert result == "2024-01-01T00:00:00+00:00"

    def test_unix_to_iso_with_float(self):
        """Float timestamp works correctly."""
        ts = 1704067200.5
        result = unix_to_iso(ts)
        assert "2024-01-01T00:00:00" in result

    def test_unix_to_iso_with_none(self):
        """None input returns None."""
        assert unix_to_iso(None) is None

    def test_datetime_to_iso_with_aware_datetime(self):
        """Aware datetime converts to ISO string."""
        dt = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
        result = datetime_to_iso(dt)
        assert result == "2024-01-01T12:00:00+00:00"

    def test_datetime_to_iso_with_naive_datetime(self):
        """Naive datetime gets UTC timezone assumed."""
        dt = datetime(2024, 1, 1, 12, 0, 0)
        result = datetime_to_iso(dt)
        assert result == "2024-01-01T12:00:00+00:00"

    def test_datetime_to_iso_with_other_timezone(self):
        """Non-UTC timezone converts to UTC."""
        # Create datetime in UTC+9 (like KST)
        kst = timezone(offset=datetime.now(UTC).utcoffset() or __import__("datetime").timedelta(hours=9))
        dt = datetime(2024, 1, 1, 21, 0, 0, tzinfo=timezone(__import__("datetime").timedelta(hours=9)))
        result = datetime_to_iso(dt)
        # 21:00 KST = 12:00 UTC
        assert "2024-01-01T12:00:00+00:00" in result

    def test_datetime_to_iso_with_none(self):
        """None input returns None."""
        assert datetime_to_iso(None) is None

    def test_datetime_from_iso_with_valid_string(self):
        """ISO string converts to datetime."""
        result = datetime_from_iso("2024-01-01T12:00:00+00:00")
        assert result is not None
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 1
        assert result.hour == 12

    def test_datetime_from_iso_with_none(self):
        """None input returns None."""
        assert datetime_from_iso(None) is None

    def test_datetime_from_iso_with_empty_string(self):
        """Empty string returns None."""
        assert datetime_from_iso("") is None


class TestNoteUtils:
    """Tests for note utility functions."""

    # normalize_tags tests
    def test_normalize_tags_with_list(self):
        """List tags return as-is."""
        raw = {"tag": ["tag1", "tag2"]}
        assert normalize_tags(raw) == ["tag1", "tag2"]

    def test_normalize_tags_with_dict(self):
        """Dict tags return values as list."""
        raw = {"tag": {"0": "tag1", "1": "tag2"}}
        result = normalize_tags(raw)
        assert set(result) == {"tag1", "tag2"}

    def test_normalize_tags_with_empty_dict(self):
        """Empty dict returns empty list."""
        raw = {"tag": {}}
        assert normalize_tags(raw) == []

    def test_normalize_tags_with_none(self):
        """Missing tag key returns empty list."""
        raw = {}
        assert normalize_tags(raw) == []

    def test_normalize_tags_with_empty_list(self):
        """Empty list returns empty list."""
        raw = {"tag": []}
        assert normalize_tags(raw) == []

    # normalize_db_tags tests
    def test_normalize_db_tags_with_list(self):
        """List returns as-is."""
        assert normalize_db_tags(["a", "b"]) == ["a", "b"]

    def test_normalize_db_tags_with_dict(self):
        """Dict returns values as list."""
        result = normalize_db_tags({"0": "a", "1": "b"})
        assert set(result) == {"a", "b"}

    def test_normalize_db_tags_with_empty_dict(self):
        """Empty dict returns empty list."""
        assert normalize_db_tags({}) == []

    def test_normalize_db_tags_with_none(self):
        """None returns empty list."""
        assert normalize_db_tags(None) == []

    # truncate_snippet tests
    def test_truncate_snippet_short_text(self):
        """Short text returns unchanged."""
        assert truncate_snippet("Hello world", 200) == "Hello world"

    def test_truncate_snippet_long_text(self):
        """Long text gets truncated with ellipsis."""
        long_text = "a" * 250
        result = truncate_snippet(long_text, 200)
        assert len(result) == 203  # 200 + "..."
        assert result.endswith("...")

    def test_truncate_snippet_whitespace_normalized(self):
        """Multiple whitespace collapsed."""
        text = "hello   world\n\ntest"
        assert truncate_snippet(text) == "hello world test"

    def test_truncate_snippet_none(self):
        """None returns empty string."""
        assert truncate_snippet(None) == ""

    def test_truncate_snippet_empty(self):
        """Empty string returns empty string."""
        assert truncate_snippet("") == ""

    # rewrite_image_urls tests
    def test_rewrite_image_urls_empty_html(self):
        """Empty HTML returns unchanged."""
        assert rewrite_image_urls("", "note1") == ""
        assert rewrite_image_urls(None, "note1") is None

    def test_rewrite_image_urls_no_images(self):
        """HTML without images returns unchanged."""
        html = "<p>Hello world</p>"
        assert rewrite_image_urls(html, "note1") == html

    def test_rewrite_image_urls_with_notestation_image(self):
        """NoteStation image tag gets placeholder."""
        # Base64 of "test.png" is "dGVzdC5wbmc="
        html = '<img ref="dGVzdC5wbmc=" />'
        result = rewrite_image_urls(html, "note1")
        assert 'alt="notestation-image:test.png"' in result

    def test_rewrite_image_urls_with_invalid_base64(self):
        """Invalid base64 ref uses fallback name."""
        html = '<img ref="invalid!!!" />'
        result = rewrite_image_urls(html, "note1")
        assert 'alt="notestation-image:image"' in result

    def test_rewrite_image_urls_with_attachment_lookup(self):
        """Attachment metadata provides dimensions; alt uses decoded_name for round-trip."""
        import base64

        ref = base64.b64encode(b"original.png").decode()
        html = f'<img ref="{ref}" />'
        lookup = {
            "att1": {
                "ref": "original.png",
                "name": "Pretty Name.png",
                "width": 800,
                "height": 600,
            }
        }
        result = rewrite_image_urls(html, "note1", attachment_lookup=lookup)
        # alt preserves decoded_name (original.png) for correct round-trip restoration
        assert 'alt="notestation-image:original.png"' in result
        assert 'width="800"' in result
        assert 'height="600"' in result

    def test_rewrite_image_urls_with_image_map(self):
        """Database image produces real src URL."""
        import base64
        from unittest.mock import MagicMock

        ref = base64.b64encode(b"photo.jpg").decode()
        html = f'<img ref="{ref}" />'

        mock_image = MagicMock()
        mock_image.ref = "photo.jpg"
        mock_image.name = "photo.jpg"
        mock_image.width = 1920
        mock_image.height = 1080

        image_map = {"photo.jpg": mock_image}
        result = rewrite_image_urls(html, "note123", image_map=image_map)

        assert 'src="/api/images/note123/photo.jpg"' in result
        assert 'width="1920"' in result
        assert 'height="1080"' in result
        assert 'class="notestation-image"' in result

    def test_rewrite_image_urls_image_map_suffix_match(self):
        """Image map matches by suffix when direct lookup fails."""
        import base64
        from unittest.mock import MagicMock

        # Decoded name has timestamp prefix
        decoded_name = "1770102482260ns_attach_photo.jpg"
        ref = base64.b64encode(decoded_name.encode()).decode()
        html = f'<img ref="{ref}" />'

        mock_image = MagicMock()
        mock_image.ref = "photo.jpg"
        mock_image.name = "photo.jpg"  # Shorter name that decoded_name ends with
        mock_image.width = 640
        mock_image.height = 480

        # Map key doesn't match decoded_name directly
        image_map = {"photo.jpg": mock_image}
        result = rewrite_image_urls(html, "note456", image_map=image_map)

        assert 'src="/api/images/note456/photo.jpg"' in result
