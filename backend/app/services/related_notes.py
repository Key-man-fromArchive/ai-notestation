"""Service for finding semantically related notes.

Given a note's embedding, finds other notes whose embeddings are
closest using pgvector cosine distance.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Note, NoteEmbedding

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class RelatedNoteItem:
    note_id: str
    title: str
    snippet: str
    similarity: float
    notebook: str | None


class RelatedNotesService:
    """Find notes semantically related to a given note."""

    def __init__(self, session: AsyncSession):
        self._session = session

    async def get_related(
        self,
        note_id: str,
        limit: int = 5,
        min_similarity: float = 0.3,
    ) -> list[RelatedNoteItem]:
        """Return notes similar to the given note_id.

        1. Look up the note's internal ID and its embeddings.
        2. Compute average embedding (centroid) for multi-chunk notes.
        3. Query for similar notes using cosine distance.
        4. Deduplicate by note (keep best chunk per note).
        """
        # Resolve internal note ID
        id_stmt = select(Note.id).where(Note.synology_note_id == note_id)
        id_result = await self._session.execute(id_stmt)
        internal_id = id_result.scalar_one_or_none()

        if internal_id is None:
            logger.debug("Note %s not found in database", note_id)
            return []

        # Get embeddings for this note
        emb_stmt = select(NoteEmbedding.embedding).where(
            NoteEmbedding.note_id == internal_id
        )
        emb_result = await self._session.execute(emb_stmt)
        emb_rows = emb_result.all()

        if not emb_rows:
            logger.debug("No embeddings for note %s", note_id)
            return []

        # Compute centroid for multi-chunk notes
        import numpy as np

        vectors = [np.array(row[0], dtype=np.float32) for row in emb_rows]
        centroid = np.mean(vectors, axis=0).tolist()

        # Find similar notes (exclude self)
        fetch_limit = limit * 4
        cosine_dist = NoteEmbedding.embedding.cosine_distance(centroid)

        similar_stmt = (
            select(
                Note.synology_note_id.label("note_id"),
                Note.title,
                NoteEmbedding.chunk_text,
                cosine_dist.label("distance"),
                Note.notebook_name,
            )
            .join(Note, NoteEmbedding.note_id == Note.id)
            .where(Note.id != internal_id)
            .order_by(cosine_dist.asc())
            .limit(fetch_limit)
        )

        result = await self._session.execute(similar_stmt)
        rows = result.all()

        if not rows:
            return []

        # Deduplicate: keep best chunk per note
        seen: dict[str, tuple[float, object]] = {}
        for row in rows:
            similarity = round(1.0 - float(row.distance), 4)
            if similarity < min_similarity:
                continue
            nid = row.note_id
            if nid not in seen or similarity > seen[nid][0]:
                seen[nid] = (similarity, row)

        if not seen:
            return []

        # Sort by similarity descending, take top `limit`
        candidates = sorted(seen.values(), key=lambda x: x[0], reverse=True)[:limit]

        return [
            RelatedNoteItem(
                note_id=row.note_id,
                title=row.title or "",
                snippet=(row.chunk_text or "")[:200].strip(),
                similarity=similarity,
                notebook=row.notebook_name,
            )
            for similarity, row in candidates
        ]
