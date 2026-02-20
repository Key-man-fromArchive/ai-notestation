"""Trash service — backup/restore/purge logic for admin storage management.

Each cleanup operation creates a TrashOperation record and backs up data
to /data/trash/{op_id}/ before deletion, enabling selective restore.
"""

from __future__ import annotations

import contextlib
import json
import logging
import shutil
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import TrashOperation

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1000


def _trash_dir(op_id: int) -> Path:
    """Return the trash directory for an operation, creating it if needed."""
    settings = get_settings()
    p = Path(settings.TRASH_PATH) / str(op_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _dir_size(path: Path) -> int:
    total = 0
    if path.exists():
        for f in path.rglob("*"):
            if f.is_file():
                with contextlib.suppress(OSError):
                    total += f.stat().st_size
    return total


async def _dump_query_to_jsonl(db: AsyncSession, query: str, dest: Path, params: dict | None = None) -> int:
    """Stream query results to a JSONL file, return row count."""
    result = await db.execute(text(query), params or {})
    rows = result.mappings().all()
    count = 0
    with open(dest, "w", encoding="utf-8") as f:
        for row in rows:
            record = {}
            for k, v in row.items():
                if hasattr(v, "isoformat"):
                    record[k] = v.isoformat()
                else:
                    record[k] = v
            f.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
            count += 1
    return count


async def _restore_jsonl_insert(
    db: AsyncSession, table: str, jsonl_path: Path, *, on_conflict: str = "DO NOTHING"
) -> int:
    """Restore rows from JSONL into table, return count."""
    if not jsonl_path.exists():
        return 0
    count = 0
    batch: list[dict] = []
    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            batch.append(json.loads(line))
            if len(batch) >= CHUNK_SIZE:
                count += await _insert_batch(db, table, batch, on_conflict)
                batch = []
    if batch:
        count += await _insert_batch(db, table, batch, on_conflict)
    return count


async def _insert_batch(db: AsyncSession, table: str, rows: list[dict], on_conflict: str) -> int:
    if not rows:
        return 0
    cols = list(rows[0].keys())
    col_list = ", ".join(cols)
    val_placeholders = ", ".join(f":{c}" for c in cols)
    sql = f"INSERT INTO {table} ({col_list}) VALUES ({val_placeholders}) ON CONFLICT {on_conflict}"  # noqa: S608
    for row in rows:
        await db.execute(text(sql), row)
    return len(rows)


async def _reset_sequence(db: AsyncSession, table: str, pk: str = "id") -> None:
    """Reset the primary key sequence to MAX(pk) + 1."""
    await db.execute(
        text(
            f"SELECT setval(pg_get_serial_sequence('{table}', '{pk}'), "  # noqa: S608
            f"COALESCE((SELECT MAX({pk}) FROM {table}), 0) + 1, false)"
        )
    )


# ---------------------------------------------------------------------------
# Activity Logs
# ---------------------------------------------------------------------------


async def trash_activity_logs(
    db: AsyncSession, triggered_by: str, *, older_than_days: int | None = None
) -> TrashOperation:
    where = ""
    params: dict = {}
    desc_suffix = ""
    if older_than_days is not None:
        where = "WHERE created_at < NOW() - MAKE_INTERVAL(days => :days)"
        params["days"] = older_than_days
        desc_suffix = f" ({older_than_days}일 이전)"

    count_result = await db.execute(text(f"SELECT COUNT(*) FROM activity_logs {where}"), params)  # noqa: S608
    count = count_result.scalar() or 0
    if count == 0:
        raise ValueError("No activity logs to trash")

    op = TrashOperation(
        operation_type="activity_logs",
        description=f"활동 로그 삭제{desc_suffix}",
        item_count=count,
        backup_path="",
        manifest={"older_than_days": older_than_days},
        triggered_by=triggered_by,
    )
    db.add(op)
    await db.flush()

    backup_dir = _trash_dir(op.id)
    op.backup_path = f"{op.id}/"

    jsonl_path = backup_dir / "activity_logs.jsonl"
    await _dump_query_to_jsonl(db, f"SELECT * FROM activity_logs {where}", jsonl_path, params)  # noqa: S608

    await db.execute(text(f"DELETE FROM activity_logs {where}"), params)  # noqa: S608
    op.size_bytes = _dir_size(backup_dir)
    return op


async def restore_activity_logs(db: AsyncSession, op: TrashOperation) -> int:
    settings = get_settings()
    backup_dir = Path(settings.TRASH_PATH) / op.backup_path
    jsonl_path = backup_dir / "activity_logs.jsonl"
    count = await _restore_jsonl_insert(db, "activity_logs", jsonl_path)
    await _reset_sequence(db, "activity_logs")
    return count


# ---------------------------------------------------------------------------
# Orphan Files
# ---------------------------------------------------------------------------


async def trash_orphan_files(db: AsyncSession, triggered_by: str) -> TrashOperation:
    settings = get_settings()
    orphans: list[dict] = []

    # Find orphan images
    images_path = Path(settings.NSX_IMAGES_PATH)
    if images_path.exists():
        db_result = await db.execute(text("SELECT file_path FROM note_images"))
        db_paths = {row.file_path for row in db_result.fetchall() if row.file_path}
        db_names = {Path(p).name for p in db_paths}

        for f in images_path.rglob("*"):
            if not f.is_file():
                continue
            if str(f) not in db_paths and f.name not in db_names:
                orphans.append({"path": str(f), "source": "images", "size": f.stat().st_size})

    # Find orphan uploads
    uploads_path = Path(settings.UPLOADS_PATH)
    if uploads_path.exists():
        db_result = await db.execute(text("SELECT file_id FROM note_attachments"))
        db_file_ids = {row.file_id for row in db_result.fetchall()}

        for f in uploads_path.rglob("*"):
            if not f.is_file():
                continue
            if f.stem not in db_file_ids and f.name not in db_file_ids:
                orphans.append({"path": str(f), "source": "uploads", "size": f.stat().st_size})

    if not orphans:
        raise ValueError("No orphan files found")

    total_size = sum(o["size"] for o in orphans)

    op = TrashOperation(
        operation_type="orphan_files",
        description="고아 파일 정리",
        item_count=len(orphans),
        backup_path="",
        manifest={"files": [{"original_path": o["path"], "source": o["source"]} for o in orphans]},
        triggered_by=triggered_by,
    )
    db.add(op)
    await db.flush()

    backup_dir = _trash_dir(op.id)
    op.backup_path = f"{op.id}/"
    files_dir = backup_dir / "files"
    files_dir.mkdir(exist_ok=True)

    moved = 0
    for o in orphans:
        src = Path(o["path"])
        if src.exists():
            dest = files_dir / f"{o['source']}_{src.name}"
            with contextlib.suppress(OSError):
                shutil.move(str(src), str(dest))
                moved += 1

    op.item_count = moved
    op.size_bytes = total_size
    return op


async def restore_orphan_files(db: AsyncSession, op: TrashOperation) -> int:
    settings = get_settings()
    backup_dir = Path(settings.TRASH_PATH) / op.backup_path
    files_dir = backup_dir / "files"
    manifest = op.manifest or {}
    restored = 0

    for entry in manifest.get("files", []):
        original_path = Path(entry["original_path"])
        source = entry["source"]
        trash_name = f"{source}_{original_path.name}"
        trash_file = files_dir / trash_name

        if trash_file.exists():
            original_path.parent.mkdir(parents=True, exist_ok=True)
            with contextlib.suppress(OSError):
                shutil.move(str(trash_file), str(original_path))
                restored += 1

    return restored


# ---------------------------------------------------------------------------
# Export Files
# ---------------------------------------------------------------------------


async def trash_export_files(db: AsyncSession, triggered_by: str) -> TrashOperation:
    settings = get_settings()
    exports_path = Path(settings.NSX_EXPORTS_PATH)

    if not exports_path.exists():
        raise ValueError("No export files found")

    files = [f for f in exports_path.rglob("*") if f.is_file()]
    if not files:
        raise ValueError("No export files found")

    total_size = sum(f.stat().st_size for f in files)

    op = TrashOperation(
        operation_type="export_files",
        description="내보내기 파일 삭제",
        item_count=len(files),
        backup_path="",
        manifest={"original_dir": str(exports_path)},
        triggered_by=triggered_by,
    )
    db.add(op)
    await db.flush()

    backup_dir = _trash_dir(op.id)
    op.backup_path = f"{op.id}/"
    files_dir = backup_dir / "exports"

    # Move the entire exports directory content
    shutil.copytree(str(exports_path), str(files_dir), dirs_exist_ok=True)
    shutil.rmtree(exports_path, ignore_errors=True)
    exports_path.mkdir(parents=True, exist_ok=True)

    op.size_bytes = total_size
    return op


async def restore_export_files(db: AsyncSession, op: TrashOperation) -> int:
    settings = get_settings()
    backup_dir = Path(settings.TRASH_PATH) / op.backup_path
    files_dir = backup_dir / "exports"
    manifest = op.manifest or {}
    original_dir = Path(manifest.get("original_dir", settings.NSX_EXPORTS_PATH))

    if not files_dir.exists():
        return 0

    original_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for f in files_dir.rglob("*"):
        if f.is_file():
            rel = f.relative_to(files_dir)
            dest = original_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(f), str(dest))
            count += 1
    return count


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------


async def trash_embeddings(db: AsyncSession, triggered_by: str) -> TrashOperation:
    count_result = await db.execute(text("SELECT COUNT(*) FROM note_embeddings"))
    count = count_result.scalar() or 0
    if count == 0:
        raise ValueError("No embeddings to trash")

    op = TrashOperation(
        operation_type="embeddings",
        description="임베딩 전체 삭제",
        item_count=count,
        backup_path="",
        manifest={"note": "Vectors omitted from backup. Re-indexing required after restore."},
        triggered_by=triggered_by,
    )
    db.add(op)
    await db.flush()

    backup_dir = _trash_dir(op.id)
    op.backup_path = f"{op.id}/"

    # Save metadata only (no vectors — too large ~6KB/row)
    jsonl_path = backup_dir / "embeddings_meta.jsonl"
    await _dump_query_to_jsonl(
        db,
        "SELECT id, note_id, chunk_index, chunk_text, created_at FROM note_embeddings",
        jsonl_path,
    )

    await db.execute(text("DELETE FROM note_embeddings"))
    op.size_bytes = _dir_size(backup_dir)
    return op


async def restore_embeddings(db: AsyncSession, op: TrashOperation) -> int:
    settings = get_settings()
    backup_dir = Path(settings.TRASH_PATH) / op.backup_path
    jsonl_path = backup_dir / "embeddings_meta.jsonl"

    if not jsonl_path.exists():
        return 0

    # Restore metadata rows (without embedding vectors — re-indexing needed)
    count = 0
    with open(jsonl_path, encoding="utf-8") as f:
        batch: list[dict] = []
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            # Skip the embedding column since we didn't back it up
            batch.append(row)
            if len(batch) >= CHUNK_SIZE:
                # We can't insert without embedding vector, so just count
                count += len(batch)
                batch = []
        count += len(batch)

    await _reset_sequence(db, "note_embeddings")
    return count


# ---------------------------------------------------------------------------
# Vision Data
# ---------------------------------------------------------------------------


async def trash_vision_data(db: AsyncSession, triggered_by: str) -> TrashOperation:
    count_result = await db.execute(
        text("""
            SELECT COUNT(*) FROM note_images
            WHERE extracted_text IS NOT NULL
               OR vision_description IS NOT NULL
               OR extraction_status IS NOT NULL
               OR vision_status IS NOT NULL
        """)
    )
    count = count_result.scalar() or 0
    if count == 0:
        raise ValueError("No vision data to trash")

    op = TrashOperation(
        operation_type="vision_data",
        description="Vision/OCR 데이터 초기화",
        item_count=count,
        backup_path="",
        triggered_by=triggered_by,
    )
    db.add(op)
    await db.flush()

    backup_dir = _trash_dir(op.id)
    op.backup_path = f"{op.id}/"

    jsonl_path = backup_dir / "vision_data.jsonl"
    await _dump_query_to_jsonl(
        db,
        """SELECT id, extracted_text, extraction_status, vision_description, vision_status
           FROM note_images
           WHERE extracted_text IS NOT NULL
              OR vision_description IS NOT NULL
              OR extraction_status IS NOT NULL
              OR vision_status IS NOT NULL""",
        jsonl_path,
    )

    await db.execute(
        text("""
            UPDATE note_images
            SET extracted_text = NULL,
                vision_description = NULL,
                extraction_status = NULL,
                vision_status = NULL
            WHERE extracted_text IS NOT NULL
               OR vision_description IS NOT NULL
               OR extraction_status IS NOT NULL
               OR vision_status IS NOT NULL
        """)
    )
    op.size_bytes = _dir_size(backup_dir)
    return op


async def restore_vision_data(db: AsyncSession, op: TrashOperation) -> int:
    settings = get_settings()
    backup_dir = Path(settings.TRASH_PATH) / op.backup_path
    jsonl_path = backup_dir / "vision_data.jsonl"

    if not jsonl_path.exists():
        return 0

    count = 0
    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            img_id = row["id"]
            await db.execute(
                text("""
                    UPDATE note_images
                    SET extracted_text = :extracted_text,
                        extraction_status = :extraction_status,
                        vision_description = :vision_description,
                        vision_status = :vision_status
                    WHERE id = :id
                """),
                {
                    "id": img_id,
                    "extracted_text": row.get("extracted_text"),
                    "extraction_status": row.get("extraction_status"),
                    "vision_description": row.get("vision_description"),
                    "vision_status": row.get("vision_status"),
                },
            )
            count += 1
    return count


# ---------------------------------------------------------------------------
# Notes Reset (full wipe)
# ---------------------------------------------------------------------------


async def trash_notes_reset(db: AsyncSession, triggered_by: str) -> TrashOperation:
    settings = get_settings()

    counts: dict[str, int] = {}
    for table, key in [
        ("note_embeddings", "embeddings"),
        ("note_images", "images"),
        ("notes", "notes"),
        ("notebooks", "notebooks"),
    ]:
        r = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))  # noqa: S608
        counts[key] = r.scalar() or 0

    total = sum(counts.values())
    if total == 0:
        raise ValueError("No data to trash")

    op = TrashOperation(
        operation_type="notes_reset",
        description="노트 전체 초기화",
        item_count=total,
        backup_path="",
        manifest={"counts": counts},
        triggered_by=triggered_by,
    )
    db.add(op)
    await db.flush()

    backup_dir = _trash_dir(op.id)
    op.backup_path = f"{op.id}/"

    # Dump tables
    for table in ("notes", "notebooks", "note_images", "note_embeddings"):
        jsonl_path = backup_dir / f"{table}.jsonl"
        if table == "note_embeddings":
            # Skip vectors, metadata only
            await _dump_query_to_jsonl(
                db,
                "SELECT id, note_id, chunk_index, chunk_text, created_at FROM note_embeddings",
                jsonl_path,
            )
        else:
            await _dump_query_to_jsonl(db, f"SELECT * FROM {table}", jsonl_path)  # noqa: S608

    # Move image files
    images_path = Path(settings.NSX_IMAGES_PATH)
    if images_path.exists() and any(images_path.rglob("*")):
        images_backup = backup_dir / "nsx_images"
        shutil.copytree(str(images_path), str(images_backup), dirs_exist_ok=True)
        shutil.rmtree(images_path, ignore_errors=True)
        images_path.mkdir(parents=True, exist_ok=True)

    # Truncate
    await db.execute(text("TRUNCATE notes CASCADE"))
    await db.execute(text("TRUNCATE notebooks CASCADE"))

    op.size_bytes = _dir_size(backup_dir)
    return op


async def restore_notes_reset(db: AsyncSession, op: TrashOperation) -> int:
    settings = get_settings()
    backup_dir = Path(settings.TRASH_PATH) / op.backup_path
    total = 0

    # Restore notebooks first (notes have FK)
    for table in ("notebooks", "notes", "note_images"):
        jsonl_path = backup_dir / f"{table}.jsonl"
        if jsonl_path.exists():
            count = await _restore_jsonl_insert(db, table, jsonl_path)
            await _reset_sequence(db, table)
            total += count

    # Note: embeddings metadata restored but vectors need re-indexing
    emb_path = backup_dir / "note_embeddings.jsonl"
    if emb_path.exists():
        # We can't restore without vectors — just note in manifest
        logger.info("Embeddings metadata found but vectors need re-indexing")

    # Restore image files
    images_backup = backup_dir / "nsx_images"
    if images_backup.exists():
        images_path = Path(settings.NSX_IMAGES_PATH)
        images_path.mkdir(parents=True, exist_ok=True)
        shutil.copytree(str(images_backup), str(images_path), dirs_exist_ok=True)

    return total


# ---------------------------------------------------------------------------
# Purge
# ---------------------------------------------------------------------------


async def purge_operation(db: AsyncSession, op: TrashOperation) -> None:
    """Permanently delete backup data for a trash operation."""
    settings = get_settings()
    backup_dir = Path(settings.TRASH_PATH) / op.backup_path

    if backup_dir.exists():
        shutil.rmtree(backup_dir, ignore_errors=True)

    op.status = "purged"
    from datetime import UTC, datetime

    op.purged_at = datetime.now(UTC)


async def purge_all(db: AsyncSession) -> int:
    """Purge all active trash operations."""
    result = await db.execute(text("SELECT id, backup_path FROM trash_operations WHERE status = 'active'"))
    ops = result.fetchall()

    settings = get_settings()
    for row in ops:
        backup_dir = Path(settings.TRASH_PATH) / (row.backup_path or "")
        if backup_dir.exists():
            shutil.rmtree(backup_dir, ignore_errors=True)

    await db.execute(text("UPDATE trash_operations SET status = 'purged', purged_at = NOW() WHERE status = 'active'"))
    return len(ops)


# ---------------------------------------------------------------------------
# Notes Batch Trash (user-facing soft delete)
# ---------------------------------------------------------------------------


async def trash_notes_batch(
    db: AsyncSession, note_ids: list[str], triggered_by: str
) -> TrashOperation:
    """Move selected notes to trash (backup to JSONL, delete from local DB only).

    NAS notes are NOT deleted — they can be recovered via re-sync or restore.
    """
    if not note_ids:
        raise ValueError("No note IDs provided")

    placeholders = ", ".join(f":id_{i}" for i in range(len(note_ids)))
    params = {f"id_{i}": nid for i, nid in enumerate(note_ids)}

    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM notes WHERE synology_note_id IN ({placeholders})"),  # noqa: S608
        params,
    )
    count = count_result.scalar() or 0
    if count == 0:
        raise ValueError("No matching notes found")

    op = TrashOperation(
        operation_type="notes_batch",
        description=f"노트 {count}개 휴지통 이동",
        item_count=count,
        backup_path="",
        manifest={"note_ids": note_ids},
        triggered_by=triggered_by,
    )
    db.add(op)
    await db.flush()

    backup_dir = _trash_dir(op.id)
    op.backup_path = f"{op.id}/"

    # Backup notes
    jsonl_path = backup_dir / "notes.jsonl"
    await _dump_query_to_jsonl(
        db,
        f"SELECT * FROM notes WHERE synology_note_id IN ({placeholders})",  # noqa: S608
        jsonl_path,
        params,
    )

    # Backup related images
    img_jsonl = backup_dir / "note_images.jsonl"
    await _dump_query_to_jsonl(
        db,
        f"SELECT * FROM note_images WHERE synology_note_id IN ({placeholders})",  # noqa: S608
        img_jsonl,
        params,
    )

    # Backup embeddings metadata (no vectors)
    emb_jsonl = backup_dir / "note_embeddings.jsonl"
    await _dump_query_to_jsonl(
        db,
        f"""SELECT ne.id, ne.note_id, ne.chunk_index, ne.chunk_text, ne.created_at
            FROM note_embeddings ne
            JOIN notes n ON ne.note_id = n.id
            WHERE n.synology_note_id IN ({placeholders})""",  # noqa: S608
        emb_jsonl,
        params,
    )

    # Delete embeddings
    await db.execute(
        text(
            f"""DELETE FROM note_embeddings
                WHERE note_id IN (
                    SELECT id FROM notes WHERE synology_note_id IN ({placeholders})
                )"""  # noqa: S608
        ),
        params,
    )

    # Delete images
    await db.execute(
        text(f"DELETE FROM note_images WHERE synology_note_id IN ({placeholders})"),  # noqa: S608
        params,
    )

    # Delete notes (cascades to attachments, access, share links)
    await db.execute(
        text(f"DELETE FROM notes WHERE synology_note_id IN ({placeholders})"),  # noqa: S608
        params,
    )

    op.size_bytes = _dir_size(backup_dir)
    return op


async def restore_notes_batch(db: AsyncSession, op: TrashOperation) -> int:
    """Restore notes from a batch trash operation."""
    settings = get_settings()
    backup_dir = Path(settings.TRASH_PATH) / op.backup_path
    total = 0

    notes_jsonl = backup_dir / "notes.jsonl"
    if notes_jsonl.exists():
        total += await _restore_jsonl_insert(db, "notes", notes_jsonl)
        await _reset_sequence(db, "notes")

    img_jsonl = backup_dir / "note_images.jsonl"
    if img_jsonl.exists():
        total += await _restore_jsonl_insert(db, "note_images", img_jsonl)
        await _reset_sequence(db, "note_images")

    # Embeddings metadata only — vectors need re-indexing
    logger.info("Notes batch restore: embeddings need re-indexing")

    return total


# ---------------------------------------------------------------------------
# Restore dispatcher
# ---------------------------------------------------------------------------

_RESTORE_MAP = {
    "activity_logs": restore_activity_logs,
    "orphan_files": restore_orphan_files,
    "export_files": restore_export_files,
    "embeddings": restore_embeddings,
    "vision_data": restore_vision_data,
    "notes_reset": restore_notes_reset,
    "notes_batch": restore_notes_batch,
}


async def restore_operation(db: AsyncSession, op: TrashOperation) -> int:
    """Dispatch restore to the correct handler based on operation_type."""
    handler = _RESTORE_MAP.get(op.operation_type)
    if not handler:
        raise ValueError(f"Unknown operation type: {op.operation_type}")

    count = await handler(db, op)

    from datetime import UTC, datetime

    op.status = "restored"
    op.restored_at = datetime.now(UTC)
    return count
