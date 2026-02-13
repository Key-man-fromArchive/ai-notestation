"""Service for rediscovering forgotten but relevant notes.

Computes the centroid of recent note embeddings and finds old notes
whose embeddings are close to the centroid, surfacing forgotten notes
that are relevant to the user's current work.
"""

from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Note, NoteEmbedding

logger = logging.getLogger(__name__)


class RediscoveryItem:
    __slots__ = ("note_id", "title", "snippet", "similarity", "last_updated", "reason")

    def __init__(
        self,
        note_id: str,
        title: str,
        snippet: str,
        similarity: float,
        last_updated: str | None,
        reason: str,
    ):
        self.note_id = note_id
        self.title = title
        self.snippet = snippet
        self.similarity = similarity
        self.last_updated = last_updated
        self.reason = reason


class RediscoveryService:
    """Find forgotten notes that are relevant to recent work."""

    def __init__(self, session: AsyncSession):
        self._session = session

    async def get_rediscoveries(
        self,
        limit: int = 5,
        days_threshold: int = 30,
        recent_count: int = 10,
        min_similarity: float = 0.3,
    ) -> list[RediscoveryItem]:
        """Return forgotten notes similar to the user's recent work.

        1. Find embeddings of the N most recently modified notes.
        2. Compute the average (centroid) embedding.
        3. Query for old notes (not updated in ``days_threshold`` days)
           whose embeddings are close to the centroid.
        4. Add slight randomness so results vary between calls.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_threshold)

        # --- 1. Get IDs of recent notes ---
        recent_ids_stmt = (
            select(Note.id)
            .where(Note.source_updated_at.is_not(None))
            .order_by(Note.source_updated_at.desc())
            .limit(recent_count)
        )
        recent_result = await self._session.execute(recent_ids_stmt)
        recent_note_ids = [row[0] for row in recent_result.all()]

        if not recent_note_ids:
            logger.debug("No recent notes found for rediscovery")
            return []

        # --- 2. Compute centroid in Python (pgvector AVG returns text) ---
        emb_stmt = select(NoteEmbedding.embedding).where(
            NoteEmbedding.note_id.in_(recent_note_ids)
        )
        emb_result = await self._session.execute(emb_stmt)
        emb_rows = emb_result.all()

        if not emb_rows:
            logger.debug("No embeddings found for recent notes")
            return []

        vectors = [np.array(row[0], dtype=np.float32) for row in emb_rows]
        centroid = np.mean(vectors, axis=0).tolist()

        # --- 3. Find old notes close to the centroid ---
        # Fetch more candidates than needed, then sample for randomness.
        fetch_limit = limit * 4
        cosine_dist = NoteEmbedding.embedding.cosine_distance(centroid)

        old_notes_stmt = (
            select(
                Note.synology_note_id.label("note_id"),
                Note.title,
                NoteEmbedding.chunk_text,
                cosine_dist.label("distance"),
                Note.source_updated_at,
            )
            .join(Note, NoteEmbedding.note_id == Note.id)
            .where(
                Note.source_updated_at < cutoff,
                Note.id.notin_(recent_note_ids),
            )
            .order_by(cosine_dist.asc())
            .limit(fetch_limit)
        )

        result = await self._session.execute(old_notes_stmt)
        rows = result.all()

        if not rows:
            return []

        # --- 4. Filter by similarity threshold & deduplicate by note_id ---
        seen: dict[str, tuple] = {}
        for row in rows:
            similarity = round(1.0 - float(row.distance), 4)
            if similarity < min_similarity:
                continue
            nid = row.note_id
            if nid not in seen or similarity > seen[nid][0]:
                seen[nid] = (similarity, row)

        candidates = list(seen.values())
        if not candidates:
            return []

        # Random sample from top candidates
        selected = random.sample(candidates, min(limit, len(candidates)))
        # Sort selected by similarity descending
        selected.sort(key=lambda x: x[0], reverse=True)

        items: list[RediscoveryItem] = []
        for similarity, row in selected:
            snippet = (row.chunk_text or "")[:200].strip()
            updated_iso = (
                row.source_updated_at.isoformat()
                if row.source_updated_at
                else None
            )
            days_ago = (
                (datetime.now(timezone.utc) - row.source_updated_at).days
                if row.source_updated_at
                else None
            )
            reason = f"{days_ago}d ago, {similarity:.0%} similar" if days_ago else ""

            items.append(
                RediscoveryItem(
                    note_id=row.note_id,
                    title=row.title or "",
                    snippet=snippet,
                    similarity=similarity,
                    last_updated=updated_iso,
                    reason=reason,
                )
            )

        return items
