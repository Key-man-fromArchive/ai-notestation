"""Tests for HWP/HWPX text extraction (OpenHWP-based)."""

from __future__ import annotations

import zipfile

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
