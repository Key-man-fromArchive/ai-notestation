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
        "device_authorization_url": "https://auth.openai.com/api/accounts/deviceauth/usercode",
        "device_token_url": "https://auth.openai.com/api/accounts/deviceauth/token",
        "scopes": "openid profile email offline_access",
        "supports_refresh": True,
        "supports_device_code": True,
        "device_code_custom_flow": True,
        "auth_mode": "device_code",
    },
    "anthropic": {
        "authorize_url": "https://claude.ai/oauth/authorize",
        "token_url": "https://console.anthropic.com/v1/oauth/token",
        "redirect_uri": "https://console.anthropic.com/oauth/code/callback",
        "scopes": "org:create_api_key user:profile user:inference",
        "supports_refresh": True,
        "supports_device_code": False,
        "auth_mode": "code_paste",
    },
    "google": {
        "auth_mode": "api_key",
    },
}

SUPPORTED_PROVIDERS = {"openai", "anthropic", "google"}


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
        auth_mode = config.get("auth_mode", "")

        if auth_mode == "api_key":
            raise OAuthError(f"Provider {provider} uses API key authentication, not OAuth", provider)

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

        if provider == "anthropic":
            client_id = self._settings.ANTHROPIC_OAUTH_CLIENT_ID
            params: dict[str, str] = {
                "code": "true",
                "client_id": client_id,
                "response_type": "code",
                "redirect_uri": config["redirect_uri"],
                "scope": config["scopes"],
                "code_challenge": code_challenge,
                "code_challenge_method": "S256",
                "state": code_verifier,
            }
            authorization_url = f"{config['authorize_url']}?{urlencode(params)}"
            return {"authorization_url": authorization_url, "state": state}

        base_url = self._settings.APP_BASE_URL
        callback_url = f"{base_url}/oauth/callback"

        params = {
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
            params["id_token_add_organizations"] = "true"
            params["codex_cli_simplified_flow"] = "true"
            params["originator"] = "codex_cli_rs"

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

        if provider == "anthropic":
            return await self._exchange_anthropic_code(code, state, code_verifier, token_row, db)

        base_url = self._settings.APP_BASE_URL
        callback_url = f"{base_url}/oauth/callback"

        token_data: dict[str, str] = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": callback_url,
            "code_verifier": code_verifier,
        }

        if provider == "openai":
            token_data["client_id"] = self._settings.OPENAI_OAUTH_CLIENT_ID

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

    async def _exchange_anthropic_code(
        self,
        code: str,
        state: str,
        code_verifier: str,
        token_row: OAuthToken,
        db: AsyncSession,
    ) -> dict[str, str | bool]:
        config = _PROVIDER_CONFIG["anthropic"]
        client_id = self._settings.ANTHROPIC_OAUTH_CLIENT_ID

        token_data = {
            "code": code,
            "state": state,
            "grant_type": "authorization_code",
            "client_id": client_id,
            "redirect_uri": config["redirect_uri"],
            "code_verifier": code_verifier,
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                config["token_url"],
                json=token_data,
                headers={"Content-Type": "application/json"},
            )

        if resp.status_code != 200:
            raise OAuthError(
                f"Anthropic token exchange failed: {resp.status_code} {resp.text}",
                "anthropic",
            )

        tokens = resp.json()
        access_token = tokens.get("access_token", "")
        refresh_token = tokens.get("refresh_token")
        expires_in = tokens.get("expires_in")

        expires_at = None
        if expires_in:
            expires_at = datetime.now(UTC) + timedelta(seconds=int(expires_in))

        token_row.access_token_encrypted = self.encrypt_token(access_token)
        if refresh_token:
            token_row.refresh_token_encrypted = self.encrypt_token(refresh_token)
        token_row.token_type = tokens.get("token_type", "bearer")
        token_row.expires_at = expires_at
        token_row.scope = tokens.get("scope", "")
        token_row.pkce_state = None
        token_row.pkce_code_verifier = None

        await db.flush()

        return {"connected": True, "provider": "anthropic"}

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
        elif provider == "anthropic":
            data["client_id"] = self._settings.ANTHROPIC_OAUTH_CLIENT_ID

        try:
            async with httpx.AsyncClient() as client:
                if provider == "anthropic":
                    resp = await client.post(
                        config["token_url"],
                        json=data,
                        headers={"Content-Type": "application/json"},
                    )
                else:
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
    # Device Code Flow (RFC 8628 - Headless OAuth)
    # ------------------------------------------------------------------

    async def start_device_flow(
        self,
        provider: str,
        username: str,
        db: AsyncSession,
    ) -> dict[str, str | int]:
        """Start the Device Authorization Grant flow.

        OpenAI uses a custom endpoint, Google uses standard RFC 8628.

        Args:
            provider: OAuth provider name (e.g. "openai").
            username: Current user's username.
            db: Database session.

        Returns:
            Dict with device_code, user_code, verification_uri, interval, expires_in.
        """
        if provider not in SUPPORTED_PROVIDERS:
            raise OAuthError(f"Unsupported OAuth provider: {provider}", provider)

        config = _PROVIDER_CONFIG[provider]
        if not config.get("supports_device_code"):
            raise OAuthError(f"Provider {provider} does not support device code flow", provider)

        if provider == "openai":
            return await self._start_openai_device_flow(username, db)
        else:
            return await self._start_standard_device_flow(provider, username, db)

    async def _start_openai_device_flow(
        self,
        username: str,
        db: AsyncSession,
    ) -> dict[str, str | int]:
        """Start OpenAI's custom device code flow (ChatGPT Plus/Pro)."""
        client_id = self._settings.OPENAI_OAUTH_CLIENT_ID
        if not client_id:
            raise OAuthError("OPENAI_OAUTH_CLIENT_ID is not configured", "openai")

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://auth.openai.com/api/accounts/deviceauth/usercode",
                json={"client_id": client_id},
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "labnote-ai/1.0",
                },
            )

        if resp.status_code != 200:
            raise OAuthError(
                f"OpenAI device code request failed: {resp.status_code} {resp.text}",
                "openai",
            )

        device_auth = resp.json()
        device_auth_id = device_auth.get("device_auth_id", "")
        user_code = device_auth.get("user_code", "")
        interval = int(device_auth.get("interval", "5"))
        expires_in = 900

        stmt = select(OAuthToken).where(
            OAuthToken.username == username,
            OAuthToken.provider == "openai",
        )
        result = await db.execute(stmt)
        token_row = result.scalar_one_or_none()

        device_code_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)
        device_code_data = f"{device_auth_id}:{user_code}"

        if token_row:
            token_row.device_code = device_code_data
            token_row.device_code_expires_at = device_code_expires_at
        else:
            token_row = OAuthToken(
                username=username,
                provider="openai",
                access_token_encrypted="",
                device_code=device_code_data,
                device_code_expires_at=device_code_expires_at,
            )
            db.add(token_row)

        await db.flush()

        return {
            "device_code": device_code_data,
            "user_code": user_code,
            "verification_uri": "https://auth.openai.com/codex/device",
            "expires_in": expires_in,
            "interval": interval,
        }

    async def _start_standard_device_flow(
        self,
        provider: str,
        username: str,
        db: AsyncSession,
    ) -> dict[str, str | int]:
        """Start standard RFC 8628 device code flow (Google, etc.)."""
        config = _PROVIDER_CONFIG[provider]

        data: dict[str, str] = {"scope": config["scopes"]}

        if provider == "google":
            client_id = self._settings.GOOGLE_OAUTH_CLIENT_ID
            if not client_id:
                raise OAuthError("GOOGLE_OAUTH_CLIENT_ID is not configured", provider)
            data["client_id"] = client_id

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                config["device_authorization_url"],
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if resp.status_code != 200:
            raise OAuthError(
                f"Device authorization request failed: {resp.status_code} {resp.text}",
                provider,
            )

        device_auth = resp.json()
        device_code = device_auth.get("device_code", "")
        user_code = device_auth.get("user_code", "")
        verification_uri = device_auth.get("verification_uri") or device_auth.get("verification_url", "")
        verification_uri_complete = device_auth.get("verification_uri_complete")
        expires_in = device_auth.get("expires_in", 1800)
        interval = device_auth.get("interval", 5)

        stmt = select(OAuthToken).where(
            OAuthToken.username == username,
            OAuthToken.provider == provider,
        )
        result = await db.execute(stmt)
        token_row = result.scalar_one_or_none()

        device_code_expires_at = datetime.now(UTC) + timedelta(seconds=int(expires_in))

        if token_row:
            token_row.device_code = device_code
            token_row.device_code_expires_at = device_code_expires_at
        else:
            token_row = OAuthToken(
                username=username,
                provider=provider,
                access_token_encrypted="",
                device_code=device_code,
                device_code_expires_at=device_code_expires_at,
            )
            db.add(token_row)

        await db.flush()

        response: dict[str, str | int] = {
            "device_code": device_code,
            "user_code": user_code,
            "verification_uri": verification_uri,
            "expires_in": expires_in,
            "interval": interval,
        }
        if verification_uri_complete:
            response["verification_uri_complete"] = verification_uri_complete

        return response

    async def poll_device_token(
        self,
        provider: str,
        username: str,
        device_code: str,
        db: AsyncSession,
    ) -> dict[str, str | bool | None]:
        """Poll for token after user completes device authorization."""
        if provider not in SUPPORTED_PROVIDERS:
            raise OAuthError(f"Unsupported OAuth provider: {provider}", provider)

        stmt = select(OAuthToken).where(
            OAuthToken.username == username,
            OAuthToken.provider == provider,
        )
        result = await db.execute(stmt)
        token_row = result.scalar_one_or_none()

        if not token_row or token_row.device_code != device_code:
            raise OAuthError("Invalid or expired device code", provider)

        if token_row.device_code_expires_at and token_row.device_code_expires_at < datetime.now(UTC):
            token_row.device_code = None
            token_row.device_code_expires_at = None
            await db.flush()
            return {"status": "expired", "connected": False}

        if provider == "openai":
            return await self._poll_openai_device_token(token_row, db)
        else:
            return await self._poll_standard_device_token(provider, token_row, db)

    async def _poll_openai_device_token(
        self,
        token_row: OAuthToken,
        db: AsyncSession,
    ) -> dict[str, str | bool | None]:
        """Poll OpenAI's custom device token endpoint."""
        device_code_data = token_row.device_code or ""
        if ":" not in device_code_data:
            raise OAuthError("Invalid device code format", "openai")

        device_auth_id, user_code = device_code_data.split(":", 1)

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://auth.openai.com/api/accounts/deviceauth/token",
                json={"device_auth_id": device_auth_id, "user_code": user_code},
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "labnote-ai/1.0",
                },
            )

        if resp.status_code == 200:
            data = resp.json()
            authorization_code = data.get("authorization_code")
            code_verifier = data.get("code_verifier")

            if authorization_code and code_verifier:
                return await self._exchange_openai_device_code(authorization_code, code_verifier, token_row, db)

        try:
            error_data = resp.json()
            error = error_data.get("error", "")
        except Exception:
            error = ""

        if error == "authorization_pending" or resp.status_code == 202:
            return {"status": "pending", "connected": False}
        elif error == "slow_down":
            return {"status": "slow_down", "connected": False}
        elif error == "access_denied":
            token_row.device_code = None
            token_row.device_code_expires_at = None
            await db.flush()
            return {"status": "denied", "connected": False}
        elif error == "expired_token":
            token_row.device_code = None
            token_row.device_code_expires_at = None
            await db.flush()
            return {"status": "expired", "connected": False}

        return {"status": "pending", "connected": False}

    async def _exchange_openai_device_code(
        self,
        authorization_code: str,
        code_verifier: str,
        token_row: OAuthToken,
        db: AsyncSession,
    ) -> dict[str, str | bool | None]:
        """Exchange OpenAI authorization code for tokens.

        Note: For device code flow, the code_verifier is provided by OpenAI's
        deviceauth/token endpoint, NOT generated by us. The redirect_uri must
        be OpenAI's deviceauth callback, not our local server.
        """
        client_id = self._settings.OPENAI_OAUTH_CLIENT_ID

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://auth.openai.com/oauth/token",
                data={
                    "grant_type": "authorization_code",
                    "code": authorization_code,
                    "client_id": client_id,
                    "code_verifier": code_verifier,
                    "redirect_uri": "https://auth.openai.com/deviceauth/callback",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if resp.status_code != 200:
            logger.warning("OpenAI token exchange failed: %s %s", resp.status_code, resp.text)
            raise OAuthError(f"Token exchange failed: {resp.text}", "openai")

        tokens = resp.json()
        access_token = tokens.get("access_token", "")
        refresh_token = tokens.get("refresh_token")
        expires_in = tokens.get("expires_in")

        expires_at = None
        if expires_in:
            expires_at = datetime.now(UTC) + timedelta(seconds=int(expires_in))

        token_row.access_token_encrypted = self.encrypt_token(access_token)
        if refresh_token:
            token_row.refresh_token_encrypted = self.encrypt_token(refresh_token)
        token_row.token_type = tokens.get("token_type", "bearer")
        token_row.expires_at = expires_at
        token_row.scope = tokens.get("scope", "")
        token_row.device_code = None
        token_row.device_code_expires_at = None

        await db.flush()

        return {
            "status": "completed",
            "connected": True,
            "provider": "openai",
        }

    async def _poll_standard_device_token(
        self,
        provider: str,
        token_row: OAuthToken,
        db: AsyncSession,
    ) -> dict[str, str | bool | None]:
        """Poll standard RFC 8628 device token endpoint."""
        config = _PROVIDER_CONFIG[provider]
        device_code = token_row.device_code or ""

        data: dict[str, str] = {
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": device_code,
        }

        if provider == "google":
            data["client_id"] = self._settings.GOOGLE_OAUTH_CLIENT_ID
            data["client_secret"] = self._settings.GOOGLE_OAUTH_CLIENT_SECRET

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                config["token_url"],
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if resp.status_code == 200:
            tokens = resp.json()
            access_token = tokens.get("access_token", "")
            refresh_token = tokens.get("refresh_token")
            expires_in = tokens.get("expires_in")
            scope = tokens.get("scope", "")

            expires_at = None
            if expires_in:
                expires_at = datetime.now(UTC) + timedelta(seconds=int(expires_in))

            email = None
            if provider == "google" and access_token:
                email = await self._fetch_google_email(access_token)

            token_row.access_token_encrypted = self.encrypt_token(access_token)
            if refresh_token:
                token_row.refresh_token_encrypted = self.encrypt_token(refresh_token)
            token_row.token_type = tokens.get("token_type", "bearer")
            token_row.expires_at = expires_at
            token_row.scope = scope
            token_row.email = email
            token_row.device_code = None
            token_row.device_code_expires_at = None

            await db.flush()

            result_dict: dict[str, str | bool | None] = {
                "status": "completed",
                "connected": True,
                "provider": provider,
            }
            if email:
                result_dict["email"] = email
            return result_dict

        # Handle error responses
        try:
            error_data = resp.json()
            error = error_data.get("error", "")
        except Exception:
            error = ""

        if error == "authorization_pending":
            # User hasn't completed authorization yet
            return {"status": "pending", "connected": False}
        elif error == "slow_down":
            # We're polling too fast
            return {"status": "slow_down", "connected": False}
        elif error == "access_denied":
            # User denied the authorization
            token_row.device_code = None
            token_row.device_code_expires_at = None
            await db.flush()
            return {"status": "denied", "connected": False}
        elif error == "expired_token":
            # Device code has expired
            token_row.device_code = None
            token_row.device_code_expires_at = None
            await db.flush()
            return {"status": "expired", "connected": False}
        else:
            # Unknown error
            logger.warning("Device code poll error for %s: %s %s", provider, resp.status_code, resp.text)
            raise OAuthError(f"Token poll failed: {error or resp.text}", provider)

    # ------------------------------------------------------------------
    # Configuration Check
    # ------------------------------------------------------------------

    def is_provider_configured(self, provider: str) -> dict[str, bool | str]:
        """Check whether the OAuth provider has required credentials configured."""
        config = _PROVIDER_CONFIG.get(provider, {})
        auth_mode = config.get("auth_mode", "")

        if provider == "openai":
            configured = bool(self._settings.OPENAI_OAUTH_CLIENT_ID)
        elif provider == "anthropic":
            configured = bool(self._settings.ANTHROPIC_OAUTH_CLIENT_ID)
        elif provider == "google":
            configured = True
        else:
            configured = False

        return {"provider": provider, "configured": configured, "auth_mode": auth_mode}

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
