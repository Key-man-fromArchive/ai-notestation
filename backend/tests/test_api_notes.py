# @TASK P4-T4.2 - Notes API endpoint tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#notes-api
# @TEST tests/test_api_notes.py

"""Tests for the Notes API endpoints.

Covers:
- GET /api/notes          -- paginated note list
- GET /api/notes/{note_id} -- single note detail
- GET /api/notebooks      -- notebook list
- GET /api/tags           -- tag list
- GET /api/todos          -- todo list
- GET /api/shortcuts      -- shortcut list
- GET /api/smart          -- smart note list

All endpoints require JWT authentication (mocked via dependency override).
NoteStationService is fully mocked via FastAPI dependency_overrides.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_app():
    """Import the FastAPI app with notes router included."""
    from app.main import app

    return app


class _ScalarList:
    def __init__(self, values):
        self._values = values

    def all(self):
        return self._values

    def __iter__(self):
        return iter(self._values)


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one(self):
        return self._value

    def scalar_one_or_none(self):
        return self._value

    def scalars(self):
        return _ScalarList(self._value)

    def all(self):
        return self._value


def _make_note(
    *,
    note_id: str,
    title: str,
    notebook_name: str | None,
    content_html: str,
    content_text: str,
    updated_at: datetime,
    created_at: datetime,
    tags: list[str] | None = None,
):
    from app.models import Note

    return Note(
        synology_note_id=note_id,
        title=title,
        content_html=content_html,
        content_text=content_text,
        notebook_name=notebook_name,
        tags=tags,
        is_todo=False,
        is_shortcut=False,
        source_created_at=created_at,
        source_updated_at=updated_at,
        synced_at=updated_at,
    )


def _setup_overrides(app, mock_ns=None, mock_db=None):
    """Override auth, NoteStationService, and DB dependencies."""
    from app.api.notes import _get_ns_service
    from app.database import get_db
    from app.services.auth_service import get_current_user

    async def _fake_current_user():
        return {
            "username": "testuser@example.com",
            "email": "testuser@example.com",
            "user_id": 1,
            "org_id": 1,
            "role": "owner",
        }

    def _fake_ns_service():
        return mock_ns

    app.dependency_overrides[get_current_user] = _fake_current_user
    if mock_ns is not None:
        app.dependency_overrides[_get_ns_service] = _fake_ns_service
    if mock_db is not None:
        app.dependency_overrides[get_db] = lambda: mock_db
    return app


def _clear_overrides(app):
    """Clear all dependency overrides."""
    app.dependency_overrides.clear()


def _make_mock_ns_service(
    *,
    list_notes_return=None,
    get_note_return=None,
    list_notebooks_return=None,
    list_tags_return=None,
    list_todos_return=None,
    list_shortcuts_return=None,
    list_smart_return=None,
    get_note_side_effect=None,
):
    """Build a mock NoteStationService with configurable return values."""
    mock_ns = AsyncMock()
    mock_ns.list_notes = AsyncMock(return_value=list_notes_return or {"notes": [], "total": 0})
    if get_note_side_effect:
        mock_ns.get_note = AsyncMock(side_effect=get_note_side_effect)
    else:
        mock_ns.get_note = AsyncMock(return_value=get_note_return or {"note": {}})
    mock_ns.list_notebooks = AsyncMock(return_value=list_notebooks_return or [])
    mock_ns.list_tags = AsyncMock(return_value=list_tags_return or [])
    mock_ns.list_todos = AsyncMock(return_value=list_todos_return or [])
    mock_ns.list_shortcuts = AsyncMock(return_value=list_shortcuts_return or [])
    mock_ns.list_smart = AsyncMock(return_value=list_smart_return or [])
    return mock_ns


# ---------------------------------------------------------------------------
# GET /api/notes - Note list
# ---------------------------------------------------------------------------


class TestListNotes:
    """Test GET /api/notes endpoint."""

    @pytest.mark.asyncio
    async def test_list_notes_success(self):
        """Should return paginated note list."""
        app = _get_app()

        now = datetime.now(UTC)
        notes = [
            _make_note(
                note_id="n1",
                title="Test Note 1",
                notebook_name="Research",
                content_html="<p>Hello</p>",
                content_text="Hello",
                updated_at=now,
                created_at=now,
                tags=["python", "fastapi"],
            ),
            _make_note(
                note_id="n2",
                title="Test Note 2",
                notebook_name=None,
                content_html="<p>World</p>",
                content_text="World",
                updated_at=now,
                created_at=now,
                tags=[],
            ),
        ]

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(side_effect=[_Result(2), _Result(notes)])
        _setup_overrides(app, mock_db=mock_db)

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/notes")

            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 2
            assert data["offset"] == 0
            assert data["limit"] == 50
            assert len(data["items"]) == 2
            assert data["items"][0]["note_id"] == "n1"
            assert data["items"][0]["title"] == "Test Note 1"
            assert data["items"][0]["tags"] == ["python", "fastapi"]
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_list_notes_with_pagination(self):
        """Should respect offset and limit query parameters."""
        app = _get_app()

        now = datetime.now(UTC)
        notes = [
            _make_note(
                note_id="n3",
                title="Page 2 Note",
                notebook_name="Lab",
                content_html="<p>Page</p>",
                content_text="Page",
                updated_at=now,
                created_at=now,
                tags=[],
            )
        ]

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(side_effect=[_Result(25), _Result(notes)])
        _setup_overrides(app, mock_db=mock_db)

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/notes?offset=10&limit=10")

            assert response.status_code == 200
            data = response.json()
            assert data["offset"] == 10
            assert data["limit"] == 10
            assert data["total"] == 25
            assert len(data["items"]) == 1
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_list_notes_empty(self):
        """Empty result should return valid paginated response."""
        app = _get_app()

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(side_effect=[_Result(0), _Result([])])
        _setup_overrides(app, mock_db=mock_db)

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/notes")

            assert response.status_code == 200
            data = response.json()
            assert data["items"] == []
            assert data["total"] == 0
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_list_notes_unauthenticated(self):
        """Request without auth should return 401."""
        app = _get_app()
        _clear_overrides(app)
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/notes")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/notes/{note_id} - Note detail
# ---------------------------------------------------------------------------


class TestGetNote:
    """Test GET /api/notes/{note_id} endpoint."""

    @pytest.mark.asyncio
    async def test_get_note_success(self):
        """Should return full note detail with content."""
        app = _get_app()

        now = datetime.now(UTC)
        db_note = _make_note(
            note_id="n42",
            title="Detailed Note",
            notebook_name="Research",
            content_html="<p>Hello <strong>world</strong></p>",
            content_text="Hello world",
            updated_at=now,
            created_at=now,
            tags=["biology"],
        )

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(side_effect=[_Result(db_note), _Result([]), _Result([]), _Result([])])
        _setup_overrides(app, mock_db=mock_db)

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/notes/n42")

            assert response.status_code == 200
            data = response.json()
            assert data["note_id"] == "n42"
            assert data["title"] == "Detailed Note"
            assert data["content"] == "<p>Hello <strong>world</strong></p>"
            assert data["notebook"] == "Research"
            assert data["tags"] == ["biology"]
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_get_note_not_found(self):
        """Non-existent note_id should return 404."""
        from app.synology_gateway.client import SynologyApiError

        app = _get_app()

        mock_ns = _make_mock_ns_service(get_note_side_effect=SynologyApiError(code=408, message="Note not found"))
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=_Result(None))
        _setup_overrides(app, mock_ns=mock_ns, mock_db=mock_db)

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/notes/nonexistent")

            assert response.status_code == 404
            data = response.json()
            assert "detail" in data
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_get_note_unauthenticated(self):
        """Request without auth should return 401."""
        app = _get_app()
        _clear_overrides(app)
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/notes/n1")

        assert response.status_code == 401



# ---------------------------------------------------------------------------
# GET /api/tags - Tag list
# ---------------------------------------------------------------------------


class TestListTags:
    """Test GET /api/tags endpoint."""

    @pytest.mark.asyncio
    async def test_list_tags_success(self):
        """Should return list of tags."""
        app = _get_app()

        mock_ns = _make_mock_ns_service(
            list_tags_return=[
                {"tag_id": "t1", "name": "python"},
                {"tag_id": "t2", "name": "ai"},
            ]
        )
        _setup_overrides(app, mock_ns)

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/tags")

            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 2
            assert data[0]["name"] == "python"
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_list_tags_unauthenticated(self):
        """Request without auth should return 401."""
        app = _get_app()
        _clear_overrides(app)
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/tags")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/todos - Todo list
# ---------------------------------------------------------------------------


class TestListTodos:
    """Test GET /api/todos endpoint."""

    @pytest.mark.asyncio
    async def test_list_todos_success(self):
        """Should return list of todos."""
        app = _get_app()

        mock_ns = _make_mock_ns_service(
            list_todos_return=[
                {"todo_id": "td1", "title": "Write tests", "completed": False},
            ]
        )
        _setup_overrides(app, mock_ns)

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/todos")

            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 1
            assert data[0]["title"] == "Write tests"
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_list_todos_unauthenticated(self):
        """Request without auth should return 401."""
        app = _get_app()
        _clear_overrides(app)
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/todos")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/shortcuts - Shortcut list
# ---------------------------------------------------------------------------


class TestListShortcuts:
    """Test GET /api/shortcuts endpoint."""

    @pytest.mark.asyncio
    async def test_list_shortcuts_success(self):
        """Should return list of shortcuts."""
        app = _get_app()

        mock_ns = _make_mock_ns_service(
            list_shortcuts_return=[
                {"shortcut_id": "sc1", "title": "Quick Note"},
            ]
        )
        _setup_overrides(app, mock_ns)

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/shortcuts")

            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 1
            assert data[0]["title"] == "Quick Note"
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_list_shortcuts_unauthenticated(self):
        """Request without auth should return 401."""
        app = _get_app()
        _clear_overrides(app)
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/shortcuts")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/smart - Smart note list
# ---------------------------------------------------------------------------


class TestListSmart:
    """Test GET /api/smart endpoint."""

    @pytest.mark.asyncio
    async def test_list_smart_success(self):
        """Should return list of smart notes."""
        app = _get_app()

        mock_ns = _make_mock_ns_service(
            list_smart_return=[
                {"smart_id": "sm1", "name": "Recent Notes"},
            ]
        )
        _setup_overrides(app, mock_ns)

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/smart")

            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 1
            assert data[0]["name"] == "Recent Notes"
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_list_smart_unauthenticated(self):
        """Request without auth should return 401."""
        app = _get_app()
        _clear_overrides(app)
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/smart")

        assert response.status_code == 401
