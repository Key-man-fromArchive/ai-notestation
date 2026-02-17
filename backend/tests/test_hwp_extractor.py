"""Tests for HWP/HWPX text extraction (OpenHWP-based)."""

from __future__ import annotations

import zipfile
from unittest.mock import AsyncMock, patch

import pytest

from app.services.hwp_extractor import HwpExtractionResult, HwpExtractor

# --- HwpExtractionResult model tests ---


def test_result_model_basic():
    result = HwpExtractionResult(text="hello", page_count=1, metadata={"format": "hwp"})
    assert result.text == "hello"
    assert result.page_count == 1
    assert result.metadata == {"format": "hwp"}


def test_result_model_hwpx_format():
    result = HwpExtractionResult(text="content", page_count=1, metadata={"format": "hwpx"})
    assert result.metadata["format"] == "hwpx"


# --- HWPX extraction tests (pure Python, no binary needed) ---


@pytest.mark.asyncio
async def test_extract_hwpx_prvtext(tmp_path):
    """HWPX extraction reads PrvText.txt from ZIP."""
    hwpx_file = tmp_path / "test.hwpx"
    with zipfile.ZipFile(hwpx_file, "w") as zf:
        zf.writestr("Preview/PrvText.txt", "연구 개요\n과제명\n바이오 디지털 트윈")
        zf.writestr("Contents/section0.xml", "<dummy/>")

    extractor = HwpExtractor()
    result = await extractor.extract(str(hwpx_file))

    assert "연구 개요" in result.text
    assert "바이오 디지털 트윈" in result.text
    assert result.metadata["format"] == "hwpx"


@pytest.mark.asyncio
async def test_extract_hwpx_fallback_xml(tmp_path):
    """HWPX extraction falls back to section XML when no PrvText.txt."""
    section_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"
            xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
      <hp:p><hp:run><hp:t>첫 번째 문단</hp:t></hp:run></hp:p>
      <hp:p><hp:run><hp:t>두 번째 문단</hp:t></hp:run></hp:p>
    </hs:sec>"""

    hwpx_file = tmp_path / "no_preview.hwpx"
    with zipfile.ZipFile(hwpx_file, "w") as zf:
        zf.writestr("Contents/section0.xml", section_xml)

    extractor = HwpExtractor()
    result = await extractor.extract(str(hwpx_file))

    assert "첫 번째 문단" in result.text
    assert "두 번째 문단" in result.text


# --- Error cases ---


@pytest.mark.asyncio
async def test_extract_file_not_found():
    """FileNotFoundError for missing files."""
    extractor = HwpExtractor()
    with pytest.raises(FileNotFoundError, match="HWP file not found"):
        await extractor.extract("/nonexistent/test.hwp")


@pytest.mark.asyncio
async def test_extract_hwpx_empty(tmp_path):
    """ValueError for HWPX with no text."""
    hwpx_file = tmp_path / "empty.hwpx"
    with zipfile.ZipFile(hwpx_file, "w") as zf:
        zf.writestr("Contents/section0.xml", "<dummy/>")

    extractor = HwpExtractor()
    with pytest.raises(ValueError, match="no extractable text"):
        await extractor.extract(str(hwpx_file))


@pytest.mark.asyncio
async def test_extract_unsupported_extension(tmp_path):
    """ValueError for unsupported extensions."""
    txt_file = tmp_path / "test.txt"
    txt_file.write_text("hello")

    extractor = HwpExtractor()
    with pytest.raises(ValueError, match="Unsupported format"):
        await extractor.extract(str(txt_file))


# --- API routing test ---


@pytest.mark.asyncio
async def test_hwp_extension_accepted_by_routing():
    """HWP extensions are recognized in the files API routing logic."""
    from app.api.files import _HWP_EXTENSIONS

    assert ".hwp" in _HWP_EXTENSIONS
    assert ".hwpx" in _HWP_EXTENSIONS


# --- HWPX image extraction tests ---

# 1x1 red PNG (smallest valid PNG)
_TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
    b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
    b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


def test_extract_hwpx_images_basic(tmp_path):
    """HWPX image extraction picks up images from BinData/ folder."""
    hwpx_file = tmp_path / "with_images.hwpx"
    with zipfile.ZipFile(hwpx_file, "w") as zf:
        zf.writestr("Preview/PrvText.txt", "text")
        zf.writestr("BinData/image001.png", _TINY_PNG)
        zf.writestr("BinData/chart.jpg", b"\xff\xd8\xff\xe0fake-jpg")
        zf.writestr("BinData/vector.wmf", b"wmf-data")  # should be skipped
        zf.writestr("BinData/ole.ole", b"ole-data")  # should be skipped

    extractor = HwpExtractor()
    images = extractor._extract_hwpx_images(hwpx_file)

    filenames = [name for name, _ in images]
    assert "image001.png" in filenames
    assert "chart.jpg" in filenames
    assert "vector.wmf" not in filenames
    assert "ole.ole" not in filenames
    assert len(images) == 2


def test_extract_hwpx_images_no_bindata(tmp_path):
    """HWPX without BinData/ returns empty list."""
    hwpx_file = tmp_path / "no_images.hwpx"
    with zipfile.ZipFile(hwpx_file, "w") as zf:
        zf.writestr("Preview/PrvText.txt", "text only")

    extractor = HwpExtractor()
    images = extractor._extract_hwpx_images(hwpx_file)
    assert images == []


def test_extract_hwpx_images_empty_data_skipped(tmp_path):
    """HWPX images with zero-length data are skipped."""
    hwpx_file = tmp_path / "empty_img.hwpx"
    with zipfile.ZipFile(hwpx_file, "w") as zf:
        zf.writestr("Preview/PrvText.txt", "text")
        zf.writestr("BinData/empty.png", b"")  # empty, should be skipped
        zf.writestr("BinData/valid.png", _TINY_PNG)

    extractor = HwpExtractor()
    images = extractor._extract_hwpx_images(hwpx_file)
    assert len(images) == 1
    assert images[0][0] == "valid.png"


# --- OCR merging tests ---


def _make_ocr_result(text: str):
    """Create a mock OCRResult."""
    from app.services.ocr_service import OCRResult

    return OCRResult(text=text, confidence=0.9, method="mock")


@pytest.mark.asyncio
async def test_ocr_images_combines_text():
    """OCR results from multiple images are combined."""
    extractor = HwpExtractor()
    images = [
        ("img1.png", _TINY_PNG),
        ("img2.jpg", b"\xff\xd8\xff\xe0fake"),
    ]

    mock_extract = AsyncMock(
        side_effect=[
            _make_ocr_result("텍스트 from image 1"),
            _make_ocr_result("텍스트 from image 2"),
        ]
    )

    with patch("app.services.ocr_service.OCRService.extract_text", mock_extract):
        text, meta = await extractor._ocr_images(images)

    assert "텍스트 from image 1" in text
    assert "텍스트 from image 2" in text
    assert meta["ocr"] is True
    assert meta["ocr_image_count"] == 2
    assert "ocr_errors" not in meta


@pytest.mark.asyncio
async def test_ocr_images_partial_failure():
    """First image fails, second succeeds — returns partial text + error count."""
    extractor = HwpExtractor()
    images = [
        ("fail.png", _TINY_PNG),
        ("ok.png", _TINY_PNG),
    ]

    mock_extract = AsyncMock(
        side_effect=[
            RuntimeError("OCR engine unavailable"),
            _make_ocr_result("성공한 OCR 텍스트"),
        ]
    )

    with patch("app.services.ocr_service.OCRService.extract_text", mock_extract):
        text, meta = await extractor._ocr_images(images)

    assert "성공한 OCR 텍스트" in text
    assert meta["ocr"] is True
    assert meta["ocr_image_count"] == 1
    assert meta["ocr_errors"] == 1


@pytest.mark.asyncio
async def test_ocr_images_empty_list():
    """No images → empty text and no OCR metadata."""
    extractor = HwpExtractor()
    text, meta = await extractor._ocr_images([])
    assert text == ""
    assert meta == {}


@pytest.mark.asyncio
async def test_extract_hwpx_text_only_no_ocr_metadata(tmp_path):
    """HWPX with text but no images has no OCR keys in metadata."""
    hwpx_file = tmp_path / "text_only.hwpx"
    with zipfile.ZipFile(hwpx_file, "w") as zf:
        zf.writestr("Preview/PrvText.txt", "순수 텍스트 문서")

    extractor = HwpExtractor()
    result = await extractor.extract(str(hwpx_file))

    assert result.text == "순수 텍스트 문서"
    assert "ocr" not in result.metadata
    assert "ocr_image_count" not in result.metadata


@pytest.mark.asyncio
async def test_extract_hwpx_with_ocr_integration(tmp_path):
    """Full HWPX extraction: body text + OCR from embedded image."""
    hwpx_file = tmp_path / "full.hwpx"
    with zipfile.ZipFile(hwpx_file, "w") as zf:
        zf.writestr("Preview/PrvText.txt", "본문 텍스트")
        zf.writestr("BinData/scan.png", _TINY_PNG)

    mock_extract = AsyncMock(return_value=_make_ocr_result("스캔된 텍스트"))

    extractor = HwpExtractor()
    with patch("app.services.ocr_service.OCRService.extract_text", mock_extract):
        result = await extractor.extract(str(hwpx_file))

    assert "본문 텍스트" in result.text
    assert "스캔된 텍스트" in result.text
    assert result.metadata["ocr"] is True
    assert result.metadata["format"] == "hwpx"
