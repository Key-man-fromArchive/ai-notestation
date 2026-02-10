from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.constants import MemberRole, NotePermission
from app.main import app

client = TestClient(app)


@pytest.fixture
def mock_db():
    return AsyncMock()


@pytest.fixture
def valid_member_token():
    return "valid-test-token"


@pytest.fixture
def mock_current_member():
    return {
        "user_id": 1,
        "org_id": 1,
        "role": MemberRole.OWNER,
        "email": "owner@example.com",
    }


class TestGetNoteSharing:
    def test_requires_auth(self):
        response = client.get("/api/notes/1/share")
        assert response.status_code == 401

    def test_requires_bearer_token(self):
        response = client.get("/api/notes/1/share", headers={"Authorization": "invalid"})
        assert response.status_code == 401

    @patch("app.api.sharing.get_current_user")
    @patch("app.api.sharing.get_note_access_list")
    @patch("app.api.sharing.can_manage_note_access")
    def test_returns_access_list(
        self,
        mock_can_manage,
        mock_get_access,
        mock_get_current_user,
        mock_current_member,
    ):
        mock_get_current_user.return_value = mock_current_member
        mock_can_manage.return_value = True
        mock_get_access.return_value = []

        response = client.get(
            "/api/notes/1/share",
            headers={"Authorization": "Bearer valid-token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "accesses" in data
        assert "can_manage" in data


class TestGrantNoteSharing:
    def test_requires_auth(self):
        response = client.post(
            "/api/notes/1/share",
            json={"email": "user@example.com", "permission": "read"},
        )
        assert response.status_code == 401

    @patch("app.api.sharing.get_current_user")
    @patch("app.api.sharing.can_manage_note_access")
    def test_requires_manage_permission(
        self,
        mock_can_manage,
        mock_get_current_user,
        mock_current_member,
    ):
        mock_current_member["role"] = MemberRole.VIEWER
        mock_get_current_user.return_value = mock_current_member
        mock_can_manage.return_value = False

        response = client.post(
            "/api/notes/1/share",
            json={"email": "user@example.com", "permission": "read"},
            headers={"Authorization": "Bearer valid-token"},
        )

        assert response.status_code == 403

    @patch("app.api.sharing.get_current_user")
    @patch("app.api.sharing.can_manage_note_access")
    @patch("app.api.sharing.get_user_by_email")
    def test_user_not_found(
        self,
        mock_get_user_by_email,
        mock_can_manage,
        mock_get_current_user,
        mock_current_member,
    ):
        mock_get_current_user.return_value = mock_current_member
        mock_can_manage.return_value = True
        mock_get_user_by_email.return_value = None

        response = client.post(
            "/api/notes/1/share",
            json={"email": "nonexistent@example.com", "permission": "read"},
            headers={"Authorization": "Bearer valid-token"},
        )

        assert response.status_code == 404

    @patch("app.api.sharing.get_current_user")
    @patch("app.api.sharing.can_manage_note_access")
    @patch("app.api.sharing.get_user_by_email")
    @patch("app.api.sharing.grant_note_access")
    def test_grants_access_successfully(
        self,
        mock_grant,
        mock_get_user_by_email,
        mock_can_manage,
        mock_get_current_user,
        mock_current_member,
    ):
        mock_get_current_user.return_value = mock_current_member
        mock_can_manage.return_value = True

        target_user = MagicMock()
        target_user.id = 2
        target_user.email = "user@example.com"
        target_user.name = "Test User"
        mock_get_user_by_email.return_value = target_user

        access = MagicMock()
        access.id = 1
        access.note_id = 1
        access.user_id = 2
        access.org_id = None
        access.permission = NotePermission.READ
        access.granted_by = 1
        mock_grant.return_value = access

        response = client.post(
            "/api/notes/1/share",
            json={"email": "user@example.com", "permission": "read"},
            headers={"Authorization": "Bearer valid-token"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["user_email"] == "user@example.com"
        assert data["permission"] == "read"


class TestRevokeNoteSharing:
    def test_requires_auth(self):
        response = client.delete("/api/notes/1/share/1")
        assert response.status_code == 401

    @patch("app.api.sharing.get_current_user")
    @patch("app.api.sharing.can_manage_note_access")
    def test_requires_manage_permission(
        self,
        mock_can_manage,
        mock_get_current_user,
        mock_current_member,
    ):
        mock_current_member["role"] = MemberRole.VIEWER
        mock_get_current_user.return_value = mock_current_member
        mock_can_manage.return_value = False

        response = client.delete(
            "/api/notes/1/share/1",
            headers={"Authorization": "Bearer valid-token"},
        )

        assert response.status_code == 403


class TestGrantOrgWideAccess:
    def test_requires_auth(self):
        response = client.post("/api/notes/1/share/org")
        assert response.status_code == 401

    @patch("app.api.sharing.get_current_user")
    @patch("app.api.sharing.can_manage_note_access")
    @patch("app.api.sharing.grant_note_access")
    def test_grants_org_access_successfully(
        self,
        mock_grant,
        mock_can_manage,
        mock_get_current_user,
        mock_current_member,
    ):
        mock_get_current_user.return_value = mock_current_member
        mock_can_manage.return_value = True

        access = MagicMock()
        access.id = 1
        access.note_id = 1
        access.user_id = None
        access.org_id = 1
        access.permission = NotePermission.READ
        access.granted_by = 1
        mock_grant.return_value = access

        response = client.post(
            "/api/notes/1/share/org",
            params={"permission": "read"},
            headers={"Authorization": "Bearer valid-token"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["is_org_wide"] is True
        assert data["org_id"] == 1
