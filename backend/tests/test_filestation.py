# @TASK P1-T1.3 - FileStation API wrapper tests
# @SPEC docs/Synology_File_Station_API_Guide.md#SYNO.FileStation.List
# @SPEC docs/Synology_File_Station_API_Guide.md#SYNO.FileStation.Upload
# @SPEC docs/Synology_File_Station_API_Guide.md#SYNO.FileStation.Download
# @TEST tests/test_filestation.py

"""Tests for the FileStation API wrapper service.

Verifies that FileStationService correctly delegates to SynologyClient
for file listing, info retrieval, upload, and download operations.
All network calls are mocked -- no real Synology NAS required.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.synology_gateway.client import SynologyClient

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_client() -> AsyncMock:
    """Provide a mocked SynologyClient whose `.request()` is an AsyncMock.

    Also sets up `_client` (httpx.AsyncClient) and `_sid`/`_url` for
    upload/download operations that bypass ``request()``.
    """
    client = AsyncMock(spec=SynologyClient)
    client._url = "http://localhost:5000"
    client._sid = "test_session_id"
    client._client = AsyncMock(spec=httpx.AsyncClient)
    return client


@pytest.fixture
def filestation_service(mock_client: AsyncMock):
    """Provide a FileStationService backed by the mocked SynologyClient."""
    from app.synology_gateway.filestation import FileStationService

    return FileStationService(client=mock_client)


# ---------------------------------------------------------------------------
# 1. list_files -- directory file listing
# ---------------------------------------------------------------------------


class TestListFiles:
    """File listing with offset/limit support."""

    @pytest.mark.asyncio
    async def test_list_files_returns_data(self, filestation_service, mock_client):
        """list_files returns the data dict from SynologyClient.request()."""
        mock_client.request.return_value = {
            "total": 2,
            "offset": 0,
            "files": [
                {"path": "/volume1/docs/file1.txt", "name": "file1.txt", "isdir": False},
                {"path": "/volume1/docs/subdir", "name": "subdir", "isdir": True},
            ],
        }

        result = await filestation_service.list_files("/volume1/docs")

        assert result["total"] == 2
        assert len(result["files"]) == 2
        assert result["files"][0]["name"] == "file1.txt"

    @pytest.mark.asyncio
    async def test_list_files_calls_correct_api(self, filestation_service, mock_client):
        """list_files calls SYNO.FileStation.List with method=list."""
        mock_client.request.return_value = {"total": 0, "offset": 0, "files": []}

        await filestation_service.list_files("/volume1/shared", offset=10, limit=50)

        mock_client.request.assert_called_once_with(
            "SYNO.FileStation.List",
            "list",
            version=2,
            folder_path="/volume1/shared",
            offset=10,
            limit=50,
            additional="real_path,size,time,type",
        )

    @pytest.mark.asyncio
    async def test_list_files_default_offset_limit(self, filestation_service, mock_client):
        """list_files uses offset=0, limit=100 by default."""
        mock_client.request.return_value = {"total": 0, "offset": 0, "files": []}

        await filestation_service.list_files("/volume1/data")

        mock_client.request.assert_called_once_with(
            "SYNO.FileStation.List",
            "list",
            version=2,
            folder_path="/volume1/data",
            offset=0,
            limit=100,
            additional="real_path,size,time,type",
        )

    @pytest.mark.asyncio
    async def test_list_files_empty_directory(self, filestation_service, mock_client):
        """Empty directory returns total=0 and empty files list."""
        mock_client.request.return_value = {"total": 0, "offset": 0, "files": []}

        result = await filestation_service.list_files("/volume1/empty")

        assert result["total"] == 0
        assert result["files"] == []

    @pytest.mark.asyncio
    async def test_list_files_invalid_path_raises(self, filestation_service):
        """list_files raises ValueError for invalid paths."""
        with pytest.raises(ValueError, match="Invalid path"):
            await filestation_service.list_files("relative/path")

    @pytest.mark.asyncio
    async def test_list_files_traversal_path_raises(self, filestation_service):
        """list_files raises ValueError for path traversal attempts."""
        with pytest.raises(ValueError, match="Invalid path"):
            await filestation_service.list_files("/volume1/../etc/passwd")


# ---------------------------------------------------------------------------
# 2. get_info -- file/folder information
# ---------------------------------------------------------------------------


class TestGetInfo:
    """File/folder information retrieval."""

    @pytest.mark.asyncio
    async def test_get_info_returns_data(self, filestation_service, mock_client):
        """get_info returns file information dict."""
        mock_client.request.return_value = {
            "files": [
                {
                    "path": "/volume1/docs/report.pdf",
                    "name": "report.pdf",
                    "isdir": False,
                    "additional": {
                        "size": 1048576,
                        "time": {"mtime": 1700000000},
                    },
                }
            ]
        }

        result = await filestation_service.get_info("/volume1/docs/report.pdf")

        assert result["files"][0]["name"] == "report.pdf"
        assert result["files"][0]["additional"]["size"] == 1048576

    @pytest.mark.asyncio
    async def test_get_info_calls_correct_api(self, filestation_service, mock_client):
        """get_info calls SYNO.FileStation.List with method=getinfo."""
        mock_client.request.return_value = {"files": []}

        await filestation_service.get_info("/volume1/docs/file.txt")

        mock_client.request.assert_called_once_with(
            "SYNO.FileStation.List",
            "getinfo",
            version=2,
            path="/volume1/docs/file.txt",
            additional="real_path,size,owner,time,perm,type",
        )

    @pytest.mark.asyncio
    async def test_get_info_invalid_path_raises(self, filestation_service):
        """get_info raises ValueError for invalid paths."""
        with pytest.raises(ValueError, match="Invalid path"):
            await filestation_service.get_info("no_leading_slash")

    @pytest.mark.asyncio
    async def test_get_info_traversal_path_raises(self, filestation_service):
        """get_info raises ValueError for path traversal attempts."""
        with pytest.raises(ValueError, match="Invalid path"):
            await filestation_service.get_info("/volume1/../../etc/shadow")


# ---------------------------------------------------------------------------
# 3. upload_file -- file upload (multipart/form-data)
# ---------------------------------------------------------------------------


class TestUploadFile:
    """File upload via multipart/form-data POST."""

    @pytest.mark.asyncio
    async def test_upload_file_sends_post(self, filestation_service, mock_client):
        """upload_file sends a POST with multipart/form-data."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.json.return_value = {"success": True, "data": {}}
        mock_response.status_code = 200
        mock_client._client.post = AsyncMock(return_value=mock_response)

        content = b"Hello, file content!"
        result = await filestation_service.upload_file(
            dest_folder="/volume1/uploads",
            filename="test.txt",
            content=content,
        )

        mock_client._client.post.assert_called_once()
        assert result == {}

    @pytest.mark.asyncio
    async def test_upload_file_correct_params(self, filestation_service, mock_client):
        """upload_file includes correct API params and file data."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.json.return_value = {"success": True, "data": {}}
        mock_response.status_code = 200
        mock_client._client.post = AsyncMock(return_value=mock_response)

        content = b"binary data here"
        await filestation_service.upload_file(
            dest_folder="/volume1/uploads",
            filename="document.pdf",
            content=content,
        )

        call_kwargs = mock_client._client.post.call_args
        # Check URL
        url = call_kwargs[0][0] if call_kwargs[0] else call_kwargs[1].get("url", "")
        assert "/webapi/entry.cgi" in str(url)

        # Check data params
        data = call_kwargs[1].get("data", {})
        assert data["api"] == "SYNO.FileStation.Upload"
        assert data["method"] == "upload"
        assert data["version"] == "2"
        assert data["path"] == "/volume1/uploads"
        assert data["create_parents"] == "true"
        assert data["overwrite"] == "true"
        assert data["_sid"] == "test_session_id"

        # Check file
        files = call_kwargs[1].get("files", {})
        assert "file" in files
        file_tuple = files["file"]
        assert file_tuple[0] == "document.pdf"
        assert file_tuple[1] == content

    @pytest.mark.asyncio
    async def test_upload_file_auto_login(self, filestation_service, mock_client):
        """upload_file calls login() if no session exists."""
        mock_client._sid = None
        mock_client.login = AsyncMock(return_value="new_session")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.json.return_value = {"success": True, "data": {}}
        mock_response.status_code = 200
        mock_client._client.post = AsyncMock(return_value=mock_response)

        # After login, _sid should be set
        async def set_sid():
            mock_client._sid = "new_session"
            return "new_session"

        mock_client.login = AsyncMock(side_effect=set_sid)

        await filestation_service.upload_file(
            dest_folder="/volume1/uploads",
            filename="file.txt",
            content=b"data",
        )

        mock_client.login.assert_called_once()

    @pytest.mark.asyncio
    async def test_upload_file_invalid_dest_raises(self, filestation_service):
        """upload_file raises ValueError for invalid destination path."""
        with pytest.raises(ValueError, match="Invalid path"):
            await filestation_service.upload_file(
                dest_folder="relative/path",
                filename="file.txt",
                content=b"data",
            )

    @pytest.mark.asyncio
    async def test_upload_file_traversal_dest_raises(self, filestation_service):
        """upload_file raises ValueError for path traversal in destination."""
        with pytest.raises(ValueError, match="Invalid path"):
            await filestation_service.upload_file(
                dest_folder="/volume1/../etc",
                filename="file.txt",
                content=b"data",
            )

    @pytest.mark.asyncio
    async def test_upload_file_api_error(self, filestation_service, mock_client):
        """upload_file raises when the API responds with an error."""
        from app.synology_gateway.client import SynologyApiError

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.json.return_value = {"success": False, "error": {"code": 1805}}
        mock_response.status_code = 200
        mock_client._client.post = AsyncMock(return_value=mock_response)

        with pytest.raises(SynologyApiError):
            await filestation_service.upload_file(
                dest_folder="/volume1/uploads",
                filename="file.txt",
                content=b"data",
            )


# ---------------------------------------------------------------------------
# 4. download_file -- file download (binary response)
# ---------------------------------------------------------------------------


class TestDownloadFile:
    """File download returning binary data."""

    @pytest.mark.asyncio
    async def test_download_file_returns_bytes(self, filestation_service, mock_client):
        """download_file returns binary file content."""
        file_content = b"PDF binary content here..."
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.content = file_content
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/octet-stream"}
        mock_client._client.get = AsyncMock(return_value=mock_response)

        result = await filestation_service.download_file("/volume1/docs/report.pdf")

        assert result == file_content

    @pytest.mark.asyncio
    async def test_download_file_correct_params(self, filestation_service, mock_client):
        """download_file sends GET with correct query params."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.content = b"file data"
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/octet-stream"}
        mock_client._client.get = AsyncMock(return_value=mock_response)

        await filestation_service.download_file("/volume1/docs/file.txt")

        mock_client._client.get.assert_called_once()
        call_kwargs = mock_client._client.get.call_args
        url = call_kwargs[0][0] if call_kwargs[0] else call_kwargs[1].get("url", "")
        assert "/webapi/entry.cgi" in str(url)

        params = call_kwargs[1].get("params", {})
        assert params["api"] == "SYNO.FileStation.Download"
        assert params["method"] == "download"
        assert params["version"] == 2
        assert params["path"] == "/volume1/docs/file.txt"
        assert params["mode"] == "download"
        assert params["_sid"] == "test_session_id"

    @pytest.mark.asyncio
    async def test_download_file_auto_login(self, filestation_service, mock_client):
        """download_file calls login() if no session exists."""
        mock_client._sid = None

        async def set_sid():
            mock_client._sid = "new_session"
            return "new_session"

        mock_client.login = AsyncMock(side_effect=set_sid)

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.content = b"data"
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/octet-stream"}
        mock_client._client.get = AsyncMock(return_value=mock_response)

        await filestation_service.download_file("/volume1/docs/file.txt")

        mock_client.login.assert_called_once()

    @pytest.mark.asyncio
    async def test_download_file_invalid_path_raises(self, filestation_service):
        """download_file raises ValueError for invalid paths."""
        with pytest.raises(ValueError, match="Invalid path"):
            await filestation_service.download_file("not/absolute")

    @pytest.mark.asyncio
    async def test_download_file_traversal_path_raises(self, filestation_service):
        """download_file raises ValueError for path traversal attempts."""
        with pytest.raises(ValueError, match="Invalid path"):
            await filestation_service.download_file("/volume1/../../etc/passwd")

    @pytest.mark.asyncio
    async def test_download_file_404_raises(self, filestation_service, mock_client):
        """download_file raises when file is not found (JSON error response)."""
        from app.synology_gateway.client import SynologyApiError

        # When a download fails, Synology may return JSON with error
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {"success": False, "error": {"code": 408}}
        mock_client._client.get = AsyncMock(return_value=mock_response)

        with pytest.raises(SynologyApiError):
            await filestation_service.download_file("/volume1/docs/missing.txt")


# ---------------------------------------------------------------------------
# 5. validate_path -- path validation
# ---------------------------------------------------------------------------


class TestValidatePath:
    """Path validation for security (prevent path traversal)."""

    def test_valid_absolute_path(self):
        """Absolute paths starting with / are valid."""
        from app.synology_gateway.filestation import FileStationService

        assert FileStationService.validate_path("/volume1/shared") is True
        assert FileStationService.validate_path("/volume1/docs/file.txt") is True
        assert FileStationService.validate_path("/data") is True

    def test_invalid_relative_path(self):
        """Relative paths (not starting with /) are invalid."""
        from app.synology_gateway.filestation import FileStationService

        assert FileStationService.validate_path("relative/path") is False
        assert FileStationService.validate_path("file.txt") is False

    def test_invalid_traversal_path(self):
        """Paths containing '..' are invalid (path traversal prevention)."""
        from app.synology_gateway.filestation import FileStationService

        assert FileStationService.validate_path("/volume1/../etc") is False
        assert FileStationService.validate_path("/volume1/../../passwd") is False
        assert FileStationService.validate_path("/../etc") is False

    def test_empty_path_invalid(self):
        """Empty or whitespace-only paths are invalid."""
        from app.synology_gateway.filestation import FileStationService

        assert FileStationService.validate_path("") is False
        assert FileStationService.validate_path("   ") is False

    def test_root_path_valid(self):
        """Root path '/' is valid."""
        from app.synology_gateway.filestation import FileStationService

        assert FileStationService.validate_path("/") is True

    def test_dots_in_filename_valid(self):
        """Single dots in filenames are OK (not traversal)."""
        from app.synology_gateway.filestation import FileStationService

        assert FileStationService.validate_path("/volume1/file.name.txt") is True
        assert FileStationService.validate_path("/volume1/.hidden") is True

    def test_double_dot_segment_invalid(self):
        """Path segments that are exactly '..' are invalid."""
        from app.synology_gateway.filestation import FileStationService

        assert FileStationService.validate_path("/volume1/..") is False
        assert FileStationService.validate_path("/..") is False
