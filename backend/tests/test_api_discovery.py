from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.api.discovery import (
    ClusterRequest,
    ClusterStatusResponse,
    ClusterTaskResponse,
    GraphDataResponse,
    GraphLink,
    GraphNode,
    TimelineEntry,
    TimelineResponse,
)
from app.models import ClusteringTask, Note, NoteCluster, Notebook
from app.services.clustering import get_cached_clusters
from app.tasks.clustering import create_clustering_task, get_task_status


@pytest.mark.asyncio
async def test_cluster_request_model():
    request = ClusterRequest(notebook_id=1, num_clusters=5)
    assert request.notebook_id == 1
    assert request.num_clusters == 5


@pytest.mark.asyncio
async def test_cluster_request_default_clusters():
    request = ClusterRequest(notebook_id=1)
    assert request.num_clusters == 5


@pytest.mark.asyncio
async def test_cluster_task_response_model():
    response = ClusterTaskResponse(task_id="abc123", status="pending")
    assert response.task_id == "abc123"
    assert response.status == "pending"


@pytest.mark.asyncio
async def test_cluster_status_response_model():
    response = ClusterStatusResponse(
        task_id="abc123",
        status="completed",
        clusters=[{"cluster_index": 0, "note_ids": [1, 2], "summary": "Test"}],
    )
    assert response.task_id == "abc123"
    assert response.status == "completed"
    assert len(response.clusters) == 1


@pytest.mark.asyncio
async def test_graph_node_model():
    node = GraphNode(id=1, label="Test Note", cluster_id=0)
    assert node.id == 1
    assert node.label == "Test Note"
    assert node.cluster_id == 0


@pytest.mark.asyncio
async def test_graph_link_model():
    link = GraphLink(source=1, target=2, weight=0.5)
    assert link.source == 1
    assert link.target == 2
    assert link.weight == 0.5


@pytest.mark.asyncio
async def test_graph_link_default_weight():
    link = GraphLink(source=1, target=2)
    assert link.weight == 1.0


@pytest.mark.asyncio
async def test_graph_data_response_model():
    response = GraphDataResponse(
        nodes=[GraphNode(id=1, label="Note 1", cluster_id=0)],
        links=[GraphLink(source=1, target=2)],
        total_notes=10,
    )
    assert len(response.nodes) == 1
    assert len(response.links) == 1
    assert response.total_notes == 10


@pytest.mark.asyncio
async def test_timeline_entry_model():
    entry = TimelineEntry(date="2024-01-15", count=5)
    assert entry.date == "2024-01-15"
    assert entry.count == 5


@pytest.mark.asyncio
async def test_timeline_response_model():
    response = TimelineResponse(
        entries=[
            TimelineEntry(date="2024-01-15", count=5),
            TimelineEntry(date="2024-01-16", count=3),
        ]
    )
    assert len(response.entries) == 2


@pytest.mark.asyncio
async def test_create_task_and_get_status(async_session):
    task_id = await create_clustering_task(
        async_session,
        notebook_id=1,
        num_clusters=3,
        created_by=100,
    )

    task = await get_task_status(async_session, task_id)

    assert task is not None
    assert task.task_id == task_id
    assert task.notebook_id == 1
    assert task.num_clusters == 3
    assert task.status == "pending"
    assert task.created_by == 100


@pytest.mark.asyncio
async def test_get_task_status_not_found(async_session):
    task = await get_task_status(async_session, "nonexistent-task-id")
    assert task is None


@pytest.mark.asyncio
async def test_get_cached_clusters_returns_none_when_empty(async_session):
    result = await get_cached_clusters(async_session, notebook_id=9999)
    assert result is None


@pytest.mark.asyncio
async def test_get_cached_clusters_returns_data(async_session):
    expires_at = datetime.now(UTC) + timedelta(minutes=5)

    cluster = NoteCluster(
        task_id="test-cached-task",
        notebook_id=42,
        cluster_index=0,
        note_ids=[1, 2, 3],
        summary="Test cluster summary",
        keywords=["test", "cluster"],
        centroid=[0.1] * 10,
        expires_at=expires_at,
    )
    async_session.add(cluster)
    await async_session.commit()

    result = await get_cached_clusters(async_session, notebook_id=42)

    assert result is not None
    assert len(result) == 1
    assert result[0].summary == "Test cluster summary"


@pytest.mark.asyncio
async def test_get_cached_clusters_excludes_expired(async_session):
    expired_at = datetime.now(UTC) - timedelta(minutes=5)

    cluster = NoteCluster(
        task_id="test-expired-task",
        notebook_id=43,
        cluster_index=0,
        note_ids=[1, 2],
        summary="Expired cluster",
        keywords=[],
        centroid=[],
        expires_at=expired_at,
    )
    async_session.add(cluster)
    await async_session.commit()

    result = await get_cached_clusters(async_session, notebook_id=43)

    assert result is None


@pytest.mark.asyncio
async def test_notes_in_notebook_limited_to_50(async_session):
    notebook = Notebook(name="Large Notebook", owner_id=1)
    async_session.add(notebook)
    await async_session.commit()

    for i in range(60):
        note = Note(
            synology_note_id=f"limit-note-{i}",
            title=f"Note {i}",
            notebook_id=notebook.id,
        )
        async_session.add(note)
    await async_session.commit()

    query = select(Note.id).where(Note.notebook_id == notebook.id).limit(50)
    result = await async_session.execute(query)
    notes = result.all()

    assert len(notes) == 50


@pytest.mark.asyncio
async def test_clustering_task_lifecycle(async_session):
    task = ClusteringTask(
        task_id="lifecycle-test",
        notebook_id=1,
        num_clusters=3,
        status="pending",
        created_by=1,
    )
    async_session.add(task)
    await async_session.commit()

    result = await async_session.execute(select(ClusteringTask).where(ClusteringTask.task_id == "lifecycle-test"))
    saved_task = result.scalar_one()
    assert saved_task.status == "pending"

    saved_task.status = "processing"
    saved_task.started_at = datetime.now(UTC)
    await async_session.commit()

    result = await async_session.execute(select(ClusteringTask).where(ClusteringTask.task_id == "lifecycle-test"))
    updated_task = result.scalar_one()
    assert updated_task.status == "processing"
    assert updated_task.started_at is not None

    updated_task.status = "completed"
    updated_task.completed_at = datetime.now(UTC)
    await async_session.commit()

    result = await async_session.execute(select(ClusteringTask).where(ClusteringTask.task_id == "lifecycle-test"))
    final_task = result.scalar_one()
    assert final_task.status == "completed"
    assert final_task.completed_at is not None


@pytest.mark.asyncio
async def test_note_cluster_with_unclustered(async_session):
    expires_at = datetime.now(UTC) + timedelta(minutes=5)

    cluster1 = NoteCluster(
        task_id="unclustered-test",
        notebook_id=50,
        cluster_index=0,
        note_ids=[1, 2],
        summary="Cluster 0",
        keywords=[],
        centroid=[],
        expires_at=expires_at,
    )
    unclustered = NoteCluster(
        task_id="unclustered-test",
        notebook_id=50,
        cluster_index=-1,
        note_ids=[3, 4],
        summary="Notes without embeddings",
        keywords=[],
        centroid=[],
        expires_at=expires_at,
    )
    async_session.add_all([cluster1, unclustered])
    await async_session.commit()

    result = await get_cached_clusters(async_session, notebook_id=50)

    assert result is not None
    assert len(result) == 2

    cluster_indices = [c.cluster_index for c in result]
    assert -1 in cluster_indices
    assert 0 in cluster_indices
