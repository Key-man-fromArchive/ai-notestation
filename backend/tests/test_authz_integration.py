# @TASK P6-T6.6 - Authorization & Security Integration Tests
# @SPEC docs/plans/phase6-member-auth.md
# @TEST tests/test_authz_integration.py

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.constants import MemberRole
from app.services.auth_service import create_access_token, create_refresh_token


def _get_app():
    from app.main import app

    return app


def _make_user(user_id: int, email: str, name: str = "", is_active: bool = True):
    user = MagicMock()
    user.id = user_id
    user.email = email
    user.name = name
    user.password_hash = "hashed"
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
):
    membership = MagicMock()
    membership.id = membership_id
    membership.user_id = user_id
    membership.org_id = org_id
    membership.role = role
    membership.accepted_at = accepted_at or datetime.now(UTC)
    membership.invite_token = None
    membership.invite_expires_at = None
    membership.invited_by = None
    return membership


def _create_auth_token(user_id: int, org_id: int, role: str, email: str = "test@example.com") -> str:
    return create_access_token(
        data={
            "sub": email,
            "user_id": user_id,
            "org_id": org_id,
            "role": role,
        }
    )


class TestRoleBasedInviteAccess:
    @pytest.mark.asyncio
    async def test_owner_can_invite_members(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        new_membership = _make_membership(2, 2, 1, MemberRole.MEMBER, None)
        new_membership.invite_expires_at = datetime.now(UTC)

        token = _create_auth_token(1, 1, MemberRole.OWNER, "owner@example.com")

        with (
            patch("app.api.members.get_user_by_email", new_callable=AsyncMock, return_value=None),
            patch(
                "app.api.members.create_invite", new_callable=AsyncMock, return_value=(new_membership, "invite-token")
            ),
        ):
            from app.database import get_db

            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/members/invite",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"email": "newmember@example.com", "role": MemberRole.MEMBER},
                )

            app.dependency_overrides.clear()

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_admin_can_invite_members(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        new_membership = _make_membership(2, 2, 1, MemberRole.MEMBER, None)
        new_membership.invite_expires_at = datetime.now(UTC)

        token = _create_auth_token(1, 1, MemberRole.ADMIN, "admin@example.com")

        with (
            patch("app.api.members.get_user_by_email", new_callable=AsyncMock, return_value=None),
            patch(
                "app.api.members.create_invite", new_callable=AsyncMock, return_value=(new_membership, "invite-token")
            ),
        ):
            from app.database import get_db

            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/members/invite",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"email": "newmember@example.com", "role": MemberRole.MEMBER},
                )

            app.dependency_overrides.clear()

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_member_cannot_invite(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()

        token = _create_auth_token(1, 1, MemberRole.MEMBER, "member@example.com")

        from app.database import get_db

        app.dependency_overrides[get_db] = lambda: mock_db

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/invite",
                headers={"Authorization": f"Bearer {token}"},
                json={"email": "newmember@example.com", "role": MemberRole.MEMBER},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 403
        assert "OWNER or ADMIN" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_viewer_cannot_invite(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()

        token = _create_auth_token(1, 1, MemberRole.VIEWER, "viewer@example.com")

        from app.database import get_db

        app.dependency_overrides[get_db] = lambda: mock_db

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/invite",
                headers={"Authorization": f"Bearer {token}"},
                json={"email": "newmember@example.com", "role": MemberRole.MEMBER},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 403
        assert "OWNER or ADMIN" in response.json()["detail"]


class TestRoleBasedRoleChangeAccess:
    @pytest.mark.asyncio
    async def test_owner_can_change_any_role(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        target_user = _make_user(2, "target@example.com", "Target")
        target_membership = _make_membership(2, 2, 1, MemberRole.MEMBER)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=target_membership)
        mock_db.execute = AsyncMock(return_value=mock_result)

        token = _create_auth_token(1, 1, MemberRole.OWNER, "owner@example.com")

        with patch("app.api.members.get_user_by_id", new_callable=AsyncMock, return_value=target_user):
            from app.database import get_db

            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.put(
                    "/api/members/2/role",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"role": MemberRole.ADMIN},
                )

            app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()["role"] == MemberRole.ADMIN

    @pytest.mark.asyncio
    async def test_admin_can_change_non_owner_roles(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        target_user = _make_user(2, "target@example.com", "Target")
        target_membership = _make_membership(2, 2, 1, MemberRole.MEMBER)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=target_membership)
        mock_db.execute = AsyncMock(return_value=mock_result)

        token = _create_auth_token(1, 1, MemberRole.ADMIN, "admin@example.com")

        with patch("app.api.members.get_user_by_id", new_callable=AsyncMock, return_value=target_user):
            from app.database import get_db

            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.put(
                    "/api/members/2/role",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"role": MemberRole.VIEWER},
                )

            app.dependency_overrides.clear()

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_admin_cannot_transfer_ownership(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()

        token = _create_auth_token(1, 1, MemberRole.ADMIN, "admin@example.com")

        from app.database import get_db

        app.dependency_overrides[get_db] = lambda: mock_db

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/members/2/role",
                headers={"Authorization": f"Bearer {token}"},
                json={"role": MemberRole.OWNER},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 403
        assert "Only OWNER can transfer ownership" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_member_cannot_change_roles(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()

        token = _create_auth_token(1, 1, MemberRole.MEMBER, "member@example.com")

        from app.database import get_db

        app.dependency_overrides[get_db] = lambda: mock_db

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/members/2/role",
                headers={"Authorization": f"Bearer {token}"},
                json={"role": MemberRole.VIEWER},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 403
        assert "OWNER or ADMIN" in response.json()["detail"]


class TestOwnershipProtection:
    @pytest.mark.asyncio
    async def test_cannot_demote_only_owner(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()

        owner_user = _make_user(1, "owner@example.com", "Owner")
        owner_membership = _make_membership(1, 1, 1, MemberRole.OWNER)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=owner_membership)
        mock_db.execute = AsyncMock(return_value=mock_result)

        token = _create_auth_token(1, 1, MemberRole.OWNER, "owner@example.com")

        with (
            patch("app.api.members.get_user_by_id", new_callable=AsyncMock, return_value=owner_user),
            patch("app.api.members.get_org_members", new_callable=AsyncMock, return_value=[owner_membership]),
        ):
            from app.database import get_db

            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.put(
                    "/api/members/1/role",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"role": MemberRole.ADMIN},
                )

            app.dependency_overrides.clear()

        assert response.status_code == 400
        assert "Cannot demote the only owner" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_owner_can_transfer_ownership_when_another_owner_exists(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        owner1 = _make_user(1, "owner1@example.com", "Owner1")
        owner1_membership = _make_membership(1, 1, 1, MemberRole.OWNER)
        owner2_membership = _make_membership(2, 2, 1, MemberRole.OWNER)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=owner1_membership)
        mock_db.execute = AsyncMock(return_value=mock_result)

        token = _create_auth_token(1, 1, MemberRole.OWNER, "owner1@example.com")

        with (
            patch("app.api.members.get_user_by_id", new_callable=AsyncMock, return_value=owner1),
            patch(
                "app.api.members.get_org_members",
                new_callable=AsyncMock,
                return_value=[owner1_membership, owner2_membership],
            ),
        ):
            from app.database import get_db

            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.put(
                    "/api/members/1/role",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"role": MemberRole.ADMIN},
                )

            app.dependency_overrides.clear()

        assert response.status_code == 200


class TestTokenValidation:
    @pytest.mark.asyncio
    async def test_missing_auth_header_rejected(self):
        """Request without Authorization header should be rejected."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/members")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_malformed_token_rejected(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()

        from app.database import get_db

        app.dependency_overrides[get_db] = lambda: mock_db

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/members",
                headers={"Authorization": "Bearer not-a-valid-jwt"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_token_rejected_for_api_access(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()

        refresh_token = create_refresh_token(
            data={
                "sub": "test@example.com",
                "user_id": 1,
                "org_id": 1,
                "role": MemberRole.OWNER,
            }
        )

        from app.database import get_db

        app.dependency_overrides[get_db] = lambda: mock_db

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/members",
                headers={"Authorization": f"Bearer {refresh_token}"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 401


class TestDuplicateInviteProtection:
    @pytest.mark.asyncio
    async def test_cannot_invite_existing_member(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()

        existing_user = _make_user(2, "existing@example.com", "Existing")
        existing_membership = _make_membership(2, 2, 1, MemberRole.MEMBER)

        token = _create_auth_token(1, 1, MemberRole.OWNER, "owner@example.com")

        with (
            patch("app.api.members.get_user_by_email", new_callable=AsyncMock, return_value=existing_user),
            patch(
                "app.api.members.get_membership",
                new_callable=AsyncMock,
                return_value=existing_membership,
            ),
        ):
            from app.database import get_db

            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/members/invite",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"email": "existing@example.com", "role": MemberRole.MEMBER},
                )

            app.dependency_overrides.clear()

        assert response.status_code == 409
        assert "already a member" in response.json()["detail"]


class TestMemberNotFoundProtection:
    @pytest.mark.asyncio
    async def test_update_nonexistent_member_returns_404(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=None)
        mock_db.execute = AsyncMock(return_value=mock_result)

        token = _create_auth_token(1, 1, MemberRole.OWNER, "owner@example.com")

        from app.database import get_db

        app.dependency_overrides[get_db] = lambda: mock_db

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/members/999/role",
                headers={"Authorization": f"Bearer {token}"},
                json={"role": MemberRole.ADMIN},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 404
        assert "Member not found" in response.json()["detail"]


class TestAllEndpointsRequireAuth:
    @pytest.mark.asyncio
    async def test_list_members_requires_auth(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/members")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invite_requires_auth(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/invite",
                json={"email": "test@example.com", "role": MemberRole.MEMBER},
            )

        assert response.status_code == 401

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


class TestRefreshTokenSecurity:
    @pytest.mark.asyncio
    async def test_access_token_cannot_be_used_for_refresh(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()

        access_token = _create_auth_token(1, 1, MemberRole.OWNER)

        from app.database import get_db

        app.dependency_overrides[get_db] = lambda: mock_db

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/auth/token/refresh",
                json={"refresh_token": access_token},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_valid_refresh_returns_new_access_token(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()

        user = _make_user(1, "refresh@example.com", "Refresh User")
        membership = _make_membership(1, 1, 1, MemberRole.OWNER)

        refresh_token = create_refresh_token(
            data={
                "sub": "refresh@example.com",
                "user_id": 1,
                "org_id": 1,
                "role": MemberRole.OWNER,
            }
        )

        with (
            patch("app.api.auth.get_user_by_id", new_callable=AsyncMock, return_value=user),
            patch("app.api.auth.get_membership", new_callable=AsyncMock, return_value=membership),
        ):
            from app.database import get_db

            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/auth/token/refresh",
                    json={"refresh_token": refresh_token},
                )

            app.dependency_overrides.clear()

        assert response.status_code == 200
        assert "access_token" in response.json()
