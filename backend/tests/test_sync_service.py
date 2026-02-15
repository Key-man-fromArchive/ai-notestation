# @TASK P1-T1.4 - SyncService tests (NoteStation -> PostgreSQL)
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#synology-gateway
# @TEST tests/test_sync_service.py

"""Tests for the SyncService that synchronises NoteStation notes to PostgreSQL.

All external dependencies (NoteStationService and AsyncSession) are mocked
so the tests run without a real database or Synology NAS.

The real NoteStation API (SYNO.NoteStation.Note/list) returns notes with
summary fields:
    object_id, title, brief, ctime, mtime, parent_id, category,
    owner, perm, acl, ver, encrypt, archive, recycle, thumb

The get_note (SYNO.NoteStation.Note/get) API returns all of the above PLUS:
    content (HTML), tag (list of tag strings), attachment, link_id,
    latitude, longitude, location, source_url, commit_msg

The sync_service.sync_all() now:
1. Calls list_notes() for summaries (no content)
2. Calls list_notebooks() to build notebook_map (object_id -> title)
3. For NEW or UPDATED notes, calls get_note(object_id) to get full detail
4. Merges summary + detail using _merge_note_data(summary, detail, notebook_map)
5. Uses object_id as the note identifier (stored in synology_note_id)
6. Uses ctime instead of creat_time
7. Derives is_todo from category == "todo"
8. Resolves notebook_name from parent_id via notebook_map
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models import Note
from app.synology_gateway.notestation import NoteStationService

# ---------------------------------------------------------------------------
# Helpers -- list API (summary only, no content)
# ---------------------------------------------------------------------------

SAMPLE_NOTEBOOKS = [
    {"object_id": "nb-1", "title": "Research"},
    {"object_id": "nb-2", "title": "Work"},
]

SAMPLE_NOTES_PAGE_1 = {
    "notes": [
        {
            "object_id": "n001",
            "title": "Research Note #1",
            "brief": "Experiment results",
            "ctime": 1706500000,
            "mtime": 1706500100,
            "parent_id": "nb-1",
            "category": "note",
            "owner": "admin",
            "perm": 7,
            "acl": 0,
            "ver": 1,
            "encrypt": False,
            "archive": False,
            "recycle": False,
            "thumb": False,
        },
        {
            "object_id": "n002",
            "title": "Meeting Notes",
            "brief": "Agenda Item 1",
            "ctime": 1706600000,
            "mtime": 1706600200,
            "parent_id": "nb-2",
            "category": "note",
            "owner": "admin",
            "perm": 7,
            "acl": 0,
            "ver": 1,
            "encrypt": False,
            "archive": False,
            "recycle": False,
            "thumb": False,
        },
    ],
    "total": 2,
}

# Detail responses from get_note (include content & tag)
SAMPLE_DETAIL_N001 = {
    "object_id": "n001",
    "title": "Research Note #1",
    "content": "<p>Experiment results</p>",
    "tag": ["experiment", "results"],
    "ctime": 1706500000,
    "mtime": 1706500100,
    "parent_id": "nb-1",
    "category": "note",
}

SAMPLE_DETAIL_N002 = {
    "object_id": "n002",
    "title": "Meeting Notes",
    "content": "<h1>Agenda</h1><p>Item 1</p>",
    "tag": ["meeting"],
    "ctime": 1706600000,
    "mtime": 1706600200,
    "parent_id": "nb-2",
    "category": "note",
}

# Summary for an updated note (mtime changed)
SAMPLE_NOTE_UPDATED_SUMMARY = {
    "object_id": "n001",
    "title": "Research Note #1 (Updated)",
    "brief": "Updated experiment results",
    "ctime": 1706500000,
    "mtime": 1706700000,  # mtime changed
    "parent_id": "nb-1",
    "category": "note",
}

# Detail for the updated note
SAMPLE_NOTE_UPDATED_DETAIL = {
    "object_id": "n001",
    "title": "Research Note #1 (Updated)",
    "content": "<p>Updated experiment results</p>",
    "tag": ["experiment", "results", "updated"],
    "ctime": 1706500000,
    "mtime": 1706700000,
    "parent_id": "nb-1",
    "category": "note",
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


def _get_note_side_effect_for(*details: dict):
    """Build an async side_effect for get_note that dispatches by object_id."""
    lookup = {d["object_id"]: d for d in details}

    async def _side_effect(note_id: str):
        return lookup[note_id]

    return _side_effect


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_notestation() -> AsyncMock:
    """Provide a mocked NoteStationService."""
    ns = AsyncMock(spec=NoteStationService)
    # Default: extract_text is a regular method, not async
    ns.extract_text = NoteStationService.extract_text
    # Default: list_notebooks returns empty list (always called by sync_all)
    ns.list_notebooks.return_value = []
    return ns


def _make_mock_db_execute(notes_result: list | None = None):
    """Create a mock execute that returns empty results for Notebook queries
    and configurable results for Note queries.

    The _sync_notebooks method issues two SELECT Notebook queries before
    _get_existing_notes issues SELECT Note. This helper distinguishes them
    by checking the SQL string for 'notebooks' table references.
    """
    _notes = notes_result if notes_result is not None else []

    async def _execute(stmt, *args, **kwargs):
        sql_str = str(stmt)
        mock_result = MagicMock()
        if "notebooks" in sql_str:
            # Notebook queries return empty
            mock_result.scalars.return_value.all.return_value = []
        else:
            mock_result.scalars.return_value.all.return_value = _notes
        return mock_result

    return _execute


@pytest.fixture
def mock_db() -> AsyncMock:
    """Provide a mocked AsyncSession."""
    db = AsyncMock()
    # Default execute: empty for all queries
    db.execute = AsyncMock(side_effect=_make_mock_db_execute())
    db.add = MagicMock()
    db.delete = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.get = AsyncMock(return_value=None)
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
        # NoteStation returns 2 note summaries (single page)
        mock_notestation.list_notes.return_value = SAMPLE_NOTES_PAGE_1
        mock_notestation.list_notebooks.return_value = SAMPLE_NOTEBOOKS
        # get_note returns full detail for each note
        mock_notestation.get_note.side_effect = _get_note_side_effect_for(
            SAMPLE_DETAIL_N001, SAMPLE_DETAIL_N002
        )

        # DB has no existing notes
        mock_db.execute.side_effect = _make_mock_db_execute([])

        result = await sync_service.sync_all()

        assert result.added == 2
        assert result.updated == 0
        assert result.deleted == 0
        assert result.total == 2
        # db.add: 2 notebooks (from SAMPLE_NOTEBOOKS) + 2 notes
        assert mock_db.add.call_count == 4
        # Verify the last 2 adds are Note instances
        note_adds = [c[0][0] for c in mock_db.add.call_args_list if isinstance(c[0][0], Note)]
        assert len(note_adds) == 2

    @pytest.mark.asyncio
    async def test_new_note_has_correct_fields(self, sync_service, mock_notestation, mock_db):
        """Inserted note should have correct mapped fields from Synology data."""
        # Summary from list_notes (no content, no tag)
        single_note_summary = {
            "notes": [
                {
                    "object_id": "n100",
                    "title": "Test Note",
                    "brief": "Hello World",
                    "ctime": 1706500000,
                    "mtime": 1706500100,
                    "parent_id": "nb-1",
                    "category": "todo",
                },
            ],
            "total": 1,
        }
        mock_notestation.list_notes.return_value = single_note_summary
        mock_notestation.list_notebooks.return_value = [
            {"object_id": "nb-1", "title": "Lab"},
        ]
        # Detail from get_note (includes content and tag)
        mock_notestation.get_note.return_value = {
            "object_id": "n100",
            "title": "Test Note",
            "content": "<p>Hello <strong>World</strong></p>",
            "tag": ["science"],
            "ctime": 1706500000,
            "mtime": 1706500100,
            "parent_id": "nb-1",
            "category": "todo",
        }

        mock_db.execute.side_effect = _make_mock_db_execute([])

        await sync_service.sync_all()

        # Verify the Note model passed to db.add
        added_note: Note = mock_db.add.call_args[0][0]
        assert added_note.synology_note_id == "n100"
        assert added_note.title == "Test Note"
        assert added_note.content_html == "<p>Hello <strong>World</strong></p>"
        assert "Hello" in added_note.content_text
        assert "World" in added_note.content_text
        # notebook_name resolved from parent_id via notebook_map
        assert added_note.notebook_name == "Lab"
        # tags from get_note detail
        assert added_note.tags == ["science"]
        # is_todo derived from category == "todo"
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
        # Synology returns updated note summary
        mock_notestation.list_notes.return_value = {
            "notes": [SAMPLE_NOTE_UPDATED_SUMMARY],
            "total": 1,
        }
        mock_notestation.list_notebooks.return_value = SAMPLE_NOTEBOOKS
        # get_note returns updated detail
        mock_notestation.get_note.return_value = SAMPLE_NOTE_UPDATED_DETAIL

        # DB has old version (earlier source_updated_at)
        old_note = _make_db_note(
            "n001",
            title="Research Note #1",
            source_updated_at=datetime(2024, 1, 29, 0, 0, 0, tzinfo=UTC),
        )
        mock_db.execute.side_effect = _make_mock_db_execute([old_note])

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
        unchanged_note_summary = {
            "object_id": "n001",
            "title": "Research Note #1",
            "brief": "Experiment results",
            "ctime": 1706500000,
            "mtime": 1706500100,
            "parent_id": "nb-1",
            "category": "note",
        }
        mock_notestation.list_notes.return_value = {
            "notes": [unchanged_note_summary],
            "total": 1,
        }
        mock_notestation.list_notebooks.return_value = SAMPLE_NOTEBOOKS
        # get_note should NOT be called for unchanged notes

        existing_note = _make_db_note(
            "n001",
            title="Research Note #1",
            source_updated_at=datetime.fromtimestamp(1706500100, tz=UTC),
        )
        mock_db.execute.side_effect = _make_mock_db_execute([existing_note])

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
        mock_db.execute.side_effect = _make_mock_db_execute([orphan_note])

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
        mock_db.execute.side_effect = _make_mock_db_execute(orphans)

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

        mock_db.execute.side_effect = _make_mock_db_execute([])

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
                    "object_id": "n001",
                    "title": "Note",
                    "brief": "text",
                    "ctime": 1706500000,
                    "mtime": 1706500100,
                    "parent_id": "nb-1",
                    "category": "note",
                }
            ],
            "total": 1,
        }
        mock_notestation.list_notebooks.return_value = SAMPLE_NOTEBOOKS
        mock_notestation.get_note.return_value = {
            "object_id": "n001",
            "title": "Note",
            "content": "<p>text</p>",
            "tag": [],
            "ctime": 1706500000,
            "mtime": 1706500100,
            "parent_id": "nb-1",
            "category": "note",
        }

        mock_db.execute.side_effect = _make_mock_db_execute([])

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
                    "object_id": "n001",
                    "title": "Note",
                    "brief": "Title Body italic",
                    "ctime": 1706500000,
                    "mtime": 1706500100,
                    "parent_id": "nb-1",
                    "category": "note",
                }
            ],
            "total": 1,
        }
        mock_notestation.list_notebooks.return_value = SAMPLE_NOTEBOOKS
        # get_note returns full HTML content
        mock_notestation.get_note.return_value = {
            "object_id": "n001",
            "title": "Note",
            "content": "<h1>Title</h1><p>Body <em>italic</em></p>",
            "tag": [],
            "ctime": 1706500000,
            "mtime": 1706500100,
            "parent_id": "nb-1",
            "category": "note",
        }

        mock_db.execute.side_effect = _make_mock_db_execute([])

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
                    "object_id": "n001",
                    "title": "Empty Note",
                    "brief": "",
                    "ctime": 1706500000,
                    "mtime": 1706500100,
                    "parent_id": "nb-1",
                    "category": "note",
                }
            ],
            "total": 1,
        }
        mock_notestation.list_notebooks.return_value = SAMPLE_NOTEBOOKS
        # get_note returns empty content
        mock_notestation.get_note.return_value = {
            "object_id": "n001",
            "title": "Empty Note",
            "content": "",
            "tag": [],
            "ctime": 1706500000,
            "mtime": 1706500100,
            "parent_id": "nb-1",
            "category": "note",
        }

        mock_db.execute.side_effect = _make_mock_db_execute([])

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
                    "object_id": "n001",
                    "title": "Updated",
                    "brief": "Updated content",
                    "ctime": 1706500000,
                    "mtime": 1706700000,  # changed
                    "parent_id": "nb-1",
                    "category": "note",
                },
                {
                    "object_id": "n003",
                    "title": "Brand New",
                    "brief": "New note",
                    "ctime": 1706800000,
                    "mtime": 1706800000,
                    "parent_id": "nb-1",
                    "category": "note",
                },
            ],
            "total": 2,
        }
        mock_notestation.list_notebooks.return_value = SAMPLE_NOTEBOOKS

        # get_note returns detail for both new/updated notes
        async def _get_note(note_id):
            details = {
                "n001": {
                    "object_id": "n001",
                    "title": "Updated",
                    "content": "<p>Updated content</p>",
                    "tag": [],
                    "ctime": 1706500000,
                    "mtime": 1706700000,
                    "parent_id": "nb-1",
                    "category": "note",
                },
                "n003": {
                    "object_id": "n003",
                    "title": "Brand New",
                    "content": "<p>New note</p>",
                    "tag": [],
                    "ctime": 1706800000,
                    "mtime": 1706800000,
                    "parent_id": "nb-1",
                    "category": "note",
                },
            }
            return details[note_id]

        mock_notestation.get_note.side_effect = _get_note

        # DB has n001 (old version) and n002 (will be deleted)
        existing_notes = [
            _make_db_note(
                "n001",
                title="Original",
                source_updated_at=datetime(2024, 1, 29, tzinfo=UTC),
            ),
            _make_db_note("n002", title="To Delete"),
        ]
        mock_db.execute.side_effect = _make_mock_db_execute(existing_notes)

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

        mock_db.execute.side_effect = _make_mock_db_execute([])

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
                    "object_id": "n001",
                    "title": "Note 1",
                    "brief": "Content",
                    "ctime": 1706500000,
                    "mtime": 1706500100,
                    "parent_id": "nb-1",
                    "category": "note",
                }
            ],
            "total": 1,
        }
        mock_notestation.list_notebooks.return_value = SAMPLE_NOTEBOOKS

        existing = _make_db_note(
            "n001",
            title="Note 1",
            source_updated_at=datetime.fromtimestamp(1706500100, tz=UTC),
        )
        mock_db.execute.side_effect = _make_mock_db_execute([existing])

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
        mock_notestation.list_notebooks.return_value = SAMPLE_NOTEBOOKS
        mock_notestation.get_note.side_effect = _get_note_side_effect_for(
            SAMPLE_DETAIL_N001, SAMPLE_DETAIL_N002
        )

        # First execute (get existing notes) succeeds
        mock_db.execute.side_effect = _make_mock_db_execute([])

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
    async def test_fetches_remaining_via_pagination(self, sync_service, mock_notestation, mock_db):
        """When the initial uncapped request returns fewer notes than total,
        the remaining notes are fetched via paginated follow-up calls."""
        # Initial call (no offset/limit): returns 2 notes but total=3
        initial_response = {
            "notes": [
                {
                    "object_id": "n001",
                    "title": "Note 1",
                    "brief": "1",
                    "ctime": 1706500000,
                    "mtime": 1706500100,
                    "parent_id": "nb-1",
                    "category": "note",
                },
                {
                    "object_id": "n002",
                    "title": "Note 2",
                    "brief": "2",
                    "ctime": 1706500000,
                    "mtime": 1706500100,
                    "parent_id": "nb-1",
                    "category": "note",
                },
            ],
            "total": 3,
        }
        # Paginated follow-up: 1 remaining note
        paginated_response = {
            "notes": [
                {
                    "object_id": "n003",
                    "title": "Note 3",
                    "brief": "3",
                    "ctime": 1706500000,
                    "mtime": 1706500100,
                    "parent_id": "nb-1",
                    "category": "note",
                },
            ],
            "total": 3,
        }

        mock_notestation.list_notes.side_effect = [initial_response, paginated_response]
        mock_notestation.list_notebooks.return_value = SAMPLE_NOTEBOOKS

        # get_note returns detail for all 3 new notes
        async def _get_note(note_id):
            details = {
                "n001": {"object_id": "n001", "title": "Note 1", "content": "<p>1</p>", "tag": [], "ctime": 1706500000, "mtime": 1706500100, "parent_id": "nb-1", "category": "note"},
                "n002": {"object_id": "n002", "title": "Note 2", "content": "<p>2</p>", "tag": [], "ctime": 1706500000, "mtime": 1706500100, "parent_id": "nb-1", "category": "note"},
                "n003": {"object_id": "n003", "title": "Note 3", "content": "<p>3</p>", "tag": [], "ctime": 1706500000, "mtime": 1706500100, "parent_id": "nb-1", "category": "note"},
            }
            return details[note_id]

        mock_notestation.get_note.side_effect = _get_note

        mock_db.execute.side_effect = _make_mock_db_execute([])

        result = await sync_service.sync_all()

        assert result.added == 3
        assert result.total == 3
        # list_notes called twice: 1st without pagination, 2nd with offset/limit
        assert mock_notestation.list_notes.await_count == 2

    @pytest.mark.asyncio
    async def test_single_request_returns_all(self, sync_service, mock_notestation, mock_db):
        """When the initial uncapped request returns all notes, no pagination is needed."""
        all_at_once = {
            "notes": [
                {
                    "object_id": "n001",
                    "title": "Note 1",
                    "brief": "1",
                    "ctime": 1706500000,
                    "mtime": 1706500100,
                    "parent_id": "nb-1",
                    "category": "note",
                },
                {
                    "object_id": "n002",
                    "title": "Note 2",
                    "brief": "2",
                    "ctime": 1706500000,
                    "mtime": 1706500100,
                    "parent_id": "nb-1",
                    "category": "note",
                },
            ],
            "total": 2,
        }

        mock_notestation.list_notes.return_value = all_at_once
        mock_notestation.list_notebooks.return_value = SAMPLE_NOTEBOOKS

        async def _get_note(note_id):
            details = {
                "n001": {"object_id": "n001", "title": "Note 1", "content": "<p>1</p>", "tag": [], "ctime": 1706500000, "mtime": 1706500100, "parent_id": "nb-1", "category": "note"},
                "n002": {"object_id": "n002", "title": "Note 2", "content": "<p>2</p>", "tag": [], "ctime": 1706500000, "mtime": 1706500100, "parent_id": "nb-1", "category": "note"},
            }
            return details[note_id]

        mock_notestation.get_note.side_effect = _get_note

        mock_db.execute.side_effect = _make_mock_db_execute([])

        result = await sync_service.sync_all()

        assert result.added == 2
        assert result.total == 2
        # list_notes called only once (no pagination needed)
        assert mock_notestation.list_notes.await_count == 1


# ---------------------------------------------------------------------------
# 10. Commit on success
# ---------------------------------------------------------------------------


class TestCommitOnSuccess:
    """DB session should be flushed after successful sync."""

    @pytest.mark.asyncio
    async def test_flush_called_on_success(self, sync_service, mock_notestation, mock_db):
        """After successful sync, db.flush() should be called."""
        mock_notestation.list_notes.return_value = {"notes": [], "total": 0}

        mock_db.execute.side_effect = _make_mock_db_execute([])

        await sync_service.sync_all()

        mock_db.flush.assert_awaited_once()
