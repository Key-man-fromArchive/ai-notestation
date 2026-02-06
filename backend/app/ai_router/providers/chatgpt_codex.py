"""ChatGPT Codex provider -- proxies to chatgpt.com/backend-api.

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
    ModelInfo(
        id="gpt-5.2", name="GPT-5.2 (ChatGPT)", provider=_PROVIDER_NAME, max_tokens=400_000, supports_streaming=True
    ),
    ModelInfo(
        id="gpt-5.2-pro",
        name="GPT-5.2 Pro (ChatGPT)",
        provider=_PROVIDER_NAME,
        max_tokens=400_000,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-5.1", name="GPT-5.1 (ChatGPT)", provider=_PROVIDER_NAME, max_tokens=400_000, supports_streaming=True
    ),
    ModelInfo(id="gpt-5", name="GPT-5 (ChatGPT)", provider=_PROVIDER_NAME, max_tokens=400_000, supports_streaming=True),
    ModelInfo(
        id="gpt-5-mini",
        name="GPT-5 mini (ChatGPT)",
        provider=_PROVIDER_NAME,
        max_tokens=200_000,
        supports_streaming=True,
    ),
    ModelInfo(id="o3", name="o3 (ChatGPT)", provider=_PROVIDER_NAME, max_tokens=200_000, supports_streaming=True),
    ModelInfo(
        id="o3-mini", name="o3 mini (ChatGPT)", provider=_PROVIDER_NAME, max_tokens=200_000, supports_streaming=True
    ),
    ModelInfo(
        id="o4-mini", name="o4 mini (ChatGPT)", provider=_PROVIDER_NAME, max_tokens=200_000, supports_streaming=True
    ),
    ModelInfo(
        id="gpt-4o", name="GPT-4o (ChatGPT)", provider=_PROVIDER_NAME, max_tokens=128_000, supports_streaming=True
    ),
    ModelInfo(
        id="gpt-4o-mini",
        name="GPT-4o mini (ChatGPT)",
        provider=_PROVIDER_NAME,
        max_tokens=128_000,
        supports_streaming=True,
    ),
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
                async with client.stream("POST", url, json=body, headers=self._build_headers()) as resp:
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
