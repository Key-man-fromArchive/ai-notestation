"""Setup Wizard API — first-run configuration endpoints."""

import asyncio
import logging
import os
import platform
import shutil

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.setup_state import is_initialized, mark_initialized

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/setup", tags=["setup"])

# In-memory wizard state (only written to DB on /complete)
_wizard_state: dict = {}


# --- Request/Response models ---


class SetupStatusResponse(BaseModel):
    initialized: bool
    current_step: int
    total_steps: int


class SystemInfoResponse(BaseModel):
    cpu_count: int
    memory_gb: float
    disk_total_gb: float
    disk_free_gb: float
    platform: str
    python_version: str


class LanguageRequest(BaseModel):
    language: str  # "ko" or "en"


class AdminRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    org_name: str
    org_slug: str


class AIProviderKey(BaseModel):
    provider: str  # "openai", "anthropic", "google", "zhipuai"
    api_key: str


class AISetupRequest(BaseModel):
    providers: list[AIProviderKey] = []
    test: bool = False


class AITestResult(BaseModel):
    provider: str
    success: bool
    message: str


class AIResponse(BaseModel):
    step: int
    test_results: list[AITestResult] | None = None


class DataSourceRequest(BaseModel):
    skip: bool = True
    nas_url: str | None = None
    nas_port: int | None = None
    nas_account: str | None = None
    nas_password: str | None = None


class CompleteResponse(BaseModel):
    success: bool
    access_token: str
    refresh_token: str
    user_id: int
    org_id: int


class StepResponse(BaseModel):
    step: int


# --- Helpers ---


def _get_memory_gb() -> float:
    """Read total memory from /proc/meminfo (Linux)."""
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    kb = int(line.split()[1])
                    return round(kb / (1024 * 1024), 1)
    except Exception:
        pass
    return 0.0


# --- Endpoints ---


@router.get("/status", response_model=SetupStatusResponse)
async def setup_status(db: AsyncSession = Depends(get_db)):
    initialized = await is_initialized(db)
    current_step = _wizard_state.get("current_step", 1)
    return SetupStatusResponse(
        initialized=initialized,
        current_step=current_step,
        total_steps=5,
    )


@router.get("/system-info", response_model=SystemInfoResponse)
async def system_info():
    disk = shutil.disk_usage("/")
    return SystemInfoResponse(
        cpu_count=os.cpu_count() or 1,
        memory_gb=_get_memory_gb(),
        disk_total_gb=round(disk.total / (1024**3), 1),
        disk_free_gb=round(disk.free / (1024**3), 1),
        platform=platform.platform(),
        python_version=platform.python_version(),
    )


@router.post("/language", response_model=StepResponse)
async def setup_language(req: LanguageRequest):
    if req.language not in ("ko", "en"):
        raise HTTPException(400, "Supported languages: ko, en")
    _wizard_state["language"] = req.language
    _wizard_state["current_step"] = 2
    return StepResponse(step=2)


@router.post("/admin", response_model=StepResponse)
async def setup_admin(req: AdminRequest):
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not req.org_slug or len(req.org_slug) < 2:
        raise HTTPException(400, "Organization slug must be at least 2 characters")
    _wizard_state["admin"] = req.model_dump()
    _wizard_state["current_step"] = 3
    return StepResponse(step=3)


@router.post("/ai", response_model=AIResponse)
async def setup_ai(req: AISetupRequest):
    _wizard_state["ai_providers"] = [p.model_dump() for p in req.providers]
    _wizard_state["current_step"] = 4

    test_results = None
    if req.test and req.providers:
        env_map = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "google": "GOOGLE_API_KEY",
            "zhipuai": "ZHIPUAI_API_KEY",
        }
        provider_display = {
            "openai": "OpenAI",
            "anthropic": "Anthropic",
            "google": "Google",
            "zhipuai": "ZhipuAI",
        }

        # Temporarily set env vars for testing
        old_values = {}
        for p in req.providers:
            env_key = env_map.get(p.provider)
            if env_key and p.api_key:
                old_values[env_key] = os.environ.get(env_key, "")
                os.environ[env_key] = p.api_key

        try:
            from app.api.settings import _test_single_provider

            lang = _wizard_state.get("language", "en")
            tasks = []
            for p in req.providers:
                env_key = env_map.get(p.provider)
                if env_key and p.api_key:
                    display = provider_display.get(p.provider, p.provider)
                    tasks.append(_test_single_provider(env_key, display, lang))

            if tasks:
                results = await asyncio.gather(*tasks, return_exceptions=True)
                test_results = []
                for r in results:
                    if isinstance(r, Exception):
                        test_results.append(
                            AITestResult(provider="unknown", success=False, message=str(r))
                        )
                    else:
                        test_results.append(
                            AITestResult(provider=r.provider, success=r.success, message=r.message)
                        )
        finally:
            for key, val in old_values.items():
                if val:
                    os.environ[key] = val
                else:
                    os.environ.pop(key, None)

    return AIResponse(step=4, test_results=test_results)


@router.post("/datasource", response_model=StepResponse)
async def setup_datasource(req: DataSourceRequest):
    if not req.skip:
        _wizard_state["datasource"] = req.model_dump()
    else:
        _wizard_state["datasource"] = {"skip": True}
    _wizard_state["current_step"] = 5
    return StepResponse(step=5)


@router.post("/complete", response_model=CompleteResponse)
async def setup_complete(db: AsyncSession = Depends(get_db)):
    """Atomic setup: create org, user, membership, settings, return JWT."""
    if await is_initialized(db):
        raise HTTPException(409, "System is already initialized")

    admin_data = _wizard_state.get("admin")
    if not admin_data:
        raise HTTPException(400, "Admin data not provided. Complete step 2 first.")

    from app.constants import MemberRole
    from app.models import Setting
    from app.services.auth_service import create_access_token, create_refresh_token
    from app.services.user_service import add_member_to_org, create_organization, create_user

    try:
        # Advisory lock to prevent concurrent setup
        await db.execute(text("SELECT pg_advisory_xact_lock(42)"))

        # Double-check after lock
        if await is_initialized(db):
            raise HTTPException(409, "System is already initialized")

        # Create organization
        org = await create_organization(
            db, name=admin_data["org_name"], slug=admin_data["org_slug"]
        )

        # Create admin user
        user = await create_user(
            db,
            email=admin_data["email"],
            password=admin_data["password"],
            name=admin_data["name"],
        )

        # Add admin as owner
        await add_member_to_org(db, user_id=user.id, org_id=org.id, role=MemberRole.OWNER)

        # Store AI provider keys as settings (JSONB value)
        ai_providers = _wizard_state.get("ai_providers", [])
        env_map = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "google": "GOOGLE_API_KEY",
            "zhipuai": "ZHIPUAI_API_KEY",
        }
        for p in ai_providers:
            env_key = env_map.get(p["provider"])
            if env_key and p["api_key"]:
                db.add(Setting(key=env_key, value={"value": p["api_key"]}))
                os.environ[env_key] = p["api_key"]

        # Store language
        language = _wizard_state.get("language", "ko")
        db.add(Setting(key="language", value={"value": language}))

        # Store NAS settings if provided
        ds = _wizard_state.get("datasource", {})
        if not ds.get("skip") and ds.get("nas_url"):
            db.add(Setting(key="synology_url", value={"value": ds["nas_url"]}))
            if ds.get("nas_port"):
                db.add(Setting(key="synology_port", value={"value": str(ds["nas_port"])}))
            if ds.get("nas_account"):
                db.add(Setting(key="synology_account", value={"value": ds["nas_account"]}))
            if ds.get("nas_password"):
                db.add(Setting(key="synology_password", value={"value": ds["nas_password"]}))

        await db.commit()

        # Generate tokens
        token_data = {"sub": str(user.id)}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)

        # Mark as initialized
        mark_initialized()

        # Clear wizard state
        _wizard_state.clear()

        return CompleteResponse(
            success=True,
            access_token=access_token,
            refresh_token=refresh_token,
            user_id=user.id,
            org_id=org.id,
        )

    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Setup failed: %s", exc)
        raise HTTPException(500, f"Setup failed: {exc}") from exc
