from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models import ClusteringTask
from app.services.clustering import cluster_notes, save_clustering_results

logger = logging.getLogger(__name__)

TASK_TIMEOUT_SECONDS = 60


def generate_task_id() -> str:
    return secrets.token_urlsafe(16)


async def create_clustering_task(
    db: AsyncSession,
    notebook_id: int,
    num_clusters: int,
    created_by: int,
) -> str:
    task_id = generate_task_id()
    task = ClusteringTask(
        task_id=task_id,
        notebook_id=notebook_id,
        num_clusters=num_clusters,
        status="pending",
        created_by=created_by,
    )
    db.add(task)
    await db.commit()
    return task_id


async def get_task_status(
    db: AsyncSession,
    task_id: str,
) -> ClusteringTask | None:
    query = select(ClusteringTask).where(ClusteringTask.task_id == task_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def update_task_status(
    db: AsyncSession,
    task_id: str,
    status: str,
    error_message: str | None = None,
) -> None:
    values: dict = {"status": status}

    if status == "processing":
        values["started_at"] = datetime.now(UTC)
    elif status in ("completed", "failed"):
        values["completed_at"] = datetime.now(UTC)
        if error_message:
            values["error_message"] = error_message

    stmt = update(ClusteringTask).where(ClusteringTask.task_id == task_id).values(**values)
    await db.execute(stmt)
    await db.commit()


async def run_clustering_task(task_id: str) -> None:
    async with async_session_factory() as db:
        task = await get_task_status(db, task_id)
        if not task:
            logger.error("Task not found: %s", task_id)
            return

        await update_task_status(db, task_id, "processing")

        try:
            result = await asyncio.wait_for(
                cluster_notes(db, task.notebook_id, task.num_clusters),
                timeout=TASK_TIMEOUT_SECONDS,
            )

            await save_clustering_results(db, task_id, task.notebook_id, result)
            await update_task_status(db, task_id, "completed")
            logger.info("Clustering task completed: %s", task_id)

        except TimeoutError:
            logger.error("Clustering task timed out: %s", task_id)
            await update_task_status(db, task_id, "failed", "Task timed out after 60 seconds")

        except Exception as e:
            logger.exception("Clustering task failed: %s", task_id)
            await update_task_status(db, task_id, "failed", str(e))


def start_clustering_background(task_id: str) -> None:
    asyncio.create_task(run_clustering_task(task_id))
