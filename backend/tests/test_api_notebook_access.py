"""
@TEST backend/tests/test_api_notebook_access.py
Tests for NotebookAccess API endpoints (TDD approach).

Covers:
- GET /notebooks/{id}/access - List access records
- POST /notebooks/{id}/access - Grant access by email
- PUT /notebooks/{id}/access/{access_id} - Update permission
- DELETE /notebooks/{id}/access/{access_id} - Revoke access
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.constants import NotePermission
from app.models import NotebookAccess, User


@pytest.fixture
def mock_db():
    return AsyncMock()


@pytest.fixture
def mock_user():
    return MagicMock(id=1)


class TestListNotebookAccess:
    """Tests for GET /notebooks/{id}/access"""

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    @patch("app.api.notebooks.get_notebook_access_list")
    async def test_list_access_success(self, mock_get_list, mock_can_manage, mock_db, mock_user):
        """Returns access list when user has ADMIN permission"""
        mock_can_manage.return_value = True

        # Mock access records
        access1 = NotebookAccess(
            id=1,
            notebook_id=100,
            user_id=1,
            org_id=None,
            permission=NotePermission.ADMIN,
            granted_by=1,
            created_at=datetime(2025, 1, 1, tzinfo=UTC),
        )
        access2 = NotebookAccess(
            id=2,
            notebook_id=100,
            user_id=2,
            org_id=None,
            permission=NotePermission.WRITE,
            granted_by=1,
            created_at=datetime(2025, 1, 2, tzinfo=UTC),
        )
        mock_get_list.return_value = [access1, access2]

        # Mock user lookup
        user1 = User(id=1, email="admin@example.com")
        user2 = User(id=2, email="writer@example.com")
        user_iter = iter([user1, user2])

        async def mock_execute(stmt):
            mock_result = AsyncMock()
            mock_result.scalar_one_or_none = MagicMock(return_value=next(user_iter))
            return mock_result

        mock_db.execute = mock_execute

        # Call endpoint
        from app.api.notebooks import list_notebook_access

        response = await list_notebook_access(notebook_id=100, db=mock_db, current_user=mock_user)

        # Assertions
        mock_can_manage.assert_called_once_with(mock_db, 100, mock_user.id)
        mock_get_list.assert_called_once_with(mock_db, 100)
        assert len(response.items) == 2
        assert response.items[0].id == 1
        assert response.items[0].user_email == "admin@example.com"
        assert response.items[0].permission == "admin"
        assert response.items[1].id == 2
        assert response.items[1].user_email == "writer@example.com"
        assert response.items[1].permission == "write"

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    async def test_list_access_forbidden(self, mock_can_manage, mock_db, mock_user):
        """Returns 403 when user lacks ADMIN permission"""
        mock_can_manage.return_value = False

        from app.api.notebooks import list_notebook_access

        with pytest.raises(HTTPException) as exc_info:
            await list_notebook_access(notebook_id=100, db=mock_db, current_user=mock_user)

        assert exc_info.value.status_code == 403
        assert "permission" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    async def test_list_access_notebook_not_found(self, mock_can_manage, mock_db, mock_user):
        """Returns 404 when notebook not found"""
        mock_can_manage.side_effect = HTTPException(status_code=404, detail="Notebook not found")

        from app.api.notebooks import list_notebook_access

        with pytest.raises(HTTPException) as exc_info:
            await list_notebook_access(notebook_id=999, db=mock_db, current_user=mock_user)

        assert exc_info.value.status_code == 404


class TestGrantNotebookAccess:
    """Tests for POST /notebooks/{id}/access"""

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    @patch("app.api.notebooks.grant_notebook_access")
    async def test_grant_access_success(self, mock_grant, mock_can_manage, mock_db, mock_user):
        """Grants access by email when user has ADMIN permission"""
        mock_can_manage.return_value = True

        # Mock user lookup
        target_user = User(id=2, email="newuser@example.com")

        async def mock_execute(stmt):
            mock_result = AsyncMock()
            mock_result.scalar_one_or_none = MagicMock(return_value=target_user)
            return mock_result

        mock_db.execute = mock_execute

        # Mock grant result
        new_access = NotebookAccess(
            id=10,
            notebook_id=100,
            user_id=2,
            org_id=None,
            permission=NotePermission.WRITE,
            granted_by=mock_user.id,
            created_at=datetime(2025, 1, 3, tzinfo=UTC),
        )
        mock_grant.return_value = new_access

        # Call endpoint
        from app.api.notebooks import AccessGrantRequest, grant_notebook_access_endpoint

        request = AccessGrantRequest(email="newuser@example.com", permission="write")
        response = await grant_notebook_access_endpoint(
            notebook_id=100, request=request, db=mock_db, current_user=mock_user
        )

        # Assertions
        mock_can_manage.assert_called_once_with(mock_db, 100, mock_user.id)
        mock_grant.assert_called_once_with(
            mock_db, notebook_id=100, user_id=2, permission=NotePermission.WRITE, granted_by=mock_user.id
        )
        assert response.id == 10
        assert response.user_id == 2
        assert response.permission == "write"

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    async def test_grant_access_user_not_found(self, mock_can_manage, mock_db, mock_user):
        """Returns 404 when email not found"""
        mock_can_manage.return_value = True

        # Mock user lookup - not found
        async def mock_execute(stmt):
            mock_result = AsyncMock()
            mock_result.scalar_one_or_none = MagicMock(return_value=None)
            return mock_result

        mock_db.execute = mock_execute

        from app.api.notebooks import AccessGrantRequest, grant_notebook_access_endpoint

        request = AccessGrantRequest(email="nonexistent@example.com", permission="read")

        with pytest.raises(HTTPException) as exc_info:
            await grant_notebook_access_endpoint(notebook_id=100, request=request, db=mock_db, current_user=mock_user)

        assert exc_info.value.status_code == 404
        assert "user not found" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    async def test_grant_access_forbidden(self, mock_can_manage, mock_db, mock_user):
        """Returns 403 when user lacks ADMIN permission"""
        mock_can_manage.return_value = False

        from app.api.notebooks import AccessGrantRequest, grant_notebook_access_endpoint

        request = AccessGrantRequest(email="someone@example.com", permission="read")

        with pytest.raises(HTTPException) as exc_info:
            await grant_notebook_access_endpoint(notebook_id=100, request=request, db=mock_db, current_user=mock_user)

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    async def test_grant_access_invalid_permission(self, mock_can_manage, mock_db, mock_user):
        """Validates permission values (read/write/admin)"""
        mock_can_manage.return_value = True

        # Mock user lookup
        target_user = User(id=2, email="user@example.com")

        async def mock_execute(stmt):
            mock_result = AsyncMock()
            mock_result.scalar_one_or_none = MagicMock(return_value=target_user)
            return mock_result

        mock_db.execute = mock_execute

        from app.api.notebooks import AccessGrantRequest, grant_notebook_access_endpoint

        request = AccessGrantRequest(email="user@example.com", permission="invalid")

        with pytest.raises(HTTPException) as exc_info:
            await grant_notebook_access_endpoint(notebook_id=100, request=request, db=mock_db, current_user=mock_user)

        assert exc_info.value.status_code == 400
        assert "invalid permission" in exc_info.value.detail.lower()


class TestUpdateNotebookAccess:
    """Tests for PUT /notebooks/{id}/access/{access_id}"""

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    @patch("app.api.notebooks.get_notebook_access_list")
    @patch("app.api.notebooks.grant_notebook_access")
    async def test_update_access_success(self, mock_grant, mock_get_list, mock_can_manage, mock_db, mock_user):
        """Updates permission level when user has ADMIN"""
        mock_can_manage.return_value = True

        # Mock existing access
        existing_access = NotebookAccess(
            id=5, notebook_id=100, user_id=2, org_id=None, permission=NotePermission.READ, granted_by=1
        )
        mock_get_list.return_value = [
            NotebookAccess(
                id=1, notebook_id=100, user_id=1, org_id=None, permission=NotePermission.ADMIN, granted_by=1
            ),
            existing_access,
        ]

        # Mock access lookup and user lookup
        user2 = User(id=2, email="user2@example.com")
        call_count = 0

        async def mock_execute(stmt):
            nonlocal call_count
            call_count += 1
            mock_result = AsyncMock()
            if call_count == 1:
                mock_result.scalar_one_or_none = MagicMock(return_value=existing_access)
            else:
                mock_result.scalar_one_or_none = MagicMock(return_value=user2)
            return mock_result

        mock_db.execute = mock_execute

        # Mock grant (update)
        updated_access = NotebookAccess(
            id=5,
            notebook_id=100,
            user_id=2,
            org_id=None,
            permission=NotePermission.WRITE,
            granted_by=mock_user.id,
            created_at=datetime(2025, 1, 4, tzinfo=UTC),
        )
        mock_grant.return_value = updated_access

        from app.api.notebooks import AccessUpdateRequest, update_notebook_access

        request = AccessUpdateRequest(permission="write")
        response = await update_notebook_access(
            notebook_id=100, access_id=5, request=request, db=mock_db, current_user=mock_user
        )

        assert response.id == 5
        assert response.permission == "write"
        assert response.user_email == "user2@example.com"
        mock_grant.assert_called_once_with(
            mock_db, notebook_id=100, user_id=2, permission=NotePermission.WRITE, granted_by=mock_user.id
        )

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    async def test_update_access_forbidden(self, mock_can_manage, mock_db, mock_user):
        """Returns 403 when user lacks ADMIN permission"""
        mock_can_manage.return_value = False

        from app.api.notebooks import AccessUpdateRequest, update_notebook_access

        request = AccessUpdateRequest(permission="write")

        with pytest.raises(HTTPException) as exc_info:
            await update_notebook_access(
                notebook_id=100, access_id=5, request=request, db=mock_db, current_user=mock_user
            )

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    @patch("app.api.notebooks.get_notebook_access_list")
    async def test_update_access_last_admin_protection(self, mock_get_list, mock_can_manage, mock_db, mock_user):
        """Returns 400 when trying to demote last ADMIN"""
        mock_can_manage.return_value = True

        # Only one ADMIN
        admin_access = NotebookAccess(
            id=1, notebook_id=100, user_id=1, org_id=None, permission=NotePermission.ADMIN, granted_by=1
        )
        mock_get_list.return_value = [admin_access]

        # Mock access lookup
        async def mock_execute(stmt):
            mock_result = AsyncMock()
            mock_result.scalar_one_or_none = MagicMock(return_value=admin_access)
            return mock_result

        mock_db.execute = mock_execute

        from app.api.notebooks import AccessUpdateRequest, update_notebook_access

        request = AccessUpdateRequest(permission="write")

        with pytest.raises(HTTPException) as exc_info:
            await update_notebook_access(
                notebook_id=100, access_id=1, request=request, db=mock_db, current_user=mock_user
            )

        assert exc_info.value.status_code == 400
        assert "last owner" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    async def test_update_access_not_found(self, mock_can_manage, mock_db, mock_user):
        """Returns 404 when access_id not found"""
        mock_can_manage.return_value = True

        # Mock access lookup - not found
        async def mock_execute(stmt):
            mock_result = AsyncMock()
            mock_result.scalar_one_or_none = MagicMock(return_value=None)
            return mock_result

        mock_db.execute = mock_execute

        from app.api.notebooks import AccessUpdateRequest, update_notebook_access

        request = AccessUpdateRequest(permission="write")

        with pytest.raises(HTTPException) as exc_info:
            await update_notebook_access(
                notebook_id=100, access_id=999, request=request, db=mock_db, current_user=mock_user
            )

        assert exc_info.value.status_code == 404


class TestRevokeNotebookAccess:
    """Tests for DELETE /notebooks/{id}/access/{access_id}"""

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    @patch("app.api.notebooks.get_notebook_access_list")
    @patch("app.api.notebooks.revoke_notebook_access")
    async def test_revoke_access_success(self, mock_revoke, mock_get_list, mock_can_manage, mock_db, mock_user):
        """Revokes access when user has ADMIN"""
        mock_can_manage.return_value = True

        # Multiple admins exist
        mock_get_list.return_value = [
            NotebookAccess(
                id=1, notebook_id=100, user_id=1, org_id=None, permission=NotePermission.ADMIN, granted_by=1
            ),
            NotebookAccess(
                id=2, notebook_id=100, user_id=2, org_id=None, permission=NotePermission.ADMIN, granted_by=1
            ),
            NotebookAccess(
                id=3, notebook_id=100, user_id=3, org_id=None, permission=NotePermission.WRITE, granted_by=1
            ),
        ]

        # Mock access lookup
        target_access = NotebookAccess(
            id=3, notebook_id=100, user_id=3, org_id=None, permission=NotePermission.WRITE, granted_by=1
        )

        async def mock_execute(stmt):
            mock_result = AsyncMock()
            mock_result.scalar_one_or_none = MagicMock(return_value=target_access)
            return mock_result

        mock_db.execute = mock_execute

        from app.api.notebooks import revoke_notebook_access_endpoint

        response = await revoke_notebook_access_endpoint(
            notebook_id=100, access_id=3, db=mock_db, current_user=mock_user
        )

        mock_revoke.assert_called_once_with(mock_db, 3)
        assert response == {"success": True}

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    async def test_revoke_access_forbidden(self, mock_can_manage, mock_db, mock_user):
        """Returns 403 when user lacks ADMIN permission"""
        mock_can_manage.return_value = False

        from app.api.notebooks import revoke_notebook_access_endpoint

        with pytest.raises(HTTPException) as exc_info:
            await revoke_notebook_access_endpoint(notebook_id=100, access_id=3, db=mock_db, current_user=mock_user)

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    @patch("app.api.notebooks.get_notebook_access_list")
    async def test_revoke_access_last_admin_protection(self, mock_get_list, mock_can_manage, mock_db, mock_user):
        """Returns 400 when trying to remove last ADMIN"""
        mock_can_manage.return_value = True

        # Only one ADMIN
        admin_access = NotebookAccess(
            id=1, notebook_id=100, user_id=1, org_id=None, permission=NotePermission.ADMIN, granted_by=1
        )
        mock_get_list.return_value = [admin_access]

        # Mock access lookup
        async def mock_execute(stmt):
            mock_result = AsyncMock()
            mock_result.scalar_one_or_none = MagicMock(return_value=admin_access)
            return mock_result

        mock_db.execute = mock_execute

        from app.api.notebooks import revoke_notebook_access_endpoint

        with pytest.raises(HTTPException) as exc_info:
            await revoke_notebook_access_endpoint(notebook_id=100, access_id=1, db=mock_db, current_user=mock_user)

        assert exc_info.value.status_code == 400
        assert "last owner" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    @patch("app.api.notebooks.can_manage_notebook_access")
    async def test_revoke_access_not_found(self, mock_can_manage, mock_db, mock_user):
        """Returns 404 when access_id not found"""
        mock_can_manage.return_value = True

        # Mock access lookup - not found
        async def mock_execute(stmt):
            mock_result = AsyncMock()
            mock_result.scalar_one_or_none = MagicMock(return_value=None)
            return mock_result

        mock_db.execute = mock_execute

        from app.api.notebooks import revoke_notebook_access_endpoint

        with pytest.raises(HTTPException) as exc_info:
            await revoke_notebook_access_endpoint(notebook_id=100, access_id=999, db=mock_db, current_user=mock_user)

        assert exc_info.value.status_code == 404
