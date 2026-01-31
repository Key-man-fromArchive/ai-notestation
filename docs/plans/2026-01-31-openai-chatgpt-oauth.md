# OpenAI ChatGPT OAuth (Codex Flow) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to authenticate with their ChatGPT Plus/Pro subscription via OAuth and use OpenAI models through the ChatGPT backend, alongside the existing API key method.

**Architecture:** Re-add OpenAI to the OAuth service using the official Codex CLI OAuth flow (`auth.openai.com` with PKCE + required scopes). Create a new `ChatGPTCodexProvider` that proxies requests to `chatgpt.com/backend-api` using the OAuth token. The JWT contains a `chatgpt_account_id` claim that must be sent in request headers. Existing API key flow is preserved as a fallback.

**Tech Stack:** FastAPI, httpx, Python JWT decoding, React, TanStack Query

**Constraints:**
- ChatGPT OAuth tokens only work with `chatgpt.com/backend-api`, NOT `api.openai.com`
- Personal use only (ChatGPT Plus/Pro subscription) — not for multi-user production
- The ChatGPT backend is a private API; response format may change

**Reference Implementation:** `https://github.com/numman-ali/opencode-openai-codex-auth` — particularly `lib/auth/auth.ts` for OAuth params and `lib/request/fetch-helpers.ts` for Codex headers.

---

## Task 1: Re-add OpenAI to OAuth Service (Backend)

**Files:**
- Modify: `backend/app/services/oauth_service.py`
- Modify: `backend/app/config.py`
- Modify: `backend/.env` and `backend/.env.example` (root `.env`)
- Test: `backend/tests/test_oauth_service.py`

### Step 1: Write the failing test

```python
# In backend/tests/test_oauth_service.py — replace test_openai_not_supported

@pytest.mark.asyncio
async def test_openai_authorize_url(self):
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
    assert "scope=openid+profile+email+offline_access" in url
    assert "code_challenge=" in url
    assert "code_challenge_method=S256" in url
```

### Step 2: Run test to verify it fails

Run: `docker compose exec backend python -m pytest tests/test_oauth_service.py::TestBuildAuthorizeUrl::test_openai_authorize_url -v`
Expected: FAIL — "Unsupported OAuth provider: openai"

### Step 3: Add OpenAI provider config and OAuth build logic

In `backend/app/config.py`, add back:
```python
OPENAI_OAUTH_CLIENT_ID: str = ""
```

In `backend/app/services/oauth_service.py`, update `_PROVIDER_CONFIG`:
```python
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
        "scopes": "openid https://www.googleapis.com/auth/userinfo.email",
        "supports_refresh": True,
    },
}
```

In `build_authorize_url`, add the OpenAI branch back (before the Google branch):
```python
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
    # ... existing Google logic unchanged
```

In `exchange_code`, add the OpenAI branch:
```python
if provider == "openai":
    token_data["client_id"] = self._settings.OPENAI_OAUTH_CLIENT_ID
elif provider == "google":
    token_data["client_id"] = self._settings.GOOGLE_OAUTH_CLIENT_ID
    token_data["client_secret"] = self._settings.GOOGLE_OAUTH_CLIENT_SECRET
```

In `_refresh_token`, add the OpenAI branch:
```python
if provider == "openai":
    data["client_id"] = self._settings.OPENAI_OAUTH_CLIENT_ID
elif provider == "google":
    data["client_id"] = self._settings.GOOGLE_OAUTH_CLIENT_ID
    data["client_secret"] = self._settings.GOOGLE_OAUTH_CLIENT_SECRET
```

In `is_provider_configured`, add the OpenAI branch:
```python
if provider == "openai":
    configured = bool(self._settings.OPENAI_OAUTH_CLIENT_ID)
elif provider == "google":
    # ... existing
```

Update `.env` and `.env.example`:
```
OPENAI_OAUTH_CLIENT_ID=app_EMoamEEZ73f0CkXaXp7hrann
```

### Step 4: Run test to verify it passes

Run: `docker compose exec backend python -m pytest tests/test_oauth_service.py -v`
Expected: ALL PASS

### Step 5: Also update the API OAuth test

In `backend/tests/test_api_oauth.py`, update `test_openai_returns_400` to test that OpenAI authorize now succeeds (returns 200 with a URL). Or remove it and confirm OpenAI is back in SUPPORTED_PROVIDERS.

### Step 6: Run all OAuth tests

Run: `docker compose exec backend python -m pytest tests/test_oauth_service.py tests/test_api_oauth.py tests/test_oauth_providers.py -v`
Expected: ALL PASS

### Step 7: Commit

```bash
git add backend/app/services/oauth_service.py backend/app/config.py .env .env.example backend/tests/
git commit -m "feat: re-add OpenAI OAuth using Codex CLI flow (PKCE + required scopes)"
```

---

## Task 2: ChatGPT Codex Provider (Backend)

**Files:**
- Create: `backend/app/ai_router/providers/chatgpt_codex.py`
- Modify: `backend/app/ai_router/router.py`
- Test: `backend/tests/test_chatgpt_codex_provider.py`

This provider proxies requests to `chatgpt.com/backend-api` using the ChatGPT OAuth token. It does NOT use the `openai` Python SDK — it uses raw `httpx` with the correct Codex headers.

### Step 1: Write the failing test

```python
# backend/tests/test_chatgpt_codex_provider.py
"""Tests for ChatGPT Codex provider."""

from __future__ import annotations
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.ai_router.schemas import Message


class TestChatGPTCodexProvider:
    """Test ChatGPT Codex provider initialization."""

    def test_init_with_token(self):
        from app.ai_router.providers.chatgpt_codex import ChatGPTCodexProvider
        provider = ChatGPTCodexProvider(
            access_token="test-jwt-token",
            account_id="account-123",
        )
        assert provider.is_oauth is True
        assert provider._account_id == "account-123"

    def test_init_requires_access_token(self):
        from app.ai_router.providers.chatgpt_codex import ChatGPTCodexProvider
        from app.ai_router.schemas import ProviderError
        with pytest.raises(ProviderError, match="access_token.*required"):
            ChatGPTCodexProvider(access_token="", account_id="")

    def test_available_models(self):
        from app.ai_router.providers.chatgpt_codex import ChatGPTCodexProvider
        provider = ChatGPTCodexProvider(
            access_token="test-token",
            account_id="account-123",
        )
        models = provider.available_models()
        model_ids = [m.id for m in models]
        assert "gpt-4o" in model_ids


class TestChatGPTCodexChat:
    """Test chat (non-streaming) via Codex backend."""

    @pytest.mark.asyncio
    async def test_chat_returns_response(self):
        from app.ai_router.providers.chatgpt_codex import ChatGPTCodexProvider

        provider = ChatGPTCodexProvider(
            access_token="test-token",
            account_id="account-123",
        )

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "output": [
                {"type": "message", "content": [{"type": "output_text", "text": "Hello!"}]}
            ],
            "model": "gpt-4o",
            "usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
        }

        with patch("app.ai_router.providers.chatgpt_codex.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            messages = [Message(role="user", content="Hi")]
            response = await provider.chat(messages, model="gpt-4o")

        assert response.content == "Hello!"
        assert response.provider == "openai-codex"


class TestAccountIdExtraction:
    """Test JWT account_id extraction utility."""

    def test_extract_account_id_from_jwt(self):
        from app.ai_router.providers.chatgpt_codex import extract_chatgpt_account_id
        import base64, json

        payload = {"https://api.openai.com/auth": {"chatgpt_account_id": "acct-abc123"}}
        b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        fake_jwt = f"header.{b64}.signature"

        account_id = extract_chatgpt_account_id(fake_jwt)
        assert account_id == "acct-abc123"

    def test_extract_returns_none_for_invalid(self):
        from app.ai_router.providers.chatgpt_codex import extract_chatgpt_account_id
        assert extract_chatgpt_account_id("not-a-jwt") is None
        assert extract_chatgpt_account_id("") is None
```

### Step 2: Run test to verify it fails

Run: `docker compose exec backend python -m pytest tests/test_chatgpt_codex_provider.py -v`
Expected: FAIL — ModuleNotFoundError

### Step 3: Implement the ChatGPT Codex provider

```python
# backend/app/ai_router/providers/chatgpt_codex.py
"""ChatGPT Codex provider — proxies to chatgpt.com/backend-api.

Uses the ChatGPT OAuth token (from Codex CLI flow) to access OpenAI models
through the ChatGPT backend. For personal use with ChatGPT Plus/Pro.

Reference: https://github.com/numman-ali/opencode-openai-codex-auth
"""

from __future__ import annotations

import base64
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.ai_router.providers.base import AIProvider
from app.ai_router.schemas import (
    AIResponse,
    Message,
    ModelInfo,
    ProviderError,
    TokenUsage,
)

logger = logging.getLogger(__name__)

_PROVIDER_NAME = "openai-codex"
_CODEX_BASE_URL = "https://chatgpt.com/backend-api"

_SUPPORTED_MODELS: list[ModelInfo] = [
    ModelInfo(id="gpt-4o", name="GPT-4o (ChatGPT)", provider=_PROVIDER_NAME, max_tokens=128000, supports_streaming=True),
    ModelInfo(id="gpt-4o-mini", name="GPT-4o mini (ChatGPT)", provider=_PROVIDER_NAME, max_tokens=128000, supports_streaming=True),
]


def extract_chatgpt_account_id(jwt_token: str) -> str | None:
    """Extract chatgpt_account_id from JWT access token payload."""
    try:
        parts = jwt_token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        # Add padding
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        return payload.get("https://api.openai.com/auth", {}).get("chatgpt_account_id")
    except Exception:
        return None


class ChatGPTCodexProvider(AIProvider):
    """AI provider backed by the ChatGPT backend (Codex flow).

    Uses the same OAuth flow as OpenAI's Codex CLI to authenticate
    against chatgpt.com/backend-api.
    """

    def __init__(self, access_token: str, account_id: str) -> None:
        if not access_token or not account_id:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message="access_token and account_id are required for ChatGPT Codex provider.",
            )
        self._access_token = access_token
        self._account_id = account_id
        self.is_oauth = True

    def _build_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
            "chatgpt-account-id": self._account_id,
            "OpenAI-Beta": "responses=experimental",
            "originator": "codex_cli_rs",
            "accept": "text/event-stream",
        }

    @staticmethod
    def _messages_to_input(messages: list[Message]) -> str:
        """Convert Message list to a single input string for the Responses API."""
        parts = []
        for m in messages:
            if m.role == "system":
                parts.append(f"[System]\n{m.content}")
            elif m.role == "user":
                parts.append(m.content)
            elif m.role == "assistant":
                parts.append(f"[Assistant]\n{m.content}")
        return "\n\n".join(parts)

    async def chat(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AIResponse:
        url = f"{_CODEX_BASE_URL}/codex/responses"
        body: dict[str, Any] = {
            "model": model,
            "input": self._messages_to_input(messages),
            "stream": False,
        }
        if "temperature" in kwargs:
            body["temperature"] = kwargs["temperature"]
        if "max_tokens" in kwargs:
            body["max_output_tokens"] = kwargs["max_tokens"]

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, json=body, headers=self._build_headers())
        except httpx.HTTPError as exc:
            raise ProviderError(provider=_PROVIDER_NAME, message=str(exc)) from exc

        if resp.status_code != 200:
            raise ProviderError(
                provider=_PROVIDER_NAME,
                message=f"ChatGPT backend error: {resp.status_code} {resp.text[:500]}",
                status_code=resp.status_code,
            )

        data = resp.json()
        # Extract text from Responses API format
        content = ""
        for item in data.get("output", []):
            if item.get("type") == "message":
                for c in item.get("content", []):
                    if c.get("type") == "output_text":
                        content += c.get("text", "")

        usage = None
        raw_usage = data.get("usage")
        if raw_usage:
            usage = TokenUsage(
                prompt_tokens=raw_usage.get("input_tokens", 0),
                completion_tokens=raw_usage.get("output_tokens", 0),
                total_tokens=raw_usage.get("total_tokens", 0),
            )

        return AIResponse(
            content=content,
            model=data.get("model", model),
            provider=_PROVIDER_NAME,
            usage=usage,
        )

    async def stream(
        self,
        messages: list[Message],
        model: str,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        url = f"{_CODEX_BASE_URL}/codex/responses"
        body: dict[str, Any] = {
            "model": model,
            "input": self._messages_to_input(messages),
            "stream": True,
        }
        if "temperature" in kwargs:
            body["temperature"] = kwargs["temperature"]
        if "max_tokens" in kwargs:
            body["max_output_tokens"] = kwargs["max_tokens"]

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST", url, json=body, headers=self._build_headers()
                ) as resp:
                    if resp.status_code != 200:
                        error_body = await resp.aread()
                        raise ProviderError(
                            provider=_PROVIDER_NAME,
                            message=f"ChatGPT stream error: {resp.status_code} {error_body[:500]}",
                            status_code=resp.status_code,
                        )
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        payload = line[6:]
                        if payload == "[DONE]":
                            return
                        try:
                            event = json.loads(payload)
                            if event.get("type") == "response.output_text.delta":
                                delta = event.get("delta", "")
                                if delta:
                                    yield delta
                        except json.JSONDecodeError:
                            continue
        except httpx.HTTPError as exc:
            raise ProviderError(provider=_PROVIDER_NAME, message=str(exc)) from exc

    def available_models(self) -> list[ModelInfo]:
        return list(_SUPPORTED_MODELS)
```

### Step 4: Register in AIRouter

In `backend/app/ai_router/router.py`, update `register_oauth_provider`:
```python
def register_oauth_provider(self, name: str, access_token: str, **kwargs: Any) -> None:
    try:
        if name == "openai":
            from app.ai_router.providers.chatgpt_codex import (
                ChatGPTCodexProvider,
                extract_chatgpt_account_id,
            )
            account_id = kwargs.get("account_id") or extract_chatgpt_account_id(access_token)
            if not account_id:
                logger.warning("Cannot extract chatgpt_account_id from token")
                return
            provider = ChatGPTCodexProvider(access_token=access_token, account_id=account_id)
        elif name == "google":
            from app.ai_router.providers.google import GoogleProvider
            provider = GoogleProvider(oauth_token=access_token, is_oauth=True, **kwargs)
        else:
            logger.warning("OAuth not supported for provider: %s", name)
            return
        self._providers[name] = provider
        logger.info("Registered OAuth provider: %s", name)
    except Exception:
        logger.warning("Failed to register OAuth provider: %s", name, exc_info=True)
```

### Step 5: Run tests

Run: `docker compose exec backend python -m pytest tests/test_chatgpt_codex_provider.py tests/test_oauth_providers.py -v`
Expected: ALL PASS

### Step 6: Commit

```bash
git add backend/app/ai_router/providers/chatgpt_codex.py backend/app/ai_router/router.py backend/tests/test_chatgpt_codex_provider.py
git commit -m "feat: add ChatGPT Codex provider for chatgpt.com/backend-api"
```

---

## Task 3: Wire OAuth Tokens into AI Endpoints (Backend)

**Files:**
- Modify: `backend/app/api/ai.py`
- Test: `backend/tests/test_api_ai_oauth.py`

Currently `ai_chat` and `ai_stream` use a singleton AIRouter that only reads env var API keys. We need per-request OAuth token injection.

### Step 1: Write the failing test

```python
# backend/tests/test_api_ai_oauth.py
"""Test that AI endpoints use OAuth tokens when available."""

from __future__ import annotations
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient


def _get_app():
    from app.main import app
    return app


def _setup_overrides(app):
    from app.services.auth_service import get_current_user
    async def _fake_user():
        return {"username": "testuser"}
    app.dependency_overrides[get_current_user] = _fake_user
    return app


def _clear_overrides(app):
    app.dependency_overrides.clear()


class TestAIOAuthIntegration:
    @pytest.mark.asyncio
    async def test_chat_uses_oauth_token_when_available(self):
        """AI chat should inject OAuth token for the resolved provider."""
        app = _get_app()
        _setup_overrides(app)
        try:
            with patch("app.api.ai.OAuthService") as MockOAuth:
                oauth_instance = MockOAuth.return_value
                oauth_instance.get_valid_token = AsyncMock(return_value="chatgpt-oauth-token")

                with patch("app.api.ai.get_ai_router") as mock_get_router:
                    mock_router = MagicMock()
                    mock_router.chat = AsyncMock(return_value=MagicMock(
                        content="test response",
                        model="gpt-4o",
                        provider="openai-codex",
                        usage=None,
                        finish_reason="stop",
                    ))
                    mock_get_router.return_value = mock_router

                    from app.api.ai import _get_oauth_service
                    app.dependency_overrides[_get_oauth_service] = lambda: oauth_instance

                    transport = ASGITransport(app=app)
                    async with AsyncClient(transport=transport, base_url="http://test") as client:
                        resp = await client.post("/api/ai/chat", json={
                            "feature": "insight",
                            "content": "test note content",
                            "model": "gpt-4o",
                        })

                    assert resp.status_code == 200
                    # Verify OAuth token was fetched
                    oauth_instance.get_valid_token.assert_called_once()
        finally:
            _clear_overrides(app)
```

### Step 2: Run test to verify it fails

Run: `docker compose exec backend python -m pytest tests/test_api_ai_oauth.py -v`
Expected: FAIL — `_get_oauth_service` not found

### Step 3: Inject OAuthService into AI endpoints

In `backend/app/api/ai.py`, add:
```python
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.oauth_service import OAuthService

def _get_oauth_service() -> OAuthService:
    return OAuthService()
```

Then update `ai_chat` and `ai_stream` to accept OAuth dependencies and inject tokens:

```python
@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(
    request: AIChatRequest,
    current_user: dict = Depends(get_current_user),
    ai_router: AIRouter = Depends(get_ai_router),
    db: AsyncSession = Depends(get_db),
    oauth_service: OAuthService = Depends(_get_oauth_service),
) -> AIChatResponse:
    # ... existing message building ...

    # Inject user's OAuth token if available
    if request.model:
        provider_name = _resolve_provider_name(request.model)
        if provider_name:
            token = await oauth_service.get_valid_token(
                username=current_user["username"],
                provider=provider_name,
                db=db,
            )
            if token:
                ai_router.register_oauth_provider(provider_name, token)

    # ... rest of existing logic ...
```

Add helper:
```python
def _resolve_provider_name(model: str | None) -> str | None:
    """Map model name to OAuth provider name."""
    if not model:
        return None
    if model.startswith("gpt-"):
        return "openai"
    if model.startswith("gemini"):
        return "google"
    return None
```

Apply the same pattern to `ai_stream`.

### Step 4: Run tests

Run: `docker compose exec backend python -m pytest tests/test_api_ai_oauth.py tests/test_api_ai.py -v`
Expected: ALL PASS

### Step 5: Commit

```bash
git add backend/app/api/ai.py backend/tests/test_api_ai_oauth.py
git commit -m "feat: inject per-user OAuth tokens into AI endpoints"
```

---

## Task 4: Re-add OpenAI OAuth UI (Frontend)

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/hooks/useOAuth.ts`
- Modify: `frontend/src/__tests__/SettingsOAuth.test.tsx`
- Modify: `frontend/src/__tests__/useOAuth.test.tsx`

### Step 1: Re-enable OpenAI OAuth in Settings.tsx

In `settingsList`, add `oauthProvider` back to the OpenAI entry:
```typescript
{
    key: 'openai_api_key',
    label: 'OpenAI API Key',
    type: 'password',
    placeholder: 'sk-...',
    oauthProvider: 'openai',  // re-add this line
},
```

Update `OAuthSection` label for OpenAI to clarify it's ChatGPT subscription:
```typescript
<OAuthSection
    provider={setting.oauthProvider!}
    label={setting.oauthProvider === 'google' ? 'Google' : 'ChatGPT (Plus/Pro)'}
/>
```

### Step 2: Re-enable OpenAI in useOAuth.ts

Change `enabled` back to both providers:
```typescript
enabled: provider === 'openai' || provider === 'google',
```

(Both the config query and status query.)

### Step 3: Update frontend tests

In `SettingsOAuth.test.tsx`:
- Update "renders OAuth connect button" test to expect both Google and ChatGPT buttons
- Update "shows API key fallback toggle" test to expect 2 toggles

In `useOAuth.test.tsx`:
- Replace the "does not enable queries for OpenAI" test with one that verifies OpenAI OAuth is active

### Step 4: Run frontend tests

Run: `docker compose exec frontend npx vitest run src/__tests__/useOAuth.test.tsx src/__tests__/SettingsOAuth.test.tsx --reporter=verbose`
Expected: ALL PASS

### Step 5: Commit

```bash
git add frontend/src/pages/Settings.tsx frontend/src/hooks/useOAuth.ts frontend/src/__tests__/
git commit -m "feat: re-add OpenAI OAuth UI (ChatGPT Plus/Pro subscription)"
```

---

## Task 5: Update E2E Tests

**Files:**
- Modify: `frontend/e2e/oauth-openai.spec.ts`
- Modify: `frontend/e2e/oauth-openai-live.spec.ts`

### Step 1: Update e2e tests

Revert the e2e tests to check that OpenAI OAuth flow works:
- Test 1: API authorize endpoint returns `auth.openai.com` URL with correct params
- Test 2: Settings page shows "ChatGPT (Plus/Pro)로 연결" button
- Test 3: Click connects to `auth.openai.com`
- Test 4: Google OAuth still works
- Test 5: Invalid state returns 400

### Step 2: Commit

```bash
git add frontend/e2e/
git commit -m "test: update e2e tests for OpenAI ChatGPT OAuth flow"
```

---

## Task 6: Singleton AIRouter Per-Request Safety (Backend)

**Files:**
- Modify: `backend/app/api/ai.py`

### Step 1: Fix thread-safety issue

The current singleton `_ai_router` would be mutated by `register_oauth_provider` on every request. This is unsafe for concurrent requests. Fix by creating a shallow copy per-request:

```python
@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(
    request: AIChatRequest,
    current_user: dict = Depends(get_current_user),
    ai_router: AIRouter = Depends(get_ai_router),
    db: AsyncSession = Depends(get_db),
    oauth_service: OAuthService = Depends(_get_oauth_service),
) -> AIChatResponse:
    # Create a per-request copy if we need OAuth injection
    request_router = ai_router

    if request.model:
        provider_name = _resolve_provider_name(request.model)
        if provider_name:
            token = await oauth_service.get_valid_token(
                username=current_user["username"],
                provider=provider_name,
                db=db,
            )
            if token:
                # Create per-request router to avoid mutating the singleton
                request_router = AIRouter.__new__(AIRouter)
                request_router._providers = dict(ai_router._providers)
                request_router.register_oauth_provider(provider_name, token)

    # Use request_router instead of ai_router for the rest
```

### Step 2: Write a test for concurrent safety

### Step 3: Run all backend tests

Run: `docker compose exec backend python -m pytest -v --tb=short`
Expected: ALL PASS

### Step 4: Commit

```bash
git add backend/app/api/ai.py
git commit -m "fix: per-request AIRouter copy for thread-safe OAuth injection"
```

---

## Task 7: Integration Smoke Test

### Step 1: Start the full stack

```bash
docker compose up -d
```

### Step 2: Manual test flow

1. Login to LabNote AI
2. Go to Settings
3. Click "ChatGPT (Plus/Pro)로 연결"
4. Verify redirect to `auth.openai.com` with correct params
5. Complete OAuth login with ChatGPT account
6. Verify callback returns to Settings with "연결됨" status
7. Try an AI feature (e.g., Insight) — should use ChatGPT backend
8. Verify Google OAuth still works separately

### Step 3: Final commit

```bash
git add -A
git commit -m "feat: complete OpenAI ChatGPT OAuth + Codex backend integration"
```

---

## Architecture Summary

```
User clicks "ChatGPT (Plus/Pro)로 연결"
    ↓
Frontend → GET /oauth/openai/authorize
    ↓
Backend builds URL: auth.openai.com/oauth/authorize
  + client_id = app_EMoamEEZ73f0CkXaXp7hrann
  + scope = openid profile email offline_access
  + PKCE (S256)
  + originator = codex_cli_rs
  + codex_cli_simplified_flow = true
    ↓
User logs in with ChatGPT account → callback with code
    ↓
Frontend → POST /oauth/openai/callback {code, state}
    ↓
Backend exchanges code → access_token (JWT) + refresh_token
Backend stores encrypted tokens in DB
    ↓
User uses AI feature → POST /api/ai/chat
    ↓
Backend:
  1. get_valid_token("openai") → decrypted JWT
  2. extract_chatgpt_account_id(jwt) → "acct-xxx"
  3. ChatGPTCodexProvider(access_token, account_id)
  4. POST chatgpt.com/backend-api/codex/responses
     + Authorization: Bearer {jwt}
     + chatgpt-account-id: acct-xxx
     + originator: codex_cli_rs
     + OpenAI-Beta: responses=experimental
    ↓
Response → SSE stream back to user
```
