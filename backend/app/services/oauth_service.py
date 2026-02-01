"""OAuth service for managing OAuth flows (Google + OpenAI ChatGPT).

Handles PKCE generation, token encryption/decryption, authorization URL building,
code exchange, token refresh, and token revocation.

OpenAI OAuth uses the Codex CLI flow (auth.openai.com) to authenticate with
ChatGPT Plus/Pro subscriptions via chatgpt.com/backend-api.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.models import OAuthToken

logger = logging.getLogger(__name__)

# Provider OAuth endpoint configuration
_PROVIDER_CONFIG = {
    "openai": {
        "authorize_url": "https://auth.openai.com/oauth/authorize",
        "token_url": "https://auth.openai.com/oauth/token",
        "scopes": "openid profile email offline_access",
        "supports_refresh": True,
    },
    "google": {
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scopes": "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/generative-language",
        "supports_refresh": True,
    },
}

SUPPORTED_PROVIDERS = set(_PROVIDER_CONFIG.keys())


class OAuthError(Exception):
    """OAuth-specific error."""

    def __init__(self, message: str, provider: str = "") -> None:
        self.message = message
        self.provider = provider
        super().__init__(message)


class OAuthService:
    """OAuth service for managing provider authentication flows."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._fernet = self._init_fernet()

    def _init_fernet(self) -> Fernet | None:
        key = self._settings.OAUTH_ENCRYPTION_KEY
        if not key:
            return None
        try:
            return Fernet(key.encode())
        except Exception:
            logger.warning("Invalid OAUTH_ENCRYPTION_KEY, token encryption disabled")
            return None

    # ------------------------------------------------------------------
    # PKCE
    # ------------------------------------------------------------------

    @staticmethod
    def generate_pkce() -> tuple[str, str]:
        """Generate PKCE code_verifier and code_challenge (S256).

        Returns:
            Tuple of (code_verifier, code_challenge).
        """
        code_verifier = secrets.token_urlsafe(64)[:128]
        digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
        code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
        return code_verifier, code_challenge

    @staticmethod
    def generate_state() -> str:
        """Generate a random state parameter for CSRF protection."""
        return secrets.token_urlsafe(32)

    # ------------------------------------------------------------------
    # Encryption
    # ------------------------------------------------------------------

    def encrypt_token(self, token: str) -> str:
        """Encrypt a token string using Fernet."""
        if not self._fernet:
            return token
        return self._fernet.encrypt(token.encode()).decode()

    def decrypt_token(self, encrypted: str) -> str:
        """Decrypt a token string using Fernet."""
        if not self._fernet:
            return encrypted
        return self._fernet.decrypt(encrypted.encode()).decode()

    # ------------------------------------------------------------------
    # Authorization URL
    # ------------------------------------------------------------------

    async def build_authorize_url(
        self,
        provider: str,
        username: str,
        db: AsyncSession,
    ) -> dict[str, str]:
        """Build the OAuth authorization URL with PKCE.

        Args:
            provider: OAuth provider name (e.g. "google").
            username: Current user's username.
            db: Database session.

        Returns:
            Dict with "authorization_url" and "state".
        """
        if provider not in SUPPORTED_PROVIDERS:
            raise OAuthError(f"Unsupported OAuth provider: {provider}", provider)

        config = _PROVIDER_CONFIG[provider]
        code_verifier, code_challenge = self.generate_pkce()
        state = self.generate_state()

        # Store PKCE state in DB for later verification
        stmt = select(OAuthToken).where(
            OAuthToken.username == username,
            OAuthToken.provider == provider,
        )
        result = await db.execute(stmt)
        token_row = result.scalar_one_or_none()

        if token_row:
            token_row.pkce_state = state
            token_row.pkce_code_verifier = code_verifier
        else:
            token_row = OAuthToken(
                username=username,
                provider=provider,
                access_token_encrypted="",
                pkce_state=state,
                pkce_code_verifier=code_verifier,
            )
            db.add(token_row)

        await db.flush()

        # Build URL
        callback_url = f"{self._settings.APP_BASE_URL}/oauth/callback"

        params: dict[str, str] = {
            "response_type": "code",
            "redirect_uri": callback_url,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }

        if provider == "openai":
            client_id = self._settings.OPENAI_OAUTH_CLIENT_ID
            if not client_id:
                raise OAuthError("OPENAI_OAUTH_CLIENT_ID is not configured", provider)
            params["client_id"] = client_id
            params["scope"] = config["scopes"]
            # Codex CLI required params
            params["id_token_add_organizations"] = "true"
            params["codex_cli_simplified_flow"] = "true"
            params["originator"] = "codex_cli_rs"
        elif provider == "google":
            client_id = self._settings.GOOGLE_OAUTH_CLIENT_ID
            if not client_id:
                raise OAuthError(
                    "GOOGLE_OAUTH_CLIENT_ID is not configured. "
                    "Create one at https://console.cloud.google.com/apis/credentials",
                    provider,
                )
            params["client_id"] = client_id
            params["scope"] = config["scopes"]
            params["access_type"] = "offline"
            params["prompt"] = "consent"

        authorization_url = f"{config['authorize_url']}?{urlencode(params)}"

        return {"authorization_url": authorization_url, "state": state}

    # ------------------------------------------------------------------
    # Token Exchange
    # ------------------------------------------------------------------

    async def exchange_code(
        self,
        provider: str,
        code: str,
        state: str,
        db: AsyncSession,
    ) -> dict[str, str | bool]:
        """Exchange authorization code for tokens.

        Args:
            provider: OAuth provider name (e.g. "google").
            code: Authorization code from callback.
            state: State parameter for CSRF verification.
            db: Database session.

        Returns:
            Dict with "connected", "provider", and optionally "email".
        """
        if provider not in SUPPORTED_PROVIDERS:
            raise OAuthError(f"Unsupported OAuth provider: {provider}", provider)

        # Verify state and retrieve code_verifier
        stmt = select(OAuthToken).where(
            OAuthToken.provider == provider,
            OAuthToken.pkce_state == state,
        )
        result = await db.execute(stmt)
        token_row = result.scalar_one_or_none()

        if not token_row:
            raise OAuthError("Invalid or expired state parameter", provider)

        code_verifier = token_row.pkce_code_verifier
        if not code_verifier:
            raise OAuthError("Missing PKCE code_verifier", provider)

        config = _PROVIDER_CONFIG[provider]
        callback_url = f"{self._settings.APP_BASE_URL}/oauth/callback"

        # Exchange code for token
        token_data: dict[str, str] = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": callback_url,
            "code_verifier": code_verifier,
        }

        if provider == "openai":
            token_data["client_id"] = self._settings.OPENAI_OAUTH_CLIENT_ID
        elif provider == "google":
            token_data["client_id"] = self._settings.GOOGLE_OAUTH_CLIENT_ID
            token_data["client_secret"] = self._settings.GOOGLE_OAUTH_CLIENT_SECRET

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                config["token_url"],
                data=token_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if resp.status_code != 200:
            raise OAuthError(
                f"Token exchange failed: {resp.status_code} {resp.text}",
                provider,
            )

        tokens = resp.json()
        access_token = tokens.get("access_token", "")
        refresh_token = tokens.get("refresh_token")
        expires_in = tokens.get("expires_in")
        scope = tokens.get("scope", "")

        # Compute expiry
        expires_at = None
        if expires_in:
            expires_at = datetime.now(UTC) + timedelta(seconds=int(expires_in))

        # Fetch email for Google
        email = None
        if provider == "google" and access_token:
            email = await self._fetch_google_email(access_token)

        # Update token row
        token_row.access_token_encrypted = self.encrypt_token(access_token)
        if refresh_token:
            token_row.refresh_token_encrypted = self.encrypt_token(refresh_token)
        token_row.token_type = tokens.get("token_type", "bearer")
        token_row.expires_at = expires_at
        token_row.scope = scope
        token_row.email = email
        token_row.pkce_state = None
        token_row.pkce_code_verifier = None

        await db.flush()

        result_dict: dict[str, str | bool] = {
            "connected": True,
            "provider": provider,
        }
        if email:
            result_dict["email"] = email
        return result_dict

    # ------------------------------------------------------------------
    # Token Retrieval (with auto-refresh)
    # ------------------------------------------------------------------

    async def get_valid_token(
        self,
        username: str,
        provider: str,
        db: AsyncSession,
    ) -> str | None:
        """Get a valid access token, refreshing if expired.

        Returns:
            Decrypted access token string, or None if not connected.
        """
        stmt = select(OAuthToken).where(
            OAuthToken.username == username,
            OAuthToken.provider == provider,
        )
        result = await db.execute(stmt)
        token_row = result.scalar_one_or_none()

        if not token_row or not token_row.access_token_encrypted:
            return None

        # Check expiry
        if token_row.expires_at and token_row.expires_at < datetime.now(UTC):
            # Try refresh
            if token_row.refresh_token_encrypted:
                refreshed = await self._refresh_token(token_row, db)
                if not refreshed:
                    return None
            else:
                return None

        return self.decrypt_token(token_row.access_token_encrypted)

    async def _refresh_token(self, token_row: OAuthToken, db: AsyncSession) -> bool:
        """Refresh an expired token."""
        provider = token_row.provider
        config = _PROVIDER_CONFIG.get(provider)
        if not config or not config["supports_refresh"]:
            return False

        refresh_token = self.decrypt_token(token_row.refresh_token_encrypted or "")
        if not refresh_token:
            return False

        data: dict[str, str] = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }

        if provider == "openai":
            data["client_id"] = self._settings.OPENAI_OAUTH_CLIENT_ID
        elif provider == "google":
            data["client_id"] = self._settings.GOOGLE_OAUTH_CLIENT_ID
            data["client_secret"] = self._settings.GOOGLE_OAUTH_CLIENT_SECRET

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    config["token_url"],
                    data=data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )

            if resp.status_code != 200:
                logger.warning("Token refresh failed for %s: %s", provider, resp.text)
                return False

            tokens = resp.json()
            token_row.access_token_encrypted = self.encrypt_token(tokens["access_token"])
            if "refresh_token" in tokens:
                token_row.refresh_token_encrypted = self.encrypt_token(tokens["refresh_token"])

            expires_in = tokens.get("expires_in")
            if expires_in:
                token_row.expires_at = datetime.now(UTC) + timedelta(seconds=int(expires_in))

            await db.flush()
            return True
        except Exception:
            logger.exception("Error refreshing token for %s", provider)
            return False

    # ------------------------------------------------------------------
    # Status / Disconnect
    # ------------------------------------------------------------------

    async def get_status(
        self,
        username: str,
        provider: str,
        db: AsyncSession,
    ) -> dict[str, str | bool | None]:
        """Get OAuth connection status for a provider."""
        stmt = select(OAuthToken).where(
            OAuthToken.username == username,
            OAuthToken.provider == provider,
        )
        result = await db.execute(stmt)
        token_row = result.scalar_one_or_none()

        if not token_row or not token_row.access_token_encrypted:
            return {"connected": False, "provider": provider}

        return {
            "connected": True,
            "provider": provider,
            "email": token_row.email,
            "expires_at": token_row.expires_at.isoformat() if token_row.expires_at else None,
        }

    async def revoke_token(
        self,
        username: str,
        provider: str,
        db: AsyncSession,
    ) -> dict[str, bool]:
        """Revoke and delete OAuth tokens for a provider."""
        stmt = select(OAuthToken).where(
            OAuthToken.username == username,
            OAuthToken.provider == provider,
        )
        result = await db.execute(stmt)
        token_row = result.scalar_one_or_none()

        if token_row:
            await db.delete(token_row)
            await db.flush()

        return {"disconnected": True}

    # ------------------------------------------------------------------
    # Configuration Check
    # ------------------------------------------------------------------

    def is_provider_configured(self, provider: str) -> dict[str, bool | str]:
        """Check whether the OAuth provider has required credentials configured."""
        if provider == "openai":
            configured = bool(self._settings.OPENAI_OAUTH_CLIENT_ID)
        elif provider == "google":
            configured = bool(
                self._settings.GOOGLE_OAUTH_CLIENT_ID
                and self._settings.GOOGLE_OAUTH_CLIENT_SECRET
            )
        else:
            configured = False

        return {"provider": provider, "configured": configured}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _fetch_google_email(self, access_token: str) -> str | None:
        """Fetch Google user email from userinfo endpoint."""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
            if resp.status_code == 200:
                return resp.json().get("email")
        except Exception:
            logger.warning("Failed to fetch Google email")
        return None
