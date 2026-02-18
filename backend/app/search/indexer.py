# @TASK P2-T2.2 - Note indexer service
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine
# @TEST tests/test_indexer.py

"""Note indexer for generating and managing vector embeddings.

Converts synchronized notes into vector embeddings via the EmbeddingService,
stores them as NoteEmbedding records, and provides lifecycle management
(index, reindex, delete, needs_indexing check).

tsvector full-text indexing is handled by a PostgreSQL trigger --
this module is responsible only for the semantic (vector) embeddings.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Note, NoteAttachment, NoteEmbedding, NoteImage
from app.search.embeddings import EmbeddingService

logger = logging.getLogger(__name__)

# GLM-OCR bbox pattern: ![](page=0,bbox=[x, y, w, h])
_BBOX_RE = re.compile(r"!\[\]\(page=\d+,bbox=\[[^\]]*\]\)\s*")


def _clean_ocr_text(text: str) -> str:
    """Remove GLM-OCR bbox references and clean up the result."""
    cleaned = _BBOX_RE.sub("", text)
    # Collapse excessive blank lines
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


@dataclass
class IndexResult:
    """Aggregated result of a batch indexing operation.

    Attributes:
        indexed: Number of notes successfully indexed.
        skipped: Number of notes skipped (already indexed).
        failed: Number of notes that failed during indexing.
        total_embeddings: Total number of embedding records created.
    """

    indexed: int = field(default=0)
    skipped: int = field(default=0)
    failed: int = field(default=0)
    total_embeddings: int = field(default=0)


class NoteIndexer:
    """Manages vector embedding lifecycle for notes.

    Coordinates between the database (AsyncSession) and the embedding
    generation service (EmbeddingService) to create, update, and delete
    NoteEmbedding records.

    Args:
        session: An async SQLAlchemy session for database operations.
        embedding_service: Service for generating vector embeddings from text.
    """

    def __init__(
        self,
        session: AsyncSession,
        embedding_service: EmbeddingService,
    ) -> None:
        self._session = session
        self._embedding_service = embedding_service

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def index_note(self, note_id: int) -> int:
        """Index a single note by generating vector embeddings.

        The note's ``content_text`` is chunked and embedded via
        :meth:`EmbeddingService.embed_chunks`. Each (chunk_text, embedding)
        pair is stored as a :class:`NoteEmbedding` record.

        tsvector indexing is handled by a DB trigger and is not
        managed here.

        Args:
            note_id: Database ID of the note to index.

        Returns:
            Number of embedding records created. Returns 0 if the note
            has empty or whitespace-only ``content_text``.

        Raises:
            ValueError: If the note with the given ID does not exist.
        """
        note = await self._get_note(note_id)

        # Use content_text, fall back to title for notes with no body
        text = (note.content_text or "").strip()
        if not text:
            text = (note.title or "").strip()

        # Append extracted text from attachments (PDF/OCR) and images
        pdf_text = await self._get_attachment_texts(note_id)
        ocr_text = await self._get_image_texts(note)

        extra = "\n\n---\n\n".join(filter(None, [pdf_text, ocr_text]))
        if extra:
            text = f"{text}\n\n---\n\n{extra}" if text else extra

        if not text:
            logger.debug("Note %d has no content or title, skipping embedding", note_id)
            return 0

        # Generate embeddings for each text chunk
        chunks = await self._embedding_service.embed_chunks(text)

        # Store each chunk as a NoteEmbedding record
        for chunk_index, (chunk_text, embedding) in enumerate(chunks):
            record = NoteEmbedding(
                note_id=note_id,
                chunk_index=chunk_index,
                chunk_text=chunk_text,
                embedding=embedding,
            )
            self._session.add(record)

        await self._session.flush()

        logger.info("Indexed note %d: %d embeddings created", note_id, len(chunks))
        return len(chunks)

    async def index_notes(self, note_ids: list[int]) -> IndexResult:
        """Batch index multiple notes.

        For each note ID, checks whether indexing is needed (via
        :meth:`needs_indexing`). Notes that already have embeddings
        are skipped. Failures for individual notes are counted but
        do not abort the batch.

        Args:
            note_ids: List of note database IDs to index.

        Returns:
            An :class:`IndexResult` summarizing the batch operation.
        """
        result = IndexResult()

        for note_id in note_ids:
            try:
                if not await self.needs_indexing(note_id):
                    result.skipped += 1
                    logger.debug("Note %d already indexed, skipping", note_id)
                    continue

                embeddings_created = await self.index_note(note_id)
                result.indexed += 1
                result.total_embeddings += embeddings_created

            except Exception:
                result.failed += 1
                logger.exception("Failed to index note %d", note_id)

        return result

    async def reindex_note(self, note_id: int) -> int:
        """Delete existing embeddings and re-index a note.

        This is useful when a note's content has been updated and the
        existing embeddings are stale.

        Args:
            note_id: Database ID of the note to reindex.

        Returns:
            Number of new embedding records created.
        """
        deleted = await self.delete_embeddings(note_id)
        logger.info("Deleted %d old embeddings for note %d", deleted, note_id)

        return await self.index_note(note_id)

    async def delete_embeddings(self, note_id: int) -> int:
        """Delete all embedding records for a given note.

        Args:
            note_id: Database ID of the note whose embeddings to delete.

        Returns:
            Number of embedding records deleted.
        """
        stmt = delete(NoteEmbedding).where(NoteEmbedding.note_id == note_id)
        result = await self._session.execute(stmt)
        return result.rowcount

    async def needs_indexing(self, note_id: int) -> bool:
        """Check whether a note needs indexing.

        Returns ``True`` if the note has zero embeddings in the
        ``note_embeddings`` table.

        Args:
            note_id: Database ID of the note to check.

        Returns:
            True if the note has no embeddings and needs indexing.
        """
        stmt = select(func.count()).select_from(NoteEmbedding).where(NoteEmbedding.note_id == note_id)
        result = await self._session.execute(stmt)
        count = result.scalar()
        return count == 0

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_attachment_texts(self, note_id: int) -> str:
        """Collect extracted PDF text from all completed attachments for a note."""
        stmt = select(NoteAttachment.extracted_text, NoteAttachment.name).where(
            NoteAttachment.note_id == note_id,
            NoteAttachment.extraction_status == "completed",
            NoteAttachment.extracted_text.isnot(None),
        )
        result = await self._session.execute(stmt)
        rows = result.fetchall()

        if not rows:
            return ""

        parts = []
        for text, name in rows:
            if text and text.strip():
                suffix = PurePosixPath(name).suffix.lower() if name else ""
                if suffix in (".hwp", ".hwpx"):
                    label = "HWP"
                elif suffix == ".pdf":
                    label = "PDF"
                elif suffix in (".docx", ".doc"):
                    label = "DOCX"
                else:
                    label = "FILE"
                parts.append(f"[{label}: {name}]\n{text.strip()}")

        return "\n\n---\n\n".join(parts)

    async def _get_image_texts(self, note: Note) -> str:
        """Collect OCR text and Vision descriptions from NoteImages."""
        if not note.synology_note_id:
            return ""

        stmt = select(
            NoteImage.extracted_text,
            NoteImage.vision_description,
            NoteImage.name,
        ).where(
            NoteImage.synology_note_id == note.synology_note_id,
            (NoteImage.extraction_status == "completed") | (NoteImage.vision_status == "completed"),
        )
        result = await self._session.execute(stmt)
        rows = result.fetchall()

        if not rows:
            return ""

        parts = []
        for ocr_text, vision_desc, name in rows:
            if ocr_text and ocr_text.strip():
                cleaned = _clean_ocr_text(ocr_text)
                if cleaned:
                    parts.append(f"[OCR: {name}]\n{cleaned}")
            if vision_desc and vision_desc.strip():
                parts.append(f"[Vision: {name}]\n{vision_desc.strip()}")

        return "\n\n---\n\n".join(parts)

    async def _get_note(self, note_id: int) -> Note:
        """Fetch a note by ID or raise ValueError.

        Args:
            note_id: Database ID of the note.

        Returns:
            The Note ORM instance.

        Raises:
            ValueError: If no note exists with the given ID.
        """
        stmt = select(Note).where(Note.id == note_id)
        result = await self._session.execute(stmt)
        note = result.scalar_one_or_none()

        if note is None:
            raise ValueError(f"Note {note_id} not found")

        return note
