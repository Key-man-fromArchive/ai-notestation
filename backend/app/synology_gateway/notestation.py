# @TASK P1-T1.2 - NoteStation API wrapper service
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#synology-gateway

"""NoteStation API wrapper for Synology NAS.

Provides a high-level async interface over the raw Synology
``SYNO.NoteStation.*`` API endpoints.  All network calls are
delegated to :class:`~app.synology_gateway.client.SynologyClient`,
which handles authentication and session management.

Usage::

    async with SynologyClient(url, user, password) as client:
        ns = NoteStationService(client)
        notes = await ns.list_notes(offset=0, limit=20)
"""

from __future__ import annotations

import logging

from bs4 import BeautifulSoup

from app.synology_gateway.client import SynologyClient

logger = logging.getLogger(__name__)


class NoteStationService:
    """Synology NoteStation API wrapper.

    Wraps the following NoteStation sub-APIs:

    - ``SYNO.NoteStation.Note``      -- notes (list / get)
    - ``SYNO.NoteStation.Notebook``   -- notebooks (list)
    - ``SYNO.NoteStation.Tag``        -- tags (list)
    - ``SYNO.NoteStation.Todo``       -- to-do items (list)
    - ``SYNO.NoteStation.Shortcut``   -- shortcuts (list)
    - ``SYNO.NoteStation.Smart``      -- smart folders (list)

    Errors raised by the underlying
    :class:`~app.synology_gateway.client.SynologyClient` (such as
    :class:`~app.synology_gateway.client.SynologyApiError`) propagate
    unchanged.

    Args:
        client: An authenticated (or auto-authenticating) SynologyClient.
    """

    NOTESTATION_API = "SYNO.NoteStation"

    def __init__(self, client: SynologyClient) -> None:
        self._client = client

    # ------------------------------------------------------------------
    # Notes
    # ------------------------------------------------------------------

    async def list_notes(
        self,
        offset: int | None = None,
        limit: int | None = None,
    ) -> dict:
        """Retrieve a list of notes.

        Calls ``SYNO.NoteStation.Note`` / ``list`` (version 1).

        When *offset* and *limit* are both ``None`` the request is sent
        **without** pagination parameters, which – according to observed
        Synology behaviour – returns **all** notes at once (the same
        approach used by the ``synology-api`` reference library).

        Args:
            offset: Number of notes to skip.  Pass ``None`` to omit.
            limit: Maximum number of notes to return.  Pass ``None`` to omit.

        Returns:
            A dict containing ``notes`` (list) and ``total`` (int).
        """
        extra: dict[str, object] = {}
        if offset is not None:
            extra["offset"] = offset
        if limit is not None:
            extra["limit"] = limit

        return await self._client.request(
            f"{self.NOTESTATION_API}.Note",
            "list",
            version=1,
            **extra,
        )

    async def get_note(self, object_id: str) -> dict:
        """Retrieve a single note by its object ID.

        Calls ``SYNO.NoteStation.Note`` / ``get`` (version 1).

        Args:
            object_id: The unique note identifier (``object_id``).

        Returns:
            A dict with the full note data (title, content, tags, etc.).
        """
        return await self._client.request(
            f"{self.NOTESTATION_API}.Note",
            "get",
            version=1,
            object_id=object_id,
        )

    # ------------------------------------------------------------------
    # Notebooks
    # ------------------------------------------------------------------

    async def list_notebooks(self) -> list[dict]:
        """Retrieve all notebooks.

        Calls ``SYNO.NoteStation.Notebook`` / ``list`` (version 1).

        Returns:
            A list of notebook dicts (each with ``notebook_id``, ``name``, etc.).
        """
        data = await self._client.request(
            f"{self.NOTESTATION_API}.Notebook",
            "list",
            version=1,
        )
        return data.get("notebooks", [])

    # ------------------------------------------------------------------
    # Tags
    # ------------------------------------------------------------------

    async def list_tags(self) -> list[dict]:
        """Retrieve all tags.

        Calls ``SYNO.NoteStation.Tag`` / ``list`` (version 1).

        Returns:
            A list of tag dicts (each with ``tag_id``, ``name``).
        """
        data = await self._client.request(
            f"{self.NOTESTATION_API}.Tag",
            "list",
            version=1,
        )
        return data.get("tags", [])

    # ------------------------------------------------------------------
    # Todos
    # ------------------------------------------------------------------

    async def list_todos(self) -> list[dict]:
        """Retrieve all to-do items.

        Calls ``SYNO.NoteStation.Todo`` / ``list`` (version 1).

        Returns:
            A list of todo dicts.
        """
        data = await self._client.request(
            f"{self.NOTESTATION_API}.Todo",
            "list",
            version=1,
        )
        return data.get("todos", [])

    # ------------------------------------------------------------------
    # Shortcuts
    # ------------------------------------------------------------------

    async def list_shortcuts(self) -> list[dict]:
        """Retrieve all shortcuts.

        Calls ``SYNO.NoteStation.Shortcut`` / ``list`` (version 1).

        Returns:
            A list of shortcut dicts.
        """
        data = await self._client.request(
            f"{self.NOTESTATION_API}.Shortcut",
            "list",
            version=1,
        )
        return data.get("shortcuts", [])

    # ------------------------------------------------------------------
    # Smart folders
    # ------------------------------------------------------------------

    async def list_smart(self) -> list[dict]:
        """Retrieve all smart folders.

        Calls ``SYNO.NoteStation.Smart`` / ``list`` (version 1).

        Returns:
            A list of smart folder dicts.
        """
        data = await self._client.request(
            f"{self.NOTESTATION_API}.Smart",
            "list",
            version=1,
        )
        return data.get("smarts", [])

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    @staticmethod
    def extract_text(html: str) -> str:
        """Extract plain text from an HTML note body.

        Uses BeautifulSoup with the ``lxml`` parser.  ``<script>`` and
        ``<style>`` elements are removed before extraction.  Block-level
        elements produce newline separators.

        Args:
            html: Raw HTML string (may be empty).

        Returns:
            Plain text with leading/trailing whitespace stripped.
        """
        if not html or not html.strip():
            return ""

        soup = BeautifulSoup(html, "lxml")

        # Remove script and style elements entirely
        for tag in soup(["script", "style"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)
        return text
