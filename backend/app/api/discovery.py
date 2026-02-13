from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Note, Notebook, NoteCluster
from app.services.auth_service import get_current_user
from app.services.clustering import get_cached_clusters
from app.services.notebook_access_control import check_notebook_access
from app.services.rediscovery import RediscoveryService
from app.tasks.clustering import (
    create_clustering_task,
    get_task_status,
    start_clustering_background,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/discovery", tags=["discovery"])


class ClusterRequest(BaseModel):
    notebook_id: int
    num_clusters: int = 5


class ClusterTaskResponse(BaseModel):
    task_id: str
    status: str


class ClusterStatusResponse(BaseModel):
    task_id: str
    status: str
    error_message: str | None = None
    clusters: list[dict] | None = None


class GraphNode(BaseModel):
    id: int
    label: str
    cluster_id: int


class GraphLink(BaseModel):
    source: int
    target: int
    weight: float = 1.0


class GraphDataResponse(BaseModel):
    nodes: list[GraphNode]
    links: list[GraphLink]
    total_notes: int


class TimelineEntry(BaseModel):
    date: str
    count: int


class TimelineResponse(BaseModel):
    entries: list[TimelineEntry]


class RediscoveryItemResponse(BaseModel):
    note_id: str
    title: str
    snippet: str
    similarity: float
    last_updated: str | None = None
    reason: str


class RediscoveryResponse(BaseModel):
    items: list[RediscoveryItemResponse]


@router.post("/cluster", status_code=202, response_model=ClusterTaskResponse)
async def trigger_clustering(
    request: ClusterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> ClusterTaskResponse:
    notebook = await db.get(Notebook, request.notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if not await check_notebook_access(db, current_user["id"], request.notebook_id):
        raise HTTPException(status_code=403, detail="Access denied")

    if request.num_clusters < 2 or request.num_clusters > 20:
        raise HTTPException(status_code=400, detail="num_clusters must be between 2 and 20")

    task_id = await create_clustering_task(
        db,
        notebook_id=request.notebook_id,
        num_clusters=request.num_clusters,
        created_by=current_user["id"],
    )

    start_clustering_background(task_id)

    return ClusterTaskResponse(task_id=task_id, status="pending")


@router.get("/cluster/{task_id}", response_model=ClusterStatusResponse)
async def get_clustering_status(
    task_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> ClusterStatusResponse:
    task = await get_task_status(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.created_by != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    response = ClusterStatusResponse(
        task_id=task_id,
        status=task.status,
        error_message=task.error_message,
    )

    if task.status == "completed":
        query = select(NoteCluster).where(NoteCluster.task_id == task_id).order_by(NoteCluster.cluster_index)
        result = await db.execute(query)
        clusters = result.scalars().all()

        response.clusters = [
            {
                "cluster_index": c.cluster_index,
                "note_ids": c.note_ids,
                "summary": c.summary,
                "keywords": c.keywords,
            }
            for c in clusters
        ]

    return response


@router.get("/graph", response_model=GraphDataResponse)
async def get_graph_data(
    notebook_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> GraphDataResponse:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if not await check_notebook_access(db, current_user["id"], notebook_id):
        raise HTTPException(status_code=403, detail="Access denied")

    cached = await get_cached_clusters(db, notebook_id)

    nodes: list[GraphNode] = []
    note_to_cluster: dict[int, int] = {}

    if cached:
        for cluster in cached:
            for note_id in cluster.note_ids:
                note_to_cluster[note_id] = cluster.cluster_index

    notes_query = select(Note.id, Note.title).where(Note.notebook_id == notebook_id).limit(50)
    result = await db.execute(notes_query)
    notes = result.all()

    total_count_query = select(func.count(Note.id)).where(Note.notebook_id == notebook_id)
    total_result = await db.execute(total_count_query)
    total_notes = total_result.scalar() or 0

    for note_id, title in notes:
        cluster_id = note_to_cluster.get(note_id, -1)
        nodes.append(GraphNode(id=note_id, label=title or f"Note {note_id}", cluster_id=cluster_id))

    links: list[GraphLink] = []
    if cached and len(nodes) > 1:
        node_ids = {n.id for n in nodes}
        for cluster in cached:
            cluster_notes = [nid for nid in cluster.note_ids if nid in node_ids]
            for i, nid1 in enumerate(cluster_notes):
                for nid2 in cluster_notes[i + 1 :]:
                    links.append(GraphLink(source=nid1, target=nid2, weight=0.5))

    return GraphDataResponse(nodes=nodes, links=links, total_notes=total_notes)


@router.get("/timeline", response_model=TimelineResponse)
async def get_timeline(
    notebook_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> TimelineResponse:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if not await check_notebook_access(db, current_user["id"], notebook_id):
        raise HTTPException(status_code=403, detail="Access denied")

    query = (
        select(
            func.date_trunc("day", Note.created_at).label("day"),
            func.count(Note.id).label("count"),
        )
        .where(Note.notebook_id == notebook_id)
        .group_by(func.date_trunc("day", Note.created_at))
        .order_by(func.date_trunc("day", Note.created_at))
    )
    result = await db.execute(query)
    rows = result.all()

    entries = [TimelineEntry(date=row.day.strftime("%Y-%m-%d"), count=row.count) for row in rows if row.day]

    return TimelineResponse(entries=entries)


@router.get("/rediscovery", response_model=RediscoveryResponse)
async def get_rediscovery(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    limit: int = Query(default=5, ge=1, le=20),
    days_threshold: int = Query(default=30, ge=7, le=365),
) -> RediscoveryResponse:
    """Return forgotten notes that are relevant to recent work."""
    service = RediscoveryService(db)
    try:
        items = await service.get_rediscoveries(
            limit=limit,
            days_threshold=days_threshold,
        )
    except Exception:
        logger.exception("Rediscovery query failed")
        return RediscoveryResponse(items=[])

    return RediscoveryResponse(
        items=[
            RediscoveryItemResponse(
                note_id=item.note_id,
                title=item.title,
                snippet=item.snippet,
                similarity=item.similarity,
                last_updated=item.last_updated,
                reason=item.reason,
            )
            for item in items
        ]
    )
