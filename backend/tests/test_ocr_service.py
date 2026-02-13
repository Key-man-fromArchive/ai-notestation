"""Tests for OCR service: engine selection, AI Vision, PaddleOCR-VL, file handling.

Covers:
- OCRResult model validation (3 tests)
- Engine selection dispatch (4 tests)
- AI Vision extraction with fallback (5 tests)
- PaddleOCR-VL local engine (3 tests)
- File-based extraction (2 tests)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.services.ocr_service import OCRResult, OCRService, PaddleOCRVLEngine


# ---------------------------------------------------------------------------
# TestOCRResultModel
# ---------------------------------------------------------------------------

class TestOCRResultModel:
    """OCRResult Pydantic model validation."""

    def test_valid(self):
        r = OCRResult(text="Hello world", confidence=0.85, method="gpt-4o")
        assert r.text == "Hello world"
        assert r.confidence == 0.85
        assert r.method == "gpt-4o"

    def test_empty_text(self):
        r = OCRResult(text="", confidence=0.0, method="paddleocr-vl")
        assert r.text == ""
        assert r.confidence == 0.0

    def test_validation_error(self):
        with pytest.raises(ValidationError):
            OCRResult(text="hello")  # missing confidence, method


# ---------------------------------------------------------------------------
# TestOCRServiceEngineSelection
# ---------------------------------------------------------------------------

class TestOCRServiceEngineSelection:
    """Engine selection based on settings store."""

    @pytest.mark.asyncio
    async def test_default_engine_ai_vision(self):
        with patch("app.services.ocr_service.OCRService._get_engine_setting", new_callable=AsyncMock) as mock_setting:
            mock_setting.return_value = "ai_vision"
            svc = OCRService()
            engine = await svc._get_engine_setting()
            assert engine == "ai_vision"

    @pytest.mark.asyncio
    async def test_engine_paddleocr_vl(self):
        with patch("app.api.settings._get_store", return_value={"ocr_engine": "paddleocr_vl"}):
            svc = OCRService()
            engine = await svc._get_engine_setting()
            assert engine == "paddleocr_vl"

    @pytest.mark.asyncio
    async def test_dispatches_to_ai_vision(self):
        svc = OCRService()
        expected = OCRResult(text="hello", confidence=0.8, method="gpt-4o")
        with (
            patch.object(svc, "_get_engine_setting", new_callable=AsyncMock, return_value="ai_vision"),
            patch.object(svc, "_ai_vision_extract", new_callable=AsyncMock, return_value=expected) as mock_ai,
        ):
            result = await svc.extract_text(b"fake-image", "image/png")
            mock_ai.assert_awaited_once_with(b"fake-image", "image/png")
            assert result == expected

    @pytest.mark.asyncio
    async def test_dispatches_to_paddleocr(self):
        svc = OCRService()
        expected = OCRResult(text="hello", confidence=0.9, method="paddleocr-vl")
        with (
            patch.object(svc, "_get_engine_setting", new_callable=AsyncMock, return_value="paddleocr_vl"),
            patch.object(PaddleOCRVLEngine, "extract", new_callable=AsyncMock, return_value=expected) as mock_paddle,
        ):
            result = await svc.extract_text(b"fake-image", "image/png")
            mock_paddle.assert_awaited_once()
            assert result == expected


# ---------------------------------------------------------------------------
# TestAIVisionExtract
# ---------------------------------------------------------------------------

class TestAIVisionExtract:
    """AI Vision cloud extraction via AIRouter."""

    def _make_mock_router(self, models, chat_side_effect=None, chat_return=None):
        """Create a mock AIRouter with given models and chat behavior."""
        mock_router = MagicMock()

        model_infos = []
        for m in models:
            info = MagicMock()
            info.id = m
            model_infos.append(info)
        mock_router.all_models.return_value = model_infos

        if chat_side_effect is not None:
            mock_router.chat = AsyncMock(side_effect=chat_side_effect)
        elif chat_return is not None:
            mock_router.chat = AsyncMock(return_value=chat_return)

        return mock_router

    def _make_response(self, content: str):
        resp = MagicMock()
        resp.content = content
        return resp

    @pytest.mark.asyncio
    async def test_success_first_model(self):
        resp = self._make_response("Extracted text here")
        router = self._make_mock_router(["glm-4.7", "gpt-4o"], chat_return=resp)

        with patch("app.ai_router.router.AIRouter", return_value=router):
            svc = OCRService()
            result = await svc._ai_vision_extract(b"img", "image/png")

        assert result.text == "Extracted text here"
        assert result.confidence == 0.8
        assert result.method == "glm-4.7"
        router.chat.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_fallback_second_model(self):
        resp = self._make_response("Fallback text")
        router = self._make_mock_router(
            ["glm-4.7", "gpt-4o"],
            chat_side_effect=[RuntimeError("glm failed"), resp],
        )

        with patch("app.ai_router.router.AIRouter", return_value=router):
            svc = OCRService()
            result = await svc._ai_vision_extract(b"img", "image/png")

        assert result.text == "Fallback text"
        assert result.method == "gpt-4o"
        assert router.chat.await_count == 2

    @pytest.mark.asyncio
    async def test_all_models_fail(self):
        router = self._make_mock_router(
            ["glm-4.7", "gpt-4o"],
            chat_side_effect=RuntimeError("fail"),
        )

        with patch("app.ai_router.router.AIRouter", return_value=router):
            svc = OCRService()
            with pytest.raises(RuntimeError, match="All Vision models failed"):
                await svc._ai_vision_extract(b"img", "image/png")

    @pytest.mark.asyncio
    async def test_no_models_available(self):
        # Only non-vision models registered
        router = self._make_mock_router(["some-text-model"])

        with patch("app.ai_router.router.AIRouter", return_value=router):
            svc = OCRService()
            with pytest.raises(RuntimeError, match="No Vision-capable"):
                await svc._ai_vision_extract(b"img", "image/png")

    @pytest.mark.asyncio
    async def test_empty_text_zero_confidence(self):
        resp = self._make_response("   ")
        router = self._make_mock_router(["glm-4.7"], chat_return=resp)

        with patch("app.ai_router.router.AIRouter", return_value=router):
            svc = OCRService()
            result = await svc._ai_vision_extract(b"img", "image/png")

        assert result.text == ""
        assert result.confidence == 0.0


# ---------------------------------------------------------------------------
# TestPaddleOCRVLEngine
# ---------------------------------------------------------------------------

class TestPaddleOCRVLEngine:
    """PaddleOCR-VL local engine tests."""

    @pytest.mark.asyncio
    async def test_extract_success(self):
        mock_pipeline = MagicMock()
        mock_pipeline.predict.return_value = [
            {"rec_text": "line1"},
            {"rec_text": "line2"},
        ]

        with patch.object(PaddleOCRVLEngine, "_get_pipeline", return_value=mock_pipeline):
            engine = PaddleOCRVLEngine()
            result = await engine.extract(b"fake-image-bytes", "image/png")

        assert result.text == "line1\nline2"
        assert result.confidence == 0.9
        assert result.method == "paddleocr-vl"

    @pytest.mark.asyncio
    async def test_empty_result(self):
        mock_pipeline = MagicMock()
        mock_pipeline.predict.return_value = []

        with patch.object(PaddleOCRVLEngine, "_get_pipeline", return_value=mock_pipeline):
            engine = PaddleOCRVLEngine()
            result = await engine.extract(b"fake-image-bytes", "image/png")

        assert result.text == ""
        assert result.confidence == 0.0

    @pytest.mark.asyncio
    async def test_string_items(self):
        mock_pipeline = MagicMock()
        mock_pipeline.predict.return_value = ["a", "b"]

        with patch.object(PaddleOCRVLEngine, "_get_pipeline", return_value=mock_pipeline):
            engine = PaddleOCRVLEngine()
            result = await engine.extract(b"fake-image-bytes", "image/png")

        assert result.text == "a\nb"


# ---------------------------------------------------------------------------
# TestExtractTextFromFile
# ---------------------------------------------------------------------------

class TestExtractTextFromFile:
    """File-based extraction (reads file, delegates to extract_text)."""

    @pytest.mark.asyncio
    async def test_success(self, tmp_path):
        img_file = tmp_path / "test.png"
        img_file.write_bytes(b"\x89PNG-fake")

        expected = OCRResult(text="from file", confidence=0.8, method="gpt-4o")
        svc = OCRService()
        with patch.object(svc, "extract_text", new_callable=AsyncMock, return_value=expected) as mock_extract:
            result = await svc.extract_text_from_file(str(img_file))

        assert result == expected
        mock_extract.assert_awaited_once()
        call_args = mock_extract.call_args
        assert call_args[0][0] == b"\x89PNG-fake"
        assert call_args[0][1] == "image/png"

    @pytest.mark.asyncio
    async def test_not_found(self):
        svc = OCRService()
        with pytest.raises(FileNotFoundError):
            await svc.extract_text_from_file("/nonexistent/path/image.png")
