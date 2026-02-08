# @TASK Public shared content access tests
# @SPEC TDD tests for GET /shared/{token} endpoint
# @TEST backend/app/api/shared.py

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Note, Notebook, ShareLink, User


@pytest.fixture
async def db(async_session: AsyncSession) -> AsyncSession:
    return async_session


@pytest.fixture
async def client(db: AsyncSession):
    """Unauthenticated client for public endpoints."""
    from app.database import get_db
    from app.main import app

    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(email="shareowner@example.com", name="Share Owner", password_hash="dummy_hash")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def test_notebook(db: AsyncSession, test_user: User) -> Notebook:
    """Create a test notebook."""
    notebook = Notebook(
        name="Shared Notebook",
        description="This notebook is shared publicly",
        owner_id=test_user.id,
    )
    db.add(notebook)
    await db.commit()
    await db.refresh(notebook)
    return notebook


@pytest.fixture
async def test_note(db: AsyncSession, test_notebook: Notebook) -> Note:
    """Create a test note."""
    note = Note(
        synology_note_id="shared_note_123",
        title="Shared Note Title",
        content_html="<p>This is the <strong>HTML content</strong> of the shared note.</p>",
        content_text="This is the HTML content of the shared note.",
        notebook_id=test_notebook.id,
        notebook_name=test_notebook.name,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


class TestPublicSharedAccess:
    """Test GET /shared/{token} for public links."""

    async def test_access_public_notebook_link(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_notebook: Notebook, test_note: Note
    ):
        """Should return notebook content for valid public link."""
        link = ShareLink(
            token="public_notebook_token_xyz123",
            notebook_id=test_notebook.id,
            link_type="public",
            created_by=test_user.id,
            is_active=True,
            access_count=0,
        )
        db.add(link)
        await db.commit()

        response = await client.get(f"/api/shared/{link.token}")

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "notebook"
        assert data["notebook"] is not None
        assert data["note"] is None
        assert data["notebook"]["id"] == test_notebook.id
        assert data["notebook"]["name"] == test_notebook.name
        assert data["notebook"]["description"] == test_notebook.description
        assert len(data["notebook"]["notes"]) == 1
        assert data["notebook"]["notes"][0]["id"] == test_note.id
        assert data["notebook"]["notes"][0]["title"] == test_note.title
        assert "preview" in data["notebook"]["notes"][0]
        assert data["expires_at"] is None

        # Verify access_count incremented
        await db.refresh(link)
        assert link.access_count == 1

    async def test_access_public_note_link(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_note: Note
    ):
        """Should return note content for valid public note link."""
        link = ShareLink(
            token="public_note_token_abc456",
            note_id=test_note.id,
            link_type="public",
            created_by=test_user.id,
            is_active=True,
            access_count=5,
        )
        db.add(link)
        await db.commit()

        response = await client.get(f"/api/shared/{link.token}")

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "note"
        assert data["note"] is not None
        assert data["notebook"] is None
        assert data["note"]["id"] == test_note.id
        assert data["note"]["title"] == test_note.title
        assert data["note"]["content_html"] == test_note.content_html
        assert data["note"]["content_text"] == test_note.content_text
        assert data["expires_at"] is None

        # Verify access_count incremented
        await db.refresh(link)
        assert link.access_count == 6

    async def test_access_nonexistent_token(self, client: AsyncClient):
        """Should return 404 for non-existent token."""
        response = await client.get("/api/shared/nonexistent_token_xyz")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    async def test_access_expired_link(self, client: AsyncClient, db: AsyncSession, test_user: User, test_note: Note):
        """Should return 410 Gone for expired link."""
        expired_time = datetime.now(UTC) - timedelta(days=1)
        link = ShareLink(
            token="expired_token_xyz",
            note_id=test_note.id,
            link_type="time_limited",
            created_by=test_user.id,
            is_active=True,
            expires_at=expired_time,
        )
        db.add(link)
        await db.commit()

        response = await client.get(f"/api/shared/{link.token}")

        assert response.status_code == 410
        assert "expired" in response.json()["detail"].lower()

        # Verify access_count NOT incremented
        await db.refresh(link)
        assert link.access_count == 0

    async def test_access_revoked_link(self, client: AsyncClient, db: AsyncSession, test_user: User, test_note: Note):
        """Should return 410 Gone for revoked (is_active=False) link."""
        link = ShareLink(
            token="revoked_token_abc",
            note_id=test_note.id,
            link_type="public",
            created_by=test_user.id,
            is_active=False,
        )
        db.add(link)
        await db.commit()

        response = await client.get(f"/api/shared/{link.token}")

        assert response.status_code == 410
        assert "revoked" in response.json()["detail"].lower()


class TestEmailRequiredLinks:
    """Test email-restricted share links."""

    async def test_access_with_correct_email(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_note: Note
    ):
        """Should allow access with correct email header."""
        link = ShareLink(
            token="email_required_token_xyz",
            note_id=test_note.id,
            link_type="email_required",
            created_by=test_user.id,
            is_active=True,
            email_restriction="allowed@example.com",
        )
        db.add(link)
        await db.commit()

        response = await client.get(
            f"/api/shared/{link.token}",
            headers={"X-Email": "allowed@example.com"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "note"
        assert data["note"]["id"] == test_note.id

        # Verify access_count incremented
        await db.refresh(link)
        assert link.access_count == 1

    async def test_access_with_wrong_email(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_note: Note
    ):
        """Should return 403 for email mismatch."""
        link = ShareLink(
            token="email_required_token_xyz2",
            note_id=test_note.id,
            link_type="email_required",
            created_by=test_user.id,
            is_active=True,
            email_restriction="allowed@example.com",
        )
        db.add(link)
        await db.commit()

        response = await client.get(
            f"/api/shared/{link.token}",
            headers={"X-Email": "wrong@example.com"},
        )

        assert response.status_code == 403
        assert "email" in response.json()["detail"].lower()

        # Verify access_count NOT incremented
        await db.refresh(link)
        assert link.access_count == 0

    async def test_access_without_email_header(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_note: Note
    ):
        """Should return 403 for missing email header."""
        link = ShareLink(
            token="email_required_token_xyz3",
            note_id=test_note.id,
            link_type="email_required",
            created_by=test_user.id,
            is_active=True,
            email_restriction="required@example.com",
        )
        db.add(link)
        await db.commit()

        response = await client.get(f"/api/shared/{link.token}")

        assert response.status_code == 403
        assert "email" in response.json()["detail"].lower()


class TestTimeLimitedLinks:
    """Test time-limited share links."""

    async def test_access_before_expiry(self, client: AsyncClient, db: AsyncSession, test_user: User, test_note: Note):
        """Should allow access before expiry."""
        future_time = datetime.now(UTC) + timedelta(days=7)
        link = ShareLink(
            token="time_limited_token_valid",
            note_id=test_note.id,
            link_type="time_limited",
            created_by=test_user.id,
            is_active=True,
            expires_at=future_time,
        )
        db.add(link)
        await db.commit()

        response = await client.get(f"/api/shared/{link.token}")

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "note"
        assert data["expires_at"] is not None

        # Verify access_count incremented
        await db.refresh(link)
        assert link.access_count == 1

    async def test_access_after_expiry(self, client: AsyncClient, db: AsyncSession, test_user: User, test_note: Note):
        """Should return 410 after expiry."""
        past_time = datetime.now(UTC) - timedelta(hours=1)
        link = ShareLink(
            token="time_limited_token_expired",
            note_id=test_note.id,
            link_type="time_limited",
            created_by=test_user.id,
            is_active=True,
            expires_at=past_time,
        )
        db.add(link)
        await db.commit()

        response = await client.get(f"/api/shared/{link.token}")

        assert response.status_code == 410


class TestNotebookWithMultipleNotes:
    """Test notebook links return all notes."""

    async def test_notebook_with_multiple_notes(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """Should return all notes in notebook."""
        # Create multiple notes
        notes = []
        for i in range(3):
            note = Note(
                synology_note_id=f"note_{i}",
                title=f"Note {i}",
                content_html=f"<p>Content {i}</p>",
                content_text=f"Content {i} " * 50,  # Long content to test preview
                notebook_id=test_notebook.id,
            )
            db.add(note)
            notes.append(note)
        await db.commit()

        link = ShareLink(
            token="notebook_multi_notes",
            notebook_id=test_notebook.id,
            link_type="public",
            created_by=test_user.id,
            is_active=True,
        )
        db.add(link)
        await db.commit()

        response = await client.get(f"/api/shared/{link.token}")

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "notebook"
        assert len(data["notebook"]["notes"]) == 3

        # Verify preview truncation
        for note_preview in data["notebook"]["notes"]:
            assert "preview" in note_preview
            assert len(note_preview["preview"]) <= 200


class TestContentPreview:
    """Test content preview truncation."""

    async def test_note_preview_truncation(
        self, client: AsyncClient, db: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """Should truncate preview to 200 chars."""
        long_content = "A" * 500
        note = Note(
            synology_note_id="long_note",
            title="Long Note",
            content_html=f"<p>{long_content}</p>",
            content_text=long_content,
            notebook_id=test_notebook.id,
        )
        db.add(note)
        await db.commit()

        link = ShareLink(
            token="notebook_preview_test",
            notebook_id=test_notebook.id,
            link_type="public",
            created_by=test_user.id,
            is_active=True,
        )
        db.add(link)
        await db.commit()

        response = await client.get(f"/api/shared/{link.token}")

        assert response.status_code == 200
        data = response.json()
        note_preview = data["notebook"]["notes"][0]["preview"]
        assert len(note_preview) <= 200
        assert note_preview.endswith("...")
