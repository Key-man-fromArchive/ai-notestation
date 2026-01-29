# @TASK P1-T1.4 - SyncService tests (NoteStation -> PostgreSQL)
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#synology-gateway
# @TEST tests/test_sync_service.py

"""Tests for the SyncService that synchronises NoteStation notes to PostgreSQL.

All external dependencies (NoteStationService and AsyncSession) are mocked
so the tests run without a real database or Synology NAS.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models import Note
from app.synology_gateway.notestation import NoteStationService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SAMPLE_NOTES_PAGE_1 = {
    "notes": [
        {
            "note_id": "n001",
            "title": "Research Note #1",
            "content": "<p>Experiment results</p>",
            "notebook_id": "nb-1",
            "notebook_name": "Research",
            "tag": ["experiment", "results"],
            "is_todo": False,
            "is_shortcut": False,
            "creat_time": 1706500000,
            "mtime": 1706500100,
        },
        {
            "note_id": "n002",
            "title": "Meeting Notes",
            "content": "<h1>Agenda</h1><p>Item 1</p>",
            "notebook_id": "nb-2",
            "notebook_name": "Work",
            "tag": ["meeting"],
            "is_todo": False,
            "is_shortcut": True,
            "creat_time": 1706600000,
            "mtime": 1706600200,
        },
    ],
    "total": 2,
}

SAMPLE_NOTE_UPDATED = {
    "note_id": "n001",
    "title": "Research Note #1 (Updated)",
    "content": "<p>Updated experiment results</p>",
    "notebook_id": "nb-1",
    "notebook_name": "Research",
    "tag": ["experiment", "results", "updated"],
    "is_todo": False,
    "is_shortcut": False,
    "creat_time": 1706500000,
    "mtime": 1706700000,  # mtime changed
}


def _make_db_note(
    synology_note_id: str,
    title: str = "Test",
    source_updated_at: datetime | None = None,
) -> Note:
    """Create a Note ORM instance for testing."""
    note = Note(
        id=1,
        synology_note_id=synology_note_id,
        title=title,
        content_html="<p>old</p>",
        content_text="old",
        notebook_name="Test",
        tags=[],
        is_todo=False,
        is_shortcut=False,
        source_created_at=datetime(2024, 1, 29, tzinfo=UTC),
        source_updated_at=source_updated_at or datetime(2024, 1, 29, tzinfo=UTC),
        synced_at=datetime(2024, 1, 29, tzinfo=UTC),
        created_at=datetime(2024, 1, 29, tzinfo=UTC),
        updated_at=datetime(2024, 1, 29, tzinfo=UTC),
    )
    return note


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_notestation() -> AsyncMock:
    """Provide a mocked NoteStationService."""
    ns = AsyncMock(spec=NoteStationService)
    # Default: extract_text is a regular method, not async
    ns.extract_text = NoteStationService.extract_text
    return ns


@pytest.fixture
def mock_db() -> AsyncMock:
    """Provide a mocked AsyncSession."""
    db = AsyncMock()
    # Mock execute to return a mock result
    db.execute = AsyncMock()
    db.add = MagicMock()
    db.delete = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    return db


@pytest.fixture
def sync_service(mock_notestation, mock_db):
    """Provide a SyncService with mocked dependencies."""
    from app.services.sync_service import SyncService

    return SyncService(notestation=mock_notestation, db=mock_db)


# ---------------------------------------------------------------------------
# 1. New notes: INSERT
# ---------------------------------------------------------------------------


class TestSyncNewNotes:
    """Notes that exist in Synology but not in DB should be inserted."""

    @pytest.mark.asyncio
    async def test_new_notes_are_added(self, sync_service, mock_notestation, mock_db):
        """Two new notes from Synology should produce added=2."""
        # NoteStation returns 2 notes (single page)
        mock_notestation.list_notes.return_value = SAMPLE_NOTES_PAGE_1

        # DB has no existing notes
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        result = await sync_service.sync_all()

        assert result.added == 2
        assert result.updated == 0
        assert result.deleted == 0
        assert result.total == 2
        # db.add should have been called twice (once per new note)
        assert mock_db.add.call_count == 2

    @pytest.mark.asyncio
    async def test_new_note_has_correct_fields(self, sync_service, mock_notestation, mock_db):
        """Inserted note should have correct mapped fields from Synology data."""
        single_note = {
            "notes": [
                {
                    "note_id": "n100",
                    "title": "Test Note",
                    "content": "<p>Hello <strong>World</strong></p>",
                    "notebook_id": "nb-1",
                    "notebook_name": "Lab",
                    "tag": ["science"],
                    "is_todo": True,
                    "is_shortcut": False,
                    "creat_time": 1706500000,
                    "mtime": 1706500100,
                },
            ],
            "total": 1,
        }
        mock_notestation.list_notes.return_value = single_note

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        await sync_service.sync_all()

        # Verify the Note model passed to db.add
        added_note: Note = mock_db.add.call_args[0][0]
        assert added_note.synology_note_id == "n100"
        assert added_note.title == "Test Note"
        assert added_note.content_html == "<p>Hello <strong>World</strong></p>"
        assert "Hello" in added_note.content_text
        assert "World" in added_note.content_text
        assert added_note.notebook_name == "Lab"
        assert added_note.tags == ["science"]
        assert added_note.is_todo is True
        assert added_note.is_shortcut is False
        assert added_note.source_created_at is not None
        assert added_note.source_updated_at is not None


# ---------------------------------------------------------------------------
# 2. Updated notes: UPDATE
# ---------------------------------------------------------------------------


class TestSyncUpdatedNotes:
    """Notes already in DB whose source_updated_at changed should be updated."""

    @pytest.mark.asyncio
    async def test_modified_note_is_updated(self, sync_service, mock_notestation, mock_db):
        """A note with changed mtime should produce updated=1."""
        # Synology returns updated note
        mock_notestation.list_notes.return_value = {
            "notes": [SAMPLE_NOTE_UPDATED],
            "total": 1,
        }

        # DB has old version (earlier source_updated_at)
        old_note = _make_db_note(
            "n001",
            title="Research Note #1",
            source_updated_at=datetime(2024, 1, 29, 0, 0, 0, tzinfo=UTC),
        )
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [old_note]
        mock_db.execute.return_value = mock_result

        result = await sync_service.sync_all()

        assert result.updated == 1
        assert result.added == 0
        assert result.deleted == 0
        # Verify note fields were updated
        assert old_note.title == "Research Note #1 (Updated)"
        assert old_note.content_html == "<p>Updated experiment results</p>"
        assert "Updated experiment results" in old_note.content_text

    @pytest.mark.asyncio
    async def test_unchanged_note_is_not_updated(self, sync_service, mock_notestation, mock_db):
        """A note with same mtime should NOT be updated."""
        # mtime = 1706500100 -> source_updated_at same as DB
        unchanged_note_data = {
            "note_id": "n001",
            "title": "Research Note #1",
            "content": "<p>Experiment results</p>",
            "notebook_id": "nb-1",
            "notebook_name": "Research",
            "tag": ["experiment"],
            "is_todo": False,
            "is_shortcut": False,
            "creat_time": 1706500000,
            "mtime": 1706500100,
        }
        mock_notestation.list_notes.return_value = {
            "notes": [unchanged_note_data],
            "total": 1,
        }

        existing_note = _make_db_note(
            "n001",
            title="Research Note #1",
            source_updated_at=datetime.fromtimestamp(1706500100, tz=UTC),
        )
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [existing_note]
        mock_db.execute.return_value = mock_result

        result = await sync_service.sync_all()

        assert result.updated == 0
        assert result.added == 0
        assert result.deleted == 0


# ---------------------------------------------------------------------------
# 3. Deleted notes: DELETE
# ---------------------------------------------------------------------------


class TestSyncDeletedNotes:
    """Notes in DB but not in Synology should be deleted."""

    @pytest.mark.asyncio
    async def test_deleted_note_is_removed(self, sync_service, mock_notestation, mock_db):
        """A note in DB not returned by Synology should produce deleted=1."""
        # Synology returns empty
        mock_notestation.list_notes.return_value = {"notes": [], "total": 0}

        # DB has one note that no longer exists in Synology
        orphan_note = _make_db_note("n999", title="Deleted Note")
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [orphan_note]
        mock_db.execute.return_value = mock_result

        result = await sync_service.sync_all()

        assert result.deleted == 1
        assert result.added == 0
        assert result.updated == 0
        # db.delete should have been called
        mock_db.delete.assert_awaited_once_with(orphan_note)

    @pytest.mark.asyncio
    async def test_multiple_deleted_notes(self, sync_service, mock_notestation, mock_db):
        """Multiple notes in DB not in Synology should all be deleted."""
        mock_notestation.list_notes.return_value = {"notes": [], "total": 0}

        orphans = [
            _make_db_note("n100"),
            _make_db_note("n200"),
            _make_db_note("n300"),
        ]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = orphans
        mock_db.execute.return_value = mock_result

        result = await sync_service.sync_all()

        assert result.deleted == 3
        assert mock_db.delete.await_count == 3


# ---------------------------------------------------------------------------
# 4. synced_at timestamp
# ---------------------------------------------------------------------------


class TestSyncedAtTimestamp:
    """synced_at should be set during sync."""

    @pytest.mark.asyncio
    async def test_synced_at_is_set(self, sync_service, mock_notestation, mock_db):
        """SyncResult.synced_at should be a UTC datetime."""
        mock_notestation.list_notes.return_value = {"notes": [], "total": 0}

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        result = await sync_service.sync_all()

        assert result.synced_at is not None
        assert isinstance(result.synced_at, datetime)
        assert result.synced_at.tzinfo is not None  # timezone-aware

    @pytest.mark.asyncio
    async def test_new_note_synced_at_is_set(self, sync_service, mock_notestation, mock_db):
        """Newly inserted notes should have synced_at set."""
        mock_notestation.list_notes.return_value = {
            "notes": [
                {
                    "note_id": "n001",
                    "title": "Note",
                    "content": "<p>text</p>",
                    "notebook_id": "nb-1",
                    "notebook_name": "NB",
                    "tag": [],
                    "is_todo": False,
                    "is_shortcut": False,
                    "creat_time": 1706500000,
                    "mtime": 1706500100,
                }
            ],
            "total": 1,
        }

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        await sync_service.sync_all()

        added_note = mock_db.add.call_args[0][0]
        assert added_note.synced_at is not None


# ---------------------------------------------------------------------------
# 5. HTML -> plain text conversion
# ---------------------------------------------------------------------------


class TestHtmlToPlainText:
    """content_text should be extracted from content_html using extract_text."""

    @pytest.mark.asyncio
    async def test_html_stripped_on_insert(self, sync_service, mock_notestation, mock_db):
        """New note's content_text should be plain text from HTML."""
        mock_notestation.list_notes.return_value = {
            "notes": [
                {
                    "note_id": "n001",
                    "title": "Note",
                    "content": "<h1>Title</h1><p>Body <em>italic</em></p>",
                    "notebook_id": "nb-1",
                    "notebook_name": "NB",
                    "tag": [],
                    "is_todo": False,
                    "is_shortcut": False,
                    "creat_time": 1706500000,
                    "mtime": 1706500100,
                }
            ],
            "total": 1,
        }

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        await sync_service.sync_all()

        added_note = mock_db.add.call_args[0][0]
        assert "<h1>" not in added_note.content_text
        assert "<p>" not in added_note.content_text
        assert "Title" in added_note.content_text
        assert "Body" in added_note.content_text
        assert "italic" in added_note.content_text

    @pytest.mark.asyncio
    async def test_empty_html_produces_empty_text(self, sync_service, mock_notestation, mock_db):
        """Empty HTML content results in empty content_text."""
        mock_notestation.list_notes.return_value = {
            "notes": [
                {
                    "note_id": "n001",
                    "title": "Empty Note",
                    "content": "",
                    "notebook_id": "nb-1",
                    "notebook_name": "NB",
                    "tag": [],
                    "is_todo": False,
                    "is_shortcut": False,
                    "creat_time": 1706500000,
                    "mtime": 1706500100,
                }
            ],
            "total": 1,
        }

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        await sync_service.sync_all()

        added_note = mock_db.add.call_args[0][0]
        assert added_note.content_text == ""


# ---------------------------------------------------------------------------
# 6. SyncResult return value
# ---------------------------------------------------------------------------


class TestSyncResult:
    """sync_all returns a SyncResult with accurate counts."""

    @pytest.mark.asyncio
    async def test_mixed_operations(self, sync_service, mock_notestation, mock_db):
        """Sync with add + update + delete produces correct counts."""
        # Synology has n001 (updated) and n003 (new); n002 is gone (deleted)
        mock_notestation.list_notes.return_value = {
            "notes": [
                {
                    "note_id": "n001",
                    "title": "Updated",
                    "content": "<p>Updated content</p>",
                    "notebook_id": "nb-1",
                    "notebook_name": "NB",
                    "tag": [],
                    "is_todo": False,
                    "is_shortcut": False,
                    "creat_time": 1706500000,
                    "mtime": 1706700000,  # changed
                },
                {
                    "note_id": "n003",
                    "title": "Brand New",
                    "content": "<p>New note</p>",
                    "notebook_id": "nb-1",
                    "notebook_name": "NB",
                    "tag": [],
                    "is_todo": False,
                    "is_shortcut": False,
                    "creat_time": 1706800000,
                    "mtime": 1706800000,
                },
            ],
            "total": 2,
        }

        # DB has n001 (old version) and n002 (will be deleted)
        existing_notes = [
            _make_db_note(
                "n001",
                title="Original",
                source_updated_at=datetime(2024, 1, 29, tzinfo=UTC),
            ),
            _make_db_note("n002", title="To Delete"),
        ]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = existing_notes
        mock_db.execute.return_value = mock_result

        result = await sync_service.sync_all()

        assert result.added == 1  # n003
        assert result.updated == 1  # n001
        assert result.deleted == 1  # n002
        assert result.total == 2  # notes in synology


# ---------------------------------------------------------------------------
# 7. Empty sync (no changes)
# ---------------------------------------------------------------------------


class TestEmptySync:
    """When there are no notes anywhere, sync should do nothing."""

    @pytest.mark.asyncio
    async def test_empty_synology_empty_db(self, sync_service, mock_notestation, mock_db):
        """No notes in Synology and no notes in DB => all zeros."""
        mock_notestation.list_notes.return_value = {"notes": [], "total": 0}

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        result = await sync_service.sync_all()

        assert result.added == 0
        assert result.updated == 0
        assert result.deleted == 0
        assert result.total == 0

    @pytest.mark.asyncio
    async def test_all_notes_unchanged(self, sync_service, mock_notestation, mock_db):
        """When all Synology notes match DB, no changes should occur."""
        mock_notestation.list_notes.return_value = {
            "notes": [
                {
                    "note_id": "n001",
                    "title": "Note 1",
                    "content": "<p>Content</p>",
                    "notebook_id": "nb-1",
                    "notebook_name": "NB",
                    "tag": [],
                    "is_todo": False,
                    "is_shortcut": False,
                    "creat_time": 1706500000,
                    "mtime": 1706500100,
                }
            ],
            "total": 1,
        }

        existing = _make_db_note(
            "n001",
            title="Note 1",
            source_updated_at=datetime.fromtimestamp(1706500100, tz=UTC),
        )
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [existing]
        mock_db.execute.return_value = mock_result

        result = await sync_service.sync_all()

        assert result.added == 0
        assert result.updated == 0
        assert result.deleted == 0


# ---------------------------------------------------------------------------
# 8. Error handling and rollback
# ---------------------------------------------------------------------------


class TestErrorHandling:
    """Errors during sync should trigger DB rollback."""

    @pytest.mark.asyncio
    async def test_notestation_error_triggers_rollback(self, sync_service, mock_notestation, mock_db):
        """When NoteStation raises an error, DB should be rolled back."""
        mock_notestation.list_notes.side_effect = Exception("NoteStation API error")

        with pytest.raises(Exception, match="NoteStation API error"):
            await sync_service.sync_all()

        mock_db.rollback.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_db_error_triggers_rollback(self, sync_service, mock_notestation, mock_db):
        """When a DB operation fails, rollback should be called."""
        mock_notestation.list_notes.return_value = SAMPLE_NOTES_PAGE_1

        # First execute (get existing notes) succeeds
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        # flush raises an error
        mock_db.flush.side_effect = Exception("DB write error")

        with pytest.raises(Exception, match="DB write error"):
            await sync_service.sync_all()

        mock_db.rollback.assert_awaited_once()


# ---------------------------------------------------------------------------
# 9. Pagination: fetch all notes across multiple pages
# ---------------------------------------------------------------------------


class TestPagination:
    """NoteStation notes should be fetched across multiple pages."""

    @pytest.mark.asyncio
    async def test_fetches_multiple_pages(self, sync_service, mock_notestation, mock_db):
        """When total > page size, multiple calls are made."""
        # Page 1: 2 notes, total=3
        page_1 = {
            "notes": [
                {
                    "note_id": "n001",
                    "title": "Note 1",
                    "content": "<p>1</p>",
                    "notebook_id": "nb-1",
                    "notebook_name": "NB",
                    "tag": [],
                    "is_todo": False,
                    "is_shortcut": False,
                    "creat_time": 1706500000,
                    "mtime": 1706500100,
                },
                {
                    "note_id": "n002",
                    "title": "Note 2",
                    "content": "<p>2</p>",
                    "notebook_id": "nb-1",
                    "notebook_name": "NB",
                    "tag": [],
                    "is_todo": False,
                    "is_shortcut": False,
                    "creat_time": 1706500000,
                    "mtime": 1706500100,
                },
            ],
            "total": 3,
        }
        # Page 2: 1 note
        page_2 = {
            "notes": [
                {
                    "note_id": "n003",
                    "title": "Note 3",
                    "content": "<p>3</p>",
                    "notebook_id": "nb-1",
                    "notebook_name": "NB",
                    "tag": [],
                    "is_todo": False,
                    "is_shortcut": False,
                    "creat_time": 1706500000,
                    "mtime": 1706500100,
                },
            ],
            "total": 3,
        }

        mock_notestation.list_notes.side_effect = [page_1, page_2]

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        result = await sync_service.sync_all()

        assert result.added == 3
        assert result.total == 3
        # list_notes should have been called twice
        assert mock_notestation.list_notes.await_count == 2


# ---------------------------------------------------------------------------
# 10. Commit on success
# ---------------------------------------------------------------------------


class TestCommitOnSuccess:
    """DB session should be flushed after successful sync."""

    @pytest.mark.asyncio
    async def test_flush_called_on_success(self, sync_service, mock_notestation, mock_db):
        """After successful sync, db.flush() should be called."""
        mock_notestation.list_notes.return_value = {"notes": [], "total": 0}

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        await sync_service.sync_all()

        mock_db.flush.assert_awaited_once()
