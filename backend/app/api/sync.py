# @TASK P4-T4.5 - Sync API endpoints
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#sync-api
# @TEST tests/test_api_sync.py

"""Sync API endpoints for manual synchronisation control.

Provides:
- ``POST /sync/trigger``  -- Start a manual NoteStation sync
- ``GET  /sync/status``   -- Query current sync status

Both endpoints require JWT authentication via the ``get_current_user``
dependency.

Sync state is tracked in-memory via :class:`SyncState`. The actual
synchronisation runs as an ``asyncio.Task`` in the background so the
trigger endpoint can return immediately.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel

from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["sync"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class SyncTriggerResponse(BaseModel):
    """Response for the sync trigger endpoint."""

    status: str  # "syncing" | "already_syncing"
    message: str


class SyncStatusResponse(BaseModel):
    """Response for the sync status endpoint."""

    status: str  # "idle" | "syncing" | "completed" | "error"
    last_sync_at: str | None = None
    notes_synced: int | None = None
    error_message: str | None = None


# ---------------------------------------------------------------------------
# In-memory sync state
# ---------------------------------------------------------------------------


class SyncState:
    """Mutable in-memory tracker for synchronisation progress.

    Attributes:
        status: Current sync status (idle / syncing / completed / error).
        is_syncing: Convenience flag indicating whether a sync is running.
        last_sync_at: ISO-8601 timestamp of the last completed sync.
        notes_synced: Total note count from the last successful sync.
        error_message: Error message if the last sync failed.
    """

    def __init__(self) -> None:
        self.status: str = "idle"
        self.is_syncing: bool = False
        self.last_sync_at: str | None = None
        self.notes_synced: int | None = None
        self.error_message: str | None = None


# Module-level singleton -- shared across requests.
_sync_state = SyncState()


# ---------------------------------------------------------------------------
# Background sync runner
# ---------------------------------------------------------------------------


async def _create_sync_service() -> tuple:
    """Create a SyncService instance with database session.

    Returns:
        A tuple of (SyncService, AsyncSession) so the caller can manage
        the session lifecycle.

    Raises:
        Any exception from session creation or service instantiation.
    """
    from app.config import get_settings
    from app.database import async_session_factory
    from app.services.sync_service import SyncService
    from app.synology_gateway.client import SynologyClient
    from app.synology_gateway.notestation import NoteStationService

    settings = get_settings()
    session = async_session_factory()

    client = SynologyClient(
        url=settings.SYNOLOGY_URL,
        user=settings.SYNOLOGY_USER,
        password=settings.SYNOLOGY_PASSWORD,
    )
    await client.login()

    notestation = NoteStationService(client)
    service = SyncService(notestation=notestation, db=session)

    return service, session


async def _run_sync_background(state: SyncState) -> None:
    """Execute the full synchronisation and update *state* accordingly.

    This function is designed to run as a background task. It catches
    all exceptions so that the sync state is always updated even on
    failure.

    Args:
        state: The :class:`SyncState` instance to update.
    """
    state.status = "syncing"
    state.is_syncing = True
    state.error_message = None

    try:
        service, session = await _create_sync_service()
        try:
            result = await service.sync_all()
            await session.commit()

            state.status = "completed"
            state.last_sync_at = result.synced_at.isoformat()
            state.notes_synced = result.total
            state.error_message = None

            logger.info(
                "Sync completed: total=%d, added=%d, updated=%d, deleted=%d",
                result.total,
                result.added,
                result.updated,
                result.deleted,
            )
        finally:
            await session.close()

    except Exception as exc:
        state.status = "error"
        state.error_message = str(exc)
        logger.exception("Sync failed: %s", exc)

    finally:
        state.is_syncing = False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/trigger", response_model=SyncTriggerResponse)
async def trigger_sync(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> SyncTriggerResponse:
    """Manually trigger a NoteStation synchronisation.

    If a sync is already in progress, returns an ``already_syncing``
    status without starting a new one.

    Requires a valid Bearer access token.
    """
    if _sync_state.is_syncing:
        return SyncTriggerResponse(
            status="already_syncing",
            message="이미 동기화가 진행 중입니다.",
        )

    background_tasks.add_task(_run_sync_background, _sync_state)

    return SyncTriggerResponse(
        status="syncing",
        message="동기화를 시작합니다.",
    )


@router.get("/status", response_model=SyncStatusResponse)
async def get_sync_status(
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> SyncStatusResponse:
    """Return the current synchronisation status.

    Requires a valid Bearer access token.
    """
    return SyncStatusResponse(
        status=_sync_state.status,
        last_sync_at=_sync_state.last_sync_at,
        notes_synced=_sync_state.notes_synced,
        error_message=_sync_state.error_message,
    )
