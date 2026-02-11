# @TASK P1-T1.1 - Synology NAS API 인증/세션 관리 클라이언트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#synology-gateway

"""Synology NAS API client with session management and auto-reconnection.

This module provides a lightweight async HTTP client for interacting with
the Synology DiskStation Manager (DSM) Web API.  It handles:

- Login / logout via ``SYNO.API.Auth``
- Automatic session ID (``_sid``) injection into every request
- Transparent re-authentication when the session expires (error codes 105, 106, 119)

Usage::

    async with SynologyClient(url, user, password) as client:
        shares = await client.request("SYNO.FileStation.List", "list_share", version=2)
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

# Session-expiry error codes returned by the Synology API.
# 105 = session does not have permission (typically expired)
# 106 = session timeout
# 119 = SID not found
_SESSION_EXPIRED_CODES: frozenset[int] = frozenset({105, 106, 119})


class SynologyAuthError(Exception):
    """Raised when authentication with the Synology NAS fails.

    Attributes:
        code: The numeric Synology error code (e.g. 400, 401, 402).
        message: A human-readable description of the failure.
    """

    def __init__(self, code: int, message: str | None = None) -> None:
        self.code = code
        self.message = message or f"Synology authentication failed (error code: {code})"
        super().__init__(self.message)


class Synology2FARequired(Exception):
    """Raised when 2-factor authentication is required (error code 403)."""

    def __init__(self) -> None:
        super().__init__("2-factor authentication required")


class SynologyApiError(Exception):
    """Raised when a non-auth Synology API call fails.

    Attributes:
        code: The numeric Synology error code.
        message: A human-readable description.
    """

    def __init__(self, code: int, message: str | None = None) -> None:
        self.code = code
        self.message = message or f"Synology API error (code: {code})"
        super().__init__(self.message)


class SynologyClient:
    """Async client for the Synology DiskStation Manager Web API.

    Environment-variable driven authentication:
    - ``SYNOLOGY_URL``:      NAS base URL  (e.g. ``http://192.168.1.100:5000``)
    - ``SYNOLOGY_USER``:     Login account name
    - ``SYNOLOGY_PASSWORD``: Login account password

    The client maintains an authenticated session (``_sid``) and
    automatically re-authenticates when the session expires.

    Args:
        url: Base URL of the Synology NAS (trailing slash is stripped).
        user: Account name for SYNO.API.Auth login.
        password: Account password.
    """

    def __init__(self, url: str, user: str, password: str) -> None:
        self._url: str = url.rstrip("/")
        self._user: str = user
        self._password: str = password
        self._sid: str | None = None
        self._client: httpx.AsyncClient = httpx.AsyncClient(
            timeout=30.0,
            verify=False,  # Synology 자체 서명 인증서 허용
        )

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    async def login(self, otp_code: str | None = None) -> str:
        """Log in to the Synology NAS and return the session ID.

        Sends a GET request to ``/webapi/auth.cgi`` with
        ``SYNO.API.Auth`` parameters (version 6, format ``sid``).

        Returns:
            The session ID string on success.

        Raises:
            SynologyAuthError: If the login response indicates failure
                (e.g. wrong credentials, account disabled).
            Synology2FARequired: If 2FA is enabled and otp_code not provided.
        """
        params: dict[str, str | int] = {
            "api": "SYNO.API.Auth",
            "version": 6,
            "method": "login",
            "account": self._user,
            "passwd": self._password,
            "session": "FileStation",
            "format": "sid",
        }

        if otp_code:
            params["otp_code"] = otp_code
            params["enable_device_token"] = "yes"

        response = await self._client.get(
            f"{self._url}/webapi/auth.cgi",
            params=params,
        )
        data = response.json()

        if not data.get("success"):
            error_code = data.get("error", {}).get("code", 0)
            if error_code == 403:
                logger.info("Synology 2FA required for user=%s", self._user)
                raise Synology2FARequired()
            logger.warning("Synology login failed (code=%d)", error_code)
            raise SynologyAuthError(error_code)

        sid = data["data"]["sid"]
        self._sid = sid
        logger.info("Synology login successful (sid=%s...)", sid[:8] if len(sid) > 8 else sid)
        return sid

    async def logout(self) -> None:
        """End the current session on the Synology NAS.

        If there is no active session (``_sid is None``), this is a no-op.
        """
        if self._sid is None:
            return

        params = {
            "api": "SYNO.API.Auth",
            "version": 6,
            "method": "logout",
            "session": "FileStation",
            "_sid": self._sid,
        }

        try:
            await self._client.get(
                f"{self._url}/webapi/auth.cgi",
                params=params,
            )
            logger.info("Synology logout completed")
        finally:
            self._sid = None

    # ------------------------------------------------------------------
    # API requests
    # ------------------------------------------------------------------

    async def request(
        self,
        api: str,
        method: str,
        version: int = 1,
        **params: object,
    ) -> dict:
        """Perform an authenticated API request against the Synology NAS.

        The ``_sid`` parameter is injected automatically.  If there is no
        active session, :meth:`login` is called first.  If the NAS
        responds with a session-expired error (codes 105, 106, 119),
        the client re-authenticates and retries **once**.

        Args:
            api: Synology API name (e.g. ``SYNO.FileStation.List``).
            method: API method (e.g. ``list_share``).
            version: API version to request.
            **params: Additional query parameters forwarded to the API.

        Returns:
            The ``data`` dict from the Synology success response.

        Raises:
            SynologyAuthError: If (re-)authentication fails.
            SynologyApiError: If the API returns a non-session error.
        """
        # Ensure we have a session
        if self._sid is None:
            await self.login()

        result = await self._raw_request(api, method, version, **params)

        if result.get("success"):
            return result.get("data", {})

        # Check for session-expired errors
        error_code = result.get("error", {}).get("code", 0)

        if error_code in _SESSION_EXPIRED_CODES:
            logger.info(
                "Session expired (code=%d), re-authenticating...",
                error_code,
            )
            await self.login()  # may raise SynologyAuthError
            result = await self._raw_request(api, method, version, **params)

            if result.get("success"):
                return result.get("data", {})

            # Second attempt also failed
            retry_code = result.get("error", {}).get("code", 0)
            raise SynologyApiError(retry_code)

        raise SynologyApiError(error_code)

    async def post_request(
        self,
        api: str,
        method: str,
        version: int = 1,
        **params: object,
    ) -> dict:
        """Perform an authenticated POST API request against the Synology NAS.

        Same session management as :meth:`request` but uses HTTP POST,
        which is required for write operations with large payloads.
        """
        if self._sid is None:
            await self.login()

        result = await self._raw_post_request(api, method, version, **params)

        if result.get("success"):
            return result.get("data", {})

        error_code = result.get("error", {}).get("code", 0)

        if error_code in _SESSION_EXPIRED_CODES:
            logger.info("Session expired (code=%d), re-authenticating...", error_code)
            await self.login()
            result = await self._raw_post_request(api, method, version, **params)

            if result.get("success"):
                return result.get("data", {})

            retry_code = result.get("error", {}).get("code", 0)
            raise SynologyApiError(retry_code)

        raise SynologyApiError(error_code)

    async def _raw_request(
        self,
        api: str,
        method: str,
        version: int,
        **extra_params: object,
    ) -> dict:
        """Send a raw GET request to the Synology ``/webapi/entry.cgi``.

        This is an internal helper -- prefer :meth:`request` which
        handles session management.
        """
        query: dict[str, object] = {
            "api": api,
            "version": version,
            "method": method,
            "_sid": self._sid,
            **extra_params,
        }

        response = await self._client.get(
            f"{self._url}/webapi/entry.cgi",
            params=query,
        )
        return response.json()

    async def _raw_post_request(
        self,
        api: str,
        method: str,
        version: int,
        **extra_params: object,
    ) -> dict:
        """Send a raw POST request to the Synology ``/webapi/entry.cgi``."""
        payload: dict[str, object] = {
            "api": api,
            "version": version,
            "method": method,
            "_sid": self._sid,
            **extra_params,
        }

        response = await self._client.post(
            f"{self._url}/webapi/entry.cgi",
            data=payload,
        )
        return response.json()

    # ------------------------------------------------------------------
    # Binary fetch (for image proxy)
    # ------------------------------------------------------------------

    async def fetch_binary(self, path: str) -> tuple[bytes, str]:
        """Fetch binary content from the Synology NAS.

        Sends an authenticated GET request and returns raw bytes
        with the content-type header.

        Args:
            path: URL path on the NAS (e.g. ``/webapi/entry.cgi?api=...``).

        Returns:
            Tuple of (bytes, content_type).
        """
        if self._sid is None:
            await self.login()

        separator = "&" if "?" in path else "?"
        url = f"{self._url}{path}{separator}_sid={self._sid}"

        response = await self._client.get(url)

        # Re-auth if needed
        if response.status_code == 403 or response.status_code == 401:
            await self.login()
            url = f"{self._url}{path}{separator}_sid={self._sid}"
            response = await self._client.get(url)

        content_type = response.headers.get("content-type", "application/octet-stream")
        return response.content, content_type

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        """Dispose the underlying ``httpx.AsyncClient``."""
        await self._client.aclose()

    async def __aenter__(self) -> SynologyClient:
        """Enter the async context: log in and return self."""
        await self.login()
        return self

    async def __aexit__(self, *args: object) -> None:
        """Exit the async context: log out and close."""
        await self.logout()
        await self.close()
