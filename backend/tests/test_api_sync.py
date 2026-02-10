# @TASK P4-T4.5 - Sync API endpoint tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#sync-api
# @TEST tests/test_api_sync.py

"""Tests for the Sync API endpoints.

Covers:
- POST /api/sync/trigger -- manual sync trigger
- GET /api/sync/status -- sync status inquiry
- JWT authentication enforcement
- Error handling when sync service fails
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_app():
    """Import and return the FastAPI app with sync router included."""
    from app.main import app

    # Ensure sync router is included
    route_paths = [route.path for route in app.routes]
    if "/api/sync/trigger" not in route_paths:
        from app.api.sync import router as sync_router

        app.include_router(sync_router, prefix="/api")
    return app


def _create_test_token(username: str = "testuser@example.com") -> str:
    """Create a valid JWT access token for testing.

    Generates a unified member JWT with user_id, org_id, and role claims.
    """
    from app.services.auth_service import create_access_token

    return create_access_token(data={
        "sub": username,
        "user_id": 1,
        "org_id": 1,
        "role": "owner",
    })


# ---------------------------------------------------------------------------
# POST /api/sync/trigger
# ---------------------------------------------------------------------------


class TestSyncTriggerEndpoint:
    """Test POST /api/sync/trigger endpoint."""

    @pytest.mark.asyncio
    async def test_trigger_success(self):
        """Authenticated trigger should start sync and return syncing status."""
        app = _get_app()
        transport = ASGITransport(app=app)
        token = _create_test_token()

        with patch("app.api.sync._sync_state") as mock_state:
            mock_state.status = "idle"
            mock_state.is_syncing = False

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/sync/trigger",
                    headers={"Authorization": f"Bearer {token}"},
                )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "syncing"
        assert "message" in data

    @pytest.mark.asyncio
    async def test_trigger_already_syncing(self):
        """Trigger while sync is in progress should return already_syncing."""
        app = _get_app()
        transport = ASGITransport(app=app)
        token = _create_test_token()

        with patch("app.api.sync._sync_state") as mock_state:
            mock_state.is_syncing = True

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/sync/trigger",
                    headers={"Authorization": f"Bearer {token}"},
                )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "already_syncing"
        assert "message" in data

    @pytest.mark.asyncio
    async def test_trigger_unauthenticated(self):
        """Request without auth should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/sync/trigger")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_trigger_invalid_token(self):
        """Request with invalid token should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/sync/trigger",
                headers={"Authorization": "Bearer invalid-token"},
            )

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/sync/status
# ---------------------------------------------------------------------------


class TestSyncStatusEndpoint:
    """Test GET /api/sync/status endpoint."""

    @pytest.mark.asyncio
    async def test_status_idle(self):
        """Status should return idle when no sync has run."""
        app = _get_app()
        transport = ASGITransport(app=app)
        token = _create_test_token()

        with patch("app.api.sync._sync_state") as mock_state:
            mock_state.status = "idle"
            mock_state.last_sync_at = None
            mock_state.notes_synced = None
            mock_state.error_message = None

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/sync/status",
                    headers={"Authorization": f"Bearer {token}"},
                )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "idle"
        assert data["last_sync_at"] is None
        assert data["notes_synced"] is None
        assert data["error_message"] is None

    @pytest.mark.asyncio
    async def test_status_syncing(self):
        """Status should return syncing when sync is in progress."""
        app = _get_app()
        transport = ASGITransport(app=app)
        token = _create_test_token()

        with patch("app.api.sync._sync_state") as mock_state:
            mock_state.status = "syncing"
            mock_state.last_sync_at = None
            mock_state.notes_synced = None
            mock_state.error_message = None

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/sync/status",
                    headers={"Authorization": f"Bearer {token}"},
                )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "syncing"

    @pytest.mark.asyncio
    async def test_status_completed(self):
        """Status should return completed with sync details after success."""
        app = _get_app()
        transport = ASGITransport(app=app)
        token = _create_test_token()

        with patch("app.api.sync._sync_state") as mock_state:
            mock_state.status = "completed"
            mock_state.last_sync_at = "2026-01-29T12:00:00+00:00"
            mock_state.notes_synced = 42
            mock_state.error_message = None

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/sync/status",
                    headers={"Authorization": f"Bearer {token}"},
                )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["last_sync_at"] == "2026-01-29T12:00:00+00:00"
        assert data["notes_synced"] == 42
        assert data["error_message"] is None

    @pytest.mark.asyncio
    async def test_status_error(self):
        """Status should return error with message when sync failed."""
        app = _get_app()
        transport = ASGITransport(app=app)
        token = _create_test_token()

        with patch("app.api.sync._sync_state") as mock_state:
            mock_state.status = "error"
            mock_state.last_sync_at = None
            mock_state.notes_synced = None
            mock_state.error_message = "NoteStation connection failed"

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/sync/status",
                    headers={"Authorization": f"Bearer {token}"},
                )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"
        assert data["error_message"] == "NoteStation connection failed"

    @pytest.mark.asyncio
    async def test_status_unauthenticated(self):
        """Request without auth should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/sync/status")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_status_invalid_token(self):
        """Request with invalid token should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/sync/status",
                headers={"Authorization": "Bearer invalid-token"},
            )

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Sync service error handling
# ---------------------------------------------------------------------------


class TestSyncServiceErrorHandling:
    """Test error handling when sync service encounters errors."""

    @pytest.mark.asyncio
    async def test_trigger_service_error_sets_error_state(self):
        """When sync service raises an exception, status should reflect error."""
        from app.api.sync import SyncState, _run_sync_background

        state = SyncState()

        # Mock the sync dependencies to raise an error
        with patch("app.api.sync._create_sync_service", side_effect=Exception("DB connection lost")):
            await _run_sync_background(state)

        assert state.status == "error"
        assert state.error_message is not None
        assert "DB connection lost" in state.error_message

    @pytest.mark.asyncio
    async def test_trigger_service_success_sets_completed_state(self):
        """When sync service completes, status should reflect completed."""
        from app.api.sync import SyncState, _run_sync_background
        from app.services.sync_service import SyncResult

        state = SyncState()

        mock_service = AsyncMock()
        mock_service.sync_all = AsyncMock(return_value=SyncResult(added=5, updated=2, deleted=1, total=42))

        mock_session = AsyncMock()
        mock_session.commit = AsyncMock()
        mock_session.close = AsyncMock()

        with (
            patch("app.api.sync._create_sync_service", return_value=(mock_service, mock_session)),
            patch("app.api.sync._count_notes_missing_images", return_value=0),
            patch("app.api.sync._count_notes_pending_index", return_value=0),
        ):
            await _run_sync_background(state)

        assert state.status == "completed"
        assert state.notes_synced == 42
        assert state.last_sync_at is not None
