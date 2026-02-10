# @TASK P0-T0.3 - FastAPI 앱 엔트리포인트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#system-architecture

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application lifespan: startup and shutdown events."""
    # Startup: create all database tables if they don't exist
    from app.database import Base
    from app import models  # noqa: F401 - Import models to register them with Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield
    # Shutdown: dispose the async engine connection pool
    await engine.dispose()


app = FastAPI(
    title="LabNote AI",
    description="Synology NoteStation enhanced with AI",
    version="0.1.0",
    lifespan=lifespan,
)

# --- CORS Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Router includes ---
from app.api.auth import router as auth_router
from app.api.notes import router as notes_router
from app.api.notebooks import router as notebooks_router
from app.api.search import router as search_router
from app.api.settings import router as settings_router
from app.api.sync import router as sync_router
from app.api.export import router as export_router
from app.api.files import router as files_router

app.include_router(auth_router, prefix="/api")
app.include_router(notes_router, prefix="/api")
app.include_router(notebooks_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(sync_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(files_router, prefix="/api")

from app.api.ai import router as ai_router

app.include_router(ai_router, prefix="/api")

from app.api.oauth import router as oauth_router

app.include_router(oauth_router, prefix="/api")

from app.api.nsx import router as nsx_router
from app.api.backup import router as backup_router
from app.api.members import router as members_router
from app.api.sharing import router as sharing_router
from app.api.share_links import router as share_links_router
from app.api.share_links import note_router as share_links_note_router
from app.api.shared import router as shared_router
from app.api.discovery import router as discovery_router
from app.api.graph import router as graph_router
from app.api.admin import router as admin_router
from app.api.activity_log import router as activity_log_router

app.include_router(nsx_router, prefix="/api")
app.include_router(backup_router, prefix="/api")
app.include_router(members_router, prefix="/api")
app.include_router(sharing_router, prefix="/api")
app.include_router(share_links_router, prefix="/api")
app.include_router(share_links_note_router, prefix="/api")
app.include_router(shared_router, prefix="/api")
app.include_router(discovery_router, prefix="/api")
app.include_router(graph_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(activity_log_router, prefix="/api")


@app.get("/api/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Health check endpoint.

    Returns a simple status response to verify the API is running.
    """
    return {"status": "ok"}
