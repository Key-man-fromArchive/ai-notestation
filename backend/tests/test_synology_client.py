# @TASK P1-T1.1 - Synology NAS API 인증/세션 관리 클라이언트 테스트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#synology-gateway
# @TEST tests/test_synology_client.py

"""Tests for the Synology NAS API client.

Verifies authentication, session management, auto-reconnection,
and API request handling without requiring a real Synology NAS.
"""

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.synology_gateway.client import SynologyApiError, SynologyAuthError, SynologyClient

# Note: The ``synology_client`` fixture is defined in conftest.py and
# provides a SynologyClient configured with test env-vars:
#   SYNOLOGY_URL = http://localhost:5000
#   SYNOLOGY_USER = testuser
#   SYNOLOGY_PASSWORD = testpassword


def _make_response(json_data: dict, status_code: int = 200) -> httpx.Response:
    """Helper: build a fake httpx.Response with the given JSON body."""
    return httpx.Response(
        status_code=status_code,
        json=json_data,
        request=httpx.Request("GET", "http://fake"),
    )


# ---------------------------------------------------------------------------
# 1. URL configuration
# ---------------------------------------------------------------------------


class TestSynologyClientConfig:
    """Synology URL and client configuration."""

    def test_url_trailing_slash_stripped(self):
        """Trailing slash on the NAS URL is removed."""
        client = SynologyClient(
            url="http://192.168.1.100:5000/",
            user="admin",
            password="pw",
        )
        assert client._url == "http://192.168.1.100:5000"

    def test_url_stored_correctly(self):
        """The base URL is stored as provided (minus trailing slash)."""
        client = SynologyClient(
            url="http://localhost:5000",
            user="testuser",
            password="testpassword",
        )
        assert client._url == "http://localhost:5000"

    def test_initial_sid_is_none(self, synology_client: SynologyClient):
        """Before login, the session ID must be None."""
        assert synology_client._sid is None


# ---------------------------------------------------------------------------
# 2. Authentication success
# ---------------------------------------------------------------------------


class TestLoginSuccess:
    """Successful login returns a session ID."""

    @pytest.mark.asyncio
    async def test_login_returns_sid(self, synology_client: SynologyClient):
        """A successful login stores and returns the session ID."""
        mock_response = _make_response({"success": True, "data": {"sid": "abc123_session"}})

        with patch.object(synology_client._client, "get", new_callable=AsyncMock, return_value=mock_response):
            sid = await synology_client.login()

        assert sid == "abc123_session"
        assert synology_client._sid == "abc123_session"

    @pytest.mark.asyncio
    async def test_login_calls_correct_endpoint(self):
        """Login hits /webapi/auth.cgi with the expected query parameters."""
        client = SynologyClient(
            url="http://localhost:5000",
            user="testuser",
            password="testpassword",
        )
        mock_response = _make_response({"success": True, "data": {"sid": "sess_ok"}})

        with patch.object(client._client, "get", new_callable=AsyncMock, return_value=mock_response) as mock_get:
            await client.login()

        mock_get.assert_called_once()
        call_args = mock_get.call_args
        url = call_args[0][0] if call_args[0] else call_args[1].get("url", "")
        assert "/webapi/auth.cgi" in str(url)

        params = call_args[1].get("params", {}) if call_args[1] else {}
        assert params["api"] == "SYNO.API.Auth"
        assert params["method"] == "login"
        assert params["account"] == "testuser"
        assert params["passwd"] == "testpassword"
        assert params["format"] == "sid"


# ---------------------------------------------------------------------------
# 3. Authentication failure
# ---------------------------------------------------------------------------


class TestLoginFailure:
    """Failed login raises SynologyAuthError."""

    @pytest.mark.asyncio
    async def test_wrong_credentials_raises_auth_error(self, synology_client: SynologyClient):
        """Error code 400 (no such account / wrong password) raises SynologyAuthError."""
        mock_response = _make_response({"success": False, "error": {"code": 400}})

        with (
            patch.object(synology_client._client, "get", new_callable=AsyncMock, return_value=mock_response),
            pytest.raises(SynologyAuthError) as exc_info,
        ):
            await synology_client.login()

        assert "400" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_account_disabled_raises_auth_error(self, synology_client: SynologyClient):
        """Error code 401 (account disabled) raises SynologyAuthError."""
        mock_response = _make_response({"success": False, "error": {"code": 401}})

        with (
            patch.object(synology_client._client, "get", new_callable=AsyncMock, return_value=mock_response),
            pytest.raises(SynologyAuthError),
        ):
            await synology_client.login()

    @pytest.mark.asyncio
    async def test_sid_not_set_on_failure(self, synology_client: SynologyClient):
        """On failed login, _sid stays None."""
        mock_response = _make_response({"success": False, "error": {"code": 400}})

        with (
            patch.object(synology_client._client, "get", new_callable=AsyncMock, return_value=mock_response),
            pytest.raises(SynologyAuthError),
        ):
            await synology_client.login()

        assert synology_client._sid is None


# ---------------------------------------------------------------------------
# 4. API request with session ID
# ---------------------------------------------------------------------------


class TestApiRequest:
    """Authenticated API requests include _sid automatically."""

    @pytest.mark.asyncio
    async def test_request_includes_sid(self, synology_client: SynologyClient):
        """The _sid parameter is sent with every API request."""
        synology_client._sid = "existing_session"

        mock_response = _make_response({"success": True, "data": {"shares": []}})

        with patch.object(
            synology_client._client, "get", new_callable=AsyncMock, return_value=mock_response
        ) as mock_get:
            result = await synology_client.request(
                api="SYNO.FileStation.List",
                method="list_share",
                version=2,
            )

        mock_get.assert_called_once()
        params = mock_get.call_args[1].get("params", {})
        assert params["_sid"] == "existing_session"
        assert params["api"] == "SYNO.FileStation.List"
        assert params["method"] == "list_share"
        assert params["version"] == 2
        assert result == {"shares": []}

    @pytest.mark.asyncio
    async def test_request_with_extra_params(self, synology_client: SynologyClient):
        """Extra keyword params are forwarded to the API call."""
        synology_client._sid = "sess"

        mock_response = _make_response({"success": True, "data": {"files": []}})

        with patch.object(
            synology_client._client, "get", new_callable=AsyncMock, return_value=mock_response
        ) as mock_get:
            await synology_client.request(
                api="SYNO.FileStation.List",
                method="list",
                version=2,
                folder_path="/my_folder",
                additional="real_path,size",
            )

        params = mock_get.call_args[1].get("params", {})
        assert params["folder_path"] == "/my_folder"
        assert params["additional"] == "real_path,size"

    @pytest.mark.asyncio
    async def test_request_auto_login_when_no_sid(self, synology_client: SynologyClient):
        """If _sid is None, request() calls login() first."""
        login_response = _make_response({"success": True, "data": {"sid": "auto_login_sid"}})
        api_response = _make_response({"success": True, "data": {"info": "ok"}})

        with patch.object(
            synology_client._client,
            "get",
            new_callable=AsyncMock,
            side_effect=[login_response, api_response],
        ):
            result = await synology_client.request(
                api="SYNO.FileStation.Info",
                method="get",
                version=2,
            )

        assert synology_client._sid == "auto_login_sid"
        assert result == {"info": "ok"}

    @pytest.mark.asyncio
    async def test_request_raises_on_api_error(self, synology_client: SynologyClient):
        """Non-session API errors are raised as SynologyAuthError (or generic)."""
        synology_client._sid = "sess"

        mock_response = _make_response({"success": False, "error": {"code": 408}})

        with (
            patch.object(synology_client._client, "get", new_callable=AsyncMock, return_value=mock_response),
            pytest.raises(SynologyApiError),
        ):
            await synology_client.request(
                api="SYNO.FileStation.List",
                method="list",
                version=2,
            )


# ---------------------------------------------------------------------------
# 5. Session expiry and auto-reconnection
# ---------------------------------------------------------------------------


class TestSessionExpiry:
    """Session expiry triggers automatic re-authentication."""

    @pytest.mark.asyncio
    async def test_session_expired_105_triggers_relogin(self, synology_client: SynologyClient):
        """Error 105 (no permission / session expired) triggers re-login + retry."""
        synology_client._sid = "expired_sid"

        expired_response = _make_response({"success": False, "error": {"code": 105}})
        login_response = _make_response({"success": True, "data": {"sid": "fresh_sid"}})
        success_response = _make_response({"success": True, "data": {"result": "ok"}})

        with patch.object(
            synology_client._client,
            "get",
            new_callable=AsyncMock,
            side_effect=[expired_response, login_response, success_response],
        ):
            result = await synology_client.request(
                api="SYNO.FileStation.Info",
                method="get",
                version=2,
            )

        assert synology_client._sid == "fresh_sid"
        assert result == {"result": "ok"}

    @pytest.mark.asyncio
    async def test_session_expired_119_triggers_relogin(self, synology_client: SynologyClient):
        """Error 119 (SID not found) triggers re-login + retry."""
        synology_client._sid = "gone_sid"

        expired_response = _make_response({"success": False, "error": {"code": 119}})
        login_response = _make_response({"success": True, "data": {"sid": "new_sid_119"}})
        success_response = _make_response({"success": True, "data": {"result": "fixed"}})

        with patch.object(
            synology_client._client,
            "get",
            new_callable=AsyncMock,
            side_effect=[expired_response, login_response, success_response],
        ):
            result = await synology_client.request(
                api="SYNO.FileStation.Info",
                method="get",
                version=2,
            )

        assert synology_client._sid == "new_sid_119"
        assert result == {"result": "fixed"}

    @pytest.mark.asyncio
    async def test_session_timeout_106_triggers_relogin(self, synology_client: SynologyClient):
        """Error 106 (session timeout) triggers re-login + retry."""
        synology_client._sid = "timed_out"

        expired_response = _make_response({"success": False, "error": {"code": 106}})
        login_response = _make_response({"success": True, "data": {"sid": "new_sid_106"}})
        success_response = _make_response({"success": True, "data": {"result": "recovered"}})

        with patch.object(
            synology_client._client,
            "get",
            new_callable=AsyncMock,
            side_effect=[expired_response, login_response, success_response],
        ):
            result = await synology_client.request(
                api="SYNO.FileStation.Info",
                method="get",
                version=2,
            )

        assert synology_client._sid == "new_sid_106"
        assert result == {"result": "recovered"}

    @pytest.mark.asyncio
    async def test_relogin_failure_raises_auth_error(self, synology_client: SynologyClient):
        """If re-login also fails, SynologyAuthError is raised."""
        synology_client._sid = "expired"

        expired_response = _make_response({"success": False, "error": {"code": 105}})
        login_fail_response = _make_response({"success": False, "error": {"code": 400}})

        with (
            patch.object(
                synology_client._client,
                "get",
                new_callable=AsyncMock,
                side_effect=[expired_response, login_fail_response],
            ),
            pytest.raises(SynologyAuthError),
        ):
            await synology_client.request(
                api="SYNO.FileStation.Info",
                method="get",
                version=2,
            )


# ---------------------------------------------------------------------------
# 6. Logout
# ---------------------------------------------------------------------------


class TestLogout:
    """Logout clears the session."""

    @pytest.mark.asyncio
    async def test_logout_clears_sid(self, synology_client: SynologyClient):
        """After logout, _sid is set back to None."""
        synology_client._sid = "active_session"

        mock_response = _make_response({"success": True})

        with patch.object(synology_client._client, "get", new_callable=AsyncMock, return_value=mock_response):
            await synology_client.logout()

        assert synology_client._sid is None

    @pytest.mark.asyncio
    async def test_logout_calls_correct_endpoint(self, synology_client: SynologyClient):
        """Logout sends a request to auth.cgi with method=logout."""
        synology_client._sid = "session_to_end"

        mock_response = _make_response({"success": True})

        with patch.object(
            synology_client._client, "get", new_callable=AsyncMock, return_value=mock_response
        ) as mock_get:
            await synology_client.logout()

        mock_get.assert_called_once()
        call_args = mock_get.call_args
        url = call_args[0][0] if call_args[0] else call_args[1].get("url", "")
        assert "/webapi/auth.cgi" in str(url)

        params = call_args[1].get("params", {})
        assert params["method"] == "logout"

    @pytest.mark.asyncio
    async def test_logout_noop_when_no_session(self, synology_client: SynologyClient):
        """Logout does nothing if there is no active session."""
        assert synology_client._sid is None

        # Should not raise and should not call HTTP
        with patch.object(synology_client._client, "get", new_callable=AsyncMock) as mock_get:
            await synology_client.logout()

        mock_get.assert_not_called()
        assert synology_client._sid is None


# ---------------------------------------------------------------------------
# 7. Context manager
# ---------------------------------------------------------------------------


class TestContextManager:
    """Async context manager logs in on enter and out on exit."""

    @pytest.mark.asyncio
    async def test_context_manager_login_logout(self):
        """__aenter__ logs in, __aexit__ logs out and closes."""
        client = SynologyClient(
            url="http://nas:5000",
            user="user",
            password="pass",
        )

        login_response = _make_response({"success": True, "data": {"sid": "ctx_sid"}})
        logout_response = _make_response({"success": True})

        with (
            patch.object(
                client._client,
                "get",
                new_callable=AsyncMock,
                side_effect=[login_response, logout_response],
            ),
            patch.object(client._client, "aclose", new_callable=AsyncMock) as mock_close,
        ):
            async with client as c:
                assert c is client
                assert c._sid == "ctx_sid"

            # After exiting the context, session should be cleared
            assert client._sid is None
            mock_close.assert_awaited_once()


# ---------------------------------------------------------------------------
# 8. Close
# ---------------------------------------------------------------------------


class TestClose:
    """Client resource cleanup."""

    @pytest.mark.asyncio
    async def test_close_calls_aclose(self, synology_client: SynologyClient):
        """close() properly disposes the underlying httpx client."""
        with patch.object(synology_client._client, "aclose", new_callable=AsyncMock) as mock_aclose:
            await synology_client.close()

        mock_aclose.assert_awaited_once()
