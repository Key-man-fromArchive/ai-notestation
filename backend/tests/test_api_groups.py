# @TASK P6-T6.3 - Group Management API tests
# @SPEC docs/plans/phase6-member-auth.md
# @TEST tests/test_api_groups.py

"""Tests for the Member Groups API.

Tests all 11 group endpoints:
- POST /groups — create group
- GET /groups — list groups
- GET /groups/{id} — get group detail
- PUT /groups/{id} — update group
- DELETE /groups/{id} — delete group
- POST /groups/{id}/members — add members
- GET /groups/{id}/members — list group members
- DELETE /groups/{id}/members — remove members from group
- PUT /groups/{id}/notebook-access — set notebook access
- GET /groups/{id}/notebook-access — list notebook access
- DELETE /groups/{id}/notebook-access/{notebook_id} — revoke access
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.constants import MemberRole


def _make_membership(
    membership_id: int,
    user_id: int,
    org_id: int,
    role: str = MemberRole.MEMBER,
    accepted_at: datetime | None = None,
):
    """Create a mock Membership object."""
    membership = MagicMock()
    membership.id = membership_id
    membership.user_id = user_id
    membership.org_id = org_id
    membership.role = role
    membership.accepted_at = accepted_at or datetime.now(UTC)
    return membership


def _make_user(user_id: int, email: str, name: str = ""):
    """Create a mock User object."""
    user = MagicMock()
    user.id = user_id
    user.email = email
    user.name = name
    return user


def _make_group(
    group_id: int,
    org_id: int,
    name: str,
    description: str = "",
    color: str = "#6B7280",
):
    """Create a mock MemberGroup object."""
    group = MagicMock()
    group.id = group_id
    group.org_id = org_id
    group.name = name
    group.description = description
    group.color = color
    group.created_at = datetime.now(UTC)
    return group


def _make_notebook(notebook_id: int, name: str):
    """Create a mock Notebook object."""
    notebook = MagicMock()
    notebook.id = notebook_id
    notebook.name = name
    return notebook


class TestCreateGroup:
    """Test POST /groups - Create group endpoint"""

    @pytest.mark.asyncio
    async def test_create_group_success(self):
        """Should create group with valid data and OWNER role"""
        from app.api.groups import create_group_endpoint

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_group = _make_group(1, 1, "Team A")

        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        with patch("app.api.groups.create_group", new_callable=AsyncMock, return_value=mock_group):
            with patch("app.api.groups.log_activity", new_callable=AsyncMock):
                response = await create_group_endpoint(
                    request=MagicMock(
                        name="Team A",
                        description="Team description",
                        color="#FF0000",
                    ),
                    current_user=current_user,
                    db=mock_db,
                )

        assert response.id == 1
        assert response.name == "Team A"
        assert response.member_count == 0

    @pytest.mark.asyncio
    async def test_create_group_requires_owner_or_admin(self):
        """Should reject non-admin users"""
        from app.main import app
        from app.database import get_db
        from httpx import ASGITransport
        from app.services.auth_service import create_access_token

        mock_db = AsyncMock()
        token = create_access_token(data={
            "sub": "member@example.com",
            "user_id": 2,
            "org_id": 1,
            "role": MemberRole.MEMBER,
        })

        app.dependency_overrides[get_db] = lambda: mock_db

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/groups",
                json={"name": "Team", "description": "", "color": "#000000"},
                headers={"Authorization": f"Bearer {token}"},
            )

        app.dependency_overrides.clear()
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_create_group_duplicate_name_returns_409(self):
        """Should return 409 conflict when group name already exists"""
        from app.api.groups import create_group_endpoint

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        with patch(
            "app.api.groups.create_group",
            new_callable=AsyncMock,
            side_effect=ValueError("Group 'Team A' already exists in this organization"),
        ):
            from fastapi import HTTPException

            try:
                await create_group_endpoint(
                    request=MagicMock(
                        name="Team A",
                        description="Duplicate",
                        color="#000000",
                    ),
                    current_user=current_user,
                    db=mock_db,
                )
                assert False, "Should have raised HTTPException"
            except HTTPException as e:
                assert e.status_code == 409


class TestListGroups:
    """Test GET /groups - List groups endpoint"""

    @pytest.mark.asyncio
    async def test_list_groups_returns_groups_with_count(self):
        """Should return all groups in org with member counts"""
        from app.api.groups import list_groups_endpoint

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_groups = [
            _make_group(1, 1, "Team A", "First team"),
            _make_group(2, 1, "Team B", "Second team"),
        ]

        with patch(
            "app.api.groups.list_groups",
            new_callable=AsyncMock,
            return_value=mock_groups,
        ):
            with patch(
                "app.api.groups._count_group_members",
                new_callable=AsyncMock,
                side_effect=[5, 3],  # 5 members in Team A, 3 in Team B
            ):
                response = await list_groups_endpoint(current_user=current_user, db=mock_db)

        assert response.total == 2
        assert len(response.groups) == 2
        assert response.groups[0].member_count == 5
        assert response.groups[1].member_count == 3

    @pytest.mark.asyncio
    async def test_list_groups_returns_empty_when_no_groups(self):
        """Should return empty list when org has no groups"""
        from app.api.groups import list_groups_endpoint

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        with patch("app.api.groups.list_groups", new_callable=AsyncMock, return_value=[]):
            response = await list_groups_endpoint(current_user=current_user, db=mock_db)

        assert response.total == 0
        assert response.groups == []


class TestGetGroup:
    """Test GET /groups/{id} - Get group detail"""

    @pytest.mark.asyncio
    async def test_get_group_success(self):
        """Should return group details when found"""
        from app.api.groups import get_group_endpoint

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_group = _make_group(1, 1, "Team A", "Team description")

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            with patch(
                "app.api.groups._count_group_members",
                new_callable=AsyncMock,
                return_value=10,
            ):
                response = await get_group_endpoint(
                    group_id=1,
                    current_user=current_user,
                    db=mock_db,
                )

        assert response.id == 1
        assert response.name == "Team A"
        assert response.description == "Team description"
        assert response.member_count == 10

    @pytest.mark.asyncio
    async def test_get_group_not_found_returns_404(self):
        """Should return 404 when group not found"""
        from app.api.groups import get_group_endpoint
        from fastapi import HTTPException

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=None):
            try:
                await get_group_endpoint(
                    group_id=999,
                    current_user=current_user,
                    db=mock_db,
                )
                assert False, "Should have raised HTTPException"
            except HTTPException as e:
                assert e.status_code == 404


    @pytest.mark.asyncio
    async def test_get_group_from_different_org_returns_404(self):
        """Should return 404 when group belongs to different org"""
        from app.api.groups import get_group_endpoint
        from fastapi import HTTPException

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        # Group belongs to org_id=2, user is in org_id=1
        mock_group = _make_group(1, 2, "Team A")

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            try:
                await get_group_endpoint(
                    group_id=1,
                    current_user=current_user,
                    db=mock_db,
                )
                assert False, "Should have raised HTTPException"
            except HTTPException as e:
                assert e.status_code == 404


class TestUpdateGroup:
    """Test PUT /groups/{id} - Update group"""

    @pytest.mark.asyncio
    async def test_update_group_success(self):
        """Should update group name, description, and color"""
        from app.api.groups import update_group_endpoint

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_group = _make_group(1, 1, "Updated Team", "Updated description", "#FF0000")

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            with patch(
                "app.api.groups.update_group",
                new_callable=AsyncMock,
                return_value=mock_group,
            ):
                with patch(
                    "app.api.groups._count_group_members",
                    new_callable=AsyncMock,
                    return_value=5,
                ):
                    with patch("app.api.groups.log_activity", new_callable=AsyncMock):
                        response = await update_group_endpoint(
                            group_id=1,
                            request=MagicMock(
                                name="Updated Team",
                                description="Updated description",
                                color="#FF0000",
                            ),
                            current_user=current_user,
                            db=mock_db,
                        )

        assert response.name == "Updated Team"
        assert response.description == "Updated description"
        assert response.color == "#FF0000"

    @pytest.mark.asyncio
    async def test_update_group_requires_owner_or_admin(self):
        """Should reject non-admin users"""
        from app.main import app
        from app.database import get_db
        from httpx import ASGITransport
        from app.services.auth_service import create_access_token

        mock_db = AsyncMock()
        token = create_access_token(data={
            "sub": "member@example.com",
            "user_id": 2,
            "org_id": 1,
            "role": MemberRole.MEMBER,
        })

        app.dependency_overrides[get_db] = lambda: mock_db

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/groups/1",
                json={"name": "Updated", "description": "", "color": "#000000"},
                headers={"Authorization": f"Bearer {token}"},
            )

        app.dependency_overrides.clear()
        assert response.status_code == 403


class TestDeleteGroup:
    """Test DELETE /groups/{id} - Delete group"""

    @pytest.mark.asyncio
    async def test_delete_group_success(self):
        """Should delete group and return success message"""
        from app.api.groups import delete_group_endpoint

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_group = _make_group(1, 1, "Team A")

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            with patch(
                "app.api.groups.delete_group",
                new_callable=AsyncMock,
                return_value=True,
            ):
                with patch("app.api.groups.log_activity", new_callable=AsyncMock):
                    response = await delete_group_endpoint(
                        group_id=1,
                        current_user=current_user,
                        db=mock_db,
                    )

        assert "successfully" in response.message.lower()

    @pytest.mark.asyncio
    async def test_delete_group_not_found_returns_404(self):
        """Should return 404 when group not found"""
        from app.api.groups import delete_group_endpoint
        from fastapi import HTTPException

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=None):
            try:
                await delete_group_endpoint(
                    group_id=999,
                    current_user=current_user,
                    db=mock_db,
                )
                assert False, "Should have raised HTTPException"
            except HTTPException as e:
                assert e.status_code == 404


class TestAddGroupMembers:
    """Test POST /groups/{id}/members - Add members to group"""

    @pytest.mark.asyncio
    async def test_add_members_success(self):
        """Should add members to group and return counts"""
        from app.api.groups import add_group_members_endpoint

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_group = _make_group(1, 1, "Team A")

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            with patch(
                "app.api.groups.add_members_to_group",
                new_callable=AsyncMock,
                return_value={"added": 2, "already_exists": 0, "errors": []},
            ):
                with patch("app.api.groups.log_activity", new_callable=AsyncMock):
                    response = await add_group_members_endpoint(
                        group_id=1,
                        request=MagicMock(membership_ids=[10, 11]),
                        current_user=current_user,
                        db=mock_db,
                    )

        assert response["added"] == 2
        assert response["already_exists"] == 0
        assert response["errors"] == []

    @pytest.mark.asyncio
    async def test_add_members_with_duplicates(self):
        """Should skip duplicate members and report in response"""
        from app.api.groups import add_group_members_endpoint

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_group = _make_group(1, 1, "Team A")

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            with patch(
                "app.api.groups.add_members_to_group",
                new_callable=AsyncMock,
                return_value={"added": 1, "already_exists": 1, "errors": []},
            ):
                with patch("app.api.groups.log_activity", new_callable=AsyncMock):
                    response = await add_group_members_endpoint(
                        group_id=1,
                        request=MagicMock(membership_ids=[10, 11]),
                        current_user=current_user,
                        db=mock_db,
                    )

        assert response["added"] == 1
        assert response["already_exists"] == 1

    @pytest.mark.asyncio
    async def test_add_members_requires_owner_or_admin(self):
        """Should reject non-admin users"""
        from app.main import app
        from app.database import get_db
        from httpx import ASGITransport
        from app.services.auth_service import create_access_token

        mock_db = AsyncMock()
        token = create_access_token(data={
            "sub": "member@example.com",
            "user_id": 2,
            "org_id": 1,
            "role": MemberRole.MEMBER,
        })

        app.dependency_overrides[get_db] = lambda: mock_db

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/groups/1/members",
                json={"membership_ids": [10, 11]},
                headers={"Authorization": f"Bearer {token}"},
            )

        app.dependency_overrides.clear()
        assert response.status_code == 403


class TestRemoveGroupMembers:
    """Test DELETE /groups/{id}/members - Remove members from group"""

    @pytest.mark.asyncio
    async def test_remove_members_success(self):
        """Should remove members from group"""
        from app.api.groups import remove_group_members_endpoint

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_group = _make_group(1, 1, "Team A")

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            with patch(
                "app.api.groups.remove_members_from_group",
                new_callable=AsyncMock,
                return_value=2,
            ):
                with patch("app.api.groups.log_activity", new_callable=AsyncMock):
                    response = await remove_group_members_endpoint(
                        group_id=1,
                        request=MagicMock(membership_ids=[10, 11]),
                        current_user=current_user,
                        db=mock_db,
                    )

        assert "2 member(s) removed" in response.message

    @pytest.mark.asyncio
    async def test_remove_members_requires_owner_or_admin(self):
        """Should reject non-admin users"""
        from app.api.groups import remove_group_members_endpoint
        from fastapi import HTTPException

        mock_db = AsyncMock()
        current_user = {
            "user_id": 2,
            "org_id": 1,
            "email": "member@example.com",
            "role": MemberRole.MEMBER,  # Non-admin
        }

        try:
            await remove_group_members_endpoint(
                group_id=1,
                request=MagicMock(membership_ids=[10, 11]),
                current_user=current_user,
                db=mock_db,
            )
            assert False, "Should have raised HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


class TestGetGroupMembers:
    """Test GET /groups/{id}/members - List group members"""

    @pytest.mark.asyncio
    async def test_get_group_members_success(self):
        """Should return list of group members with details"""
        from app.api.groups import get_group_members_endpoint

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_group = _make_group(1, 1, "Team A")
        mock_members = [
            {
                "membership_id": 10,
                "user_id": 2,
                "email": "user1@example.com",
                "name": "User One",
                "role": MemberRole.MEMBER,
                "added_at": "2025-01-01T00:00:00",
            },
            {
                "membership_id": 11,
                "user_id": 3,
                "email": "user2@example.com",
                "name": "User Two",
                "role": MemberRole.ADMIN,
                "added_at": "2025-01-02T00:00:00",
            },
        ]

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            with patch(
                "app.api.groups.get_group_members",
                new_callable=AsyncMock,
                return_value=mock_members,
            ):
                response = await get_group_members_endpoint(
                    group_id=1,
                    current_user=current_user,
                    db=mock_db,
                )

        assert len(response) == 2
        assert response[0].email == "user1@example.com"
        assert response[1].role == MemberRole.ADMIN

    @pytest.mark.asyncio
    async def test_get_group_members_returns_empty_when_no_members(self):
        """Should return empty list when group has no members"""
        from app.api.groups import get_group_members_endpoint

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_group = _make_group(1, 1, "Team A")

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            with patch(
                "app.api.groups.get_group_members",
                new_callable=AsyncMock,
                return_value=[],
            ):
                response = await get_group_members_endpoint(
                    group_id=1,
                    current_user=current_user,
                    db=mock_db,
                )

        assert response == []


class TestGroupNotebookAccess:
    """Test notebook access endpoints"""

    @pytest.mark.asyncio
    async def test_get_group_notebook_access_success(self):
        """Should return list of notebook accesses for group"""
        from app.api.groups import get_group_notebook_access_endpoint

        mock_db = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_group = _make_group(1, 1, "Team A")
        mock_accesses = [
            {
                "id": 100,
                "notebook_id": 1,
                "notebook_name": "Notes",
                "permission": "read",
                "created_at": "2025-01-01T00:00:00",
            },
            {
                "id": 101,
                "notebook_id": 2,
                "notebook_name": "Personal",
                "permission": "write",
                "created_at": "2025-01-02T00:00:00",
            },
        ]

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            with patch(
                "app.api.groups.get_group_notebook_accesses",
                new_callable=AsyncMock,
                return_value=mock_accesses,
            ):
                response = await get_group_notebook_access_endpoint(
                    group_id=1,
                    current_user=current_user,
                    db=mock_db,
                )

        assert len(response) == 2
        assert response[0].notebook_name == "Notes"
        assert response[0].permission == "read"
        assert response[1].permission == "write"

    @pytest.mark.asyncio
    async def test_update_group_notebook_access_success(self):
        """Should update notebook access for group"""
        from app.api.groups import update_group_notebook_access_endpoint

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_group = _make_group(1, 1, "Team A")
        mock_accesses = [
            {
                "id": 100,
                "notebook_id": 1,
                "notebook_name": "Notes",
                "permission": "admin",
                "created_at": "2025-01-01T00:00:00",
            },
        ]

        access_request = MagicMock()
        access_request.accesses = [
            MagicMock(notebook_id=1, permission="admin"),
        ]

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            with patch(
                "app.api.groups.bulk_set_group_notebook_access",
                new_callable=AsyncMock,
                return_value=1,
            ):
                with patch(
                    "app.api.groups.get_group_notebook_accesses",
                    new_callable=AsyncMock,
                    return_value=mock_accesses,
                ):
                    with patch("app.api.groups.log_activity", new_callable=AsyncMock):
                        response = await update_group_notebook_access_endpoint(
                            group_id=1,
                            request=access_request,
                            current_user=current_user,
                            db=mock_db,
                        )

        assert len(response) == 1
        assert response[0].permission == "admin"

    @pytest.mark.asyncio
    async def test_update_notebook_access_requires_owner_or_admin(self):
        """Should reject non-admin users for notebook access updates"""
        from app.main import app
        from app.database import get_db
        from httpx import ASGITransport
        from app.services.auth_service import create_access_token

        mock_db = AsyncMock()
        token = create_access_token(data={
            "sub": "member@example.com",
            "user_id": 2,
            "org_id": 1,
            "role": MemberRole.MEMBER,
        })

        app.dependency_overrides[get_db] = lambda: mock_db

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/groups/1/notebook-access",
                json={"accesses": [{"notebook_id": 1, "permission": "read"}]},
                headers={"Authorization": f"Bearer {token}"},
            )

        app.dependency_overrides.clear()
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_update_notebook_access_validates_permission(self):
        """Should validate permission values"""
        from app.main import app
        from app.database import get_db
        from httpx import ASGITransport
        from app.services.auth_service import create_access_token

        mock_db = AsyncMock()
        token = create_access_token(data={
            "sub": "owner@example.com",
            "user_id": 1,
            "org_id": 1,
            "role": MemberRole.OWNER,
        })

        app.dependency_overrides[get_db] = lambda: mock_db

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/groups/1/notebook-access",
                json={"accesses": [{"notebook_id": 1, "permission": "invalid"}]},
                headers={"Authorization": f"Bearer {token}"},
            )

        app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_remove_group_notebook_access_success(self):
        """Should remove notebook access for group"""
        from app.api.groups import remove_group_notebook_access_endpoint

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_group = _make_group(1, 1, "Team A")

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            with patch(
                "app.api.groups.remove_group_notebook_access",
                new_callable=AsyncMock,
                return_value=True,
            ):
                with patch("app.api.groups.log_activity", new_callable=AsyncMock):
                    response = await remove_group_notebook_access_endpoint(
                        group_id=1,
                        notebook_id=1,
                        current_user=current_user,
                        db=mock_db,
                    )

        assert "successfully" in response.message.lower()

    @pytest.mark.asyncio
    async def test_remove_group_notebook_access_not_found(self):
        """Should return 404 when access record not found"""
        from app.api.groups import remove_group_notebook_access_endpoint
        from fastapi import HTTPException

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        current_user = {
            "user_id": 1,
            "org_id": 1,
            "email": "owner@example.com",
            "role": MemberRole.OWNER,
        }

        mock_group = _make_group(1, 1, "Team A")

        with patch("app.api.groups.get_group", new_callable=AsyncMock, return_value=mock_group):
            with patch(
                "app.api.groups.remove_group_notebook_access",
                new_callable=AsyncMock,
                return_value=False,
            ):
                try:
                    await remove_group_notebook_access_endpoint(
                        group_id=1,
                        notebook_id=999,
                        current_user=current_user,
                        db=mock_db,
                    )
                    assert False, "Should have raised HTTPException"
                except HTTPException as e:
                    assert e.status_code == 404

    @pytest.mark.asyncio
    async def test_remove_notebook_access_requires_owner_or_admin(self):
        """Should reject non-admin users"""
        from app.main import app
        from app.database import get_db
        from httpx import ASGITransport
        from app.services.auth_service import create_access_token

        mock_db = AsyncMock()
        token = create_access_token(data={
            "sub": "member@example.com",
            "user_id": 2,
            "org_id": 1,
            "role": MemberRole.MEMBER,
        })

        app.dependency_overrides[get_db] = lambda: mock_db

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete(
                "/api/groups/1/notebook-access/1",
                headers={"Authorization": f"Bearer {token}"},
            )

        app.dependency_overrides.clear()
        assert response.status_code == 403
