# @TASK P1-T1.2 - NoteStation API wrapper tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#synology-gateway
# @TEST tests/test_notestation.py

"""Tests for the NoteStation API wrapper service.

Verifies that NoteStationService correctly delegates to SynologyClient
and provides proper data transformation (HTML -> plain text).
"""

from unittest.mock import AsyncMock

import pytest

from app.synology_gateway.client import SynologyApiError, SynologyClient

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_client() -> AsyncMock:
    """Provide a mocked SynologyClient whose `.request()` is an AsyncMock."""
    client = AsyncMock(spec=SynologyClient)
    return client


@pytest.fixture
def notestation_service(mock_client: AsyncMock):
    """Provide a NoteStationService backed by the mocked SynologyClient."""
    from app.synology_gateway.notestation import NoteStationService

    return NoteStationService(client=mock_client)


# ---------------------------------------------------------------------------
# 1. list_notes - note list retrieval
# ---------------------------------------------------------------------------


class TestListNotes:
    """Note listing with offset/limit support."""

    @pytest.mark.asyncio
    async def test_list_notes_returns_data(self, notestation_service, mock_client):
        """list_notes returns the data dict from SynologyClient.request()."""
        mock_client.request.return_value = {
            "notes": [
                {"note_id": "n001", "title": "First note"},
                {"note_id": "n002", "title": "Second note"},
            ],
            "total": 2,
        }

        result = await notestation_service.list_notes()

        assert result["total"] == 2
        assert len(result["notes"]) == 2
        assert result["notes"][0]["note_id"] == "n001"

    @pytest.mark.asyncio
    async def test_list_notes_default_no_pagination(self, notestation_service, mock_client):
        """list_notes sends NO offset/limit by default (fetch all at once)."""
        mock_client.request.return_value = {"notes": [], "total": 0}

        await notestation_service.list_notes()

        mock_client.request.assert_called_once_with(
            "SYNO.NoteStation.Note",
            "list",
            version=1,
        )

    @pytest.mark.asyncio
    async def test_list_notes_custom_offset_limit(self, notestation_service, mock_client):
        """list_notes forwards custom offset and limit parameters."""
        mock_client.request.return_value = {"notes": [], "total": 0}

        await notestation_service.list_notes(offset=20, limit=10)

        mock_client.request.assert_called_once_with(
            "SYNO.NoteStation.Note",
            "list",
            version=1,
            offset=20,
            limit=10,
        )


# ---------------------------------------------------------------------------
# 2. get_note - single note retrieval
# ---------------------------------------------------------------------------


class TestGetNote:
    """Retrieve a single note by ID."""

    @pytest.mark.asyncio
    async def test_get_note_returns_data(self, notestation_service, mock_client):
        """get_note returns the note data for the given ID."""
        mock_client.request.return_value = {
            "note_id": "n001",
            "title": "My Note",
            "content": "<p>Hello</p>",
        }

        result = await notestation_service.get_note("n001")

        assert result["note_id"] == "n001"
        assert result["title"] == "My Note"

    @pytest.mark.asyncio
    async def test_get_note_calls_correct_api(self, notestation_service, mock_client):
        """get_note calls SYNO.NoteStation.Note with method=get."""
        mock_client.request.return_value = {"note_id": "n001"}

        await notestation_service.get_note("n001")

        mock_client.request.assert_called_once_with(
            "SYNO.NoteStation.Note",
            "get",
            version=1,
            object_id="n001",
        )


# ---------------------------------------------------------------------------
# 3. list_notebooks - notebook listing
# ---------------------------------------------------------------------------


class TestListNotebooks:
    """Notebook listing."""

    @pytest.mark.asyncio
    async def test_list_notebooks_returns_list(self, notestation_service, mock_client):
        """list_notebooks returns a list of notebook dicts."""
        mock_client.request.return_value = {
            "notebooks": [
                {"notebook_id": "nb01", "name": "Research"},
                {"notebook_id": "nb02", "name": "Personal"},
            ]
        }

        result = await notestation_service.list_notebooks()

        assert len(result) == 2
        assert result[0]["notebook_id"] == "nb01"

    @pytest.mark.asyncio
    async def test_list_notebooks_calls_correct_api(self, notestation_service, mock_client):
        """list_notebooks calls SYNO.NoteStation.Notebook with method=list."""
        mock_client.request.return_value = {"notebooks": []}

        await notestation_service.list_notebooks()

        mock_client.request.assert_called_once_with(
            "SYNO.NoteStation.Notebook",
            "list",
            version=1,
        )


# ---------------------------------------------------------------------------
# 4. list_tags - tag listing
# ---------------------------------------------------------------------------


class TestListTags:
    """Tag listing."""

    @pytest.mark.asyncio
    async def test_list_tags_returns_list(self, notestation_service, mock_client):
        """list_tags returns a list of tag dicts."""
        mock_client.request.return_value = {
            "tags": [
                {"tag_id": "t01", "name": "important"},
                {"tag_id": "t02", "name": "review"},
            ]
        }

        result = await notestation_service.list_tags()

        assert len(result) == 2
        assert result[0]["name"] == "important"

    @pytest.mark.asyncio
    async def test_list_tags_calls_correct_api(self, notestation_service, mock_client):
        """list_tags calls SYNO.NoteStation.Tag with method=list."""
        mock_client.request.return_value = {"tags": []}

        await notestation_service.list_tags()

        mock_client.request.assert_called_once_with(
            "SYNO.NoteStation.Tag",
            "list",
            version=1,
        )


# ---------------------------------------------------------------------------
# 5. list_todos - todo listing
# ---------------------------------------------------------------------------


class TestListTodos:
    """Todo listing."""

    @pytest.mark.asyncio
    async def test_list_todos_returns_list(self, notestation_service, mock_client):
        """list_todos returns a list of todo dicts."""
        mock_client.request.return_value = {
            "todos": [
                {"todo_id": "td01", "title": "Buy milk", "completed": False},
            ]
        }

        result = await notestation_service.list_todos()

        assert len(result) == 1
        assert result[0]["title"] == "Buy milk"

    @pytest.mark.asyncio
    async def test_list_todos_calls_correct_api(self, notestation_service, mock_client):
        """list_todos calls SYNO.NoteStation.Todo with method=list."""
        mock_client.request.return_value = {"todos": []}

        await notestation_service.list_todos()

        mock_client.request.assert_called_once_with(
            "SYNO.NoteStation.Todo",
            "list",
            version=1,
        )


# ---------------------------------------------------------------------------
# 6. list_shortcuts - shortcut listing
# ---------------------------------------------------------------------------


class TestListShortcuts:
    """Shortcut listing."""

    @pytest.mark.asyncio
    async def test_list_shortcuts_returns_list(self, notestation_service, mock_client):
        """list_shortcuts returns a list of shortcut dicts."""
        mock_client.request.return_value = {
            "shortcuts": [
                {"shortcut_id": "sc01", "title": "Quick Note"},
            ]
        }

        result = await notestation_service.list_shortcuts()

        assert len(result) == 1
        assert result[0]["title"] == "Quick Note"

    @pytest.mark.asyncio
    async def test_list_shortcuts_calls_correct_api(self, notestation_service, mock_client):
        """list_shortcuts calls SYNO.NoteStation.Shortcut with method=list."""
        mock_client.request.return_value = {"shortcuts": []}

        await notestation_service.list_shortcuts()

        mock_client.request.assert_called_once_with(
            "SYNO.NoteStation.Shortcut",
            "list",
            version=1,
        )


# ---------------------------------------------------------------------------
# 7. list_smart - smart folder listing
# ---------------------------------------------------------------------------


class TestListSmart:
    """Smart folder listing."""

    @pytest.mark.asyncio
    async def test_list_smart_returns_list(self, notestation_service, mock_client):
        """list_smart returns a list of smart folder dicts."""
        mock_client.request.return_value = {
            "smarts": [
                {"smart_id": "sm01", "name": "Recent Notes"},
            ]
        }

        result = await notestation_service.list_smart()

        assert len(result) == 1
        assert result[0]["name"] == "Recent Notes"

    @pytest.mark.asyncio
    async def test_list_smart_calls_correct_api(self, notestation_service, mock_client):
        """list_smart calls SYNO.NoteStation.Smart with method=list."""
        mock_client.request.return_value = {"smarts": []}

        await notestation_service.list_smart()

        mock_client.request.assert_called_once_with(
            "SYNO.NoteStation.Smart",
            "list",
            version=1,
        )


# ---------------------------------------------------------------------------
# 8. extract_text - HTML to plain text
# ---------------------------------------------------------------------------


class TestExtractText:
    """HTML body parsing to plain text using BeautifulSoup."""

    def test_simple_html(self):
        """Simple HTML tags are stripped to plain text."""
        from app.synology_gateway.notestation import NoteStationService

        html = "<p>Hello World</p>"
        result = NoteStationService.extract_text(html)
        assert result == "Hello World"

    def test_nested_html(self):
        """Nested HTML elements are flattened to text."""
        from app.synology_gateway.notestation import NoteStationService

        html = "<div><h1>Title</h1><p>Body <strong>bold</strong> text</p></div>"
        result = NoteStationService.extract_text(html)
        assert "Title" in result
        assert "Body" in result
        assert "bold" in result
        assert "text" in result

    def test_multiline_html(self):
        """Multiple block elements produce newline-separated text."""
        from app.synology_gateway.notestation import NoteStationService

        html = "<p>Line one</p><p>Line two</p>"
        result = NoteStationService.extract_text(html)
        assert "Line one" in result
        assert "Line two" in result
        # Lines should be separated by newline
        assert "\n" in result

    def test_html_with_entities(self):
        """HTML entities are decoded."""
        from app.synology_gateway.notestation import NoteStationService

        html = "<p>A &amp; B &lt; C</p>"
        result = NoteStationService.extract_text(html)
        assert "A & B < C" in result

    def test_empty_html(self):
        """Empty HTML returns empty string."""
        from app.synology_gateway.notestation import NoteStationService

        result = NoteStationService.extract_text("")
        assert result == ""

    def test_whitespace_only_html(self):
        """HTML with only whitespace returns empty string."""
        from app.synology_gateway.notestation import NoteStationService

        result = NoteStationService.extract_text("<p>   </p>")
        assert result == ""

    def test_script_tags_removed(self):
        """Script tags and their content are removed."""
        from app.synology_gateway.notestation import NoteStationService

        html = "<p>Safe</p><script>alert('xss')</script><p>Content</p>"
        result = NoteStationService.extract_text(html)
        assert "Safe" in result
        assert "Content" in result
        assert "alert" not in result
        assert "script" not in result

    def test_style_tags_removed(self):
        """Style tags and their content are removed."""
        from app.synology_gateway.notestation import NoteStationService

        html = "<style>.red{color:red}</style><p>Visible</p>"
        result = NoteStationService.extract_text(html)
        assert "Visible" in result
        assert "color" not in result


# ---------------------------------------------------------------------------
# 9. Empty results handling
# ---------------------------------------------------------------------------


class TestEmptyResults:
    """Empty API responses are handled gracefully."""

    @pytest.mark.asyncio
    async def test_list_notes_empty(self, notestation_service, mock_client):
        """Empty notes list returns proper structure."""
        mock_client.request.return_value = {"notes": [], "total": 0}

        result = await notestation_service.list_notes()

        assert result["notes"] == []
        assert result["total"] == 0

    @pytest.mark.asyncio
    async def test_list_notebooks_empty(self, notestation_service, mock_client):
        """Empty notebooks list returns empty list."""
        mock_client.request.return_value = {"notebooks": []}

        result = await notestation_service.list_notebooks()

        assert result == []

    @pytest.mark.asyncio
    async def test_list_tags_empty(self, notestation_service, mock_client):
        """Empty tags list returns empty list."""
        mock_client.request.return_value = {"tags": []}

        result = await notestation_service.list_tags()

        assert result == []

    @pytest.mark.asyncio
    async def test_list_todos_empty(self, notestation_service, mock_client):
        """Empty todos list returns empty list."""
        mock_client.request.return_value = {"todos": []}

        result = await notestation_service.list_todos()

        assert result == []

    @pytest.mark.asyncio
    async def test_list_shortcuts_empty(self, notestation_service, mock_client):
        """Empty shortcuts list returns empty list."""
        mock_client.request.return_value = {"shortcuts": []}

        result = await notestation_service.list_shortcuts()

        assert result == []

    @pytest.mark.asyncio
    async def test_list_smart_empty(self, notestation_service, mock_client):
        """Empty smart folders list returns empty list."""
        mock_client.request.return_value = {"smarts": []}

        result = await notestation_service.list_smart()

        assert result == []


# ---------------------------------------------------------------------------
# 10. API error propagation
# ---------------------------------------------------------------------------


class TestErrorPropagation:
    """SynologyApiError from the client propagates through NoteStationService."""

    @pytest.mark.asyncio
    async def test_list_notes_error_propagates(self, notestation_service, mock_client):
        """API error from list_notes propagates as SynologyApiError."""
        mock_client.request.side_effect = SynologyApiError(code=408)

        with pytest.raises(SynologyApiError) as exc_info:
            await notestation_service.list_notes()

        assert exc_info.value.code == 408

    @pytest.mark.asyncio
    async def test_get_note_error_propagates(self, notestation_service, mock_client):
        """API error from get_note propagates as SynologyApiError."""
        mock_client.request.side_effect = SynologyApiError(code=404)

        with pytest.raises(SynologyApiError) as exc_info:
            await notestation_service.get_note("missing_id")

        assert exc_info.value.code == 404

    @pytest.mark.asyncio
    async def test_list_notebooks_error_propagates(self, notestation_service, mock_client):
        """API error from list_notebooks propagates as SynologyApiError."""
        mock_client.request.side_effect = SynologyApiError(code=500)

        with pytest.raises(SynologyApiError):
            await notestation_service.list_notebooks()

    @pytest.mark.asyncio
    async def test_list_tags_error_propagates(self, notestation_service, mock_client):
        """API error from list_tags propagates as SynologyApiError."""
        mock_client.request.side_effect = SynologyApiError(code=500)

        with pytest.raises(SynologyApiError):
            await notestation_service.list_tags()
