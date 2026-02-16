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


class TestDeleteMember:
    @pytest.mark.asyncio
    async def test_delete_member_requires_auth(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete("/api/members/1")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_member_requires_owner_or_admin(self):
        from app.services.auth_service import create_access_token

        app = _get_app()
        transport = ASGITransport(app=app)

        token = create_access_token(data={
            "sub": "viewer@example.com",
            "user_id": 3,
            "org_id": 1,
            "role": MemberRole.VIEWER,
        })

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete(
                "/api/members/2",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_delete_member_cannot_remove_owner(self):
        from app.services.auth_service import create_access_token

        app = _get_app()
        transport = ASGITransport(app=app)
        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        owner_membership = _make_membership(1, 10, 1, MemberRole.OWNER, datetime.now(UTC))
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = owner_membership
        mock_db.execute = AsyncMock(return_value=mock_result)

        token = create_access_token(data={
            "sub": "admin@example.com",
            "user_id": 2,
            "org_id": 1,
            "role": MemberRole.ADMIN,
        })

        from app.database import get_db
        app.dependency_overrides[get_db] = lambda: mock_db

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete(
                "/api/members/1",
                headers={"Authorization": f"Bearer {token}"},
            )

        app.dependency_overrides.clear()
        assert response.status_code == 400
        assert "Cannot remove owner" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_delete_member_cannot_remove_self(self):
        from app.services.auth_service import create_access_token

        app = _get_app()
        transport = ASGITransport(app=app)
        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        self_membership = _make_membership(1, 2, 1, MemberRole.ADMIN, datetime.now(UTC))
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = self_membership
        mock_db.execute = AsyncMock(return_value=mock_result)

        token = create_access_token(data={
            "sub": "admin@example.com",
            "user_id": 2,
            "org_id": 1,
            "role": MemberRole.ADMIN,
        })

        from app.database import get_db
        app.dependency_overrides[get_db] = lambda: mock_db

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete(
                "/api/members/1",
                headers={"Authorization": f"Bearer {token}"},
            )

        app.dependency_overrides.clear()
        assert response.status_code == 400
        assert "Cannot remove yourself" in response.json()["detail"]


class TestBatchRemoveMembers:
    @pytest.mark.asyncio
    async def test_batch_remove_requires_auth(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/batch-remove",
                json={"member_ids": [1, 2]},
            )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_batch_remove_requires_owner_or_admin(self):
        from app.services.auth_service import create_access_token

        app = _get_app()
        transport = ASGITransport(app=app)

        token = create_access_token(data={
            "sub": "member@example.com",
            "user_id": 3,
            "org_id": 1,
            "role": MemberRole.MEMBER,
        })

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/batch-remove",
                json={"member_ids": [1, 2]},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 403


class TestMemberNotebookAccess:
    @pytest.mark.asyncio
    async def test_get_member_access_requires_auth(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/members/1/notebook-access")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_member_access_requires_owner_or_admin(self):
        from app.services.auth_service import create_access_token

        app = _get_app()
        transport = ASGITransport(app=app)

        token = create_access_token(data={
            "sub": "viewer@example.com",
            "user_id": 3,
            "org_id": 1,
            "role": MemberRole.VIEWER,
        })

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/members/1/notebook-access",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_update_member_access_requires_auth(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/members/1/notebook-access",
                json={"accesses": [{"notebook_id": 1, "permission": "read"}]},
            )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_revoke_member_access_requires_auth(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete("/api/members/1/notebook-access/1")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_update_access_validates_permission(self):
        from app.services.auth_service import create_access_token

        app = _get_app()
        transport = ASGITransport(app=app)

        token = create_access_token(data={
            "sub": "owner@example.com",
            "user_id": 1,
            "org_id": 1,
            "role": MemberRole.OWNER,
        })

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/members/1/notebook-access",
                json={"accesses": [{"notebook_id": 1, "permission": "invalid"}]},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 422


class TestBatchChangeRole:
    """Test POST /members/batch-role - Batch role change"""

    @pytest.mark.asyncio
    async def test_batch_role_requires_auth(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/batch-role",
                json={"member_ids": [1, 2], "role": MemberRole.ADMIN},
            )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_batch_role_requires_owner_or_admin(self):
        from app.services.auth_service import create_access_token

        app = _get_app()
        transport = ASGITransport(app=app)

        token = create_access_token(data={
            "sub": "member@example.com",
            "user_id": 3,
            "org_id": 1,
            "role": MemberRole.MEMBER,
        })

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/batch-role",
                json={"member_ids": [1, 2], "role": MemberRole.ADMIN},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_batch_role_validates_role(self):
        from app.services.auth_service import create_access_token

        app = _get_app()
        transport = ASGITransport(app=app)

        token = create_access_token(data={
            "sub": "owner@example.com",
            "user_id": 1,
            "org_id": 1,
            "role": MemberRole.OWNER,
        })

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/members/batch-role",
                json={"member_ids": [2, 3], "role": "invalid_role"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_batch_role_cannot_promote_to_owner(self):
        from app.api.members import batch_change_role

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        member = _make_membership(2, 2, 1, MemberRole.MEMBER, datetime.now(UTC))
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = member
        mock_db.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.members.log_activity", new_callable=AsyncMock):
            response = await batch_change_role(
                request=MagicMock(member_ids=[2], role=MemberRole.OWNER),
                current_user=current_user,
                db=mock_db,
            )

        assert response.updated == 0
        assert len(response.errors) > 0
        assert "Cannot promote to OWNER via batch" in response.errors[0]

    @pytest.mark.asyncio
    async def test_batch_role_cannot_change_owner_role(self):
        from app.api.members import batch_change_role

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        owner_member = _make_membership(1, 10, 1, MemberRole.OWNER, datetime.now(UTC))
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = owner_member
        mock_db.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.members.log_activity", new_callable=AsyncMock):
            response = await batch_change_role(
                request=MagicMock(member_ids=[1], role=MemberRole.ADMIN),
                current_user=current_user,
                db=mock_db,
            )

        assert response.updated == 0
        assert len(response.errors) > 0
        assert "Cannot change owner role" in response.errors[0]

    @pytest.mark.asyncio
    async def test_batch_role_cannot_change_own_role(self):
        from app.api.members import batch_change_role

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        current_user = {
            "user_id": 2,
            "org_id": 1,
            "email": "admin@example.com",
            "role": MemberRole.ADMIN,
        }

        self_member = _make_membership(2, 2, 1, MemberRole.ADMIN, datetime.now(UTC))
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = self_member
        mock_db.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.members.log_activity", new_callable=AsyncMock):
            response = await batch_change_role(
                request=MagicMock(member_ids=[2], role=MemberRole.MEMBER),
                current_user=current_user,
                db=mock_db,
            )

        assert response.updated == 0
        assert len(response.errors) > 0
        assert "Cannot change own role" in response.errors[0]

    @pytest.mark.asyncio
    async def test_batch_role_success(self):
        from app.api.members import batch_change_role

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        member1 = _make_membership(2, 2, 1, MemberRole.MEMBER, datetime.now(UTC))
        member2 = _make_membership(3, 3, 1, MemberRole.VIEWER, datetime.now(UTC))

        call_count = [0]
        def side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return MagicMock(scalar_one_or_none=MagicMock(return_value=member1))
            else:
                return MagicMock(scalar_one_or_none=MagicMock(return_value=member2))

        mock_db.execute = AsyncMock(side_effect=side_effect)

        with patch("app.api.members.log_activity", new_callable=AsyncMock):
            response = await batch_change_role(
                request=MagicMock(member_ids=[2, 3], role=MemberRole.ADMIN),
                current_user=current_user,
                db=mock_db,
            )

        assert response.updated == 2
        assert response.failed == 0
        assert response.errors == []


class TestMemberGroups:
    """Test GET /members/{id}/groups - Member groups endpoint"""

    @pytest.mark.asyncio
    async def test_get_member_groups_requires_auth(self):
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/members/1/groups")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_member_groups_success(self):
        from app.api.members import get_member_groups

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        # Mock membership exists
        membership = _make_membership(2, 2, 1, MemberRole.MEMBER, datetime.now(UTC))
        membership_result = MagicMock()
        membership_result.scalar_one_or_none.return_value = membership

        # Mock groups
        group1 = MagicMock()
        group1.id = 1
        group1.name = "Team A"
        group1.color = "#FF0000"

        group2 = MagicMock()
        group2.id = 2
        group2.name = "Team B"
        group2.color = "#00FF00"

        groups_result = MagicMock()
        groups_result.scalars.return_value.all.return_value = [group1, group2]

        call_count = [0]
        def side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return membership_result
            else:
                return groups_result

        mock_db.execute = AsyncMock(side_effect=side_effect)

        response = await get_member_groups(
            member_id=2,
            current_user=current_user,
            db=mock_db,
        )

        assert len(response) == 2
        assert response[0].group_name == "Team A"
        assert response[1].group_name == "Team B"
        assert response[0].color == "#FF0000"

    @pytest.mark.asyncio
    async def test_get_member_groups_member_not_found(self):
        from app.api.members import get_member_groups
        from fastapi import HTTPException

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        membership_result = MagicMock()
        membership_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=membership_result)

        try:
            await get_member_groups(
                member_id=999,
                current_user=current_user,
                db=mock_db,
            )
            assert False, "Should have raised HTTPException"
        except HTTPException as e:
            assert e.status_code == 404

    @pytest.mark.asyncio
    async def test_get_member_groups_returns_empty_when_no_groups(self):
        from app.api.members import get_member_groups

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        # Mock membership exists
        membership = _make_membership(2, 2, 1, MemberRole.MEMBER, datetime.now(UTC))
        membership_result = MagicMock()
        membership_result.scalar_one_or_none.return_value = membership

        # Mock no groups
        groups_result = MagicMock()
        groups_result.scalars.return_value.all.return_value = []

        call_count = [0]
        def side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return membership_result
            else:
                return groups_result

        mock_db.execute = AsyncMock(side_effect=side_effect)

        response = await get_member_groups(
            member_id=2,
            current_user=current_user,
            db=mock_db,
        )

        assert response == []

    @pytest.mark.asyncio
    async def test_get_member_groups_from_different_org(self):
        from app.api.members import get_member_groups
        from fastapi import HTTPException

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        # When querying with org_id=1 filter, should return None since member is in org_id=2
        membership_result = MagicMock()
        membership_result.scalar_one_or_none.return_value = None  # Not found in org 1
        mock_db.execute = AsyncMock(return_value=membership_result)

        try:
            await get_member_groups(
                member_id=2,
                current_user=current_user,
                db=mock_db,
            )
            assert False, "Should have raised HTTPException"
        except HTTPException as e:
            assert e.status_code == 404
