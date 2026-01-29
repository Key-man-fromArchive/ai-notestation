# @TASK P1-T1.3 - FileStation API wrapper service
# @SPEC docs/Synology_File_Station_API_Guide.md#SYNO.FileStation.List
# @SPEC docs/Synology_File_Station_API_Guide.md#SYNO.FileStation.Upload
# @SPEC docs/Synology_File_Station_API_Guide.md#SYNO.FileStation.Download

"""Synology File Station API wrapper.

Provides a high-level async interface over the raw Synology
``SYNO.FileStation.*`` API endpoints for file operations:

- **List**: Enumerate files in a folder (``SYNO.FileStation.List`` / ``list``)
- **Info**: Get detailed file/folder info (``SYNO.FileStation.List`` / ``getinfo``)
- **Upload**: Upload a file via multipart POST (``SYNO.FileStation.Upload`` / ``upload``)
- **Download**: Download a file as binary (``SYNO.FileStation.Download`` / ``download``)

All network calls are delegated to :class:`~app.synology_gateway.client.SynologyClient`,
which handles authentication and session management.

Usage::

    async with SynologyClient(url, user, password) as client:
        fs = FileStationService(client)
        files = await fs.list_files("/volume1/shared")
        data = await fs.download_file("/volume1/shared/report.pdf")
"""

from __future__ import annotations

import logging

from app.synology_gateway.client import SynologyApiError, SynologyClient

logger = logging.getLogger(__name__)


class FileStationService:
    """Synology File Station API wrapper.

    Wraps the following File Station sub-APIs:

    - ``SYNO.FileStation.List``     -- list files / get info
    - ``SYNO.FileStation.Upload``   -- upload files (multipart/form-data)
    - ``SYNO.FileStation.Download`` -- download files (binary response)

    Path validation is enforced on all methods to prevent path traversal
    attacks.  All paths must be absolute (start with ``/``) and must not
    contain ``..`` segments.

    Args:
        client: An authenticated (or auto-authenticating) SynologyClient.
    """

    def __init__(self, client: SynologyClient) -> None:
        self._client = client

    # ------------------------------------------------------------------
    # Path validation
    # ------------------------------------------------------------------

    @staticmethod
    def validate_path(path: str) -> bool:
        """Validate a Synology file path.

        Rules:
        - Must not be empty or whitespace-only.
        - Must start with ``/`` (absolute path).
        - Must not contain ``..`` as a path segment (path traversal prevention).

        Args:
            path: The file/folder path to validate.

        Returns:
            ``True`` if the path is valid, ``False`` otherwise.
        """
        if not path or not path.strip():
            return False

        stripped = path.strip()

        # Must be absolute
        if not stripped.startswith("/"):
            return False

        # Check for path traversal: no segment may be exactly ".."
        segments = stripped.split("/")
        return all(segment != ".." for segment in segments)

    def _ensure_valid_path(self, path: str) -> None:
        """Raise ``ValueError`` if the path is invalid.

        Args:
            path: The file/folder path to validate.

        Raises:
            ValueError: If the path fails :meth:`validate_path`.
        """
        if not self.validate_path(path):
            raise ValueError(
                f"Invalid path: {path!r}. "
                "Path must be absolute (start with '/') and must not contain '..' segments."
            )

    # ------------------------------------------------------------------
    # Ensure authenticated session
    # ------------------------------------------------------------------

    async def _ensure_session(self) -> None:
        """Ensure the underlying client has an active session.

        Calls ``login()`` if ``_sid`` is ``None``.
        """
        if self._client._sid is None:
            await self._client.login()

    # ------------------------------------------------------------------
    # List files
    # ------------------------------------------------------------------

    async def list_files(
        self,
        folder_path: str,
        offset: int = 0,
        limit: int = 100,
    ) -> dict:
        """Enumerate files in a given folder.

        Calls ``SYNO.FileStation.List`` / ``list`` (version 2).

        Args:
            folder_path: Absolute path to the folder (e.g. ``/volume1/shared``).
            offset: Number of files to skip (for pagination).
            limit: Maximum number of files to return.

        Returns:
            A dict containing ``total`` (int), ``offset`` (int), and
            ``files`` (list of file dicts).

        Raises:
            ValueError: If ``folder_path`` is invalid.
            SynologyApiError: If the API returns an error.
        """
        self._ensure_valid_path(folder_path)

        return await self._client.request(
            "SYNO.FileStation.List",
            "list",
            version=2,
            folder_path=folder_path,
            offset=offset,
            limit=limit,
            additional="real_path,size,time,type",
        )

    # ------------------------------------------------------------------
    # Get file info
    # ------------------------------------------------------------------

    async def get_info(self, path: str) -> dict:
        """Get detailed information about a file or folder.

        Calls ``SYNO.FileStation.List`` / ``getinfo`` (version 2).

        Args:
            path: Absolute path to the file/folder.

        Returns:
            A dict containing ``files`` (list with a single file info dict).

        Raises:
            ValueError: If ``path`` is invalid.
            SynologyApiError: If the API returns an error.
        """
        self._ensure_valid_path(path)

        return await self._client.request(
            "SYNO.FileStation.List",
            "getinfo",
            version=2,
            path=path,
            additional="real_path,size,owner,time,perm,type",
        )

    # ------------------------------------------------------------------
    # Upload file
    # ------------------------------------------------------------------

    async def upload_file(
        self,
        dest_folder: str,
        filename: str,
        content: bytes,
        *,
        create_parents: bool = True,
        overwrite: bool = True,
    ) -> dict:
        """Upload a file to the Synology NAS.

        Sends a POST multipart/form-data request to
        ``SYNO.FileStation.Upload`` / ``upload`` (version 2).

        The upload bypasses :meth:`SynologyClient.request` because the
        Synology Upload API requires ``multipart/form-data`` encoding
        (RFC 1867), with the file content as the last part.

        Args:
            dest_folder: Absolute destination folder path.
            filename: Name for the uploaded file.
            content: Raw binary file content.
            create_parents: Create parent folders if they don't exist.
            overwrite: Overwrite existing file if present.

        Returns:
            The ``data`` dict from the Synology success response (typically empty).

        Raises:
            ValueError: If ``dest_folder`` is invalid.
            SynologyApiError: If the API returns an error.
        """
        self._ensure_valid_path(dest_folder)
        await self._ensure_session()

        url = f"{self._client._url}/webapi/entry.cgi"

        # API parameters go as form fields (not query params)
        data = {
            "api": "SYNO.FileStation.Upload",
            "method": "upload",
            "version": "2",
            "path": dest_folder,
            "create_parents": str(create_parents).lower(),
            "overwrite": str(overwrite).lower(),
            "_sid": self._client._sid,
        }

        # File content must be the last part (RFC 1867)
        files = {
            "file": (filename, content),
        }

        logger.debug(
            "Uploading file %r to %r",
            filename,
            dest_folder,
        )

        response = await self._client._client.post(
            url,
            data=data,
            files=files,
        )

        result = response.json()

        if not result.get("success"):
            error_code = result.get("error", {}).get("code", 0)
            logger.warning(
                "File upload failed (code=%d, file=%r, dest=%r)",
                error_code,
                filename,
                dest_folder,
            )
            raise SynologyApiError(error_code)

        logger.info("Uploaded %r to %r", filename, dest_folder)
        return result.get("data", {})

    # ------------------------------------------------------------------
    # Download file
    # ------------------------------------------------------------------

    async def download_file(self, file_path: str) -> bytes:
        """Download a file from the Synology NAS.

        Sends a GET request to ``SYNO.FileStation.Download`` / ``download``
        (version 2).  The response body is the raw file content.

        The download bypasses :meth:`SynologyClient.request` because the
        Synology Download API returns binary content rather than JSON.

        Args:
            file_path: Absolute path to the file to download.

        Returns:
            The raw binary file content.

        Raises:
            ValueError: If ``file_path`` is invalid.
            SynologyApiError: If the file is not found or another API error occurs.
        """
        self._ensure_valid_path(file_path)
        await self._ensure_session()

        url = f"{self._client._url}/webapi/entry.cgi"

        params = {
            "api": "SYNO.FileStation.Download",
            "method": "download",
            "version": 2,
            "path": file_path,
            "mode": "download",
            "_sid": self._client._sid,
        }

        logger.debug("Downloading file %r", file_path)

        response = await self._client._client.get(url, params=params)

        # If the response is JSON, it's likely an error
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            result = response.json()
            if not result.get("success"):
                error_code = result.get("error", {}).get("code", 0)
                logger.warning(
                    "File download failed (code=%d, path=%r)",
                    error_code,
                    file_path,
                )
                raise SynologyApiError(error_code)

        logger.info("Downloaded file %r (%d bytes)", file_path, len(response.content))
        return response.content
