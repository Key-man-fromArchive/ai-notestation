"""Tests for OAuth service: PKCE, encryption, token exchange, refresh, revoke."""

from __future__ import annotations

import base64
import hashlib
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.oauth_service import OAuthError, OAuthService


class TestPKCE:
    """PKCE code_verifier and code_challenge generation."""

    def test_generate_pkce_returns_tuple(self):
        verifier, challenge = OAuthService.generate_pkce()
        assert isinstance(verifier, str)
        assert isinstance(challenge, str)
        assert len(verifier) > 0
        assert len(challenge) > 0

    def test_generate_pkce_s256_validation(self):
        verifier, challenge = OAuthService.generate_pkce()
        # Verify S256: base64url(sha256(verifier)) == challenge
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
        assert challenge == expected

    def test_generate_pkce_uniqueness(self):
        v1, c1 = OAuthService.generate_pkce()
        v2, c2 = OAuthService.generate_pkce()
        assert v1 != v2
        assert c1 != c2

    def test_generate_state_returns_string(self):
        state = OAuthService.generate_state()
        assert isinstance(state, str)
        assert len(state) > 0

    def test_generate_state_uniqueness(self):
        s1 = OAuthService.generate_state()
        s2 = OAuthService.generate_state()
        assert s1 != s2


class TestEncryption:
    """Fernet token encryption/decryption."""

    def test_encrypt_decrypt_roundtrip(self):
        from cryptography.fernet import Fernet

        key = Fernet.generate_key().decode()
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = key
        service = OAuthService(settings=settings)

        plaintext = "test-access-token-12345"
        encrypted = service.encrypt_token(plaintext)
        assert encrypted != plaintext
        decrypted = service.decrypt_token(encrypted)
        assert decrypted == plaintext

    def test_no_encryption_key_passthrough(self):
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = ""
        service = OAuthService(settings=settings)

        token = "test-token"
        assert service.encrypt_token(token) == token
        assert service.decrypt_token(token) == token

    def test_invalid_encryption_key_logs_warning(self):
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = "not-a-valid-fernet-key"
        service = OAuthService(settings=settings)
        # Should not raise, just disable encryption
        assert service._fernet is None


class TestBuildAuthorizeUrl:
    """Authorization URL building with PKCE and state."""

    @pytest.mark.asyncio
    async def test_unsupported_provider_raises(self):
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = ""
        service = OAuthService(settings=settings)
        db = AsyncMock()

        with pytest.raises(OAuthError, match="Unsupported"):
            await service.build_authorize_url("invalid", "user1", db)

    @pytest.mark.asyncio
    async def test_google_authorize_url(self):
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = ""
        settings.APP_BASE_URL = "http://localhost:3000"
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-google-client-id"
        service = OAuthService(settings=settings)

        # Mock DB
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result
        db.add = MagicMock()
        db.flush = AsyncMock()

        result = await service.build_authorize_url("google", "user1", db)

        assert "authorization_url" in result
        assert "state" in result
        url = result["authorization_url"]
        assert "accounts.google.com" in url
        assert "test-google-client-id" in url
        assert "code_challenge=" in url
        assert "code_challenge_method=S256" in url
        assert "access_type=offline" in url

    @pytest.mark.asyncio
    async def test_openai_authorize_url(self):
        """OpenAI OAuth via Codex CLI flow should build correct authorize URL."""
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = ""
        settings.APP_BASE_URL = "http://localhost:3000"
        settings.OPENAI_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
        service = OAuthService(settings=settings)

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result
        db.add = MagicMock()
        db.flush = AsyncMock()

        result = await service.build_authorize_url("openai", "user1", db)

        url = result["authorization_url"]
        assert "auth.openai.com" in url
        assert "app_EMoamEEZ73f0CkXaXp7hrann" in url
        assert "scope=openid+profile+email+offline_access" in url or "scope=openid" in url
        assert "code_challenge=" in url
        assert "code_challenge_method=S256" in url
        # Codex CLI required params
        assert "codex_cli_simplified_flow=true" in url
        assert "originator=codex_cli_rs" in url


class TestExchangeCode:
    """Token exchange from authorization code."""

    @pytest.mark.asyncio
    async def test_invalid_state_raises(self):
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = ""
        service = OAuthService(settings=settings)

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        with pytest.raises(OAuthError, match="Invalid or expired state"):
            await service.exchange_code("google", "code123", "bad-state", db)

    @pytest.mark.asyncio
    async def test_successful_exchange(self):
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = ""
        settings.APP_BASE_URL = "http://localhost:3000"
        settings.GOOGLE_OAUTH_CLIENT_ID = "client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret"
        service = OAuthService(settings=settings)

        # Mock token row with PKCE data
        token_row = MagicMock()
        token_row.pkce_code_verifier = "test-verifier"
        token_row.provider = "google"

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = token_row
        db.execute.return_value = mock_result
        db.flush = AsyncMock()

        # Mock httpx response
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "access_token": "ya29.test-token",
            "refresh_token": "1//test-refresh",
            "expires_in": 3600,
            "token_type": "Bearer",
            "scope": "https://www.googleapis.com/auth/generative-language",
        }

        with patch("app.services.oauth_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            # Also mock _fetch_google_email
            with patch.object(service, "_fetch_google_email", return_value="user@gmail.com"):
                result = await service.exchange_code("google", "auth-code", "valid-state", db)

        assert result["connected"] is True
        assert result["provider"] == "google"
        assert result["email"] == "user@gmail.com"


class TestGetValidToken:
    """Token retrieval with auto-refresh."""

    @pytest.mark.asyncio
    async def test_no_token_returns_none(self):
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = ""
        service = OAuthService(settings=settings)

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        token = await service.get_valid_token("user1", "google", db)
        assert token is None

    @pytest.mark.asyncio
    async def test_valid_token_returned(self):
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = ""
        service = OAuthService(settings=settings)

        token_row = MagicMock()
        token_row.access_token_encrypted = "valid-token"
        token_row.expires_at = datetime.now(UTC) + timedelta(hours=1)

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = token_row
        db.execute.return_value = mock_result

        token = await service.get_valid_token("user1", "google", db)
        assert token == "valid-token"


class TestGetStatus:
    """OAuth connection status queries."""

    @pytest.mark.asyncio
    async def test_not_connected(self):
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = ""
        service = OAuthService(settings=settings)

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        status = await service.get_status("user1", "google", db)
        assert status["connected"] is False

    @pytest.mark.asyncio
    async def test_connected_with_email(self):
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = ""
        service = OAuthService(settings=settings)

        token_row = MagicMock()
        token_row.access_token_encrypted = "token"
        token_row.email = "user@gmail.com"
        token_row.expires_at = datetime.now(UTC) + timedelta(hours=1)

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = token_row
        db.execute.return_value = mock_result

        status = await service.get_status("user1", "google", db)
        assert status["connected"] is True
        assert status["email"] == "user@gmail.com"


class TestRevokeToken:
    """Token revocation."""

    @pytest.mark.asyncio
    async def test_revoke_existing_token(self):
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = ""
        service = OAuthService(settings=settings)

        token_row = MagicMock()

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = token_row
        db.execute.return_value = mock_result
        db.delete = AsyncMock()
        db.flush = AsyncMock()

        result = await service.revoke_token("user1", "google", db)
        assert result["disconnected"] is True
        db.delete.assert_called_once_with(token_row)

    @pytest.mark.asyncio
    async def test_revoke_nonexistent_token(self):
        settings = MagicMock()
        settings.OAUTH_ENCRYPTION_KEY = ""
        service = OAuthService(settings=settings)

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result
        db.flush = AsyncMock()

        result = await service.revoke_token("user1", "google", db)
        assert result["disconnected"] is True
