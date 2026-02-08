# @TASK ShareLink CRUD API tests
# @SPEC TDD tests for share link endpoints
# @TEST backend/app/api/share_links.py

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import NotePermission
from app.models import Notebook, ShareLink, User
from app.services.notebook_access_control import grant_notebook_access


@pytest.fixture
async def db(async_session: AsyncSession) -> AsyncSession:
    return async_session


@pytest.fixture
async def client(db: AsyncSession, test_user: User):
    from app.database import get_db
    from app.main import app
    from app.services.auth_service import get_current_user

    async def override_get_db():
        yield db

    def override_get_current_user():
        return test_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(email="testuser@example.com", name="Test User", password_hash="dummy_hash")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def other_user(db: AsyncSession) -> User:
    user = User(email="otheruser@example.com", name="Other User", password_hash="dummy_hash")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def test_notebook(db: AsyncSession, test_user: User) -> Notebook:
    """Create a test notebook with admin permission for test_user."""
    notebook = Notebook(name="Test Notebook", description="Test description")
    db.add(notebook)
    await db.flush()
    await db.refresh(notebook)

    # Grant ADMIN permission to test_user
    await grant_notebook_access(
        db=db,
        notebook_id=notebook.id,
        user_id=test_user.id,
        org_id=None,
        permission=NotePermission.ADMIN,
        granted_by=test_user.id,
    )
    await db.commit()
    return notebook


@pytest.fixture
async def test_notebook_read_only(db: AsyncSession, test_user: User, other_user: User) -> Notebook:
    """Create a test notebook where test_user has only READ permission."""
    notebook = Notebook(name="Read Only Notebook", description="Read only")
    db.add(notebook)
    await db.flush()
    await db.refresh(notebook)

    # Grant ADMIN to other_user
    await grant_notebook_access(
        db=db,
        notebook_id=notebook.id,
        user_id=other_user.id,
        org_id=None,
        permission=NotePermission.ADMIN,
        granted_by=other_user.id,
    )

    # Grant READ to test_user
    await grant_notebook_access(
        db=db,
        notebook_id=notebook.id,
        user_id=test_user.id,
        org_id=None,
        permission=NotePermission.READ,
        granted_by=other_user.id,
    )
    await db.commit()
    return notebook


class TestCreateShareLink:
    """Test POST /api/notebooks/{notebook_id}/links endpoint."""

    async def test_create_public_link(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """Should create a public share link."""
        response = await client.post(
            f"/api/notebooks/{test_notebook.id}/links",
            json={"link_type": "public"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["link_type"] == "public"
        assert data["notebook_id"] == test_notebook.id
        assert data["note_id"] is None
        assert data["token"] is not None
        assert len(data["token"]) == 43  # secrets.token_urlsafe(32) produces 43 chars
        assert data["is_active"] is True
        assert data["access_count"] == 0
        assert data["email_restriction"] is None
        assert data["expires_at"] is None

        # Verify in database
        stmt = select(ShareLink).where(ShareLink.token == data["token"])
        result = await db.execute(stmt)
        link = result.scalar_one_or_none()
        assert link is not None
        assert link.created_by == test_user.id

    async def test_create_email_required_link(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """Should create an email-required share link."""
        response = await client.post(
            f"/api/notebooks/{test_notebook.id}/links",
            json={
                "link_type": "email_required",
                "email_restriction": "allowed@example.com",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["link_type"] == "email_required"
        assert data["email_restriction"] == "allowed@example.com"
        assert data["expires_at"] is None

    async def test_create_time_limited_link(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """Should create a time-limited share link."""
        response = await client.post(
            f"/api/notebooks/{test_notebook.id}/links",
            json={
                "link_type": "time_limited",
                "expires_in_days": 7,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["link_type"] == "time_limited"
        assert data["expires_at"] is not None

        # Verify expires_at is approximately 7 days from now
        expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
        expected_expiry = datetime.now(UTC) + timedelta(days=7)
        assert abs((expires_at - expected_expiry).total_seconds()) < 60  # Within 1 minute

    async def test_create_link_missing_email_for_email_required(
        self, client: AsyncClient, test_user: User, test_notebook: Notebook
    ):
        """Should reject email_required link without email_restriction."""
        response = await client.post(
            f"/api/notebooks/{test_notebook.id}/links",
            json={"link_type": "email_required"},
        )

        assert response.status_code == 400
        assert "email_restriction" in response.json()["detail"].lower()

    async def test_create_link_missing_expires_in_days_for_time_limited(
        self, client: AsyncClient, test_user: User, test_notebook: Notebook
    ):
        """Should reject time_limited link without expires_in_days."""
        response = await client.post(
            f"/api/notebooks/{test_notebook.id}/links",
            json={"link_type": "time_limited"},
        )

        assert response.status_code == 400
        assert "expires_in_days" in response.json()["detail"].lower()

    async def test_create_link_invalid_link_type(self, client: AsyncClient, test_user: User, test_notebook: Notebook):
        """Should reject invalid link_type."""
        response = await client.post(
            f"/api/notebooks/{test_notebook.id}/links",
            json={"link_type": "invalid_type"},
        )

        assert response.status_code == 400
        assert "link_type" in response.json()["detail"].lower()

    async def test_create_link_expires_in_days_too_large(
        self, client: AsyncClient, test_user: User, test_notebook: Notebook
    ):
        """Should reject time_limited link with expires_in_days > 90."""
        response = await client.post(
            f"/api/notebooks/{test_notebook.id}/links",
            json={
                "link_type": "time_limited",
                "expires_in_days": 91,
            },
        )

        assert response.status_code == 400
        assert "90" in response.json()["detail"].lower()

    async def test_create_link_expires_in_days_too_small(
        self, client: AsyncClient, test_user: User, test_notebook: Notebook
    ):
        """Should reject time_limited link with expires_in_days < 1."""
        response = await client.post(
            f"/api/notebooks/{test_notebook.id}/links",
            json={
                "link_type": "time_limited",
                "expires_in_days": 0,
            },
        )

        assert response.status_code == 400
        assert "1" in response.json()["detail"].lower()

    async def test_create_link_max_active_links_limit(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """Should enforce max 10 active links per notebook per user."""
        # Create 10 active links
        for i in range(10):
            link = ShareLink(
                token=f"token_{i}_{'x' * 30}",
                notebook_id=test_notebook.id,
                link_type="public",
                created_by=test_user.id,
                is_active=True,
            )
            db.add(link)
        await db.commit()

        # Try to create 11th link
        response = await client.post(
            f"/api/notebooks/{test_notebook.id}/links",
            json={"link_type": "public"},
        )

        assert response.status_code == 400
        assert "10" in response.json()["detail"].lower()
        assert "active" in response.json()["detail"].lower()

    async def test_create_link_without_admin_permission(
        self, client: AsyncClient, test_user: User, test_notebook_read_only: Notebook
    ):
        """Should reject link creation without ADMIN permission."""
        response = await client.post(
            f"/api/notebooks/{test_notebook_read_only.id}/links",
            json={"link_type": "public"},
        )

        assert response.status_code == 403
        assert "permission" in response.json()["detail"].lower()

    async def test_create_link_notebook_not_found(self, client: AsyncClient, test_user: User):
        """Should return 404 for non-existent notebook."""
        response = await client.post(
            "/api/notebooks/99999/links",
            json={"link_type": "public"},
        )

        assert response.status_code == 404


class TestListShareLinks:
    """Test GET /api/notebooks/{notebook_id}/links endpoint."""

    async def test_list_active_links_only(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """Should list only active links."""
        # Create 2 active links
        active1 = ShareLink(
            token="active_token_1_" + "x" * 28,
            notebook_id=test_notebook.id,
            link_type="public",
            created_by=test_user.id,
            is_active=True,
        )
        active2 = ShareLink(
            token="active_token_2_" + "x" * 28,
            notebook_id=test_notebook.id,
            link_type="email_required",
            email_restriction="test@example.com",
            created_by=test_user.id,
            is_active=True,
        )
        # Create 1 inactive link
        inactive = ShareLink(
            token="inactive_token_" + "x" * 28,
            notebook_id=test_notebook.id,
            link_type="public",
            created_by=test_user.id,
            is_active=False,
        )
        db.add_all([active1, active2, inactive])
        await db.commit()

        response = await client.get(f"/api/notebooks/{test_notebook.id}/links")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

        # Verify inactive link is not in the list
        tokens = [item["token"] for item in data["items"]]
        assert inactive.token not in tokens

    async def test_list_links_empty(self, client: AsyncClient, test_user: User, test_notebook: Notebook):
        """Should return empty list when no active links exist."""
        response = await client.get(f"/api/notebooks/{test_notebook.id}/links")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []

    async def test_list_links_without_admin_permission(
        self, client: AsyncClient, test_user: User, test_notebook_read_only: Notebook
    ):
        """Should reject list request without ADMIN permission."""
        response = await client.get(f"/api/notebooks/{test_notebook_read_only.id}/links")

        assert response.status_code == 403

    async def test_list_links_notebook_not_found(self, client: AsyncClient, test_user: User):
        """Should return 404 for non-existent notebook."""
        response = await client.get("/api/notebooks/99999/links")

        assert response.status_code == 404


class TestRevokeShareLink:
    """Test DELETE /api/notebooks/{notebook_id}/links/{link_id} endpoint."""

    async def test_revoke_link_success(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """Should soft delete (set is_active=False) the link."""
        link = ShareLink(
            token="revoke_token_" + "x" * 30,
            notebook_id=test_notebook.id,
            link_type="public",
            created_by=test_user.id,
            is_active=True,
        )
        db.add(link)
        await db.commit()
        await db.refresh(link)

        response = await client.delete(f"/api/notebooks/{test_notebook.id}/links/{link.id}")

        assert response.status_code == 204

        # Verify link is soft deleted
        await db.refresh(link)
        assert link.is_active is False

    async def test_revoke_link_without_admin_permission(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_notebook_read_only: Notebook
    ):
        """Should reject revoke request without ADMIN permission."""
        link = ShareLink(
            token="revoke_token_2_" + "x" * 29,
            notebook_id=test_notebook_read_only.id,
            link_type="public",
            created_by=test_user.id,
            is_active=True,
        )
        db.add(link)
        await db.commit()
        await db.refresh(link)

        response = await client.delete(f"/api/notebooks/{test_notebook_read_only.id}/links/{link.id}")

        assert response.status_code == 403

    async def test_revoke_link_not_found(self, client: AsyncClient, test_user: User, test_notebook: Notebook):
        """Should return 404 for non-existent link."""
        response = await client.delete(f"/api/notebooks/{test_notebook.id}/links/99999")

        assert response.status_code == 404

    async def test_revoke_link_notebook_not_found(self, client: AsyncClient, test_user: User):
        """Should return 404 for non-existent notebook."""
        response = await client.delete("/api/notebooks/99999/links/1")

        assert response.status_code == 404


class TestCreateNoteShareLink:
    """Test POST /api/notes/{note_id}/links endpoint."""

    async def test_create_note_link_success(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """Should create a share link for a note (checking notebook access)."""
        from app.models import Note

        note = Note(
            synology_note_id=f"test_note_{test_notebook.id}",
            title="Test Note",
            content_html="<p>Test content</p>",
            content_text="Test content",
            notebook_id=test_notebook.id,
        )
        db.add(note)
        await db.commit()
        await db.refresh(note)

        response = await client.post(
            f"/api/notes/{note.id}/links",
            json={"link_type": "public"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["link_type"] == "public"
        assert data["note_id"] == note.id
        assert data["notebook_id"] is None
        assert data["token"] is not None

    async def test_create_note_link_without_notebook_access(
        self, client: AsyncClient, db: AsyncSession, test_user: User, other_user: User
    ):
        """Should reject note link creation without notebook access."""
        from app.models import Note

        # Create notebook with admin permission for other_user only
        notebook = Notebook(name="Private Notebook")
        db.add(notebook)
        await db.flush()

        await grant_notebook_access(
            db=db,
            notebook_id=notebook.id,
            user_id=other_user.id,
            org_id=None,
            permission=NotePermission.ADMIN,
            granted_by=other_user.id,
        )

        note = Note(
            synology_note_id=f"private_note_{notebook.id}",
            title="Private Note",
            content_html="<p>Private content</p>",
            content_text="Private content",
            notebook_id=notebook.id,
        )
        db.add(note)
        await db.commit()
        await db.refresh(note)

        # test_user should not have access
        response = await client.post(
            f"/api/notes/{note.id}/links",
            json={"link_type": "public"},
        )

        assert response.status_code == 403

    async def test_create_note_link_note_not_found(self, client: AsyncClient, test_user: User):
        """Should return 404 for non-existent note."""
        response = await client.post(
            "/api/notes/99999/links",
            json={"link_type": "public"},
        )

        assert response.status_code == 404
