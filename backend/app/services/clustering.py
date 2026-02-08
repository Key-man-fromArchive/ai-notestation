from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import numpy as np
from sklearn.cluster import KMeans
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_router.router import AIRouter
from app.ai_router.schemas import AIRequest, Message
from app.models import Note, NoteCluster, NoteEmbedding

logger = logging.getLogger(__name__)

CLUSTER_TTL_MINUTES = 5


@dataclass
class ClusterResult:
    cluster_index: int
    note_ids: list[int]
    summary: str
    keywords: list[str]
    centroid: list[float]


@dataclass
class ClusteringResult:
    clusters: list[ClusterResult]
    unclustered_note_ids: list[int]


async def fetch_embeddings_for_notebook(
    db: AsyncSession,
    notebook_id: int,
) -> dict[int, list[float]]:
    query = (
        select(NoteEmbedding.note_id, NoteEmbedding.embedding)
        .join(Note, Note.id == NoteEmbedding.note_id)
        .where(Note.notebook_id == notebook_id)
        .where(NoteEmbedding.chunk_index == 0)
    )
    result = await db.execute(query)
    rows = result.all()

    note_embeddings: dict[int, list[float]] = {}
    for note_id, embedding in rows:
        if embedding is not None:
            note_embeddings[note_id] = list(embedding)

    return note_embeddings


async def fetch_notes_in_notebook(
    db: AsyncSession,
    notebook_id: int,
) -> list[int]:
    query = select(Note.id).where(Note.notebook_id == notebook_id)
    result = await db.execute(query)
    return [row[0] for row in result.all()]


def run_kmeans_clustering(
    note_embeddings: dict[int, list[float]],
    num_clusters: int,
) -> dict[int, list[int]]:
    if len(note_embeddings) < num_clusters:
        num_clusters = max(1, len(note_embeddings))

    note_ids = list(note_embeddings.keys())
    embeddings_matrix = np.array([note_embeddings[nid] for nid in note_ids])

    kmeans = KMeans(n_clusters=num_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(embeddings_matrix)

    clusters: dict[int, list[int]] = {}
    for i, label in enumerate(labels):
        label_int = int(label)
        if label_int not in clusters:
            clusters[label_int] = []
        clusters[label_int].append(note_ids[i])

    return clusters


def compute_centroid(
    note_ids: list[int],
    note_embeddings: dict[int, list[float]],
) -> list[float]:
    embeddings = [note_embeddings[nid] for nid in note_ids if nid in note_embeddings]
    if not embeddings:
        return []
    return np.mean(embeddings, axis=0).tolist()


async def fetch_note_titles(
    db: AsyncSession,
    note_ids: list[int],
) -> list[str]:
    if not note_ids:
        return []
    query = select(Note.title).where(Note.id.in_(note_ids))
    result = await db.execute(query)
    return [row[0] for row in result.all() if row[0]]


async def generate_cluster_summary(
    ai_router: AIRouter,
    titles: list[str],
) -> tuple[str, list[str]]:
    if not titles:
        return "", []

    titles_text = "\n".join(f"- {t}" for t in titles[:20])

    prompt = f"""Analyze these note titles and provide:
1. A brief summary (1-2 sentences) describing the common theme
2. 3-5 keywords that capture the main topics

Note titles:
{titles_text}

Respond in this exact format:
SUMMARY: <your summary>
KEYWORDS: <keyword1>, <keyword2>, <keyword3>"""

    try:
        request = AIRequest(
            messages=[Message(role="user", content=prompt)],
            temperature=0.3,
            max_tokens=200,
        )
        response = await ai_router.chat(request)
        content = response.content

        summary = ""
        keywords: list[str] = []

        for line in content.split("\n"):
            line = line.strip()
            if line.startswith("SUMMARY:"):
                summary = line[8:].strip()
            elif line.startswith("KEYWORDS:"):
                kw_text = line[9:].strip()
                keywords = [k.strip() for k in kw_text.split(",") if k.strip()]

        return summary, keywords
    except Exception as e:
        logger.warning("Failed to generate cluster summary: %s", e)
        return f"Cluster with {len(titles)} notes", []


async def cluster_notes(
    db: AsyncSession,
    notebook_id: int,
    num_clusters: int = 5,
    ai_router: AIRouter | None = None,
) -> ClusteringResult:
    all_note_ids = await fetch_notes_in_notebook(db, notebook_id)
    note_embeddings = await fetch_embeddings_for_notebook(db, notebook_id)

    notes_with_embeddings = set(note_embeddings.keys())
    unclustered = [nid for nid in all_note_ids if nid not in notes_with_embeddings]

    if not note_embeddings:
        return ClusteringResult(clusters=[], unclustered_note_ids=unclustered)

    cluster_assignments = run_kmeans_clustering(note_embeddings, num_clusters)

    if ai_router is None:
        ai_router = AIRouter()

    results: list[ClusterResult] = []
    for cluster_idx, note_ids_in_cluster in cluster_assignments.items():
        titles = await fetch_note_titles(db, note_ids_in_cluster)
        summary, keywords = await generate_cluster_summary(ai_router, titles)
        centroid = compute_centroid(note_ids_in_cluster, note_embeddings)

        results.append(
            ClusterResult(
                cluster_index=cluster_idx,
                note_ids=note_ids_in_cluster,
                summary=summary,
                keywords=keywords,
                centroid=centroid,
            )
        )

    results.sort(key=lambda c: c.cluster_index)

    return ClusteringResult(clusters=results, unclustered_note_ids=unclustered)


async def save_clustering_results(
    db: AsyncSession,
    task_id: str,
    notebook_id: int,
    result: ClusteringResult,
) -> None:
    expires_at = datetime.now(UTC) + timedelta(minutes=CLUSTER_TTL_MINUTES)

    for cluster in result.clusters:
        db_cluster = NoteCluster(
            task_id=task_id,
            notebook_id=notebook_id,
            cluster_index=cluster.cluster_index,
            note_ids=cluster.note_ids,
            summary=cluster.summary,
            keywords=cluster.keywords,
            centroid=cluster.centroid,
            expires_at=expires_at,
        )
        db.add(db_cluster)

    if result.unclustered_note_ids:
        unclustered_cluster = NoteCluster(
            task_id=task_id,
            notebook_id=notebook_id,
            cluster_index=-1,
            note_ids=result.unclustered_note_ids,
            summary="Notes without embeddings",
            keywords=[],
            centroid=[],
            expires_at=expires_at,
        )
        db.add(unclustered_cluster)

    await db.commit()


async def get_cached_clusters(
    db: AsyncSession,
    notebook_id: int,
) -> list[NoteCluster] | None:
    now = datetime.now(UTC)
    query = (
        select(NoteCluster)
        .where(NoteCluster.notebook_id == notebook_id)
        .where(NoteCluster.expires_at > now)
        .order_by(NoteCluster.cluster_index)
    )
    result = await db.execute(query)
    clusters = list(result.scalars().all())

    return clusters if clusters else None
