from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import numpy as np
import pytest

from app.models import ClusteringTask, Note, NoteCluster, NoteEmbedding
from app.services.clustering import (
    ClusteringResult,
    ClusterResult,
    cluster_notes,
    compute_centroid,
    fetch_embeddings_for_notebook,
    fetch_note_titles,
    fetch_notes_in_notebook,
    generate_cluster_summary,
    get_cached_clusters,
    run_kmeans_clustering,
    save_clustering_results,
)
from app.tasks.clustering import (
    create_clustering_task,
    generate_task_id,
    get_task_status,
    update_task_status,
)


@pytest.fixture
def sample_embedding() -> list[float]:
    return [0.01 * i for i in range(1536)]


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


@pytest.fixture
def mock_ai_router():
    from app.ai_router.schemas import AIResponse

    router = MagicMock()
    router.chat = AsyncMock(
        return_value=AIResponse(
            content="SUMMARY: Notes about research topics\nKEYWORDS: research, science, data",
            model="gpt-4o-mini",
            provider="openai",
        )
    )
    return router


def test_generate_task_id():
    task_id = generate_task_id()
    assert isinstance(task_id, str)
    assert len(task_id) > 10

    task_id2 = generate_task_id()
    assert task_id != task_id2


def test_run_kmeans_clustering_basic():
    np.random.seed(42)
    embeddings = {
        1: np.random.randn(1536).tolist(),
        2: np.random.randn(1536).tolist(),
        3: np.random.randn(1536).tolist(),
        4: np.random.randn(1536).tolist(),
        5: np.random.randn(1536).tolist(),
    }

    clusters = run_kmeans_clustering(embeddings, num_clusters=2)

    assert len(clusters) == 2

    all_note_ids = set()
    for note_ids in clusters.values():
        all_note_ids.update(note_ids)

    assert all_note_ids == {1, 2, 3, 4, 5}


def test_run_kmeans_clustering_fewer_notes_than_clusters():
    embeddings = {
        1: [0.1] * 1536,
        2: [0.2] * 1536,
    }

    clusters = run_kmeans_clustering(embeddings, num_clusters=5)

    assert len(clusters) <= 2

    all_note_ids = set()
    for note_ids in clusters.values():
        all_note_ids.update(note_ids)

    assert all_note_ids == {1, 2}


def test_run_kmeans_clustering_single_note():
    embeddings = {1: [0.1] * 1536}

    clusters = run_kmeans_clustering(embeddings, num_clusters=3)

    assert len(clusters) == 1
    assert 1 in clusters[0]


def test_compute_centroid_basic():
    embeddings = {
        1: [1.0, 2.0, 3.0],
        2: [3.0, 4.0, 5.0],
    }

    centroid = compute_centroid([1, 2], embeddings)

    assert len(centroid) == 3
    assert centroid[0] == pytest.approx(2.0)
    assert centroid[1] == pytest.approx(3.0)
    assert centroid[2] == pytest.approx(4.0)


def test_compute_centroid_empty():
    embeddings = {}
    centroid = compute_centroid([], embeddings)
    assert centroid == []


def test_compute_centroid_missing_note_ids():
    embeddings = {1: [1.0, 2.0, 3.0]}
    centroid = compute_centroid([1, 99], embeddings)
    assert len(centroid) == 3


@pytest.mark.asyncio
async def test_generate_cluster_summary_basic(mock_ai_router):
    titles = ["Research on AI", "Machine Learning Study", "Deep Learning Notes"]

    summary, keywords = await generate_cluster_summary(mock_ai_router, titles)

    assert "research" in summary.lower() or "notes" in summary.lower()
    assert len(keywords) >= 1
    mock_ai_router.chat.assert_called_once()


@pytest.mark.asyncio
async def test_generate_cluster_summary_empty_titles(mock_ai_router):
    summary, keywords = await generate_cluster_summary(mock_ai_router, [])

    assert summary == ""
    assert keywords == []
    mock_ai_router.chat.assert_not_called()


@pytest.mark.asyncio
async def test_generate_cluster_summary_ai_failure():
    from app.ai_router.router import AIRouter

    router = MagicMock(spec=AIRouter)
    router.chat = AsyncMock(side_effect=Exception("API Error"))

    titles = ["Test Note 1", "Test Note 2"]
    summary, keywords = await generate_cluster_summary(router, titles)

    assert "2 notes" in summary
    assert keywords == []


@pytest.mark.asyncio
async def test_fetch_notes_in_notebook(async_session):
    note1 = Note(synology_note_id="note-1", title="Note 1", notebook_id=1)
    note2 = Note(synology_note_id="note-2", title="Note 2", notebook_id=1)
    note3 = Note(synology_note_id="note-3", title="Note 3", notebook_id=2)

    async_session.add_all([note1, note2, note3])
    await async_session.commit()

    note_ids = await fetch_notes_in_notebook(async_session, notebook_id=1)

    assert len(note_ids) == 2
    assert note1.id in note_ids
    assert note2.id in note_ids
    assert note3.id not in note_ids


@pytest.mark.asyncio
async def test_fetch_embeddings_for_notebook(async_session, sample_embedding):
    note1 = Note(synology_note_id="note-1", title="Note 1", notebook_id=1)
    note2 = Note(synology_note_id="note-2", title="Note 2", notebook_id=1)
    async_session.add_all([note1, note2])
    await async_session.commit()

    emb1 = NoteEmbedding(
        note_id=note1.id,
        chunk_index=0,
        chunk_text="chunk 1",
        embedding=sample_embedding,
    )
    emb2 = NoteEmbedding(
        note_id=note2.id,
        chunk_index=0,
        chunk_text="chunk 2",
        embedding=sample_embedding,
    )
    emb3 = NoteEmbedding(
        note_id=note1.id,
        chunk_index=1,
        chunk_text="chunk 1b",
        embedding=sample_embedding,
    )
    async_session.add_all([emb1, emb2, emb3])
    await async_session.commit()

    embeddings = await fetch_embeddings_for_notebook(async_session, notebook_id=1)

    assert len(embeddings) == 2
    assert note1.id in embeddings
    assert note2.id in embeddings


@pytest.mark.asyncio
async def test_fetch_note_titles(async_session):
    note1 = Note(synology_note_id="note-1", title="Title A", notebook_id=1)
    note2 = Note(synology_note_id="note-2", title="Title B", notebook_id=1)
    async_session.add_all([note1, note2])
    await async_session.commit()

    titles = await fetch_note_titles(async_session, [note1.id, note2.id])

    assert "Title A" in titles
    assert "Title B" in titles


@pytest.mark.asyncio
async def test_fetch_note_titles_empty():
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.all.return_value = []
    mock_db.execute = AsyncMock(return_value=mock_result)

    titles = await fetch_note_titles(mock_db, [])
    assert titles == []


@pytest.mark.asyncio
async def test_cluster_notes_no_embeddings(async_session):
    note1 = Note(synology_note_id="note-1", title="Note 1", notebook_id=1)
    note2 = Note(synology_note_id="note-2", title="Note 2", notebook_id=1)
    async_session.add_all([note1, note2])
    await async_session.commit()

    result = await cluster_notes(async_session, notebook_id=1, num_clusters=2)

    assert len(result.clusters) == 0
    assert len(result.unclustered_note_ids) == 2


@pytest.mark.asyncio
async def test_cluster_notes_with_embeddings(async_session, sample_embedding, mock_ai_router):
    notes = []
    for i in range(10):
        note = Note(synology_note_id=f"note-{i}", title=f"Note {i}", notebook_id=1)
        notes.append(note)

    async_session.add_all(notes)
    await async_session.commit()

    for i, note in enumerate(notes[:8]):
        emb = NoteEmbedding(
            note_id=note.id,
            chunk_index=0,
            chunk_text=f"chunk {i}",
            embedding=[x + i * 0.1 for x in sample_embedding],
        )
        async_session.add(emb)

    await async_session.commit()

    result = await cluster_notes(async_session, notebook_id=1, num_clusters=3, ai_router=mock_ai_router)

    assert len(result.clusters) == 3
    assert len(result.unclustered_note_ids) == 2

    all_clustered = set()
    for cluster in result.clusters:
        assert len(cluster.note_ids) > 0
        all_clustered.update(cluster.note_ids)

    assert len(all_clustered) == 8


@pytest.mark.asyncio
async def test_save_clustering_results(async_session):
    result = ClusteringResult(
        clusters=[
            ClusterResult(
                cluster_index=0,
                note_ids=[1, 2, 3],
                summary="Cluster about research",
                keywords=["research", "science"],
                centroid=[0.1] * 10,
            ),
            ClusterResult(
                cluster_index=1,
                note_ids=[4, 5],
                summary="Cluster about notes",
                keywords=["notes", "data"],
                centroid=[0.2] * 10,
            ),
        ],
        unclustered_note_ids=[6],
    )

    await save_clustering_results(async_session, "test-task-1", notebook_id=1, result=result)

    from sqlalchemy import select

    query = select(NoteCluster).where(NoteCluster.task_id == "test-task-1")
    db_result = await async_session.execute(query)
    clusters = db_result.scalars().all()

    assert len(clusters) == 3

    unclustered = [c for c in clusters if c.cluster_index == -1]
    assert len(unclustered) == 1
    assert 6 in unclustered[0].note_ids


@pytest.mark.asyncio
async def test_get_cached_clusters_found(async_session):
    expires_at = datetime.now(UTC) + timedelta(minutes=5)

    cluster = NoteCluster(
        task_id="test-task-2",
        notebook_id=1,
        cluster_index=0,
        note_ids=[1, 2],
        summary="Test cluster",
        keywords=["test"],
        centroid=[0.1] * 10,
        expires_at=expires_at,
    )
    async_session.add(cluster)
    await async_session.commit()

    result = await get_cached_clusters(async_session, notebook_id=1)

    assert result is not None
    assert len(result) == 1
    assert result[0].task_id == "test-task-2"


@pytest.mark.asyncio
async def test_get_cached_clusters_expired(async_session):
    expires_at = datetime.now(UTC) - timedelta(minutes=5)

    cluster = NoteCluster(
        task_id="test-task-expired",
        notebook_id=1,
        cluster_index=0,
        note_ids=[1, 2],
        summary="Expired cluster",
        keywords=[],
        centroid=[],
        expires_at=expires_at,
    )
    async_session.add(cluster)
    await async_session.commit()

    result = await get_cached_clusters(async_session, notebook_id=1)

    assert result is None


@pytest.mark.asyncio
async def test_create_clustering_task(async_session):
    task_id = await create_clustering_task(
        async_session,
        notebook_id=1,
        num_clusters=5,
        created_by=100,
    )

    assert task_id is not None
    assert len(task_id) > 0

    task = await get_task_status(async_session, task_id)

    assert task is not None
    assert task.notebook_id == 1
    assert task.num_clusters == 5
    assert task.status == "pending"
    assert task.created_by == 100


@pytest.mark.asyncio
async def test_update_task_status_to_processing(async_session):
    task = ClusteringTask(
        task_id="test-task-update",
        notebook_id=1,
        num_clusters=3,
        status="pending",
        created_by=1,
    )
    async_session.add(task)
    await async_session.commit()

    await update_task_status(async_session, "test-task-update", "processing")

    updated = await get_task_status(async_session, "test-task-update")

    assert updated is not None
    assert updated.status == "processing"
    assert updated.started_at is not None


@pytest.mark.asyncio
async def test_update_task_status_to_completed(async_session):
    task = ClusteringTask(
        task_id="test-task-complete",
        notebook_id=1,
        num_clusters=3,
        status="processing",
        created_by=1,
    )
    async_session.add(task)
    await async_session.commit()

    await update_task_status(async_session, "test-task-complete", "completed")

    updated = await get_task_status(async_session, "test-task-complete")

    assert updated is not None
    assert updated.status == "completed"
    assert updated.completed_at is not None


@pytest.mark.asyncio
async def test_update_task_status_to_failed(async_session):
    task = ClusteringTask(
        task_id="test-task-fail",
        notebook_id=1,
        num_clusters=3,
        status="processing",
        created_by=1,
    )
    async_session.add(task)
    await async_session.commit()

    await update_task_status(async_session, "test-task-fail", "failed", "Something went wrong")

    updated = await get_task_status(async_session, "test-task-fail")

    assert updated is not None
    assert updated.status == "failed"
    assert updated.error_message == "Something went wrong"
    assert updated.completed_at is not None


@pytest.mark.asyncio
async def test_get_task_status_not_found(async_session):
    result = await get_task_status(async_session, "nonexistent-task")
    assert result is None


def test_clustering_result_dataclass():
    result = ClusteringResult(
        clusters=[
            ClusterResult(
                cluster_index=0,
                note_ids=[1, 2],
                summary="Test",
                keywords=["a"],
                centroid=[0.1],
            )
        ],
        unclustered_note_ids=[3],
    )

    assert len(result.clusters) == 1
    assert result.unclustered_note_ids == [3]
