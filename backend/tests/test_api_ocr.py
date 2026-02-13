"""Tests for OCR API endpoints + background tasks.

Covers:
- POST /api/images/{id}/extract (4 tests)
- GET  /api/images/{id}/text    (5 tests)
- POST /api/files/{id}/extract  (5 tests)
- GET  /api/files/{id}/text     (2 tests)
- Background task execution     (2 tests)
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Note, NoteAttachment, NoteImage
from tests.conftest import make_auth_headers


# ---------------------------------------------------------------------------
# Helpers — seed DB rows (use unique IDs to avoid conflicts across tests)
# ---------------------------------------------------------------------------

def _uid() -> str:
    return uuid.uuid4().hex[:12]


async def _seed_note(db: AsyncSession) -> Note:
    """Create a minimal Note row for FK references."""
    note = Note(
        synology_note_id=f"test-note-{_uid()}",
        title="Test Note for OCR",
        content_text="Some content",
    )
    db.add(note)
    await db.flush()
    return note


async def _seed_note_image(
    db: AsyncSession,
    note: Note,
    *,
    extraction_status: str | None = None,
    extracted_text: str | None = None,
) -> NoteImage:
    """Create a NoteImage linked to a note."""
    image = NoteImage(
        synology_note_id=note.synology_note_id,
        ref=f"img-{_uid()}.png",
        name="test-image.png",
        md5=_uid(),
        file_path="/data/images/test-image.png",
        mime_type="image/png",
        extraction_status=extraction_status,
        extracted_text=extracted_text,
    )
    db.add(image)
    await db.flush()
    return image


async def _seed_note_attachment(
    db: AsyncSession,
    note: Note,
    file_id: str,
    *,
    extraction_status: str | None = None,
    extracted_text: str | None = None,
    page_count: int | None = None,
) -> NoteAttachment:
    """Create a NoteAttachment linked to a note."""
    att = NoteAttachment(
        note_id=note.id,
        file_id=file_id,
        name=file_id,
        extraction_status=extraction_status,
        extracted_text=extracted_text,
        page_count=page_count,
    )
    db.add(att)
    await db.flush()
    return att


# ---------------------------------------------------------------------------
# TestExtractImageText — POST /api/images/{id}/extract
# ---------------------------------------------------------------------------

class TestExtractImageText:
    """POST /api/images/{id}/extract triggers OCR for a NoteImage."""

    @pytest.mark.asyncio
    async def test_success(self, test_client, test_db):
        note = await _seed_note(test_db)
        image = await _seed_note_image(test_db, note)
        await test_db.commit()

        resp = await test_client.post(
            f"/api/images/{image.id}/extract",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"

    @pytest.mark.asyncio
    async def test_already_completed(self, test_client, test_db):
        note = await _seed_note(test_db)
        image = await _seed_note_image(
            test_db, note, extraction_status="completed", extracted_text="Hello"
        )
        await test_db.commit()

        resp = await test_client.post(
            f"/api/images/{image.id}/extract",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "already_completed"

    @pytest.mark.asyncio
    async def test_not_found(self, test_client, test_db):
        resp = await test_client.post(
            "/api/images/99999/extract",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated(self, test_client, test_db):
        resp = await test_client.post("/api/images/1/extract")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# TestGetImageText — GET /api/images/{id}/text
# ---------------------------------------------------------------------------

class TestGetImageText:
    """GET /api/images/{id}/text returns extraction results."""

    @pytest.mark.asyncio
    async def test_completed(self, test_client, test_db):
        note = await _seed_note(test_db)
        image = await _seed_note_image(
            test_db, note, extraction_status="completed", extracted_text="Hello"
        )
        await test_db.commit()

        resp = await test_client.get(
            f"/api/images/{image.id}/text",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "Hello"
        assert data["extraction_status"] == "completed"

    @pytest.mark.asyncio
    async def test_pending(self, test_client, test_db):
        note = await _seed_note(test_db)
        image = await _seed_note_image(test_db, note, extraction_status="pending")
        await test_db.commit()

        resp = await test_client.get(
            f"/api/images/{image.id}/text",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] is None
        assert data["extraction_status"] == "pending"

    @pytest.mark.asyncio
    async def test_failed(self, test_client, test_db):
        note = await _seed_note(test_db)
        image = await _seed_note_image(test_db, note, extraction_status="failed")
        await test_db.commit()

        resp = await test_client.get(
            f"/api/images/{image.id}/text",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 200
        assert resp.json()["extraction_status"] == "failed"

    @pytest.mark.asyncio
    async def test_not_found(self, test_client, test_db):
        resp = await test_client.get(
            "/api/images/99999/text",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated(self, test_client, test_db):
        resp = await test_client.get("/api/images/1/text")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# TestExtractFileText — POST /api/files/{file_id}/extract
# ---------------------------------------------------------------------------

class TestExtractFileText:
    """POST /api/files/{file_id}/extract triggers text extraction."""

    @pytest.mark.asyncio
    async def test_pdf_success(self, test_client, test_db, tmp_path, monkeypatch):
        fid = f"{_uid()}.pdf"
        pdf_file = tmp_path / fid
        pdf_file.write_bytes(b"%PDF-1.4 fake")
        monkeypatch.setattr("app.api.files.settings.UPLOADS_PATH", str(tmp_path))

        note = await _seed_note(test_db)
        await _seed_note_attachment(test_db, note, fid)
        await test_db.commit()

        resp = await test_client.post(
            f"/api/files/{fid}/extract",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"

    @pytest.mark.asyncio
    async def test_image_success(self, test_client, test_db, tmp_path, monkeypatch):
        fid = f"{_uid()}.png"
        img_file = tmp_path / fid
        img_file.write_bytes(b"\x89PNG fake")
        monkeypatch.setattr("app.api.files.settings.UPLOADS_PATH", str(tmp_path))

        note = await _seed_note(test_db)
        await _seed_note_attachment(test_db, note, fid)
        await test_db.commit()

        resp = await test_client.post(
            f"/api/files/{fid}/extract",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"

    @pytest.mark.asyncio
    async def test_unsupported_type(self, test_client, test_db, tmp_path, monkeypatch):
        fid = f"{_uid()}.txt"
        txt_file = tmp_path / fid
        txt_file.write_bytes(b"plain text")
        monkeypatch.setattr("app.api.files.settings.UPLOADS_PATH", str(tmp_path))

        resp = await test_client.post(
            f"/api/files/{fid}/extract",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 400
        assert "Only PDF and image files" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_file_not_on_disk(self, test_client, test_db, tmp_path, monkeypatch):
        monkeypatch.setattr("app.api.files.settings.UPLOADS_PATH", str(tmp_path))

        resp = await test_client.post(
            "/api/files/missing-never-exists.pdf/extract",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 404
        assert "File not found" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_already_completed(self, test_client, test_db, tmp_path, monkeypatch):
        fid = f"{_uid()}.pdf"
        pdf_file = tmp_path / fid
        pdf_file.write_bytes(b"%PDF-1.4 fake")
        monkeypatch.setattr("app.api.files.settings.UPLOADS_PATH", str(tmp_path))

        note = await _seed_note(test_db)
        await _seed_note_attachment(
            test_db, note, fid,
            extraction_status="completed",
            extracted_text="Already done",
            page_count=5,
        )
        await test_db.commit()

        resp = await test_client.post(
            f"/api/files/{fid}/extract",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "already_completed"
        assert data["page_count"] == 5


# ---------------------------------------------------------------------------
# TestGetFileText — GET /api/files/{file_id}/text
# ---------------------------------------------------------------------------

class TestGetFileText:
    """GET /api/files/{file_id}/text returns extraction results."""

    @pytest.mark.asyncio
    async def test_completed(self, test_client, test_db):
        fid = f"{_uid()}.pdf"
        note = await _seed_note(test_db)
        await _seed_note_attachment(
            test_db, note, fid,
            extraction_status="completed",
            extracted_text="Report content",
            page_count=3,
        )
        await test_db.commit()

        resp = await test_client.get(
            f"/api/files/{fid}/text",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "Report content"
        assert data["page_count"] == 3
        assert data["extraction_status"] == "completed"

    @pytest.mark.asyncio
    async def test_not_found(self, test_client, test_db):
        resp = await test_client.get(
            f"/api/files/{_uid()}-nonexistent.pdf/text",
            headers=make_auth_headers(),
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TestBackgroundTasks
# ---------------------------------------------------------------------------

class TestBackgroundTasks:
    """Direct invocation of background OCR task functions."""

    @pytest.mark.asyncio
    async def test_run_image_ocr_success(self, test_db):
        """Background task completes OCR and updates DB."""
        from app.services.ocr_service import OCRResult

        note = await _seed_note(test_db)
        image = await _seed_note_image(
            test_db, note, extraction_status="pending"
        )
        await test_db.commit()

        ocr_result = OCRResult(text="OCR text", confidence=0.9, method="gpt-4o")

        with (
            patch("app.database.async_session_factory") as mock_factory,
            patch("app.services.ocr_service.OCRService") as MockOCRService,
            patch("app.api.files._reindex_note", new_callable=AsyncMock) as mock_reindex,
        ):
            # Make the mock session factory return our test_db
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=test_db)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_factory.return_value = mock_ctx

            mock_svc = MockOCRService.return_value
            mock_svc.extract_text_from_file = AsyncMock(return_value=ocr_result)

            from app.api.files import _run_image_ocr
            await _run_image_ocr(image.id)

        await test_db.refresh(image)
        assert image.extraction_status == "completed"
        assert image.extracted_text == "OCR text"

    @pytest.mark.asyncio
    async def test_run_image_ocr_failure(self, test_db):
        """Background task marks image as failed on error."""
        note = await _seed_note(test_db)
        image = await _seed_note_image(
            test_db, note, extraction_status="pending"
        )
        await test_db.commit()

        with (
            patch("app.database.async_session_factory") as mock_factory,
            patch("app.services.ocr_service.OCRService") as MockOCRService,
        ):
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=test_db)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_factory.return_value = mock_ctx

            mock_svc = MockOCRService.return_value
            mock_svc.extract_text_from_file = AsyncMock(
                side_effect=RuntimeError("OCR failed")
            )

            from app.api.files import _run_image_ocr
            await _run_image_ocr(image.id)

        await test_db.refresh(image)
        assert image.extraction_status == "failed"
