# @TASK Notebooks CRUD API tests (TDD RED phase)
# @SPEC Notebooks CRUD API with permission checks
# @TEST tests/test_api_notebooks.py

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.constants import NotePermission


class TestListNotebooks:
    """Test GET /api/notebooks - List accessible notebooks with note_count"""

    @pytest.mark.asyncio
    async def test_list_notebooks_returns_accessible_notebooks(self):
        """Should return notebooks user has access to with note counts"""
        from app.api.notebooks import list_notebooks

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        # Mock get_accessible_notebooks to return [100, 200]
        with patch("app.api.notebooks.get_accessible_notebooks") as mock_get_accessible:
            mock_get_accessible.return_value = [100, 200]

            # Mock notebook query with note counts
            mock_notebook1 = MagicMock()
            mock_notebook1.id = 100
            mock_notebook1.name = "Work Notes"
            mock_notebook1.description = "Work related notes"
            mock_notebook1.is_public = False
            mock_notebook1.created_at = datetime(2025, 1, 1, tzinfo=UTC)
            mock_notebook1.updated_at = datetime(2025, 1, 2, tzinfo=UTC)

            mock_notebook2 = MagicMock()
            mock_notebook2.id = 200
            mock_notebook2.name = "Personal"
            mock_notebook2.description = None
            mock_notebook2.is_public = True
            mock_notebook2.created_at = datetime(2025, 1, 3, tzinfo=UTC)
            mock_notebook2.updated_at = datetime(2025, 1, 4, tzinfo=UTC)

            # Mock query result with note_count
            mock_result = MagicMock()
            mock_result.all.return_value = [
                (mock_notebook1, 5),  # (notebook, note_count)
                (mock_notebook2, 0),
            ]
            mock_db.execute.return_value = mock_result

            response = await list_notebooks(db=mock_db, current_user=mock_user)

            assert response.total == 2
            assert len(response.items) == 2
            assert response.items[0].id == 100
            assert response.items[0].name == "Work Notes"
            assert response.items[0].note_count == 5
            assert response.items[1].id == 200
            assert response.items[1].note_count == 0

    @pytest.mark.asyncio
    async def test_list_notebooks_returns_empty_when_no_access(self):
        """Should return empty list when user has no accessible notebooks"""
        from app.api.notebooks import list_notebooks

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        with patch("app.api.notebooks.get_accessible_notebooks") as mock_get_accessible:
            mock_get_accessible.return_value = []

            mock_result = MagicMock()
            mock_result.all.return_value = []
            mock_db.execute.return_value = mock_result

            response = await list_notebooks(db=mock_db, current_user=mock_user)

            assert response.total == 0
            assert response.items == []


class TestCreateNotebook:
    """Test POST /api/notebooks - Create notebook and auto-grant admin permission"""

    @pytest.mark.asyncio
    async def test_create_notebook_grants_admin_to_creator(self):
        """Should create notebook and automatically grant ADMIN permission to creator"""
        from app.api.notebooks import NotebookCreate, create_notebook

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        notebook_data = NotebookCreate(name="New Notebook", description="Test description")

        # Mock notebook creation
        mock_notebook = MagicMock()
        mock_notebook.id = 300
        mock_notebook.name = "New Notebook"
        mock_notebook.description = "Test description"
        mock_notebook.is_public = False
        mock_notebook.created_at = datetime(2025, 2, 7, tzinfo=UTC)
        mock_notebook.updated_at = datetime(2025, 2, 7, tzinfo=UTC)

        # Mock note count query
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 0
        mock_db.execute.return_value = mock_count_result

        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.refresh = AsyncMock()
        mock_db.commit = AsyncMock()

        # Mock grant_notebook_access
        with patch("app.api.notebooks.grant_notebook_access") as mock_grant:
            # Simulate notebook creation by setting attributes
            def add_side_effect(obj):
                obj.id = 300
                obj.is_public = False
                obj.created_at = datetime(2025, 2, 7, tzinfo=UTC)
                obj.updated_at = datetime(2025, 2, 7, tzinfo=UTC)

            mock_db.add.side_effect = add_side_effect

            response = await create_notebook(notebook=notebook_data, db=mock_db, current_user=mock_user)

            # Verify grant_notebook_access was called with ADMIN permission
            mock_grant.assert_called_once()
            call_args = mock_grant.call_args
            assert call_args[1]["notebook_id"] == 300
            assert call_args[1]["user_id"] == 1
            assert call_args[1]["permission"] == NotePermission.ADMIN
            assert call_args[1]["granted_by"] == 1

            assert response.id == 300
            assert response.name == "New Notebook"
            assert response.note_count == 0

    @pytest.mark.asyncio
    async def test_create_notebook_with_minimal_data(self):
        """Should create notebook with only required fields"""
        from app.api.notebooks import NotebookCreate, create_notebook

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        notebook_data = NotebookCreate(name="Minimal Notebook")

        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 0
        mock_db.execute.return_value = mock_count_result

        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.refresh = AsyncMock()
        mock_db.commit = AsyncMock()

        with patch("app.api.notebooks.grant_notebook_access"):

            def add_side_effect(obj):
                obj.id = 400
                obj.description = None
                obj.is_public = False
                obj.created_at = datetime(2025, 2, 7, tzinfo=UTC)
                obj.updated_at = datetime(2025, 2, 7, tzinfo=UTC)

            mock_db.add.side_effect = add_side_effect

            response = await create_notebook(notebook=notebook_data, db=mock_db, current_user=mock_user)

            assert response.id == 400
            assert response.name == "Minimal Notebook"
            assert response.description is None


class TestGetNotebook:
    """Test GET /api/notebooks/{id} - Get notebook details (requires READ permission)"""

    @pytest.mark.asyncio
    async def test_get_notebook_with_read_permission(self):
        """Should return notebook details when user has READ permission"""
        from app.api.notebooks import get_notebook

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        # Mock check_notebook_access to return True
        with patch("app.api.notebooks.check_notebook_access") as mock_check:
            mock_check.return_value = True

            # Mock notebook query
            mock_notebook = MagicMock()
            mock_notebook.id = 100
            mock_notebook.name = "Test Notebook"
            mock_notebook.description = "Test"
            mock_notebook.is_public = False
            mock_notebook.created_at = datetime(2025, 1, 1, tzinfo=UTC)
            mock_notebook.updated_at = datetime(2025, 1, 2, tzinfo=UTC)

            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_notebook
            mock_db.execute.return_value = mock_result

            # Mock note count
            mock_count_result = MagicMock()
            mock_count_result.scalar.return_value = 3
            mock_db.execute.side_effect = [mock_result, mock_count_result]

            response = await get_notebook(notebook_id=100, db=mock_db, current_user=mock_user)

            assert response.id == 100
            assert response.name == "Test Notebook"
            assert response.note_count == 3

            # Verify permission check was called
            mock_check.assert_called_once_with(mock_db, 1, 100, NotePermission.READ)

    @pytest.mark.asyncio
    async def test_get_notebook_without_permission_raises_403(self):
        """Should raise 403 when user lacks READ permission"""
        from app.api.notebooks import get_notebook

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        with patch("app.api.notebooks.check_notebook_access") as mock_check:
            mock_check.return_value = False

            with pytest.raises(HTTPException) as exc_info:
                await get_notebook(notebook_id=100, db=mock_db, current_user=mock_user)

            assert exc_info.value.status_code == 403
            assert "permission" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_get_notebook_not_found_raises_404(self):
        """Should raise 404 when notebook doesn't exist"""
        from app.api.notebooks import get_notebook

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        with patch("app.api.notebooks.check_notebook_access") as mock_check:
            mock_check.return_value = True

            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            mock_db.execute.return_value = mock_result

            with pytest.raises(HTTPException) as exc_info:
                await get_notebook(notebook_id=999, db=mock_db, current_user=mock_user)

            assert exc_info.value.status_code == 404


class TestUpdateNotebook:
    """Test PUT /api/notebooks/{id} - Update notebook (requires WRITE permission)"""

    @pytest.mark.asyncio
    async def test_update_notebook_with_write_permission(self):
        """Should update notebook when user has WRITE permission"""
        from app.api.notebooks import NotebookUpdate, update_notebook

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        update_data = NotebookUpdate(name="Updated Name", description="Updated description")

        with patch("app.api.notebooks.check_notebook_access") as mock_check:
            mock_check.return_value = True

            mock_notebook = MagicMock()
            mock_notebook.id = 100
            mock_notebook.name = "Old Name"
            mock_notebook.description = "Old description"
            mock_notebook.is_public = False
            mock_notebook.created_at = datetime(2025, 1, 1, tzinfo=UTC)
            mock_notebook.updated_at = datetime(2025, 1, 2, tzinfo=UTC)

            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_notebook
            mock_db.execute.return_value = mock_result

            # Mock note count
            mock_count_result = MagicMock()
            mock_count_result.scalar.return_value = 2
            mock_db.execute.side_effect = [mock_result, mock_count_result]

            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock()

            await update_notebook(notebook_id=100, notebook=update_data, db=mock_db, current_user=mock_user)

            # Verify permission check with WRITE
            mock_check.assert_called_once_with(mock_db, 1, 100, NotePermission.WRITE)

            # Verify fields were updated
            assert mock_notebook.name == "Updated Name"
            assert mock_notebook.description == "Updated description"

    @pytest.mark.asyncio
    async def test_update_notebook_without_permission_raises_403(self):
        """Should raise 403 when user lacks WRITE permission"""
        from app.api.notebooks import NotebookUpdate, update_notebook

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        update_data = NotebookUpdate(name="New Name")

        with patch("app.api.notebooks.check_notebook_access") as mock_check:
            mock_check.return_value = False

            with pytest.raises(HTTPException) as exc_info:
                await update_notebook(notebook_id=100, notebook=update_data, db=mock_db, current_user=mock_user)

            assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_update_notebook_partial_update(self):
        """Should update only provided fields"""
        from app.api.notebooks import NotebookUpdate, update_notebook

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        # Only update name, not description
        update_data = NotebookUpdate(name="New Name Only")

        with patch("app.api.notebooks.check_notebook_access") as mock_check:
            mock_check.return_value = True

            mock_notebook = MagicMock()
            mock_notebook.id = 100
            mock_notebook.name = "Old Name"
            mock_notebook.description = "Keep this"
            mock_notebook.is_public = False
            mock_notebook.created_at = datetime(2025, 1, 1, tzinfo=UTC)
            mock_notebook.updated_at = datetime(2025, 1, 2, tzinfo=UTC)

            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_notebook
            mock_db.execute.return_value = mock_result

            mock_count_result = MagicMock()
            mock_count_result.scalar.return_value = 0
            mock_db.execute.side_effect = [mock_result, mock_count_result]

            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock()

            await update_notebook(notebook_id=100, notebook=update_data, db=mock_db, current_user=mock_user)

            # Name should be updated, description should remain
            assert mock_notebook.name == "New Name Only"
            assert mock_notebook.description == "Keep this"


class TestDeleteNotebook:
    """Test DELETE /api/notebooks/{id} - Delete notebook (requires ADMIN permission)"""

    @pytest.mark.asyncio
    async def test_delete_notebook_with_admin_permission(self):
        """Should delete notebook when user has ADMIN permission and no notes exist"""
        from app.api.notebooks import delete_notebook

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        with patch("app.api.notebooks.check_notebook_access") as mock_check:
            mock_check.return_value = True

            mock_notebook = MagicMock()
            mock_notebook.id = 100

            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_notebook
            mock_db.execute.return_value = mock_result

            # Mock note count = 0 (no notes)
            mock_count_result = MagicMock()
            mock_count_result.scalar.return_value = 0
            mock_db.execute.side_effect = [mock_result, mock_count_result]

            mock_db.delete = AsyncMock()
            mock_db.commit = AsyncMock()

            response = await delete_notebook(notebook_id=100, db=mock_db, current_user=mock_user)

            # Verify permission check with ADMIN
            mock_check.assert_called_once_with(mock_db, 1, 100, NotePermission.ADMIN)

            assert response["success"] is True

    @pytest.mark.asyncio
    async def test_delete_notebook_without_permission_raises_403(self):
        """Should raise 403 when user lacks ADMIN permission"""
        from app.api.notebooks import delete_notebook

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        with patch("app.api.notebooks.check_notebook_access") as mock_check:
            mock_check.return_value = False

            with pytest.raises(HTTPException) as exc_info:
                await delete_notebook(notebook_id=100, db=mock_db, current_user=mock_user)

            assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_delete_notebook_with_notes_raises_400(self):
        """Should raise 400 when notebook has notes"""
        from app.api.notebooks import delete_notebook

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        with patch("app.api.notebooks.check_notebook_access") as mock_check:
            mock_check.return_value = True

            mock_notebook = MagicMock()
            mock_notebook.id = 100

            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_notebook
            mock_db.execute.return_value = mock_result

            # Mock note count = 5 (has notes)
            mock_count_result = MagicMock()
            mock_count_result.scalar.return_value = 5
            mock_db.execute.side_effect = [mock_result, mock_count_result]

            with pytest.raises(HTTPException) as exc_info:
                await delete_notebook(notebook_id=100, db=mock_db, current_user=mock_user)

            assert exc_info.value.status_code == 400
            assert "notes" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_delete_notebook_not_found_raises_404(self):
        """Should raise 404 when notebook doesn't exist"""
        from app.api.notebooks import delete_notebook

        mock_db = AsyncMock()
        mock_user = MagicMock(id=1)

        with patch("app.api.notebooks.check_notebook_access") as mock_check:
            mock_check.return_value = True

            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            mock_db.execute.return_value = mock_result

            with pytest.raises(HTTPException) as exc_info:
                await delete_notebook(notebook_id=999, db=mock_db, current_user=mock_user)

            assert exc_info.value.status_code == 404
