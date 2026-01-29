# @TASK P1-T1.4 - NoteStation -> PostgreSQL sync service
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#synology-gateway
# @TEST tests/test_sync_service.py

"""Synchronise Synology NoteStation notes to the local PostgreSQL database.

Full sync strategy:
1. Fetch ALL notes from NoteStation (paginated).
2. Load ALL existing notes from the local DB.
3. Compare by ``synology_note_id``:
   - Present in NoteStation but not in DB -> INSERT
   - Present in both but ``source_updated_at`` changed -> UPDATE
   - Present in DB but not in NoteStation -> DELETE
4. Flush changes and return a :class:`SyncResult` summary.

Incremental / delta sync is planned for a future iteration.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Note
from app.synology_gateway.notestation import NoteStationService

logger = logging.getLogger(__name__)

# Default page size for paginated note fetching
_PAGE_SIZE = 50


@dataclass
class SyncResult:
    """Summary of a synchronisation run.

    Attributes:
        added: Number of newly inserted notes.
        updated: Number of existing notes that were updated.
        deleted: Number of notes removed (no longer in NoteStation).
        total: Total notes currently in NoteStation.
        synced_at: UTC timestamp when the sync completed.
    """

    added: int = 0
    updated: int = 0
    deleted: int = 0
    total: int = 0
    synced_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class SyncService:
    """NoteStation -> PostgreSQL synchronisation service.

    Args:
        notestation: An authenticated NoteStationService instance.
        db: An SQLAlchemy async session (caller manages transaction boundaries).
    """

    def __init__(self, notestation: NoteStationService, db: AsyncSession) -> None:
        self._notestation = notestation
        self._db = db

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def sync_all(self) -> SyncResult:
        """Run a full synchronisation.

        Returns:
            A :class:`SyncResult` with add/update/delete counts.

        Raises:
            Any exception from NoteStation or the DB; the session is
            rolled back automatically on error.
        """
        try:
            now = datetime.now(UTC)

            # 1. Fetch all remote notes
            remote_notes = await self._fetch_all_notes()

            # 2. Load existing local notes, keyed by synology_note_id
            existing = await self._get_existing_notes()

            # 3. Build a set of remote IDs for deletion detection
            remote_ids: set[str] = set()

            added = 0
            updated = 0

            for note_data in remote_notes:
                note_id = str(note_data["note_id"])
                remote_ids.add(note_id)

                if note_id not in existing:
                    # New note -> INSERT
                    new_note = self._note_to_model(note_data, synced_at=now)
                    self._db.add(new_note)
                    added += 1
                else:
                    # Existing note -> check if updated
                    db_note = existing[note_id]
                    remote_updated = _unix_to_utc(note_data.get("mtime"))
                    if remote_updated and remote_updated != db_note.source_updated_at:
                        self._update_note(db_note, note_data, synced_at=now)
                        updated += 1

            # 4. Delete notes that are no longer in NoteStation
            deleted = 0
            for syn_id, db_note in existing.items():
                if syn_id not in remote_ids:
                    await self._db.delete(db_note)
                    deleted += 1

            # 5. Flush all changes
            await self._db.flush()

            total = len(remote_notes)

            result = SyncResult(
                added=added,
                updated=updated,
                deleted=deleted,
                total=total,
                synced_at=now,
            )
            logger.info(
                "Sync completed: added=%d, updated=%d, deleted=%d, total=%d",
                added,
                updated,
                deleted,
                total,
            )
            return result

        except Exception:
            await self._db.rollback()
            raise

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _fetch_all_notes(self) -> list[dict]:
        """Fetch all notes from NoteStation using pagination.

        Returns:
            A flat list of note dicts from all pages.
        """
        all_notes: list[dict] = []
        offset = 0

        while True:
            data = await self._notestation.list_notes(offset=offset, limit=_PAGE_SIZE)
            notes = data.get("notes", [])
            total = data.get("total", 0)

            all_notes.extend(notes)

            # If we've fetched all notes, stop
            if len(all_notes) >= total or not notes:
                break

            offset += len(notes)

        return all_notes

    async def _get_existing_notes(self) -> dict[str, Note]:
        """Load all notes from the local DB, keyed by synology_note_id.

        Returns:
            A mapping of ``synology_note_id`` -> :class:`Note`.
        """
        stmt = select(Note)
        result = await self._db.execute(stmt)
        notes = result.scalars().all()
        return {note.synology_note_id: note for note in notes}

    def _note_to_model(self, note_data: dict, synced_at: datetime) -> Note:
        """Convert a Synology note API response dict to a Note ORM model.

        Uses :meth:`NoteStationService.extract_text` to derive plain text
        from the HTML content body.

        Args:
            note_data: Raw note dict from the NoteStation API.
            synced_at: The timestamp to set as ``synced_at``.

        Returns:
            A new :class:`Note` instance (not yet added to the session).
        """
        content_html = note_data.get("content", "")
        content_text = NoteStationService.extract_text(content_html)

        return Note(
            synology_note_id=str(note_data["note_id"]),
            title=note_data.get("title", ""),
            content_html=content_html,
            content_text=content_text,
            notebook_name=note_data.get("notebook_name"),
            tags=note_data.get("tag"),
            is_todo=note_data.get("is_todo", False),
            is_shortcut=note_data.get("is_shortcut", False),
            source_created_at=_unix_to_utc(note_data.get("creat_time")),
            source_updated_at=_unix_to_utc(note_data.get("mtime")),
            synced_at=synced_at,
        )

    def _update_note(self, db_note: Note, note_data: dict, synced_at: datetime) -> None:
        """Update an existing Note ORM model with fresh data from NoteStation.

        Args:
            db_note: The existing DB model to update in-place.
            note_data: Raw note dict from the NoteStation API.
            synced_at: The timestamp to set as ``synced_at``.
        """
        content_html = note_data.get("content", "")

        db_note.title = note_data.get("title", "")
        db_note.content_html = content_html
        db_note.content_text = NoteStationService.extract_text(content_html)
        db_note.notebook_name = note_data.get("notebook_name")
        db_note.tags = note_data.get("tag")
        db_note.is_todo = note_data.get("is_todo", False)
        db_note.is_shortcut = note_data.get("is_shortcut", False)
        db_note.source_created_at = _unix_to_utc(note_data.get("creat_time"))
        db_note.source_updated_at = _unix_to_utc(note_data.get("mtime"))
        db_note.synced_at = synced_at


# ------------------------------------------------------------------
# Module-level utilities
# ------------------------------------------------------------------


def _unix_to_utc(timestamp: int | float | None) -> datetime | None:
    """Convert a Unix timestamp to a timezone-aware UTC datetime.

    Args:
        timestamp: Seconds since epoch, or ``None``.

    Returns:
        A UTC :class:`datetime`, or ``None`` if the input is ``None``.
    """
    if timestamp is None:
        return None
    return datetime.fromtimestamp(timestamp, tz=UTC)
