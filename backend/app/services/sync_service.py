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

# Page size used when the API does not return all notes at once.
_PAGE_SIZE = 500


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

        The NoteStation ``list`` API returns summary data (no content).
        For new or updated notes we fetch the full note via ``get`` to
        obtain ``content`` (HTML) and ``tag`` metadata.

        Returns:
            A :class:`SyncResult` with add/update/delete counts.

        Raises:
            Any exception from NoteStation or the DB; the session is
            rolled back automatically on error.
        """
        try:
            now = datetime.now(UTC)

            # 1. Fetch all remote notes (list – summary only)
            remote_notes = await self._fetch_all_notes()

            # 2. Build notebook ID -> name lookup
            notebook_map = await self._fetch_notebook_map()

            # 3. Load existing local notes, keyed by synology_note_id
            existing = await self._get_existing_notes()

            # 4. Build a set of remote IDs for deletion detection
            remote_ids: set[str] = set()

            added = 0
            updated = 0

            for note_summary in remote_notes:
                # NoteStation API uses ``object_id``, not ``note_id``
                note_id = str(note_summary["object_id"])
                remote_ids.add(note_id)

                is_new = note_id not in existing
                is_updated = False
                if not is_new:
                    db_note = existing[note_id]
                    remote_updated = _unix_to_utc(note_summary.get("mtime"))
                    is_updated = bool(
                        remote_updated and remote_updated != db_note.source_updated_at
                    )

                if is_new or is_updated:
                    # Fetch full note detail (content, tags)
                    try:
                        detail = await self._notestation.get_note(note_id)
                    except Exception:
                        # If we can't fetch detail, fall back to summary
                        logger.warning("Failed to fetch detail for note %s, using summary", note_id)
                        detail = note_summary

                    # Merge summary + detail, resolve notebook name
                    merged = _merge_note_data(note_summary, detail, notebook_map)

                    if is_new:
                        new_note = self._note_to_model(merged, synced_at=now)
                        self._db.add(new_note)
                        added += 1
                    else:
                        self._update_note(existing[note_id], merged, synced_at=now)
                        updated += 1

            # 5. Delete notes that are no longer in NoteStation
            deleted = 0
            for syn_id, db_note in existing.items():
                if syn_id not in remote_ids:
                    await self._db.delete(db_note)
                    deleted += 1

            # 6. Flush all changes
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

    async def _fetch_notebook_map(self) -> dict[str, str]:
        """Fetch all notebooks and return a mapping of object_id -> title.

        Returns:
            A dict mapping notebook ``object_id`` to notebook ``title``.
        """
        try:
            notebooks = await self._notestation.list_notebooks()
            return {
                nb["object_id"]: nb.get("title", "")
                for nb in notebooks
                if "object_id" in nb
            }
        except Exception:
            logger.warning("Failed to fetch notebooks for name lookup")
            return {}

    async def _fetch_all_notes(self) -> list[dict]:
        """Fetch all notes from NoteStation.

        Strategy:
        1. First request **without** offset/limit so the API returns
           every note in a single response (observed Synology behaviour,
           matching the ``synology-api`` reference library).
        2. If the server still returns fewer notes than ``total``
           (i.e. it caps a single response), fall back to paginated
           fetching for the remaining notes.

        Returns:
            A flat list of note dicts.
        """
        # --- Phase 1: attempt a single uncapped request ---------------
        data = await self._notestation.list_notes()
        all_notes: list[dict] = data.get("notes", [])
        total = data.get("total", 0)

        logger.info(
            "NoteStation list (no pagination): received %d notes, total=%d",
            len(all_notes),
            total,
        )

        if not all_notes:
            return all_notes

        # --- Phase 2: paginate if the server capped the response ------
        if total > len(all_notes):
            logger.info(
                "Server capped response at %d notes (total=%d), "
                "fetching remaining via pagination...",
                len(all_notes),
                total,
            )
            offset = len(all_notes)
            while offset < total:
                page = await self._notestation.list_notes(
                    offset=offset, limit=_PAGE_SIZE,
                )
                notes = page.get("notes", [])
                if not notes:
                    break
                all_notes.extend(notes)
                offset += len(notes)
                logger.debug(
                    "Pagination: fetched %d notes so far (offset=%d, total=%d)",
                    len(all_notes),
                    offset,
                    total,
                )

        logger.info("Total notes fetched from NoteStation: %d", len(all_notes))
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
        """Convert a merged Synology note dict to a Note ORM model.

        The ``note_data`` dict is expected to have been normalised by
        :func:`_merge_note_data` so that field names are consistent.

        Args:
            note_data: Merged note dict (summary + detail).
            synced_at: The timestamp to set as ``synced_at``.

        Returns:
            A new :class:`Note` instance (not yet added to the session).
        """
        content_html = note_data.get("content", "")
        content_text = NoteStationService.extract_text(content_html)

        return Note(
            synology_note_id=str(note_data["object_id"]),
            title=note_data.get("title", ""),
            content_html=content_html,
            content_text=content_text,
            notebook_name=note_data.get("notebook_name"),
            tags=note_data.get("tag"),
            is_todo=note_data.get("category") == "todo",
            is_shortcut=False,
            source_created_at=_unix_to_utc(note_data.get("ctime")),
            source_updated_at=_unix_to_utc(note_data.get("mtime")),
            synced_at=synced_at,
        )

    def _update_note(self, db_note: Note, note_data: dict, synced_at: datetime) -> None:
        """Update an existing Note ORM model with fresh data from NoteStation.

        Args:
            db_note: The existing DB model to update in-place.
            note_data: Merged note dict (summary + detail).
            synced_at: The timestamp to set as ``synced_at``.
        """
        content_html = note_data.get("content", "")

        db_note.title = note_data.get("title", "")
        db_note.content_html = content_html
        db_note.content_text = NoteStationService.extract_text(content_html)
        db_note.notebook_name = note_data.get("notebook_name")
        db_note.tags = note_data.get("tag")
        db_note.is_todo = note_data.get("category") == "todo"
        db_note.is_shortcut = False
        db_note.source_created_at = _unix_to_utc(note_data.get("ctime"))
        db_note.source_updated_at = _unix_to_utc(note_data.get("mtime"))
        db_note.synced_at = synced_at


# ------------------------------------------------------------------
# Module-level utilities
# ------------------------------------------------------------------


def _merge_note_data(
    summary: dict, detail: dict, notebook_map: dict[str, str]
) -> dict:
    """Merge list-summary and get-detail dicts into a normalised form.

    The ``list`` API returns ``object_id``, ``title``, ``ctime``,
    ``mtime``, ``parent_id``, ``category``, ``brief``.
    The ``get`` API adds ``content``, ``tag``, ``attachment``, etc.

    This function combines both and resolves ``parent_id`` to a
    human-readable notebook name.
    """
    merged: dict = {**summary, **detail}

    # Resolve notebook name from parent_id
    parent_id = merged.get("parent_id", "")
    merged["notebook_name"] = notebook_map.get(parent_id, "")

    # Ensure tag is a list (or None)
    tag_raw = merged.get("tag")
    if isinstance(tag_raw, dict):
        merged["tag"] = list(tag_raw.values()) if tag_raw else None
    elif isinstance(tag_raw, list):
        merged["tag"] = tag_raw if tag_raw else None
    else:
        merged["tag"] = None

    return merged


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
