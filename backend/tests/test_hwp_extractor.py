"""Tests for HWP/HWPX text extraction."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

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


# --- HwpExtractor.extract() tests ---


@pytest.mark.asyncio
async def test_extract_hwp_success(tmp_path):
    """HWP file extraction returns body text."""
    hwp_file = tmp_path / "test.hwp"
    hwp_file.write_bytes(b"dummy")

    mock_reader = MagicMock()
    mock_reader.text = "본문 텍스트입니다."
    mock_reader.get_tables_as_markdown.return_value = ""

    with patch("hwp_hwpx_parser.Reader", return_value=mock_reader):
        extractor = HwpExtractor()
        result = await extractor.extract(str(hwp_file))

    assert result.text == "본문 텍스트입니다."
    assert result.page_count == 1
    assert result.metadata["format"] == "hwp"


@pytest.mark.asyncio
async def test_extract_hwpx_with_tables(tmp_path):
    """HWPX file extraction includes tables."""
    hwpx_file = tmp_path / "report.hwpx"
    hwpx_file.write_bytes(b"dummy")

    mock_reader = MagicMock()
    mock_reader.text = "본문"
    mock_reader.get_tables_as_markdown.return_value = "| col1 | col2 |\n|---|---|\n| a | b |"

    with patch("hwp_hwpx_parser.Reader", return_value=mock_reader):
        extractor = HwpExtractor()
        result = await extractor.extract(str(hwpx_file))

    assert "본문" in result.text
    assert "| col1 | col2 |" in result.text
    assert result.metadata["format"] == "hwpx"


# --- Error cases ---


@pytest.mark.asyncio
async def test_extract_file_not_found():
    """FileNotFoundError for missing files."""
    extractor = HwpExtractor()
    with pytest.raises(FileNotFoundError, match="HWP file not found"):
        await extractor.extract("/nonexistent/test.hwp")


@pytest.mark.asyncio
async def test_extract_empty_document(tmp_path):
    """ValueError for empty documents."""
    hwp_file = tmp_path / "empty.hwp"
    hwp_file.write_bytes(b"dummy")

    mock_reader = MagicMock()
    mock_reader.text = ""
    mock_reader.get_tables_as_markdown.return_value = ""

    with patch("hwp_hwpx_parser.Reader", return_value=mock_reader):
        extractor = HwpExtractor()
        with pytest.raises(ValueError, match="no extractable text"):
            await extractor.extract(str(hwp_file))


@pytest.mark.asyncio
async def test_extract_parse_failure(tmp_path):
    """ValueError when parser fails to open file."""
    hwp_file = tmp_path / "corrupt.hwp"
    hwp_file.write_bytes(b"corrupt")

    with patch("hwp_hwpx_parser.Reader", side_effect=Exception("bad format")):
        extractor = HwpExtractor()
        with pytest.raises(ValueError, match="Failed to open HWP/HWPX"):
            await extractor.extract(str(hwp_file))


# --- API routing test ---


@pytest.mark.asyncio
async def test_hwp_extension_accepted_by_routing():
    """HWP extensions are recognized in the files API routing logic."""
    from app.api.files import _HWP_EXTENSIONS

    assert ".hwp" in _HWP_EXTENSIONS
    assert ".hwpx" in _HWP_EXTENSIONS

    # Verify routing logic: HWP file IDs should not be rejected
    for ext in (".hwp", ".hwpx"):
        file_id = f"abc123{ext}"
        is_hwp = any(file_id.lower().endswith(e) for e in _HWP_EXTENSIONS)
        assert is_hwp, f"{ext} should be recognized as HWP"
