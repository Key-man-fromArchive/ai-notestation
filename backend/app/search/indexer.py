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
        ai_router: Optional AI router for generating note summaries.
            When provided, a 2-3 sentence summary is generated per note
            and embedded as a special ``chunk_type="summary"`` chunk.
    """

    def __init__(
        self,
        session: AsyncSession,
        embedding_service: EmbeddingService,
        ai_router: object | None = None,
    ) -> None:
        self._session = session
        self._embedding_service = embedding_service
        self._ai_router = ai_router

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def index_note(self, note_id: int) -> int:
        """Index a single note by generating vector embeddings.

        Each source (main content, individual attachments, individual images)
        is chunked and embedded separately with its own ``chunk_type``.
        A contextual prefix with note metadata is prepended to each segment
        to improve semantic retrieval (Anthropic "Contextual Retrieval").

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
        prefix = self._build_context_prefix(note)

        # Use content_text, fall back to title for notes with no body
        text = (note.content_text or "").strip()
        if not text:
            text = (note.title or "").strip()

        # Build segments: list of (text, chunk_type) tuples
        segments: list[tuple[str, str]] = []

        if text:
            segments.append((prefix + text if prefix else text, "content"))

        # Attachments — each file is a separate segment
        for att_text, att_type in await self._get_attachment_segments(note_id):
            segments.append((prefix + att_text if prefix else att_text, att_type))

        # Images — each OCR/vision result is a separate segment
        for img_text, img_type in await self._get_image_segments(note):
            segments.append((prefix + img_text if prefix else img_text, img_type))

        if not segments:
            logger.debug("Note %d has no content or title, skipping embedding", note_id)
            return 0

        # Embed each segment separately, tracking chunk_type per record
        chunk_index = 0
        for segment_text, chunk_type in segments:
            chunks = await self._embedding_service.embed_chunks(segment_text)
            for chunk_text, embedding in chunks:
                record = NoteEmbedding(
                    note_id=note_id,
                    chunk_index=chunk_index,
                    chunk_text=chunk_text,
                    embedding=embedding,
                    chunk_type=chunk_type,
                )
                self._session.add(record)
                chunk_index += 1

        # Generate and embed AI summary (if router available and not cached)
        if self._ai_router and not note.summary:
            summary = await self._generate_summary(note, text)
            if summary:
                note.summary = summary
                summary_text = prefix + summary if prefix else summary
                summary_chunks = await self._embedding_service.embed_chunks(summary_text)
                for chunk_text, embedding in summary_chunks:
                    self._session.add(
                        NoteEmbedding(
                            note_id=note_id,
                            chunk_index=-1,
                            chunk_text=chunk_text,
                            embedding=embedding,
                            chunk_type="summary",
                        )
                    )
                    chunk_index += 1

        await self._session.flush()

        logger.info("Indexed note %d: %d embeddings created", note_id, chunk_index)
        return chunk_index

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

    @staticmethod
    def _build_context_prefix(note: Note) -> str:
        """Build a metadata prefix to prepend to chunk text before embedding.

        Anthropic "Contextual Retrieval" technique: attaching document-level
        context (title, notebook, date) to each chunk improves semantic
        search recall by up to 67%.

        Returns:
            A bracketed metadata string like ``[Note: X | Notebook: Y | Date: Z]\\n``,
            or empty string if the note has no usable metadata.
        """
        parts: list[str] = []
        if note.title:
            parts.append(f"Note: {note.title}")
        if note.notebook_name:
            parts.append(f"Notebook: {note.notebook_name}")
        if note.source_created_at:
            parts.append(f"Date: {note.source_created_at.strftime('%Y-%m-%d')}")
        if not parts:
            return ""
        return f"[{' | '.join(parts)}]\n"

    async def _generate_summary(self, note: Note, text: str) -> str | None:
        """Generate a 2-3 sentence AI summary for the note.

        Returns:
            Summary string, or None if generation fails or no AI router.
        """
        try:
            from app.ai_router.prompts.note_summary import build_messages
            from app.ai_router.schemas import AIRequest

            # Simple language detection: if >15% of chars are CJK, use Korean
            cjk_count = sum(1 for c in text[:500] if "\u4e00" <= c <= "\u9fff" or "\uac00" <= c <= "\ud7af")
            lang = "ko" if cjk_count > len(text[:500]) * 0.15 else "en"

            messages = build_messages(text, lang=lang)
            request = AIRequest(messages=messages, temperature=0.3, max_tokens=300)
            response = await self._ai_router.chat(request)
            summary = (response.content or "").strip()
            if summary:
                logger.info("Generated summary for note %d (%d chars)", note.id, len(summary))
                return summary
        except Exception:
            logger.warning("Failed to generate summary for note %d", note.id, exc_info=True)
        return None

    @staticmethod
    def _detect_attachment_type(name: str | None) -> str:
        """Map attachment filename to a chunk_type string."""
        if not name:
            return "file"
        suffix = PurePosixPath(name).suffix.lower()
        if suffix in (".hwp", ".hwpx"):
            return "hwp"
        if suffix == ".pdf":
            return "pdf"
        if suffix in (".docx", ".doc"):
            return "docx"
        return "file"

    async def _get_attachment_segments(self, note_id: int) -> list[tuple[str, str]]:
        """Return per-attachment ``(text, chunk_type)`` tuples."""
        stmt = select(NoteAttachment.extracted_text, NoteAttachment.name).where(
            NoteAttachment.note_id == note_id,
            NoteAttachment.extraction_status == "completed",
            NoteAttachment.extracted_text.isnot(None),
        )
        result = await self._session.execute(stmt)
        rows = result.fetchall()

        segments: list[tuple[str, str]] = []
        for text, name in rows:
            if text and text.strip():
                chunk_type = self._detect_attachment_type(name)
                segment_text = f"[{chunk_type.upper()}: {name}]\n{text.strip()}"
                segments.append((segment_text, chunk_type))
        return segments

    async def _get_image_segments(self, note: Note) -> list[tuple[str, str]]:
        """Return per-image ``(text, chunk_type)`` tuples for OCR and Vision."""
        if not note.synology_note_id:
            return []

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

        segments: list[tuple[str, str]] = []
        for ocr_text, vision_desc, name in rows:
            if ocr_text and ocr_text.strip():
                cleaned = _clean_ocr_text(ocr_text)
                if cleaned:
                    segments.append((f"[OCR: {name}]\n{cleaned}", "ocr"))
            if vision_desc and vision_desc.strip():
                segments.append((f"[Vision: {name}]\n{vision_desc.strip()}", "vision"))
        return segments

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
