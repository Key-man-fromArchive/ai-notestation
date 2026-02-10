# @TASK P6-T6.2 - Members API tests
# @SPEC docs/plans/phase6-member-auth.md
# @TEST tests/test_api_members.py

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.constants import MemberRole


def _get_app():
    from app.main import app

    return app


def _make_user(user_id: int, email: str, name: str = "", password_hash: str = "", is_active: bool = True):
    user = MagicMock()
    user.id = user_id
    user.email = email
    user.name = name
    user.password_hash = password_hash
    user.is_active = is_active
    user.email_verified = False
    return user


def _make_org(org_id: int, name: str, slug: str):
    org = MagicMock()
    org.id = org_id
    org.name = name
    org.slug = slug
    return org


def _make_membership(
    membership_id: int,
    user_id: int,
    org_id: int,
    role: str = MemberRole.MEMBER,
    accepted_at: datetime | None = None,
    invite_token: str | None = None,
    invite_expires_at: datetime | None = None,
):
    membership = MagicMock()
    membership.id = membership_id
    membership.user_id = user_id
    membership.org_id = org_id
    membership.role = role
    membership.accepted_at = accepted_at
    membership.invite_token = invite_token
    membership.invite_expires_at = invite_expires_at
    membership.invited_by = None
    return membership


class TestSignupValidation:
    @pytest.mark.asyncio
    async def test_signup_rejects_short_password(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/signup",
                json={
                    "email": "short@example.com",
                    "password": "short",
                    "name": "Short Password",
                    "org_name": "Test Org",
                    "org_slug": "test-org-short",
                },
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_signup_rejects_invalid_slug(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/signup",
                json={
                    "email": "slug@example.com",
                    "password": "securepassword123",
                    "name": "Invalid Slug",
                    "org_name": "Test Org",
                    "org_slug": "ab",
                },
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_signup_rejects_invalid_email(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/signup",
                json={
                    "email": "invalid-email",
                    "password": "securepassword123",
                    "name": "Invalid Email",
                    "org_name": "Test Org",
                    "org_slug": "test-org-email",
                },
            )

        assert response.status_code == 422


class TestSignup:
    @pytest.mark.asyncio
    async def test_signup_creates_user_and_org(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.flush = AsyncMock()
        mock_db.add = MagicMock()

        user = _make_user(1, "newuser@example.com", "New User")
        org = _make_org(1, "Test Organization", "test-org-signup")
        membership = _make_membership(1, 1, 1, MemberRole.OWNER, datetime.now(UTC))

        with (
            patch("app.api.members.get_user_by_email", new_callable=AsyncMock, return_value=None),
            patch("app.api.members.get_organization_by_slug", new_callable=AsyncMock, return_value=None),
            patch("app.api.members.create_user", new_callable=AsyncMock, return_value=user),
            patch("app.api.members.create_organization", new_callable=AsyncMock, return_value=org),
            patch("app.api.members.add_member_to_org", new_callable=AsyncMock, return_value=membership),
        ):
            from app.database import get_db

            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/members/signup",
                    json={
                        "email": "newuser@example.com",
                        "password": "securepassword123",
                        "name": "New User",
                        "org_name": "Test Organization",
                        "org_slug": "test-org-signup",
                    },
                )

            app.dependency_overrides.clear()

        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["email"] == "newuser@example.com"
        assert data["name"] == "New User"
        assert data["org_slug"] == "test-org-signup"
        assert data["role"] == MemberRole.OWNER

    @pytest.mark.asyncio
    async def test_signup_rejects_duplicate_email(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()
        existing_user = _make_user(1, "duplicate@example.com", "Existing")

        with patch("app.api.members.get_user_by_email", new_callable=AsyncMock, return_value=existing_user):
            from app.database import get_db

            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/members/signup",
                    json={
                        "email": "duplicate@example.com",
                        "password": "securepassword123",
                        "name": "Duplicate User",
                        "org_name": "Dup Org",
                        "org_slug": "dup-org-test",
                    },
                )

            app.dependency_overrides.clear()

        assert response.status_code == 409
        assert "already registered" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_signup_rejects_duplicate_slug(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()
        existing_org = _make_org(1, "Existing Org", "duplicate-slug-test")

        with (
            patch("app.api.members.get_user_by_email", new_callable=AsyncMock, return_value=None),
            patch("app.api.members.get_organization_by_slug", new_callable=AsyncMock, return_value=existing_org),
        ):
            from app.database import get_db

            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/members/signup",
                    json={
                        "email": "newuser@example.com",
                        "password": "securepassword123",
                        "name": "New User",
                        "org_name": "Another Org",
                        "org_slug": "duplicate-slug-test",
                    },
                )

            app.dependency_overrides.clear()

        assert response.status_code == 409
        assert "slug already taken" in response.json()["detail"]


class TestInvite:
    @pytest.mark.asyncio
    async def test_invite_requires_auth(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/invite",
                json={
                    "email": "noinvite@example.com",
                    "role": MemberRole.MEMBER,
                },
            )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invite_validates_role(self):
        from app.services.auth_service import create_access_token

        app = _get_app()
        transport = ASGITransport(app=app)

        token = create_access_token(data={
            "sub": "admin@example.com",
            "user_id": 1,
            "org_id": 1,
            "role": MemberRole.OWNER,
        })

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/invite",
                json={
                    "email": "invite@example.com",
                    "role": "invalid_role",
                },
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 422


class TestAcceptInvite:
    @pytest.mark.asyncio
    async def test_accept_invalid_token(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        with patch("app.api.members.accept_invite", new_callable=AsyncMock, return_value=None):
            from app.database import get_db

            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/members/accept",
                    json={
                        "token": "invalid-invite-token",
                        "password": "newpassword123",
                    },
                )

            app.dependency_overrides.clear()

        assert response.status_code == 400
        assert "Invalid or expired" in response.json()["detail"]


class TestListMembers:
    @pytest.mark.asyncio
    async def test_list_members_requires_auth(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/members")

        assert response.status_code == 401


class TestUpdateRole:
    @pytest.mark.asyncio
    async def test_update_role_requires_auth(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/members/1/role",
                json={"role": MemberRole.ADMIN},
            )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_update_role_validates_role(self):
        from app.services.auth_service import create_access_token

        app = _get_app()
        transport = ASGITransport(app=app)

        token = create_access_token(data={
            "sub": "admin@example.com",
            "user_id": 1,
            "org_id": 1,
            "role": MemberRole.OWNER,
        })

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/members/1/role",
                json={"role": "invalid_role"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 422
