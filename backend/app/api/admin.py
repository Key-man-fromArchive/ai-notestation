"""Admin-only management dashboard endpoints."""

from __future__ import annotations

import contextlib
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.ai import _OAUTH_PROVIDER_MODELS, get_ai_router
from app.api.settings import _load_from_db as load_settings_from_db
from app.config import get_settings
from app.constants import MemberRole
from app.database import get_db
from app.services.activity_log import get_trigger_name, log_activity
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin(
    current_user: dict = Depends(get_current_user),  # noqa: B008
) -> dict:
    """Dependency that requires owner or admin role."""
    if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def _dir_size(path: str) -> int:
    """Calculate total size of a directory in bytes."""
    total = 0
    p = Path(path)
    if p.exists():
        for f in p.rglob("*"):
            if f.is_file():
                with contextlib.suppress(OSError):
                    total += f.stat().st_size
    return total


def _human_size(size_bytes: int) -> str:
    """Convert bytes to human-readable string."""
    size = float(size_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"


class UserUpdateRequest(BaseModel):
    is_active: bool | None = None


# --- Overview ---

@router.get("/overview")
async def get_admin_overview(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Dashboard overview with key metrics."""
    user_result = await db.execute(
        text("SELECT COUNT(*) FROM users WHERE is_active = true")
    )
    active_users = user_result.scalar() or 0

    note_result = await db.execute(text("SELECT COUNT(*) FROM notes"))
    total_notes = note_result.scalar() or 0

    embed_result = await db.execute(text("SELECT COUNT(*) FROM note_embeddings"))
    total_embeddings = embed_result.scalar() or 0

    org_result = await db.execute(text("SELECT COUNT(*) FROM organizations"))
    total_orgs = org_result.scalar() or 0

    return {
        "active_users": active_users,
        "total_notes": total_notes,
        "total_embeddings": total_embeddings,
        "total_organizations": total_orgs,
    }


# --- Database Stats ---

@router.get("/db/stats")
async def get_db_stats(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Database statistics: sizes, row counts, connections."""
    size_result = await db.execute(
        text("SELECT pg_size_pretty(pg_database_size(current_database()))")
    )
    database_size = size_result.scalar() or "unknown"

    size_bytes_result = await db.execute(
        text("SELECT pg_database_size(current_database())")
    )
    database_size_bytes = size_bytes_result.scalar() or 0

    conn_result = await db.execute(
        text("SELECT count(*) FROM pg_stat_activity WHERE state = 'active'")
    )
    active_connections = conn_result.scalar() or 0

    total_conn_result = await db.execute(
        text("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()")
    )
    total_connections = total_conn_result.scalar() or 0

    table_stats_result = await db.execute(
        text("""
            SELECT
                relname AS table_name,
                n_live_tup AS row_count,
                pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
                pg_total_relation_size(relid) AS total_size_bytes,
                pg_size_pretty(pg_relation_size(relid)) AS data_size,
                pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
            FROM pg_stat_user_tables
            ORDER BY pg_total_relation_size(relid) DESC
        """)
    )
    tables = [
        {
            "name": row.table_name,
            "row_count": row.row_count,
            "total_size": row.total_size,
            "total_size_bytes": row.total_size_bytes,
            "data_size": row.data_size,
            "index_size": row.index_size,
        }
        for row in table_stats_result.fetchall()
    ]

    return {
        "database_size": database_size,
        "database_size_bytes": database_size_bytes,
        "active_connections": active_connections,
        "total_connections": total_connections,
        "tables": tables,
    }


# --- Data Usage ---

@router.get("/data/usage")
async def get_data_usage(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Data usage breakdown by category."""
    settings = get_settings()

    notes_result = await db.execute(
        text("""
            SELECT
                COUNT(*) AS count,
                COALESCE(SUM(LENGTH(content_text)), 0) AS text_bytes,
                COALESCE(SUM(LENGTH(content_html)), 0) AS html_bytes
            FROM notes
        """)
    )
    notes_row = notes_result.fetchone()

    embed_result = await db.execute(
        text("""
            SELECT
                COUNT(*) AS count,
                COUNT(DISTINCT note_id) AS note_count
            FROM note_embeddings
        """)
    )
    embed_row = embed_result.fetchone()

    images_result = await db.execute(
        text("SELECT COUNT(*) AS count FROM note_images")
    )
    images_count = images_result.scalar() or 0

    notebooks_result = await db.execute(text("SELECT COUNT(*) FROM notebooks"))
    notebooks_count = notebooks_result.scalar() or 0

    images_dir_size = _dir_size(settings.NSX_IMAGES_PATH)
    exports_dir_size = _dir_size(settings.NSX_EXPORTS_PATH)
    uploads_dir_size = _dir_size(settings.UPLOADS_PATH)

    return {
        "notes": {
            "count": notes_row.count if notes_row else 0,
            "text_bytes": notes_row.text_bytes if notes_row else 0,
            "text_size": _human_size(notes_row.text_bytes if notes_row else 0),
            "html_bytes": notes_row.html_bytes if notes_row else 0,
            "html_size": _human_size(notes_row.html_bytes if notes_row else 0),
        },
        "notebooks": {"count": notebooks_count},
        "embeddings": {
            "count": embed_row.count if embed_row else 0,
            "indexed_notes": embed_row.note_count if embed_row else 0,
        },
        "images": {
            "count": images_count,
            "dir_size_bytes": images_dir_size,
            "dir_size": _human_size(images_dir_size),
        },
        "storage": {
            "images": {"bytes": images_dir_size, "human": _human_size(images_dir_size)},
            "exports": {"bytes": exports_dir_size, "human": _human_size(exports_dir_size)},
            "uploads": {"bytes": uploads_dir_size, "human": _human_size(uploads_dir_size)},
            "total_bytes": images_dir_size + exports_dir_size + uploads_dir_size,
            "total": _human_size(images_dir_size + exports_dir_size + uploads_dir_size),
        },
    }


# --- User Management ---

@router.get("/users")
async def list_users(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """List all users with membership details."""
    result = await db.execute(
        text("""
            SELECT
                u.id,
                u.email,
                u.name,
                u.is_active,
                u.email_verified,
                u.created_at,
                u.updated_at,
                m.role,
                m.org_id,
                m.accepted_at,
                o.name AS org_name
            FROM users u
            LEFT JOIN memberships m ON m.user_id = u.id
            LEFT JOIN organizations o ON o.id = m.org_id
            ORDER BY u.created_at DESC
        """)
    )
    users = [
        {
            "id": row.id,
            "email": row.email,
            "name": row.name,
            "is_active": row.is_active,
            "email_verified": row.email_verified,
            "role": row.role,
            "org_id": row.org_id,
            "org_name": row.org_name,
            "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in result.fetchall()
    ]
    return {"users": users, "total": len(users)}


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    body: UserUpdateRequest,
    admin: dict = Depends(require_admin),   # noqa: B008
    db: AsyncSession = Depends(get_db),     # noqa: B008
) -> dict:
    """Update user active status."""
    if user_id == admin["user_id"] and body.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    if body.is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    result = await db.execute(
        text(
            "UPDATE users SET is_active = :is_active, updated_at = NOW() "
            "WHERE id = :user_id RETURNING id"
        ),
        {"is_active": body.is_active, "user_id": user_id},
    )
    row = result.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    await db.commit()
    await log_activity(
        "admin", "completed",
        message=f"사용자 상태 변경: user_id={user_id}",
        details={"user_id": user_id, "is_active": body.is_active},
        triggered_by=get_trigger_name(admin),
    )
    return {"status": "ok", "user_id": user_id}


# --- NAS Status ---

@router.get("/nas/status")
async def get_nas_status(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """NAS connection status and configuration."""
    settings_map = await load_settings_from_db(db)

    nas_url = (settings_map.get("nas_url", "") or "").strip().strip('"')
    nas_user = (settings_map.get("nas_user", "") or "").strip()

    configured = bool(nas_url and nas_user)

    sync_result = await db.execute(
        text("SELECT MAX(synced_at) AS last_sync FROM notes WHERE synced_at IS NOT NULL")
    )
    last_sync_row = sync_result.fetchone()
    last_sync = (
        last_sync_row.last_sync.isoformat()
        if last_sync_row and last_sync_row.last_sync
        else None
    )

    synced_count = await db.execute(
        text("SELECT COUNT(*) FROM notes WHERE synced_at IS NOT NULL")
    )

    return {
        "configured": configured,
        "nas_url": nas_url if configured else None,
        "last_sync": last_sync,
        "synced_notes": synced_count.scalar() or 0,
    }


# --- LLM Providers ---

@router.get("/providers")
async def get_providers(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """LLM provider status and available models."""
    ai_router = get_ai_router()
    provider_names = ai_router.available_providers()

    providers = []
    for name in provider_names:
        try:
            provider = ai_router.get_provider(name)
            models = provider.available_models()
            providers.append({
                "name": name,
                "status": "active",
                "model_count": len(models),
                "models": [
                    {
                        "id": m.id,
                        "name": m.name,
                        "max_tokens": m.max_tokens,
                        "supports_streaming": m.supports_streaming,
                    }
                    for m in models
                ],
            })
        except Exception as e:
            providers.append({
                "name": name,
                "status": "error",
                "error": str(e),
                "model_count": 0,
                "models": [],
            })

    # Include OAuth-connected providers not already registered via API key
    from app.models import OAuthToken

    registered_names = {p["name"] for p in providers}
    for oauth_provider, oauth_models in _OAUTH_PROVIDER_MODELS.items():
        if oauth_provider in registered_names:
            continue
        stmt = select(OAuthToken).where(
            OAuthToken.provider == oauth_provider,
            OAuthToken.access_token_encrypted.isnot(None),
        )
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            providers.append({
                "name": oauth_provider,
                "status": "active",
                "source": "oauth",
                "model_count": len(oauth_models),
                "models": [
                    {
                        "id": m.id,
                        "name": m.name,
                        "max_tokens": m.max_tokens,
                        "supports_streaming": m.supports_streaming,
                    }
                    for m in oauth_models
                ],
            })

    key_result = await db.execute(
        text("SELECT key, value FROM settings WHERE key LIKE '%_api_key'")
    )
    api_keys = {}
    for row in key_result.fetchall():
        api_keys[row.key] = bool(row.value)

    return {
        "providers": providers,
        "api_keys": api_keys,
        "total_models": sum(p["model_count"] for p in providers),
    }
