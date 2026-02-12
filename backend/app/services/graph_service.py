"""Graph service: materialized view refresh and graph analysis computation."""

from __future__ import annotations

import logging
from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def refresh_avg_embeddings(db: AsyncSession) -> None:
    """Refresh the note_avg_embeddings materialized view.

    Should be called after sync or indexing completes.
    Uses CONCURRENTLY to avoid locking reads during refresh.
    """
    try:
        await db.execute(text(
            "REFRESH MATERIALIZED VIEW CONCURRENTLY note_avg_embeddings"
        ))
        await db.commit()
        logger.info("Refreshed note_avg_embeddings materialized view")
    except Exception:
        logger.exception("Failed to refresh note_avg_embeddings")
        await db.rollback()


def compute_graph_analysis(
    nodes: list[dict],
    links: list[dict],
) -> dict:
    """Compute graph analysis metrics from nodes and links.

    Returns hub notes, orphan notes, network stats, and cluster summary.
    """
    node_ids = {n["id"] for n in nodes}
    node_map = {n["id"]: n for n in nodes}

    # Build adjacency / degree map
    degree: dict[int, int] = defaultdict(int)
    notebook_edges: dict[str | None, int] = defaultdict(int)
    notebook_edge_weights: dict[str | None, list[float]] = defaultdict(list)

    for link in links:
        src, tgt = link["source"], link["target"]
        degree[src] += 1
        degree[tgt] += 1

        # Cluster summary: count edges within same notebook
        src_nb = node_map.get(src, {}).get("notebook")
        tgt_nb = node_map.get(tgt, {}).get("notebook")
        if src_nb == tgt_nb and src_nb is not None:
            notebook_edges[src_nb] += 1
            notebook_edge_weights[src_nb].append(link["weight"])

    # Hub notes (top-10 by degree)
    hub_notes = sorted(
        [
            {
                "id": nid,
                "note_key": node_map[nid].get("note_key", ""),
                "label": node_map[nid]["label"],
                "degree": degree[nid],
            }
            for nid in degree
            if nid in node_map
        ],
        key=lambda x: x["degree"],
        reverse=True,
    )[:10]

    # Orphan notes (0 connections)
    connected = set(degree.keys())
    orphan_ids = node_ids - connected
    orphan_notes = [
        {
            "id": nid,
            "note_key": node_map[nid].get("note_key", ""),
            "label": node_map[nid]["label"],
        }
        for nid in orphan_ids
        if nid in node_map
    ]

    # Network stats
    num_nodes = len(nodes)
    num_edges = len(links)
    degrees = list(degree.values())
    avg_degree = sum(degrees) / num_nodes if num_nodes > 0 else 0
    max_possible_edges = num_nodes * (num_nodes - 1) / 2 if num_nodes > 1 else 1
    density = num_edges / max_possible_edges

    # Connected components via BFS
    adjacency: dict[int, set[int]] = defaultdict(set)
    for link in links:
        adjacency[link["source"]].add(link["target"])
        adjacency[link["target"]].add(link["source"])

    visited: set[int] = set()
    components = 0
    for nid in node_ids:
        if nid not in visited:
            components += 1
            stack = [nid]
            while stack:
                current = stack.pop()
                if current in visited:
                    continue
                visited.add(current)
                stack.extend(adjacency[current] - visited)

    # Cluster summary by notebook
    notebook_counts: dict[str | None, int] = defaultdict(int)
    for n in nodes:
        notebook_counts[n["notebook"]] += 1

    cluster_summary = []
    for nb, count in sorted(notebook_counts.items(), key=lambda x: x[1], reverse=True):
        weights = notebook_edge_weights.get(nb, [])
        cluster_summary.append({
            "notebook": nb or "(분류 없음)",
            "note_count": count,
            "edge_count": notebook_edges.get(nb, 0),
            "avg_similarity": round(sum(weights) / len(weights), 3) if weights else 0,
        })

    return {
        "hub_notes": hub_notes,
        "orphan_notes": orphan_notes,
        "orphan_count": len(orphan_notes),
        "network_stats": {
            "nodes": num_nodes,
            "edges": num_edges,
            "avg_degree": round(avg_degree, 2),
            "density": round(density, 6),
            "components": components,
        },
        "cluster_summary": cluster_summary,
    }
