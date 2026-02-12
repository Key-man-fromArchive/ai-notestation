# @TASK P1-T1.4 - NoteStation -> PostgreSQL sync service
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#synology-gateway
# @TEST tests/test_sync_service.py

"""Bidirectional sync between Synology NoteStation and local PostgreSQL.

Sync strategy (Push before Pull):
1. **Push** — Local edits (sync_status='local_modified') are pushed to NoteStation.
2. **Pull** — Remote notes are compared with local DB:
   - New remote note → INSERT
   - Remote changed, local clean → UPDATE
   - Both changed → CONFLICT (store remote version in remote_conflict_data)
3. **Delete** — Notes absent from remote:
   - If local_modified → mark as 'local_only' (preserve)
   - Otherwise → DELETE
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
    """Summary of a synchronisation run."""

    added: int = 0
    updated: int = 0
    deleted: int = 0
    pushed: int = 0
    conflicts: int = 0
    total: int = 0
    synced_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class SyncService:
    """Bidirectional NoteStation <-> PostgreSQL synchronisation service.

    Args:
        notestation: An authenticated NoteStationService instance.
        db: An SQLAlchemy async session (caller manages transaction boundaries).
        write_enabled: Whether push-to-NoteStation is available.
    """

    def __init__(
        self,
        notestation: NoteStationService,
        db: AsyncSession,
        write_enabled: bool = False,
    ) -> None:
        self._notestation = notestation
        self._db = db
        self._write_enabled = write_enabled

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def sync_all(self) -> SyncResult:
        """Run a full bidirectional synchronisation.

        Step 1: Push local changes to NoteStation (if write_enabled).
        Step 2: Pull remote changes, detecting conflicts.
        Step 3: Handle deletions (preserve local_modified notes).

        Returns:
            A :class:`SyncResult` with add/update/delete/pushed/conflicts counts.
        """
        try:
            now = datetime.now(UTC)

            # Step 1: Push local changes to NoteStation
            pushed = await self._push_local_changes()

            # Step 2: Fetch all remote notes (list – summary only)
            remote_notes = await self._fetch_all_notes()
            notebook_map = await self._fetch_notebook_map()
            existing = await self._get_existing_notes()

            remote_ids: set[str] = set()
            added = 0
            updated = 0
            conflicts = 0

            for note_summary in remote_notes:
                note_id = str(note_summary["object_id"])
                remote_ids.add(note_id)

                is_new = note_id not in existing
                if is_new:
                    # New remote note → INSERT
                    try:
                        detail = await self._notestation.get_note(note_id)
                    except Exception:
                        logger.warning("Failed to fetch detail for note %s, using summary", note_id)
                        detail = note_summary

                    merged = _merge_note_data(note_summary, detail, notebook_map)
                    new_note = self._note_to_model(merged, synced_at=now)
                    self._db.add(new_note)
                    added += 1
                    continue

                db_note = existing[note_id]
                remote_updated = _unix_to_utc(note_summary.get("mtime"))
                remote_changed = bool(
                    remote_updated and remote_updated != db_note.source_updated_at
                )
                local_changed = db_note.sync_status in ("local_modified", "conflict")

                if remote_changed and local_changed:
                    # Both sides changed → CONFLICT
                    try:
                        detail = await self._notestation.get_note(note_id)
                    except Exception:
                        detail = note_summary

                    merged = _merge_note_data(note_summary, detail, notebook_map)
                    db_note.remote_conflict_data = {
                        "title": merged.get("title", ""),
                        "content": merged.get("content", ""),
                        "source_updated_at": remote_updated.isoformat() if remote_updated else None,
                    }
                    db_note.sync_status = "conflict"
                    db_note.synced_at = now
                    conflicts += 1
                    logger.info("Conflict detected for note %s", note_id)

                elif remote_changed:
                    # Remote only changed → UPDATE local
                    try:
                        detail = await self._notestation.get_note(note_id)
                    except Exception:
                        logger.warning("Failed to fetch detail for note %s, using summary", note_id)
                        detail = note_summary

                    merged = _merge_note_data(note_summary, detail, notebook_map)
                    self._update_note(db_note, merged, synced_at=now)
                    updated += 1

                # else: local only changed (already pushed in Step 1) or no change → skip

            # Step 3: Handle deletions
            deleted = 0
            for syn_id, db_note in existing.items():
                if syn_id not in remote_ids:
                    if db_note.sync_status in ("local_modified", "local_only"):
                        # Preserve locally modified notes
                        db_note.sync_status = "local_only"
                        logger.info("Note %s not on remote, marked as local_only", syn_id)
                    else:
                        await self._db.delete(db_note)
                        deleted += 1

            await self._db.flush()

            total = len(remote_notes)
            result = SyncResult(
                added=added,
                updated=updated,
                deleted=deleted,
                pushed=pushed,
                conflicts=conflicts,
                total=total,
                synced_at=now,
            )
            logger.info(
                "Sync completed: added=%d, updated=%d, deleted=%d, pushed=%d, conflicts=%d, total=%d",
                added, updated, deleted, pushed, conflicts, total,
            )
            return result

        except Exception:
            await self._db.rollback()
            raise

    # ------------------------------------------------------------------
    # Push logic
    # ------------------------------------------------------------------

    async def _push_local_changes(self) -> int:
        """Push locally modified notes to NoteStation.

        Returns:
            Number of notes successfully pushed.
        """
        if not self._write_enabled:
            return 0

        stmt = select(Note).where(Note.sync_status == "local_modified")
        result = await self._db.execute(stmt)
        local_modified = result.scalars().all()

        if not local_modified:
            return 0

        from app.utils.note_utils import inline_local_file_images, restore_nas_image_urls

        # Build reverse notebook map (name → NAS object_id) for creating new notes
        notebook_map = await self._fetch_notebook_map()
        name_to_id = {title: oid for oid, title in notebook_map.items()}

        pushed = 0
        for note in local_modified:
            try:
                # Convert local image URLs before pushing to NAS
                push_content = note.content_html or ""
                logger.info(
                    "_push %s: before — nas-images=%d, images=%d, files=%d, placeholders=%d",
                    note.synology_note_id,
                    push_content.count("/api/nas-images/"),
                    push_content.count("/api/images/"),
                    push_content.count("/api/files/"),
                    push_content.count("notestation-image:"),
                )
                push_content = inline_local_file_images(push_content)
                push_content = restore_nas_image_urls(push_content)
                logger.info(
                    "_push %s: after transforms — NAS refs=%d, remaining /api/=%d",
                    note.synology_note_id,
                    push_content.count("syno-notestation-image-object"),
                    push_content.count("/api/"),
                )

                # Detect whether note exists on NAS
                is_new_note = False
                try:
                    await self._notestation.get_note(note.synology_note_id)
                except Exception:
                    is_new_note = True

                if is_new_note:
                    parent_id = name_to_id.get(note.notebook_name)
                    if not parent_id:
                        logger.warning(
                            "Cannot create note %s: notebook '%s' not found on NAS",
                            note.synology_note_id, note.notebook_name,
                        )
                        continue

                    result_data = await self._notestation.create_note(
                        parent_id=parent_id,
                        title=note.title,
                        content=push_content,
                    )
                    old_id = note.synology_note_id
                    new_nas_id = result_data.get("object_id", old_id)
                    note.synology_note_id = new_nas_id
                    logger.info("_push: created note on NAS, old_id=%s → new_id=%s", old_id, new_nas_id)
                else:
                    await self._notestation.update_note(
                        object_id=note.synology_note_id,
                        title=note.title,
                        content=push_content,
                    )

                # Fetch updated note from NAS to get new version hash & canonical content
                try:
                    nas_note = await self._notestation.get_note(note.synology_note_id)
                    if nas_note.get("ver"):
                        note.nas_ver = nas_note["ver"]
                    if nas_note.get("link_id"):
                        note.link_id = nas_note["link_id"]
                    if nas_note.get("mtime"):
                        note.source_updated_at = _unix_to_utc(nas_note["mtime"])
                    # Use NAS content (canonical format with NAS refs instead of data URIs)
                    if nas_note.get("content"):
                        push_content = nas_note["content"]
                except Exception:
                    logger.warning("Failed to fetch updated note %s after push", note.synology_note_id)

                # Update DB with NAS-format content to keep it clean
                note.content_html = push_content
                note.content_text = NoteStationService.extract_text(push_content)
                note.sync_status = "synced"
                note.local_modified_at = None
                pushed += 1
                logger.info("Pushed note %s to NoteStation", note.synology_note_id)
            except Exception:
                logger.warning("Failed to push note %s to NoteStation", note.synology_note_id)

        if pushed:
            await self._db.flush()

        return pushed

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
        from app.utils.note_utils import extract_data_uri_images

        content_html = note_data.get("content", "")
        # Extract data URI images to local files (rehype-raw can't parse huge data URIs)
        content_html = extract_data_uri_images(content_html)
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
            link_id=note_data.get("link_id"),
            nas_ver=note_data.get("ver"),
        )

    def _update_note(self, db_note: Note, note_data: dict, synced_at: datetime) -> None:
        """Update an existing Note ORM model with fresh data from NoteStation.

        Args:
            db_note: The existing DB model to update in-place.
            note_data: Merged note dict (summary + detail).
            synced_at: The timestamp to set as ``synced_at``.
        """
        from app.utils.note_utils import extract_data_uri_images

        content_html = note_data.get("content", "")
        # Extract data URI images to local files (rehype-raw can't parse huge data URIs)
        content_html = extract_data_uri_images(content_html)

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
        db_note.link_id = note_data.get("link_id")
        db_note.nas_ver = note_data.get("ver")


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
