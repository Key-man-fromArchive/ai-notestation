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
    # Startup: database connection is established via engine on first use
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

# --- Router includes (added in later phases) ---
# from app.api import notes, search, ai, sync, settings as settings_api
# app.include_router(notes.router, prefix="/api")
# app.include_router(search.router, prefix="/api")
# app.include_router(ai.router, prefix="/api")
# app.include_router(sync.router, prefix="/api")
# app.include_router(settings_api.router, prefix="/api")


@app.get("/api/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Health check endpoint.

    Returns a simple status response to verify the API is running.
    """
    return {"status": "ok"}
