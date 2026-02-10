# Admin Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an admin-only management dashboard for LabNote AI that provides DB monitoring, data usage analytics, user management, NAS status, and LLM provider management in a unified interface.

**Architecture:** New `/api/admin` backend router with `require_admin` dependency guard. Frontend adds `/admin` route with tabbed layout (Overview, Database, Users, NAS, Providers). Reuses existing auth system (owner/admin role check) and UI patterns (shadcn/ui, TanStack Query).

**Tech Stack:** FastAPI + SQLAlchemy async (raw SQL for pg_stat), React 19 + TanStack Query, TailwindCSS + shadcn/ui, lucide-react icons

---

## Phase 1: Backend Admin Infrastructure

### Task 1: Create admin dependency guard

**Files:**
- Create: `backend/app/api/admin.py`
- Test: `backend/tests/test_admin.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_admin.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
def admin_token(create_test_token):
    """Token with admin role."""
    return create_test_token(role="admin")


@pytest.fixture
def member_token(create_test_token):
    """Token with member role."""
    return create_test_token(role="member")


@pytest.mark.asyncio
async def test_admin_dashboard_requires_auth():
    """Unauthenticated request should return 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/admin/overview")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_dashboard_rejects_member(member_token):
    """Member role should be rejected with 403."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/admin/overview",
            headers={"Authorization": f"Bearer {member_token}"},
        )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_dashboard_allows_admin(admin_token):
    """Admin role should be allowed."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/admin/overview",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin.py -v`
Expected: FAIL - no `/api/admin/overview` endpoint exists

**Step 3: Create the admin router with guard dependency**

```python
# backend/app/api/admin.py
"""Admin-only management dashboard endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import MemberRole
from app.database import get_db
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


@router.get("/overview")
async def get_admin_overview(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Dashboard overview with key metrics."""
    # User counts
    user_result = await db.execute(
        text("SELECT COUNT(*) FROM users WHERE is_active = true")
    )
    active_users = user_result.scalar() or 0

    # Note counts
    note_result = await db.execute(text("SELECT COUNT(*) FROM notes"))
    total_notes = note_result.scalar() or 0

    # Embedding counts
    embed_result = await db.execute(text("SELECT COUNT(*) FROM note_embeddings"))
    total_embeddings = embed_result.scalar() or 0

    # Organization count
    org_result = await db.execute(text("SELECT COUNT(*) FROM organizations"))
    total_orgs = org_result.scalar() or 0

    return {
        "active_users": active_users,
        "total_notes": total_notes,
        "total_embeddings": total_embeddings,
        "total_organizations": total_orgs,
    }
```

**Step 4: Register the router in main.py**

Add to `backend/app/main.py` after other router includes:
```python
from app.api.admin import router as admin_router
app.include_router(admin_router, prefix="/api")
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_admin.py -v`
Expected: All 3 tests PASS

**Step 6: Commit**

```bash
git add backend/app/api/admin.py backend/tests/test_admin.py backend/app/main.py
git commit -m "feat(admin): add admin router with require_admin guard and overview endpoint"
```

---

## Phase 2: Database Monitoring API

### Task 2: Add DB stats endpoint

**Files:**
- Modify: `backend/app/api/admin.py`
- Modify: `backend/tests/test_admin.py`

**Step 1: Write the failing test**

Append to `backend/tests/test_admin.py`:
```python
@pytest.mark.asyncio
async def test_admin_db_stats(admin_token):
    """DB stats endpoint returns table info."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/admin/db/stats",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "database_size" in data
    assert "tables" in data
    assert "active_connections" in data
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin.py::test_admin_db_stats -v`
Expected: FAIL - 404 or attribute error

**Step 3: Implement DB stats endpoint**

Add to `backend/app/api/admin.py`:
```python
@router.get("/db/stats")
async def get_db_stats(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Database statistics: sizes, row counts, connections."""
    # Database total size
    size_result = await db.execute(
        text("SELECT pg_size_pretty(pg_database_size(current_database()))")
    )
    database_size = size_result.scalar() or "unknown"

    # Database size in bytes (for charts)
    size_bytes_result = await db.execute(
        text("SELECT pg_database_size(current_database())")
    )
    database_size_bytes = size_bytes_result.scalar() or 0

    # Active connections
    conn_result = await db.execute(
        text("SELECT count(*) FROM pg_stat_activity WHERE state = 'active'")
    )
    active_connections = conn_result.scalar() or 0

    # Total connections
    total_conn_result = await db.execute(
        text("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()")
    )
    total_connections = total_conn_result.scalar() or 0

    # Per-table stats
    table_stats_result = await db.execute(
        text("""
            SELECT
                schemaname,
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
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_admin.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/app/api/admin.py backend/tests/test_admin.py
git commit -m "feat(admin): add database monitoring stats endpoint"
```

---

## Phase 3: Data Usage & Storage API

### Task 3: Add data usage endpoint

**Files:**
- Modify: `backend/app/api/admin.py`
- Modify: `backend/tests/test_admin.py`

**Step 1: Write the failing test**

Append to `backend/tests/test_admin.py`:
```python
@pytest.mark.asyncio
async def test_admin_data_usage(admin_token):
    """Data usage endpoint returns storage breakdown."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/admin/data/usage",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "notes" in data
    assert "embeddings" in data
    assert "images" in data
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin.py::test_admin_data_usage -v`
Expected: FAIL

**Step 3: Implement data usage endpoint**

Add to `backend/app/api/admin.py`:
```python
import os
from pathlib import Path

from app.config import get_settings


def _dir_size(path: str) -> int:
    """Calculate total size of a directory in bytes."""
    total = 0
    p = Path(path)
    if p.exists():
        for f in p.rglob("*"):
            if f.is_file():
                total += f.stat().st_size
    return total


def _human_size(size_bytes: int) -> str:
    """Convert bytes to human-readable string."""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} PB"


@router.get("/data/usage")
async def get_data_usage(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Data usage breakdown by category."""
    settings = get_settings()

    # Notes stats
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

    # Embeddings stats
    embed_result = await db.execute(
        text("""
            SELECT
                COUNT(*) AS count,
                COUNT(DISTINCT note_id) AS note_count
            FROM note_embeddings
        """)
    )
    embed_row = embed_result.fetchone()

    # Images stats
    images_result = await db.execute(
        text("SELECT COUNT(*) AS count FROM note_images")
    )
    images_count = images_result.scalar() or 0

    # File system sizes
    images_dir_size = _dir_size(settings.NSX_IMAGES_PATH)
    exports_dir_size = _dir_size(settings.NSX_EXPORTS_PATH)
    uploads_dir_size = _dir_size(settings.UPLOADS_PATH)

    # Notebooks & notebooks
    notebooks_result = await db.execute(text("SELECT COUNT(*) FROM notebooks"))
    notebooks_count = notebooks_result.scalar() or 0

    return {
        "notes": {
            "count": notes_row.count if notes_row else 0,
            "text_bytes": notes_row.text_bytes if notes_row else 0,
            "text_size": _human_size(notes_row.text_bytes if notes_row else 0),
            "html_bytes": notes_row.html_bytes if notes_row else 0,
            "html_size": _human_size(notes_row.html_bytes if notes_row else 0),
        },
        "notebooks": {
            "count": notebooks_count,
        },
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
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_admin.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/app/api/admin.py backend/tests/test_admin.py
git commit -m "feat(admin): add data usage and storage analytics endpoint"
```

---

## Phase 4: User Management API

### Task 4: Add user listing and management endpoints

**Files:**
- Modify: `backend/app/api/admin.py`
- Modify: `backend/tests/test_admin.py`

**Step 1: Write the failing tests**

Append to `backend/tests/test_admin.py`:
```python
@pytest.mark.asyncio
async def test_admin_users_list(admin_token):
    """Users endpoint returns list of users with membership info."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "users" in data
    assert isinstance(data["users"], list)


@pytest.mark.asyncio
async def test_admin_users_rejects_member(member_token):
    """Member cannot access user management."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/admin/users",
            headers={"Authorization": f"Bearer {member_token}"},
        )
    assert resp.status_code == 403
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin.py::test_admin_users_list -v`
Expected: FAIL

**Step 3: Implement user management endpoints**

Add to `backend/app/api/admin.py`:
```python
from pydantic import BaseModel


class UserUpdateRequest(BaseModel):
    is_active: bool | None = None
    role: str | None = None


@router.get("/users")
async def list_users(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """List all users with membership details and note counts."""
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
                o.name AS org_name,
                (SELECT COUNT(*) FROM notes n
                 JOIN notebooks nb ON n.notebook_id = nb.id
                 WHERE nb.owner_id = u.id) AS note_count
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
            "note_count": row.note_count,
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
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Update user status (activate/deactivate)."""
    # Prevent self-deactivation
    if user_id == admin["user_id"] and body.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    updates = []
    params = {"user_id": user_id}

    if body.is_active is not None:
        updates.append("is_active = :is_active")
        params["is_active"] = body.is_active

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    query = f"UPDATE users SET {', '.join(updates)}, updated_at = NOW() WHERE id = :user_id RETURNING id"
    result = await db.execute(text(query), params)
    row = result.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    await db.commit()
    return {"status": "ok", "user_id": user_id}
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_admin.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/app/api/admin.py backend/tests/test_admin.py
git commit -m "feat(admin): add user listing and management endpoints"
```

---

## Phase 5: NAS & LLM Provider Status APIs

### Task 5: Add NAS status and provider management endpoints

**Files:**
- Modify: `backend/app/api/admin.py`
- Modify: `backend/tests/test_admin.py`

**Step 1: Write the failing tests**

Append to `backend/tests/test_admin.py`:
```python
@pytest.mark.asyncio
async def test_admin_nas_status(admin_token):
    """NAS status endpoint returns connection info."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/admin/nas/status",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "configured" in data


@pytest.mark.asyncio
async def test_admin_providers(admin_token):
    """Providers endpoint returns provider list."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/admin/providers",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "providers" in data
    assert isinstance(data["providers"], list)
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin.py::test_admin_nas_status tests/test_admin.py::test_admin_providers -v`
Expected: FAIL

**Step 3: Implement NAS status and provider endpoints**

Add to `backend/app/api/admin.py`:
```python
from app.ai_router.router import AIRouter


@router.get("/nas/status")
async def get_nas_status(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """NAS connection status and configuration."""
    # Read NAS settings from DB
    nas_keys = ["nas_url", "nas_user", "nas_password"]
    result = await db.execute(
        text("SELECT key, value FROM settings WHERE key = ANY(:keys)"),
        {"keys": nas_keys},
    )
    settings_map = {row.key: row.value for row in result.fetchall()}

    nas_url = settings_map.get("nas_url", "")
    # Unwrap JSONB string values
    if isinstance(nas_url, str):
        pass
    elif nas_url:
        nas_url = str(nas_url)
    else:
        nas_url = ""

    configured = bool(nas_url and settings_map.get("nas_user"))

    # Last sync time
    sync_result = await db.execute(
        text("""
            SELECT MAX(synced_at) AS last_sync
            FROM notes
            WHERE synced_at IS NOT NULL
        """)
    )
    last_sync_row = sync_result.fetchone()
    last_sync = last_sync_row.last_sync.isoformat() if last_sync_row and last_sync_row.last_sync else None

    return {
        "configured": configured,
        "nas_url": nas_url if configured else None,
        "last_sync": last_sync,
        "synced_notes": (await db.execute(text("SELECT COUNT(*) FROM notes WHERE synced_at IS NOT NULL"))).scalar() or 0,
    }


@router.get("/providers")
async def get_providers(
    admin: dict = Depends(require_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """LLM provider status and available models."""
    ai_router = AIRouter()
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

    # Check which API keys are configured (from DB settings)
    key_result = await db.execute(
        text("""
            SELECT key, value FROM settings
            WHERE key LIKE '%_api_key'
        """)
    )
    api_keys = {}
    for row in key_result.fetchall():
        val = row.value
        # JSONB strings come with quotes
        if isinstance(val, str) and val:
            api_keys[row.key] = True
        else:
            api_keys[row.key] = bool(val)

    return {
        "providers": providers,
        "api_keys": api_keys,
        "total_models": sum(p["model_count"] for p in providers),
    }
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_admin.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/app/api/admin.py backend/tests/test_admin.py
git commit -m "feat(admin): add NAS status and LLM provider management endpoints"
```

---

## Phase 6: Frontend Admin Page Shell

### Task 6: Create admin page with tab layout and route guard

**Files:**
- Create: `frontend/src/pages/Admin.tsx`
- Modify: `frontend/src/App.tsx` (add route)
- Modify: `frontend/src/components/Sidebar.tsx` (add nav item)

**Step 1: Create the Admin page component**

```tsx
// frontend/src/pages/Admin.tsx
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Navigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Database,
  Users,
  Server,
  Brain,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'overview', label: '개요', icon: LayoutDashboard },
  { id: 'database', label: '데이터베이스', icon: Database },
  { id: 'users', label: '사용자', icon: Users },
  { id: 'nas', label: 'NAS', icon: Server },
  { id: 'providers', label: 'LLM 프로바이더', icon: Brain },
] as const

type TabId = (typeof TABS)[number]['id']

export default function Admin() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  // Admin guard - redirect non-admin users
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">관리자 대시보드</h1>
        <p className="text-sm text-muted-foreground">
          시스템 모니터링 및 관리
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'database' && <DatabaseTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'nas' && <NasTab />}
        {activeTab === 'providers' && <ProvidersTab />}
      </div>
    </div>
  )
}

// Placeholder tabs - will be implemented in subsequent tasks
function OverviewTab() {
  return <div className="text-muted-foreground">Loading overview...</div>
}

function DatabaseTab() {
  return <div className="text-muted-foreground">Loading database stats...</div>
}

function UsersTab() {
  return <div className="text-muted-foreground">Loading users...</div>
}

function NasTab() {
  return <div className="text-muted-foreground">Loading NAS status...</div>
}

function ProvidersTab() {
  return <div className="text-muted-foreground">Loading providers...</div>
}
```

**Step 2: Add route to App.tsx**

In `frontend/src/App.tsx`, add lazy import:
```tsx
const Admin = lazy(() => import('./pages/Admin'))
```

Add route inside `ProtectedRoutes`:
```tsx
<Route path="/admin" element={<Admin />} />
```

**Step 3: Add sidebar navigation item**

In `frontend/src/components/Sidebar.tsx`, add to navigation items (conditionally for admin only):
```tsx
import { ShieldCheck } from 'lucide-react'

// In the navigation items array, add conditionally:
// After existing items, before the items are rendered:
const { user } = useAuth()
const isAdmin = user?.role === 'owner' || user?.role === 'admin'

// Add to nav items list:
...(isAdmin ? [{ to: '/admin', icon: ShieldCheck, label: '관리자' }] : []),
```

**Step 4: Verify manually**

Run: `cd frontend && npm run dev`
Navigate to `/admin` as admin user - should see tabbed layout.
Navigate to `/admin` as member user - should redirect to `/`.

**Step 5: Commit**

```bash
git add frontend/src/pages/Admin.tsx frontend/src/App.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat(admin): add admin page shell with tab navigation and route guard"
```

---

## Phase 7: Frontend Overview Tab

### Task 7: Implement overview tab with key metrics

**Files:**
- Modify: `frontend/src/pages/Admin.tsx`

**Step 1: Create useAdminOverview hook and OverviewTab**

Replace the placeholder `OverviewTab` in `Admin.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  FileText,
  HardDrive,
  Building2,
  Loader2,
} from 'lucide-react'

function OverviewTab() {
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => apiClient.get<{
      active_users: number
      total_notes: number
      total_embeddings: number
      total_organizations: number
    }>('/admin/overview'),
  })

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['admin', 'data-usage'],
    queryFn: () => apiClient.get<{
      notes: { count: number; text_size: string }
      notebooks: { count: number }
      embeddings: { count: number; indexed_notes: number }
      images: { count: number; dir_size: string }
      storage: { total: string; images: { human: string }; exports: { human: string }; uploads: { human: string } }
    }>('/admin/data/usage'),
  })

  if (overviewLoading || usageLoading) {
    return <LoadingSpinner />
  }

  const stats = [
    { label: '활성 사용자', value: overview?.active_users ?? 0, icon: Users },
    { label: '전체 노트', value: overview?.total_notes ?? 0, icon: FileText },
    { label: '임베딩 수', value: overview?.total_embeddings ?? 0, icon: Brain },
    { label: '조직 수', value: overview?.total_organizations ?? 0, icon: Building2 },
  ]

  return (
    <div className="space-y-6">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="p-4 border border-border rounded-lg bg-card"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Storage Breakdown */}
      {usage && (
        <div className="p-4 border border-border rounded-lg bg-card">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            스토리지 사용량
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StorageItem label="전체" value={usage.storage.total} />
            <StorageItem label="이미지" value={usage.storage.images.human} sub={`${usage.images.count}개 파일`} />
            <StorageItem label="내보내기" value={usage.storage.exports.human} />
            <StorageItem label="업로드" value={usage.storage.uploads.human} />
          </div>
        </div>
      )}

      {/* Data Summary */}
      {usage && (
        <div className="p-4 border border-border rounded-lg bg-card">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Database className="h-5 w-5" />
            데이터 요약
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">노트 텍스트</p>
              <p className="font-medium">{usage.notes.text_size}</p>
            </div>
            <div>
              <p className="text-muted-foreground">노트북</p>
              <p className="font-medium">{usage.notebooks.count}개</p>
            </div>
            <div>
              <p className="text-muted-foreground">인덱싱된 노트</p>
              <p className="font-medium">{usage.embeddings.indexed_notes} / {usage.notes.count}개</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StorageItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}
```

**Step 2: Verify manually**

Run: `cd frontend && npm run dev`
Navigate to `/admin` - overview tab should display metric cards and storage breakdown.

**Step 3: Commit**

```bash
git add frontend/src/pages/Admin.tsx
git commit -m "feat(admin): implement overview tab with metrics and storage usage"
```

---

## Phase 8: Frontend Database Tab

### Task 8: Implement database monitoring tab

**Files:**
- Modify: `frontend/src/pages/Admin.tsx`

**Step 1: Replace DatabaseTab placeholder**

```tsx
function DatabaseTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'db-stats'],
    queryFn: () => apiClient.get<{
      database_size: string
      database_size_bytes: number
      active_connections: number
      total_connections: number
      tables: Array<{
        name: string
        row_count: number
        total_size: string
        total_size_bytes: number
        data_size: string
        index_size: string
      }>
    }>('/admin/db/stats'),
    refetchInterval: 30000, // Refresh every 30s
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* DB Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">데이터베이스 크기</p>
          <p className="text-2xl font-bold">{data?.database_size}</p>
        </div>
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">활성 연결</p>
          <p className="text-2xl font-bold">{data?.active_connections}</p>
        </div>
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">전체 연결</p>
          <p className="text-2xl font-bold">{data?.total_connections}</p>
        </div>
      </div>

      {/* Table Stats */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-muted/50 border-b border-border">
          <h3 className="font-semibold">테이블별 통계</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-medium">테이블</th>
                <th className="text-right px-4 py-2 font-medium">행 수</th>
                <th className="text-right px-4 py-2 font-medium">전체 크기</th>
                <th className="text-right px-4 py-2 font-medium">데이터</th>
                <th className="text-right px-4 py-2 font-medium">인덱스</th>
              </tr>
            </thead>
            <tbody>
              {data?.tables.map((table) => (
                <tr key={table.name} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono text-xs">{table.name}</td>
                  <td className="px-4 py-2 text-right">{table.row_count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">{table.total_size}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{table.data_size}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{table.index_size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Verify manually**

Run: `cd frontend && npm run dev`
Click "데이터베이스" tab - should show DB size, connections, and table stats.

**Step 3: Commit**

```bash
git add frontend/src/pages/Admin.tsx
git commit -m "feat(admin): implement database monitoring tab with table stats"
```

---

## Phase 9: Frontend Users Tab

### Task 9: Implement user management tab

**Files:**
- Modify: `frontend/src/pages/Admin.tsx`

**Step 1: Replace UsersTab placeholder**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Crown,
  Shield,
  Eye,
  UserCheck,
  UserX,
  Loader2,
} from 'lucide-react'

const ROLE_CONFIG: Record<string, { icon: typeof Crown; color: string; label: string }> = {
  owner: { icon: Crown, color: 'bg-amber-100 text-amber-700', label: 'Owner' },
  admin: { icon: Shield, color: 'bg-blue-100 text-blue-700', label: 'Admin' },
  member: { icon: Users, color: 'bg-green-100 text-green-700', label: 'Member' },
  viewer: { icon: Eye, color: 'bg-gray-100 text-gray-700', label: 'Viewer' },
}

interface AdminUser {
  id: number
  email: string
  name: string
  is_active: boolean
  email_verified: boolean
  role: string
  org_name: string | null
  note_count: number
  created_at: string | null
  accepted_at: string | null
}

function UsersTab() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiClient.get<{ users: AdminUser[]; total: number }>('/admin/users'),
  })

  const toggleActive = useMutation({
    mutationFn: ({ userId, isActive }: { userId: number; isActive: boolean }) =>
      apiClient.put(`/admin/users/${userId}`, { is_active: isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          전체 {data?.total ?? 0}명의 사용자
        </p>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-medium">사용자</th>
                <th className="text-left px-4 py-2 font-medium">역할</th>
                <th className="text-left px-4 py-2 font-medium">조직</th>
                <th className="text-right px-4 py-2 font-medium">노트 수</th>
                <th className="text-left px-4 py-2 font-medium">상태</th>
                <th className="text-left px-4 py-2 font-medium">가입일</th>
                <th className="text-right px-4 py-2 font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => {
                const roleInfo = ROLE_CONFIG[u.role] || ROLE_CONFIG.member
                const RoleIcon = roleInfo.icon
                return (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{u.name || '(이름 없음)'}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                        roleInfo.color,
                      )}>
                        <RoleIcon className="h-3 w-3" />
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.org_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">{u.note_count}</td>
                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <UserCheck className="h-3 w-3" /> 활성
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <UserX className="h-3 w-3" /> 비활성
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('ko-KR') : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.role !== 'owner' && (
                        <button
                          onClick={() => toggleActive.mutate({ userId: u.id, isActive: !u.is_active })}
                          disabled={toggleActive.isPending}
                          className={cn(
                            'px-3 py-1 rounded text-xs font-medium transition-colors',
                            u.is_active
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-green-50 text-green-600 hover:bg-green-100'
                          )}
                        >
                          {toggleActive.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : u.is_active ? '비활성화' : '활성화'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Verify manually**

Run: `cd frontend && npm run dev`
Click "사용자" tab - should show user table with role badges, status, and activate/deactivate buttons.

**Step 3: Commit**

```bash
git add frontend/src/pages/Admin.tsx
git commit -m "feat(admin): implement user management tab with activate/deactivate"
```

---

## Phase 10: Frontend NAS & Providers Tabs

### Task 10: Implement NAS status and LLM provider tabs

**Files:**
- Modify: `frontend/src/pages/Admin.tsx`

**Step 1: Replace NasTab placeholder**

```tsx
import {
  CheckCircle2,
  XCircle,
  Clock,
  Wifi,
  WifiOff,
} from 'lucide-react'

function NasTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'nas-status'],
    queryFn: () => apiClient.get<{
      configured: boolean
      nas_url: string | null
      last_sync: string | null
      synced_notes: number
    }>('/admin/nas/status'),
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="p-6 border border-border rounded-lg bg-card">
        <div className="flex items-center gap-4 mb-6">
          {data?.configured ? (
            <div className="p-3 rounded-full bg-green-100">
              <Wifi className="h-6 w-6 text-green-600" />
            </div>
          ) : (
            <div className="p-3 rounded-full bg-red-100">
              <WifiOff className="h-6 w-6 text-red-600" />
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold">
              {data?.configured ? 'NAS 연결됨' : 'NAS 미설정'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {data?.nas_url || '설정 페이지에서 NAS를 설정하세요'}
            </p>
          </div>
        </div>

        {data?.configured && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border">
            <div>
              <p className="text-sm text-muted-foreground">NAS URL</p>
              <p className="font-medium font-mono text-sm">{data.nas_url}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">동기화된 노트</p>
              <p className="font-medium">{data.synced_notes.toLocaleString()}개</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">마지막 동기화</p>
              <p className="font-medium">
                {data.last_sync
                  ? new Date(data.last_sync).toLocaleString('ko-KR')
                  : '없음'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Replace ProvidersTab placeholder**

```tsx
function ProvidersTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'providers'],
    queryFn: () => apiClient.get<{
      providers: Array<{
        name: string
        status: string
        model_count: number
        error?: string
        models: Array<{
          id: string
          name: string
          max_tokens: number
          supports_streaming: boolean
        }>
      }>
      api_keys: Record<string, boolean>
      total_models: number
    }>('/admin/providers'),
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">활성 프로바이더</p>
          <p className="text-2xl font-bold">{data?.providers.length ?? 0}</p>
        </div>
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">사용 가능 모델</p>
          <p className="text-2xl font-bold">{data?.total_models ?? 0}</p>
        </div>
      </div>

      {/* Provider Cards */}
      <div className="space-y-4">
        {data?.providers.map((provider) => (
          <div key={provider.name} className="border border-border rounded-lg bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold capitalize">{provider.name}</h3>
                {provider.status === 'active' ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> 활성
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-red-600">
                    <XCircle className="h-3 w-3" /> 오류
                  </span>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {provider.model_count}개 모델
              </span>
            </div>

            {provider.error && (
              <div className="px-4 py-2 bg-red-50 text-red-600 text-sm">
                {provider.error}
              </div>
            )}

            {provider.models.length > 0 && (
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {provider.models.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/30 text-sm"
                    >
                      <span className="font-mono text-xs">{model.id}</span>
                      <span className="text-xs text-muted-foreground">
                        {(model.max_tokens / 1000).toFixed(0)}K
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {data?.providers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>등록된 LLM 프로바이더가 없습니다.</p>
            <p className="text-sm">설정 페이지에서 API 키를 추가하세요.</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 3: Verify manually**

Run: `cd frontend && npm run dev`
- Click "NAS" tab - should show connection status card
- Click "LLM 프로바이더" tab - should show provider cards with model lists

**Step 4: Commit**

```bash
git add frontend/src/pages/Admin.tsx
git commit -m "feat(admin): implement NAS status and LLM provider tabs"
```

---

## Phase 11: Final Polish & Integration Test

### Task 11: Run full test suite and lint

**Step 1: Run backend tests**

Run: `cd backend && pytest tests/test_admin.py -v`
Expected: All tests PASS

**Step 2: Run backend lint**

Run: `cd backend && ruff check . && ruff format .`
Expected: No errors

**Step 3: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 4: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

**Step 5: Final commit (if any lint fixes)**

```bash
git add -A
git commit -m "chore(admin): lint fixes and final polish"
```

---

## Summary of Deliverables

| Phase | Backend | Frontend | Description |
|-------|---------|----------|-------------|
| 1 | `admin.py` router + `require_admin` + `/overview` | - | Admin guard & overview API |
| 2 | `/db/stats` endpoint | - | DB monitoring (sizes, connections, tables) |
| 3 | `/data/usage` endpoint | - | Storage analytics (notes, images, files) |
| 4 | `/users` + `/users/{id}` endpoints | - | User listing & management |
| 5 | `/nas/status` + `/providers` endpoints | - | NAS & LLM provider status |
| 6 | - | `Admin.tsx` page + route + sidebar | Tab layout shell with admin guard |
| 7 | - | OverviewTab component | Key metrics cards & storage breakdown |
| 8 | - | DatabaseTab component | DB size, connections, table stats table |
| 9 | - | UsersTab component | User table with activate/deactivate |
| 10 | - | NasTab + ProvidersTab components | NAS status card & provider cards |
| 11 | Tests + lint | Lint + type check | Final verification |

**New Files:**
- `backend/app/api/admin.py` (~200 lines)
- `backend/tests/test_admin.py` (~80 lines)
- `frontend/src/pages/Admin.tsx` (~500 lines)

**Modified Files:**
- `backend/app/main.py` (+2 lines: import + include_router)
- `frontend/src/App.tsx` (+2 lines: lazy import + route)
- `frontend/src/components/Sidebar.tsx` (+3 lines: admin nav item)
