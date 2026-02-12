from __future__ import annotations

import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Note
from app.services.auth_service import get_current_user
from app.services.graph_service import compute_graph_analysis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/graph", tags=["graph"])

# ---------------------------------------------------------------------------
# Content cap for cluster insight (per note)
# ---------------------------------------------------------------------------
_NOTE_CONTENT_MAX_CHARS = 2000
_CLUSTER_TOTAL_MAX_CHARS = 20_000


class GraphNode(BaseModel):
    id: int
    note_key: str
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
    analysis: dict[str, Any] | None = None


@router.get("", response_model=GlobalGraphResponse)
async def get_global_graph(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    limit: int = Query(200, ge=0, le=5000, description="0 = all indexed notes"),
    similarity_threshold: float = Query(0.5, ge=0.3, le=0.95),
    neighbors_per_note: int = Query(5, ge=1, le=20),
    max_edges: int = Query(0, ge=0, le=10000, description="0 = auto (nodes×3, cap 10000)"),
    include_analysis: bool = Query(False),
) -> GlobalGraphResponse:
    """Get global note graph with similarity-based links.

    Uses the pre-computed note_avg_embeddings materialized view with
    LATERAL JOIN for efficient top-K neighbor lookups per note.

    Parameters:
        limit: Number of nodes (0 = all indexed notes, up to 5000).
        similarity_threshold: Minimum cosine similarity for a link.
        neighbors_per_note: Max neighbors per note (LATERAL JOIN K).
        max_edges: Hard cap on edges (0 = auto = nodes×3, cap 10000).
        include_analysis: Include graph analysis (hub notes, orphans, stats).
    """
    total_result = await db.execute(text("SELECT COUNT(*) FROM notes"))
    total_notes = total_result.scalar() or 0

    indexed_result = await db.execute(
        text("SELECT COUNT(*) FROM note_avg_embeddings")
    )
    indexed_notes = indexed_result.scalar() or 0

    # Fetch nodes: limit=0 means all indexed notes
    notes_query = (
        select(Note.id, Note.synology_note_id, Note.title, Note.notebook_name)
        .where(
            Note.id.in_(
                select(text("note_id")).select_from(text("note_avg_embeddings"))
            )
        )
        .order_by(Note.updated_at.desc())
    )
    if limit > 0:
        notes_query = notes_query.limit(limit)

    result = await db.execute(notes_query)
    notes = result.all()

    nodes = [
        GraphNode(
            id=note_id,
            note_key=synology_note_id,
            label=title or f"Note {note_id}",
            notebook=notebook_name,
            size=1,
        )
        for note_id, synology_note_id, title, notebook_name in notes
    ]

    node_ids = [n.id for n in nodes]
    if len(node_ids) < 2:
        empty_analysis = (
            compute_graph_analysis(
                [n.model_dump() for n in nodes], []
            )
            if include_analysis
            else None
        )
        return GlobalGraphResponse(
            nodes=nodes,
            links=[],
            total_notes=total_notes,
            indexed_notes=indexed_notes,
            analysis=empty_analysis,
        )

    # Compute edge cap
    edge_cap = max_edges if max_edges > 0 else min(len(node_ids) * 3, 10000)

    # LATERAL JOIN: top-K neighbors per note using IVFFlat index
    # When limit=0, node_ids == entire note_avg_embeddings table, so the
    # ANY(:node_ids) filter is redundant and prevents IVFFlat index usage.
    # Removing it drops query time from ~34s to ~0.6s for 2300+ notes.
    if limit == 0:
        similarity_query = text("""
            SELECT DISTINCT ON (LEAST(a.note_id, b.note_id), GREATEST(a.note_id, b.note_id))
                a.note_id AS source,
                b.note_id AS target,
                1 - (a.avg_embedding <=> b.avg_embedding) AS similarity
            FROM note_avg_embeddings a
            CROSS JOIN LATERAL (
                SELECT note_id, avg_embedding
                FROM note_avg_embeddings
                WHERE note_id != a.note_id
                ORDER BY avg_embedding <=> a.avg_embedding
                LIMIT :k
            ) b
            WHERE 1 - (a.avg_embedding <=> b.avg_embedding) > :threshold
            ORDER BY LEAST(a.note_id, b.note_id),
                     GREATEST(a.note_id, b.note_id),
                     similarity DESC
            LIMIT :max_edges
        """)
        query_params = {
            "threshold": similarity_threshold,
            "k": neighbors_per_note,
            "max_edges": edge_cap,
        }
    else:
        similarity_query = text("""
            SELECT DISTINCT ON (LEAST(a.note_id, b.note_id), GREATEST(a.note_id, b.note_id))
                a.note_id AS source,
                b.note_id AS target,
                1 - (a.avg_embedding <=> b.avg_embedding) AS similarity
            FROM note_avg_embeddings a
            CROSS JOIN LATERAL (
                SELECT note_id, avg_embedding
                FROM note_avg_embeddings
                WHERE note_id != a.note_id
                  AND note_id = ANY(:node_ids)
                ORDER BY avg_embedding <=> a.avg_embedding
                LIMIT :k
            ) b
            WHERE a.note_id = ANY(:node_ids)
              AND 1 - (a.avg_embedding <=> b.avg_embedding) > :threshold
            ORDER BY LEAST(a.note_id, b.note_id),
                     GREATEST(a.note_id, b.note_id),
                     similarity DESC
            LIMIT :max_edges
        """)
        query_params = {
            "node_ids": node_ids,
            "threshold": similarity_threshold,
            "k": neighbors_per_note,
            "max_edges": edge_cap,
        }

    try:
        logger.info(
            "Graph query: %d nodes, threshold=%.2f, K=%d, max_edges=%d, mode=%s",
            len(node_ids),
            similarity_threshold,
            neighbors_per_note,
            edge_cap,
            "all" if limit == 0 else "filtered",
        )
        sim_result = await db.execute(similarity_query, query_params)
        similarities = sim_result.all()
        logger.info("Found %d similarity links", len(similarities))

        links = [
            GraphLink(source=src, target=tgt, weight=round(float(sim), 4))
            for src, tgt, sim in similarities
        ]
    except Exception as e:
        logger.error("Similarity query failed: %s", e, exc_info=True)
        links = []

    # Compute analysis if requested
    analysis = None
    if include_analysis:
        analysis = compute_graph_analysis(
            [n.model_dump() for n in nodes],
            [link.model_dump() for link in links],
        )

    return GlobalGraphResponse(
        nodes=nodes,
        links=links,
        total_notes=total_notes,
        indexed_notes=indexed_notes,
        analysis=analysis,
    )


# ---------------------------------------------------------------------------
# Graph semantic search
# ---------------------------------------------------------------------------


class GraphSearchHit(BaseModel):
    note_id: int
    title: str
    score: float
    search_type: str


class GraphSearchResponse(BaseModel):
    hits: list[GraphSearchHit]
    query: str


@router.get("/search", response_model=GraphSearchResponse)
async def graph_search(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    q: str = Query(..., min_length=1),
    limit: int = Query(50, ge=1, le=200),
    search_type: str = Query("hybrid", pattern="^(hybrid|semantic|fts)$"),
) -> GraphSearchResponse:
    """Search notes for graph highlighting using the full search engine.

    Returns note *database IDs* (not synology IDs) so the frontend can
    directly match them against graph node IDs.

    Uses the same API key resolution as the main search endpoint
    (settings DB → env var) and falls back to UnifiedSearchEngine
    (FTS + Trigram) when semantic search is unavailable.

    Parameters:
        q: Search query.
        limit: Max results.
        search_type: "hybrid" (default), "semantic", or "fts".
    """
    from app.api.search import _get_openai_api_key
    from app.config import get_settings
    from app.search.embeddings import EmbeddingService
    from app.search.engine import (
        FullTextSearchEngine,
        HybridSearchEngine,
        SemanticSearchEngine,
        TrigramSearchEngine,
        UnifiedSearchEngine,
    )

    settings = get_settings()
    username = current_user.get("username", "")
    api_key = await _get_openai_api_key(db, username)

    fts = FullTextSearchEngine(session=db)
    trigram = TrigramSearchEngine(session=db)

    if search_type in ("hybrid", "semantic") and api_key:
        embedding_service = EmbeddingService(
            api_key=api_key,
            model=settings.EMBEDDING_MODEL,
        )
        semantic = SemanticSearchEngine(
            session=db, embedding_service=embedding_service
        )
        engine = HybridSearchEngine(fts_engine=fts, semantic_engine=semantic) if search_type == "hybrid" else semantic
    else:
        # Fallback: FTS + Trigram unified search (works without embeddings)
        engine = UnifiedSearchEngine(fts_engine=fts, trigram_engine=trigram)

    search_page = await engine.search(q, limit=limit)

    # Map synology_note_id back to database id for graph matching
    if not search_page.results:
        return GraphSearchResponse(hits=[], query=q)

    synology_ids = [r.note_id for r in search_page.results]
    stmt = select(Note.id, Note.synology_note_id, Note.title).where(
        Note.synology_note_id.in_(synology_ids)
    )
    rows = await db.execute(stmt)
    id_map = {row.synology_note_id: (row.id, row.title) for row in rows.fetchall()}

    hits = []
    for r in search_page.results:
        db_info = id_map.get(r.note_id)
        if db_info:
            hits.append(
                GraphSearchHit(
                    note_id=db_info[0],
                    title=db_info[1] or r.title,
                    score=round(r.score, 4),
                    search_type=r.search_type,
                )
            )

    return GraphSearchResponse(hits=hits, query=q)


# ---------------------------------------------------------------------------
# Cluster insight (SSE streaming)
# ---------------------------------------------------------------------------


class ClusterInsightRequest(BaseModel):
    note_ids: list[int] = Field(..., min_length=2, max_length=30)
    focus: str | None = None
    model: str | None = None


@router.post("/cluster-insight")
async def cluster_insight(
    request: ClusterInsightRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> StreamingResponse:
    """Analyze a cluster of related notes using AI.

    Fetches note content for the given IDs, builds a cluster insight
    prompt, and streams the AI response as SSE events.

    SSE format:
        event: metadata  -> { notes: [{id, title}] }
        data: {chunk}    -> AI text chunks
        data: [DONE]     -> stream end
        event: error     -> error message
    """
    from app.ai_router.prompts import cluster_insight as ci_prompt
    from app.ai_router.schemas import AIRequest
    from app.api.ai import _inject_oauth_if_available, get_ai_router
    from app.services.oauth_service import OAuthService

    # Fetch note content
    stmt = select(
        Note.id, Note.title, Note.content_text, Note.notebook_name
    ).where(Note.id.in_(request.note_ids))
    result = await db.execute(stmt)
    rows = result.fetchall()

    if len(rows) < 2:
        async def not_enough():
            msg = json.dumps(
                {"chunk": "분석할 노트가 충분하지 않습니다. 최소 2개의 노트가 필요합니다."},
                ensure_ascii=False,
            )
            yield f"data: {msg}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            not_enough(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # Build notes list, respecting content limits
    notes_data: list[tuple[str, str]] = []
    notes_meta: list[dict] = []
    remaining = _CLUSTER_TOTAL_MAX_CHARS

    for row in rows:
        title = row.title or f"Note {row.id}"
        content = (row.content_text or "")[:min(_NOTE_CONTENT_MAX_CHARS, remaining)]
        remaining -= len(content)
        notes_data.append((title, content))
        notes_meta.append({"id": row.id, "title": title, "notebook": row.notebook_name})
        if remaining <= 0:
            break

    # Build prompt
    messages = ci_prompt.build_messages(notes=notes_data, focus=request.focus)

    # Get AI router with OAuth support
    ai_router = get_ai_router()
    oauth_service = OAuthService()
    effective_router = await _inject_oauth_if_available(
        ai_router,
        request.model,
        current_user["username"],
        db,
        oauth_service,
    )

    ai_request = AIRequest(
        messages=messages,
        model=request.model,
        stream=True,
    )

    async def event_generator():
        # Emit metadata: which notes are being analyzed
        meta = json.dumps(
            {"notes": notes_meta, "total": len(notes_data)},
            ensure_ascii=False,
        )
        yield f"event: metadata\ndata: {meta}\n\n"

        try:
            async for sse_line in effective_router.stream(ai_request):
                yield sse_line
        except Exception as exc:
            logger.error("Cluster insight stream error: %s", exc, exc_info=True)
            yield f"event: error\ndata: {exc!s}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
