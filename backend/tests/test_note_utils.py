"""Tests for note_utils image URL rewriting and restoration round-trip."""

from __future__ import annotations

import base64

import pytest

from app.utils.note_utils import restore_nas_image_urls, rewrite_image_urls


def _b64(name: str) -> str:
    """Helper to base64-encode a name."""
    return base64.b64encode(name.encode("utf-8")).decode("ascii")


NAS_IMG_FMT = (
    '<img class=" syno-notestation-image-object" '
    'src="webman/3rdparty/NoteStation/images/transparent.gif" '
    'border="0" ref="{ref}" adjust="true" />'
)


# -----------------------------------------------------------------------
# restore_nas_image_urls: NAS proxy URLs
# -----------------------------------------------------------------------


class TestRestoreNasProxyUrls:
    def test_nas_proxy_url_restores_ref(self):
        html = '<img src="/api/nas-images/note1/attkey/photo.jpg" alt="1770687005299ns_attach_image_photo.jpg" />'
        result = restore_nas_image_urls(html)
        expected_ref = _b64("1770687005299ns_attach_image_photo.jpg")
        assert f'ref="{expected_ref}"' in result
        assert "syno-notestation-image-object" in result
        assert "/api/nas-images/" not in result

    def test_nas_proxy_with_extra_attrs(self):
        html = '<img src="/api/nas-images/note1/key/img.png" alt="myimage.png" width="400" height="300" class="notestation-image" loading="lazy" />'
        result = restore_nas_image_urls(html)
        expected_ref = _b64("myimage.png")
        assert f'ref="{expected_ref}"' in result
        assert "/api/nas-images/" not in result


# -----------------------------------------------------------------------
# restore_nas_image_urls: Local NSX image URLs
# -----------------------------------------------------------------------


class TestRestoreLocalImageUrls:
    def test_local_image_url_restores_ref(self):
        html = '<img src="/api/images/note1/image_ref_123" alt="1770102482260ns_attach_image_test.jpg" />'
        result = restore_nas_image_urls(html)
        expected_ref = _b64("1770102482260ns_attach_image_test.jpg")
        assert f'ref="{expected_ref}"' in result
        assert "/api/images/" not in result

    def test_local_image_fallback_to_url_ref(self):
        """When alt is 'image' (generic), fallback to ref from URL path."""
        html = '<img src="/api/images/note1/my_image_ref" alt="image" />'
        result = restore_nas_image_urls(html)
        expected_ref = _b64("my_image_ref")
        assert f'ref="{expected_ref}"' in result

    def test_local_image_url_encoded_ref(self):
        """URL-encoded path segment should be decoded for ref."""
        html = '<img src="/api/images/note1/file%20name.jpg" alt="image" />'
        result = restore_nas_image_urls(html)
        expected_ref = _b64("file name.jpg")
        assert f'ref="{expected_ref}"' in result


# -----------------------------------------------------------------------
# restore_nas_image_urls: Placeholder images (no src)
# -----------------------------------------------------------------------


class TestRestorePlaceholderImages:
    def test_placeholder_restores_ref(self):
        html = '<img alt="notestation-image:1770687005299ns_attach_image_photo.jpg" />'
        result = restore_nas_image_urls(html)
        expected_ref = _b64("1770687005299ns_attach_image_photo.jpg")
        assert f'ref="{expected_ref}"' in result
        assert "syno-notestation-image-object" in result

    def test_placeholder_with_dimensions(self):
        html = '<img alt="notestation-image:photo.jpg" width="640" height="480" />'
        result = restore_nas_image_urls(html)
        expected_ref = _b64("photo.jpg")
        assert f'ref="{expected_ref}"' in result


# -----------------------------------------------------------------------
# restore_nas_image_urls: HTML entity handling
# -----------------------------------------------------------------------


class TestHtmlEntityHandling:
    def test_ampersand_in_alt(self):
        """TipTap HTML-encodes & in alt attributes; we must unescape before encoding."""
        name = "file&name.jpg"
        html = f'<img src="/api/nas-images/note1/key/fn.jpg" alt="file&amp;name.jpg" />'
        result = restore_nas_image_urls(html)
        expected_ref = _b64(name)
        assert f'ref="{expected_ref}"' in result

    def test_lt_gt_in_alt(self):
        name = "file<1>.jpg"
        html = f'<img src="/api/nas-images/note1/key/fn.jpg" alt="file&lt;1&gt;.jpg" />'
        result = restore_nas_image_urls(html)
        expected_ref = _b64(name)
        assert f'ref="{expected_ref}"' in result

    def test_quot_in_alt(self):
        """Double-quote entities in alt should be unescaped."""
        name = 'file"quote.jpg'
        html = '<img src="/api/nas-images/note1/key/fn.jpg" alt="file&quot;quote.jpg" />'
        result = restore_nas_image_urls(html)
        expected_ref = _b64(name)
        assert f'ref="{expected_ref}"' in result


# -----------------------------------------------------------------------
# restore_nas_image_urls: Attribute order agnostic
# -----------------------------------------------------------------------


class TestAttributeOrder:
    def test_alt_before_src(self):
        """Should work even if alt appears before src."""
        html = '<img alt="myfile.png" src="/api/nas-images/note1/key/myfile.png" />'
        result = restore_nas_image_urls(html)
        expected_ref = _b64("myfile.png")
        assert f'ref="{expected_ref}"' in result

    def test_tiptap_style_no_self_close(self):
        """TipTap may output <img ...> instead of <img ... />."""
        html = '<img src="/api/nas-images/note1/key/file.jpg" alt="decoded.jpg">'
        result = restore_nas_image_urls(html)
        expected_ref = _b64("decoded.jpg")
        assert f'ref="{expected_ref}"' in result


# -----------------------------------------------------------------------
# restore_nas_image_urls: Pass-through cases
# -----------------------------------------------------------------------


class TestPassThrough:
    def test_external_url_unchanged(self):
        html = '<img src="https://example.com/photo.jpg" alt="photo" />'
        result = restore_nas_image_urls(html)
        assert result == html

    def test_data_uri_unchanged(self):
        html = '<img src="data:image/png;base64,iVBOR..." alt="screenshot" />'
        result = restore_nas_image_urls(html)
        assert result == html

    def test_api_files_unchanged(self):
        """/api/files/ URLs should NOT be converted (handled by inline_local_file_images)."""
        html = '<img src="/api/files/abc123.png" alt="upload" />'
        result = restore_nas_image_urls(html)
        assert result == html

    def test_empty_html(self):
        assert restore_nas_image_urls("") == ""
        assert restore_nas_image_urls(None) is None


# -----------------------------------------------------------------------
# Mixed content
# -----------------------------------------------------------------------


class TestMixedContent:
    def test_multiple_image_types(self):
        """Mixed content with NAS, local, placeholder, external, and data URI images."""
        html = (
            '<p>Hello</p>'
            '<img src="/api/nas-images/n1/k1/a.jpg" alt="nas_decoded.jpg" />'
            '<img src="/api/images/n1/ref1" alt="local_decoded.jpg" />'
            '<img alt="notestation-image:placeholder.jpg" />'
            '<img src="https://example.com/ext.png" alt="external" />'
            '<img src="data:image/png;base64,abc" alt="data" />'
            '<p>End</p>'
        )
        result = restore_nas_image_urls(html)

        # NAS proxy → converted
        assert _b64("nas_decoded.jpg") in result
        # Local → converted
        assert _b64("local_decoded.jpg") in result
        # Placeholder → converted
        assert _b64("placeholder.jpg") in result
        # External → unchanged
        assert "https://example.com/ext.png" in result
        # Data URI → unchanged
        assert "data:image/png;base64,abc" in result
        # No remaining API URLs
        assert "/api/nas-images/" not in result
        assert "/api/images/" not in result
        assert "notestation-image:" not in result


# -----------------------------------------------------------------------
# Full round-trip: rewrite_image_urls → (edit) → restore_nas_image_urls
# -----------------------------------------------------------------------


class TestFullRoundTrip:
    def test_nas_proxy_round_trip(self):
        """rewrite → TipTap-style output → restore should produce correct NAS ref."""
        decoded_name = "1770687005299ns_attach_image_photo.jpg"
        ref_b64 = _b64(decoded_name)
        att_name = "ns_attach_image_photo.jpg"

        # Original NAS HTML
        original = f'<img class="syno-notestation-image-object" src="webman/3rdparty/NoteStation/images/transparent.gif" ref="{ref_b64}" />'

        # Simulate rewrite_image_urls with NAS attachments
        nas_attachments = {
            "att_key_1": {
                "name": att_name,
                "ref": ref_b64,
                "width": 800,
                "height": 600,
            }
        }
        rewritten = rewrite_image_urls(
            original, note_id="note123", nas_attachments=nas_attachments
        )

        # Verify rewrite produced a proxy URL with decoded_name as alt
        assert "/api/nas-images/" in rewritten
        assert f'alt="{decoded_name}"' in rewritten

        # Simulate TipTap output (may reorder attrs, no self-close)
        # restore should still work
        restored = restore_nas_image_urls(rewritten)

        # Verify restored ref matches original
        assert f'ref="{ref_b64}"' in restored
        assert "syno-notestation-image-object" in restored
        assert "/api/" not in restored

    def test_local_image_round_trip(self):
        """rewrite (local NSX image) → restore should produce correct NAS ref."""
        decoded_name = "1770102482260ns_attach_image_test.png"
        ref_b64 = _b64(decoded_name)

        original = f'<img class="syno-notestation-image-object" src="webman/3rdparty/NoteStation/images/transparent.gif" ref="{ref_b64}" />'

        # Mock NoteImage for NSX-extracted image
        class MockImage:
            def __init__(self):
                self.ref = "image_ref_123"
                self.name = "ns_attach_image_test.png"
                self.width = 640
                self.height = 480

        image_map = {decoded_name: MockImage()}
        rewritten = rewrite_image_urls(
            original, note_id="note456", image_map=image_map
        )

        assert "/api/images/" in rewritten
        assert f'alt="{decoded_name}"' in rewritten

        restored = restore_nas_image_urls(rewritten)
        assert f'ref="{ref_b64}"' in restored
        assert "/api/" not in restored
