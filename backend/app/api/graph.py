from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Note, NoteEmbedding
from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/graph", tags=["graph"])


class GraphNode(BaseModel):
    id: int
    label: str
    notebook: str | None = None
    size: int = 1


class GraphLink(BaseModel):
    source: int
    target: int
    weight: float


class GlobalGraphResponse(BaseModel):
    nodes: list[GraphNode]
    links: list[GraphLink]
    total_notes: int
    indexed_notes: int


@router.get("", response_model=GlobalGraphResponse)
async def get_global_graph(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    limit: int = Query(200, ge=10, le=500),
    similarity_threshold: float = Query(0.5, ge=0.3, le=0.95),
) -> GlobalGraphResponse:
    """Get global note graph with similarity-based links.

    Returns nodes for all indexed notes and links based on
    cosine similarity of embeddings above the threshold.
    """
    total_result = await db.execute(select(text("COUNT(*) FROM notes")))
    total_notes = total_result.scalar() or 0

    indexed_result = await db.execute(select(text("COUNT(DISTINCT note_id) FROM note_embeddings")))
    indexed_notes = indexed_result.scalar() or 0

    notes_query = (
        select(Note.id, Note.title, Note.notebook_name)
        .where(Note.id.in_(select(NoteEmbedding.note_id).distinct()))
        .order_by(Note.updated_at.desc())
        .limit(limit)
    )
    result = await db.execute(notes_query)
    notes = result.all()

    nodes = [
        GraphNode(
            id=note_id,
            label=title or f"Note {note_id}",
            notebook=notebook_name,
            size=1,
        )
        for note_id, title, notebook_name in notes
    ]

    node_ids = [n.id for n in nodes]
    if len(node_ids) < 2:
        return GlobalGraphResponse(
            nodes=nodes,
            links=[],
            total_notes=total_notes,
            indexed_notes=indexed_notes,
        )

    similarity_query = text("""
        WITH note_embeddings_agg AS (
            SELECT note_id, AVG(embedding) as avg_embedding
            FROM note_embeddings
            WHERE note_id = ANY(:node_ids)
            GROUP BY note_id
        )
        SELECT 
            a.note_id as source,
            b.note_id as target,
            1 - (a.avg_embedding <=> b.avg_embedding) as similarity
        FROM note_embeddings_agg a
        CROSS JOIN note_embeddings_agg b
        WHERE a.note_id < b.note_id
          AND 1 - (a.avg_embedding <=> b.avg_embedding) > :threshold
        ORDER BY similarity DESC
        LIMIT 500
    """)

    try:
        logger.info("Graph query: %d nodes, threshold=%.2f", len(node_ids), similarity_threshold)
        sim_result = await db.execute(
            similarity_query,
            {"node_ids": node_ids, "threshold": similarity_threshold},
        )
        similarities = sim_result.all()
        logger.info("Found %d similarity links", len(similarities))

        links = [GraphLink(source=src, target=tgt, weight=float(sim)) for src, tgt, sim in similarities]
    except Exception as e:
        logger.error("Similarity query failed: %s", e, exc_info=True)
        links = []

    return GlobalGraphResponse(
        nodes=nodes,
        links=links,
        total_notes=total_notes,
        indexed_notes=indexed_notes,
    )
