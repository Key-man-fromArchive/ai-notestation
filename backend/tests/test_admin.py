"""Tests for admin dashboard endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.services.auth_service import create_access_token


def _make_headers(role: str = "owner") -> dict[str, str]:
    """Create auth headers with specified role."""
    token = create_access_token(
        data={
            "sub": "admin@test.com",
            "user_id": 1,
            "org_id": 1,
            "role": role,
        }
    )
    return {"Authorization": f"Bearer {token}"}


def _get_app():
    from app.main import app

    return app


class TestAdminGuard:
    """Test require_admin dependency."""

    @pytest.mark.asyncio
    async def test_rejects_unauthenticated(self):
        transport = ASGITransport(app=_get_app())
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/admin/overview")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_rejects_member_role(self):
        transport = ASGITransport(app=_get_app())
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/admin/overview",
                headers=_make_headers("member"),
            )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_rejects_viewer_role(self):
        transport = ASGITransport(app=_get_app())
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/admin/overview",
                headers=_make_headers("viewer"),
            )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_allows_admin_role(self, test_client: AsyncClient):
        resp = await test_client.get(
            "/api/admin/overview",
            headers=_make_headers("admin"),
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_allows_owner_role(self, test_client: AsyncClient):
        resp = await test_client.get(
            "/api/admin/overview",
            headers=_make_headers("owner"),
        )
        assert resp.status_code == 200


class TestAdminOverview:
    """Test GET /admin/overview."""

    @pytest.mark.asyncio
    async def test_returns_metrics(self, test_client: AsyncClient):
        resp = await test_client.get(
            "/api/admin/overview",
            headers=_make_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "active_users" in data
        assert "total_notes" in data
        assert "total_embeddings" in data
        assert "total_organizations" in data


class TestAdminDbStats:
    """Test GET /admin/db/stats."""

    @pytest.mark.asyncio
    async def test_returns_db_stats(self, test_client: AsyncClient):
        resp = await test_client.get(
            "/api/admin/db/stats",
            headers=_make_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "database_size" in data
        assert "tables" in data
        assert "active_connections" in data
        assert isinstance(data["tables"], list)


class TestAdminDataUsage:
    """Test GET /admin/data/usage."""

    @pytest.mark.asyncio
    async def test_returns_usage(self, test_client: AsyncClient):
        resp = await test_client.get(
            "/api/admin/data/usage",
            headers=_make_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "notes" in data
        assert "embeddings" in data
        assert "images" in data
        assert "storage" in data


class TestAdminUsers:
    """Test GET /admin/users."""

    @pytest.mark.asyncio
    async def test_returns_users_list(self, test_client: AsyncClient):
        resp = await test_client.get(
            "/api/admin/users",
            headers=_make_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "users" in data
        assert isinstance(data["users"], list)
        assert "total" in data

    @pytest.mark.asyncio
    async def test_rejects_member(self):
        transport = ASGITransport(app=_get_app())
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/admin/users",
                headers=_make_headers("member"),
            )
        assert resp.status_code == 403


class TestAdminNasStatus:
    """Test GET /admin/nas/status."""

    @pytest.mark.asyncio
    async def test_returns_nas_status(self, test_client: AsyncClient):
        resp = await test_client.get(
            "/api/admin/nas/status",
            headers=_make_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "configured" in data
        assert "synced_notes" in data


class TestAdminProviders:
    """Test GET /admin/providers."""

    @pytest.mark.asyncio
    async def test_returns_providers(self, test_client: AsyncClient):
        resp = await test_client.get(
            "/api/admin/providers",
            headers=_make_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "providers" in data
        assert isinstance(data["providers"], list)
        assert "total_models" in data
