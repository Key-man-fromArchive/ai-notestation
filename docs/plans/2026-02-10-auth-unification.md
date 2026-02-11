# Auth System Unification & DB Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify the dual authentication system (NAS login + Member login) into a single member-based auth flow, make NAS connection an admin-only setting, and fix all database foreign key inconsistencies.

**Architecture:** Member-based auth (email/password with organizations) becomes the sole login mechanism. NAS credentials move to Settings (admin-only). `get_current_user` dependency is updated to decode member tokens while maintaining backward-compatible return format (`username` = email). All missing database FK constraints are added via Alembic migration.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Alembic, React 19, TanStack Query, shadcn/ui

---

## Current State Analysis

### Two Parallel Auth Systems

| Aspect | NAS Auth (`/api/auth/*`) | Member Auth (`/api/members/*`) |
|--------|--------------------------|-------------------------------|
| Login endpoint | `POST /auth/login` | `POST /members/login` |
| Token claims | `{sub: "admin"}` | `{sub, user_id, org_id, role}` |
| Refresh | `POST /auth/token/refresh` | `POST /members/refresh` |
| User info | `GET /auth/me` → `{username}` | Decoded from token |
| Frontend hook | `useAuth()` (AuthContext) | `useMemberAuth()` |
| Frontend page | `/nas-login` (Login.tsx) | `/member-login` (MemberLogin.tsx) |
| Selection page | `/login` → LoginSelect.tsx | - |

### DB Foreign Key Issues Found

| Column | Should Reference | Status |
|--------|-----------------|--------|
| `memberships.user_id` | `users.id` | Missing FK |
| `memberships.org_id` | `organizations.id` | Missing FK |
| `memberships.invited_by` | `users.id` | Missing FK |
| `note_access.note_id` | `notes.id` | Missing FK |
| `note_access.user_id` | `users.id` | Missing FK |
| `note_access.org_id` | `organizations.id` | Missing FK |
| `note_access.granted_by` | `users.id` | Missing FK |
| `notes.notebook_id` | `notebooks.id` | Missing FK |
| `note_embeddings.note_id` | `notes.id` | Missing FK |
| `note_attachments.note_id` | `notes.id` | Missing FK |
| `share_links.notebook_id` | `notebooks.id` | Missing FK |
| `share_links.note_id` | `notes.id` | Missing FK |
| `share_links.created_by` | `users.id` | Missing FK |
| `clustering_tasks.created_by` | `users.id` | Missing FK |
| `clustering_tasks.notebook_id` | `notebooks.id` | Missing FK |
| `note_clusters.notebook_id` | `notebooks.id` | Missing FK |

Note: `notebook_access` already has proper FKs from migration 009.

---

## Phase 1: Database FK Migration

### Task 1: Create Alembic migration for missing foreign keys

**Files:**
- Create: `backend/alembic/versions/012_add_missing_foreign_keys.py`
- Modify: `backend/app/models.py`

**Step 1: Create migration file**

```python
"""Add missing foreign key constraints.

Revision ID: 012_add_missing_fks
Revises: 011_add_note_images
Create Date: 2026-02-10
"""

from alembic import op

revision = "012_add_missing_fks"
down_revision = "011_add_note_images"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- memberships ---
    op.create_foreign_key(
        "fk_memberships_user_id", "memberships", "users",
        ["user_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_memberships_org_id", "memberships", "organizations",
        ["org_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_memberships_invited_by", "memberships", "users",
        ["invited_by"], ["id"], ondelete="SET NULL",
    )

    # --- note_access ---
    op.create_foreign_key(
        "fk_note_access_note_id", "note_access", "notes",
        ["note_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_note_access_user_id", "note_access", "users",
        ["user_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_note_access_org_id", "note_access", "organizations",
        ["org_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_note_access_granted_by", "note_access", "users",
        ["granted_by"], ["id"], ondelete="SET NULL",
    )

    # --- notes.notebook_id ---
    op.create_foreign_key(
        "fk_notes_notebook_id", "notes", "notebooks",
        ["notebook_id"], ["id"], ondelete="SET NULL",
    )

    # --- note_embeddings.note_id ---
    op.create_foreign_key(
        "fk_note_embeddings_note_id", "note_embeddings", "notes",
        ["note_id"], ["id"], ondelete="CASCADE",
    )

    # --- note_attachments.note_id ---
    op.create_foreign_key(
        "fk_note_attachments_note_id", "note_attachments", "notes",
        ["note_id"], ["id"], ondelete="CASCADE",
    )

    # --- share_links ---
    op.create_foreign_key(
        "fk_share_links_notebook_id", "share_links", "notebooks",
        ["notebook_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_share_links_note_id", "share_links", "notes",
        ["note_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_share_links_created_by", "share_links", "users",
        ["created_by"], ["id"], ondelete="CASCADE",
    )

    # --- clustering_tasks ---
    op.create_foreign_key(
        "fk_clustering_tasks_created_by", "clustering_tasks", "users",
        ["created_by"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_clustering_tasks_notebook_id", "clustering_tasks", "notebooks",
        ["notebook_id"], ["id"], ondelete="CASCADE",
    )

    # --- note_clusters.notebook_id ---
    op.create_foreign_key(
        "fk_note_clusters_notebook_id", "note_clusters", "notebooks",
        ["notebook_id"], ["id"], ondelete="CASCADE",
    )


def downgrade() -> None:
    # --- note_clusters ---
    op.drop_constraint("fk_note_clusters_notebook_id", "note_clusters", type_="foreignkey")

    # --- clustering_tasks ---
    op.drop_constraint("fk_clustering_tasks_notebook_id", "clustering_tasks", type_="foreignkey")
    op.drop_constraint("fk_clustering_tasks_created_by", "clustering_tasks", type_="foreignkey")

    # --- share_links ---
    op.drop_constraint("fk_share_links_created_by", "share_links", type_="foreignkey")
    op.drop_constraint("fk_share_links_note_id", "share_links", type_="foreignkey")
    op.drop_constraint("fk_share_links_notebook_id", "share_links", type_="foreignkey")

    # --- note_attachments ---
    op.drop_constraint("fk_note_attachments_note_id", "note_attachments", type_="foreignkey")

    # --- note_embeddings ---
    op.drop_constraint("fk_note_embeddings_note_id", "note_embeddings", type_="foreignkey")

    # --- notes ---
    op.drop_constraint("fk_notes_notebook_id", "notes", type_="foreignkey")

    # --- note_access ---
    op.drop_constraint("fk_note_access_granted_by", "note_access", type_="foreignkey")
    op.drop_constraint("fk_note_access_org_id", "note_access", type_="foreignkey")
    op.drop_constraint("fk_note_access_user_id", "note_access", type_="foreignkey")
    op.drop_constraint("fk_note_access_note_id", "note_access", type_="foreignkey")

    # --- memberships ---
    op.drop_constraint("fk_memberships_invited_by", "memberships", type_="foreignkey")
    op.drop_constraint("fk_memberships_org_id", "memberships", type_="foreignkey")
    op.drop_constraint("fk_memberships_user_id", "memberships", type_="foreignkey")
```

**Step 2: Update ORM models to declare ForeignKey**

In `backend/app/models.py`, add `ForeignKey` import and update columns:

```python
from sqlalchemy import ..., ForeignKey, ...

# Note model
notebook_id: Mapped[int | None] = mapped_column(
    Integer, ForeignKey("notebooks.id", ondelete="SET NULL"), nullable=True, index=True
)

# NoteEmbedding model
note_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("notes.id", ondelete="CASCADE"), index=True
)

# NoteAttachment model
note_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("notes.id", ondelete="CASCADE"), index=True
)

# Membership model
user_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
)
org_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("organizations.id", ondelete="CASCADE"), index=True
)
invited_by: Mapped[int | None] = mapped_column(
    Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
)

# NoteAccess model
note_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("notes.id", ondelete="CASCADE"), index=True
)
user_id: Mapped[int | None] = mapped_column(
    Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
)
org_id: Mapped[int | None] = mapped_column(
    Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True
)
granted_by: Mapped[int] = mapped_column(
    Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False
)

# NotebookAccess model - already has FKs from migration 009
# Add ForeignKey declarations to ORM to match:
notebook_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("notebooks.id", ondelete="CASCADE"), index=True, nullable=False
)
user_id: Mapped[int | None] = mapped_column(
    Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
)
org_id: Mapped[int | None] = mapped_column(
    Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True
)
granted_by: Mapped[int] = mapped_column(
    Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False
)

# ShareLink model
notebook_id: Mapped[int | None] = mapped_column(
    Integer, ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=True
)
note_id: Mapped[int | None] = mapped_column(
    Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=True
)
created_by: Mapped[int] = mapped_column(
    Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
)

# ClusteringTask model
notebook_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False, index=True
)
created_by: Mapped[int] = mapped_column(
    Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
)

# NoteCluster model
notebook_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False, index=True
)
```

**Step 3: Handle note_access.granted_by nullable change**

The `note_access.granted_by` FK uses `ondelete="SET NULL"` but the column is `nullable=False`. We need to make it nullable in both ORM and migration:

Add to migration:
```python
# Make granted_by nullable for SET NULL to work
op.alter_column("note_access", "granted_by", nullable=True)
```

And in models.py:
```python
granted_by: Mapped[int | None] = mapped_column(
    Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
)
```

**Step 4: Run migration**

Run: `cd /mnt/docker/labnote-ai/backend && alembic upgrade head`
Expected: Migration applies successfully, all FK constraints created.

**Step 5: Verify migration**

Run: `cd /mnt/docker/labnote-ai/backend && python -c "from app.database import engine; import asyncio; asyncio.run(engine.dispose())"`
Expected: No import errors.

**Step 6: Run existing tests**

Run: `cd /mnt/docker/labnote-ai/backend && pytest --tb=short -q 2>&1 | tail -20`
Expected: All existing tests still pass.

**Step 7: Commit**

```bash
git add backend/alembic/versions/012_add_missing_foreign_keys.py backend/app/models.py
git commit -m "fix(db): add missing foreign key constraints across all tables"
```

---

## Phase 2: Backend Auth Unification

### Task 2: Update `get_current_user` to support member tokens

The core change: `get_current_user` currently returns `{"username": "admin"}` from NAS tokens. After unification, ALL tokens are member tokens with `{sub, user_id, org_id, role}`. We update `get_current_user` to decode these claims while keeping `username` key for backward compatibility.

**Files:**
- Modify: `backend/app/services/auth_service.py:107-142`

**Step 1: Update `get_current_user` in auth_service.py**

Replace the `get_current_user` function:

```python
async def get_current_user(
    token: str = Depends(oauth2_scheme),
) -> dict:
    """FastAPI dependency that extracts the current user from a Bearer token.

    Returns a dict with user context from member JWT:
    - username: email (backward compat)
    - email: user email
    - user_id: int
    - org_id: int
    - role: member role string
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = verify_token(token)
    except JWTError:
        raise credentials_exception from None

    if payload.get("type") != "access":
        raise credentials_exception

    username: str | None = payload.get("sub")
    if username is None:
        raise credentials_exception

    user_id = payload.get("user_id")
    org_id = payload.get("org_id")
    role = payload.get("role")

    if user_id is None or org_id is None:
        raise credentials_exception

    return {
        "username": username,
        "email": username,
        "user_id": user_id,
        "org_id": org_id,
        "role": role or "member",
    }
```

**Step 2: Run tests to check impact**

Run: `cd /mnt/docker/labnote-ai/backend && pytest --tb=short -q 2>&1 | tail -30`
Expected: Some tests may fail if they create NAS-style tokens (sub-only). Note failures for Task 3.

**Step 3: Commit**

```bash
git add backend/app/services/auth_service.py
git commit -m "refactor(auth): update get_current_user to decode member JWT claims"
```

---

### Task 3: Update auth API endpoints

Convert `/api/auth/login` from NAS authentication to NAS connection test.
Update `/api/auth/me` to return full user info.
Update `/api/auth/token/refresh` to handle member tokens.

**Files:**
- Modify: `backend/app/api/auth.py`

**Step 1: Rewrite auth.py**

```python
"""Authentication API endpoints.

After unification:
- POST /auth/login       -- Member login (email/password), returns JWT pair
- POST /auth/token/refresh -- Exchange refresh token for new access token
- GET  /auth/me          -- Return current user info (requires auth)
- POST /auth/nas/test    -- Test NAS connection (admin only)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import MemberRole
from app.database import get_db
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    verify_token,
)
from app.services.user_service import (
    get_membership,
    get_user_by_email,
    get_user_by_id,
    get_user_memberships,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    name: str
    org_id: int
    org_slug: str
    role: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    user_id: int
    email: str
    name: str
    org_id: int
    org_slug: str
    role: str


class NasTestRequest(BaseModel):
    username: str
    password: str
    otp_code: str | None = None


class NasTestResponse(BaseModel):
    success: bool
    message: str
    requires_2fa: bool = False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Authenticate user with email/password. Returns JWT with org context."""
    user = await get_user_by_email(db, request.email)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(request.password, user.password_hash):
        logger.warning("Login failed for email=%s", request.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    memberships = await get_user_memberships(db, user.id)
    accepted = [m for m in memberships if m.accepted_at]

    if not accepted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active organization membership",
        )

    membership = accepted[0]
    from sqlalchemy import select
    from app.models import Organization

    org_result = await db.execute(
        select(Organization).where(Organization.id == membership.org_id)
    )
    org = org_result.scalar_one()

    token_data = {
        "sub": user.email,
        "user_id": user.id,
        "org_id": org.id,
        "role": membership.role,
    }
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)

    logger.info("User logged in: email=%s, org=%s", user.email, org.slug)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        email=user.email,
        name=user.name,
        org_id=org.id,
        org_slug=org.slug,
        role=membership.role,
    )


@router.post("/token/refresh", response_model=AccessTokenResponse)
async def refresh_token(
    request: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> AccessTokenResponse:
    """Exchange a valid refresh token for a new access token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = verify_token(request.refresh_token)
    except Exception:
        raise credentials_exception from None

    if payload.get("type") != "refresh":
        raise credentials_exception

    user_id = payload.get("user_id")
    org_id = payload.get("org_id")
    if user_id is None or org_id is None:
        raise credentials_exception

    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise credentials_exception

    membership = await get_membership(db, user_id, org_id)
    if not membership or not membership.accepted_at:
        raise credentials_exception

    token_data = {
        "sub": user.email,
        "user_id": user.id,
        "org_id": org_id,
        "role": membership.role,
    }
    new_access = create_access_token(data=token_data)
    return AccessTokenResponse(access_token=new_access)


@router.get("/me", response_model=UserResponse)
async def me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Return full user info for the authenticated user."""
    user = await get_user_by_id(db, current_user["user_id"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    from sqlalchemy import select
    from app.models import Organization

    org_result = await db.execute(
        select(Organization).where(Organization.id == current_user["org_id"])
    )
    org = org_result.scalar_one_or_none()

    return UserResponse(
        user_id=user.id,
        email=user.email,
        name=user.name,
        org_id=current_user["org_id"],
        org_slug=org.slug if org else "",
        role=current_user["role"],
    )


@router.post("/nas/test", response_model=NasTestResponse)
async def test_nas_connection(
    request: NasTestRequest,
    current_user: dict = Depends(get_current_user),
) -> NasTestResponse:
    """Test NAS connection with given credentials. Admin/Owner only."""
    if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can manage NAS connection",
        )

    from app.api.settings import get_nas_config
    from app.synology_gateway.client import (
        Synology2FARequired,
        SynologyAuthError,
        SynologyClient,
    )

    nas = get_nas_config()
    client = SynologyClient(
        url=nas["url"],
        user=request.username,
        password=request.password,
    )

    try:
        await client.login(otp_code=request.otp_code)
        await client.close()
        return NasTestResponse(success=True, message="NAS connection successful")
    except Synology2FARequired:
        await client.close()
        return NasTestResponse(
            success=False,
            message="2FA required",
            requires_2fa=True,
        )
    except SynologyAuthError as e:
        await client.close()
        msg = "Invalid credentials"
        if e.code == 404:
            msg = "Invalid OTP code"
        return NasTestResponse(success=False, message=msg)
    except Exception as e:
        await client.close()
        return NasTestResponse(success=False, message=str(e))
```

**Step 2: Run tests**

Run: `cd /mnt/docker/labnote-ai/backend && pytest tests/ --tb=short -q 2>&1 | tail -30`
Expected: Note which auth-related tests fail (they'll need updating in Task 5).

**Step 3: Commit**

```bash
git add backend/app/api/auth.py
git commit -m "refactor(auth): unify login to member-based, add NAS test endpoint"
```

---

### Task 4: Clean up members.py - remove duplicate endpoints and fix dependencies

After Task 3, `/api/auth/login` handles member login. The `/api/members/login` and `/api/members/refresh` endpoints are now redundant. Keep members.py for org management only (signup, invite, accept, list, role update). Also fix the manual Authorization header parsing to use proper FastAPI `Depends`.

**Files:**
- Modify: `backend/app/api/members.py`

**Step 1: Remove redundant endpoints from members.py**

Remove `login()` and `refresh()` endpoints since auth.py now handles them.

Keep these endpoints:
- `POST /members/signup` - still needed for new user registration
- `POST /members/invite` - org management
- `POST /members/accept` - accept invite
- `GET /members` - list members
- `PUT /members/{id}/role` - change roles

**Step 2: Fix dependency injection in remaining endpoints**

Replace manual `authorization: str | None = None` + header parsing pattern with proper FastAPI `Depends(get_current_user)` from auth_service:

```python
# BEFORE (3 endpoints have this pattern):
async def invite_member(
    request: InviteRequest,
    authorization: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise ...
    token = authorization.split(" ", 1)[1]
    current_member = await get_current_member(token, db)

# AFTER:
from app.services.auth_service import get_current_user

async def invite_member(
    request: InviteRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # current_user already has user_id, org_id, role, email
```

Apply this to `invite_member`, `list_members`, and `update_member_role`.

**Step 3: Remove the local `get_current_member` function** (lines 199-239) since we now use the unified `get_current_user`.

**Step 4: Remove `LoginRequest`, `RefreshRequest`, `RefreshResponse` schemas** that are no longer used.

**Step 5: Update TokenResponse import** - members.py signup still returns tokens, keep that TokenResponse.

**Step 6: Run tests**

Run: `cd /mnt/docker/labnote-ai/backend && pytest --tb=short -q 2>&1 | tail -30`

**Step 7: Commit**

```bash
git add backend/app/api/members.py
git commit -m "refactor(members): remove duplicate auth endpoints, use unified get_current_user"
```

---

### Task 5: Fix sharing.py to use unified auth

**Files:**
- Modify: `backend/app/api/sharing.py`

**Step 1: Replace local `get_current_member` with `get_current_user`**

The sharing.py file (lines 60-90) defines its own `get_current_member` function. Replace all usages with `Depends(get_current_user)` from auth_service.

Find all endpoints in sharing.py that manually parse Authorization header and update them to use `current_user: dict = Depends(get_current_user)`.

**Step 2: Run tests**

Run: `cd /mnt/docker/labnote-ai/backend && pytest --tb=short -q 2>&1 | tail -30`

**Step 3: Commit**

```bash
git add backend/app/api/sharing.py
git commit -m "refactor(sharing): use unified get_current_user dependency"
```

---

### Task 6: Update test fixtures for unified auth tokens

**Files:**
- Modify: Test files that create NAS-style tokens (sub-only)

**Step 1: Find all test token creation**

Search for tests that create tokens with only `{"sub": "admin"}` or similar NAS-style tokens:

Run: `cd /mnt/docker/labnote-ai/backend && grep -rn '"sub"' tests/ | head -30`

**Step 2: Update test helper to create member-style tokens**

All test tokens should now include `user_id`, `org_id`, `role` claims:

```python
# Test helper - create unified token
def create_test_token(
    email: str = "test@example.com",
    user_id: int = 1,
    org_id: int = 1,
    role: str = "owner",
) -> str:
    return create_access_token(data={
        "sub": email,
        "user_id": user_id,
        "org_id": org_id,
        "role": role,
    })
```

**Step 3: Update all test files that use the old token format**

**Step 4: Run full test suite**

Run: `cd /mnt/docker/labnote-ai/backend && pytest --tb=short -v 2>&1 | tail -50`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add backend/tests/
git commit -m "test(auth): update all test fixtures to use unified member tokens"
```

---

## Phase 3: Frontend Auth Unification

### Task 7: Merge useMemberAuth into AuthContext

The two auth mechanisms need to become one. AuthContext will be the single source of truth, using member-based login flow.

**Files:**
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Delete: `frontend/src/hooks/useMemberAuth.ts`

**Step 1: Rewrite AuthContext.tsx**

The unified AuthContext should:
- Login via `POST /api/auth/login` (the new unified endpoint)
- Store `access_token`, `refresh_token` in localStorage
- Store user info (user_id, email, name, org_id, org_slug, role) in state
- Refresh via `POST /api/auth/token/refresh`
- Restore session via `GET /api/auth/me`
- Expose `user`, `isAuthenticated`, `isLoading`, `login`, `logout`, `signup`

```typescript
interface User {
  user_id: number
  email: string
  name: string
  org_id: number
  org_slug: string
  role: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (data: SignupRequest) => Promise<void>
  logout: () => void
}
```

Key changes from current AuthContext:
- Remove NAS login (username/password/otp)
- Remove 2FA handling from login (2FA is now only in NAS settings test)
- Remove `member_user` localStorage - user info comes from token response
- Use `POST /api/auth/login` instead of `POST /api/auth/login` (NAS) or `POST /api/members/login`
- Session restore: call `GET /api/auth/me` which now returns full user info

**Step 2: Update all imports of useMemberAuth**

Search and replace `useMemberAuth` imports to use `useAuth` from AuthContext:

Files to update:
- `frontend/src/pages/MemberLogin.tsx` (will be deleted in Task 8)
- `frontend/src/pages/Members.tsx`
- `frontend/src/pages/Signup.tsx` (will use AuthContext.signup)
- Any other component importing useMemberAuth

**Step 3: Delete useMemberAuth.ts**

Remove `frontend/src/hooks/useMemberAuth.ts`.

**Step 4: Run frontend tests**

Run: `cd /mnt/docker/labnote-ai/frontend && npm test 2>&1 | tail -20`

**Step 5: Commit**

```bash
git add frontend/src/contexts/AuthContext.tsx
git rm frontend/src/hooks/useMemberAuth.ts
git add frontend/src/pages/Members.tsx frontend/src/pages/Signup.tsx
git commit -m "refactor(frontend): unify auth into single AuthContext, remove useMemberAuth"
```

---

### Task 8: Create single login page, remove LoginSelect and NAS login

**Files:**
- Modify: `frontend/src/pages/Login.tsx` - becomes the single login page (email/password)
- Delete: `frontend/src/pages/LoginSelect.tsx`
- Delete: `frontend/src/pages/MemberLogin.tsx`
- Modify: `frontend/src/App.tsx` - update routes

**Step 1: Rewrite Login.tsx as unified login page**

Simple email/password form using `useAuth().login()`:

```tsx
export default function Login() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    // shadcn Card with email + password fields
    // Link to /signup for new users
  )
}
```

**Step 2: Update App.tsx routes**

```tsx
// Remove these routes:
// <Route path="/login" element={<LoginSelect />} />
// <Route path="/nas-login" element={<Login />} />
// <Route path="/member-login" element={<MemberLogin />} />

// Replace with:
<Route path="/login" element={<Login />} />
<Route path="/signup" element={<Signup />} />
```

Also update the redirect in ProtectedRoutes to point to `/login`.

**Step 3: Delete LoginSelect.tsx and MemberLogin.tsx**

**Step 4: Update Signup.tsx to use unified AuthContext**

Replace `useMemberAuth().signup()` with `useAuth().signup()`.

**Step 5: Run frontend**

Run: `cd /mnt/docker/labnote-ai/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds with no import errors.

**Step 6: Commit**

```bash
git rm frontend/src/pages/LoginSelect.tsx frontend/src/pages/MemberLogin.tsx
git add frontend/src/pages/Login.tsx frontend/src/pages/Signup.tsx frontend/src/App.tsx
git commit -m "refactor(frontend): single login page, remove NAS login and LoginSelect"
```

---

### Task 9: Add NAS settings admin guard in Settings page

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

**Step 1: Add admin role check for NAS settings section**

The NAS connection settings section (NasConnectionSection) should only be visible to users with OWNER or ADMIN role:

```tsx
function Settings() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  return (
    <div>
      {isAdmin && <NasConnectionSection />}
      {isAdmin && <ImageSyncSection />}
      <ApiKeysSection />
      <SearchIndexSection />
    </div>
  )
}
```

**Step 2: Add NAS credential test via new endpoint**

Update the NAS test connection button to call `POST /api/auth/nas/test` instead of the old flow:

```tsx
const testNasConnection = async () => {
  const response = await apiClient.post<NasTestResponse>('/auth/nas/test', {
    username: nasUsername,
    password: nasPassword,
    otp_code: otpCode || undefined,
  })
  // Handle response.success, response.requires_2fa, response.message
}
```

**Step 3: Commit**

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "feat(settings): restrict NAS settings to admin users, use NAS test endpoint"
```

---

## Phase 4: Cleanup

### Task 10: Final cleanup and verification

**Files:**
- Various cleanup across backend and frontend

**Step 1: Remove unused imports in auth.py**

Remove imports of `SynologyClient`, `Synology2FARequired`, `SynologyAuthError` from auth.py if no longer used directly (they're used in the NAS test endpoint, so keep if needed).

**Step 2: Clean up dead localStorage keys**

In AuthContext, ensure we clean up legacy keys on logout:

```typescript
const logout = () => {
  apiClient.clearToken()
  apiClient.clearRefreshToken()
  localStorage.removeItem('member_user')  // clean up legacy key
  setUser(null)
}
```

**Step 3: Run full backend test suite**

Run: `cd /mnt/docker/labnote-ai/backend && pytest --tb=short -v 2>&1 | tail -50`
Expected: All tests pass.

**Step 4: Run full frontend build**

Run: `cd /mnt/docker/labnote-ai/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds.

**Step 5: Run linters**

Run: `cd /mnt/docker/labnote-ai/backend && ruff check . && ruff format --check .`
Run: `cd /mnt/docker/labnote-ai/frontend && npm run lint`

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: auth unification cleanup, remove dead code"
```

---

## Summary of Changes

### Backend
| File | Change |
|------|--------|
| `models.py` | Add ForeignKey declarations to all columns missing them |
| `alembic/versions/012_*` | New migration adding 16 FK constraints |
| `services/auth_service.py` | `get_current_user` returns `{username, email, user_id, org_id, role}` |
| `api/auth.py` | Login becomes member-based, add `/nas/test`, update `/me` and `/token/refresh` |
| `api/members.py` | Remove duplicate login/refresh, fix Depends injection |
| `api/sharing.py` | Remove local `get_current_member`, use unified `get_current_user` |
| `tests/*` | Update all token fixtures to member format |

### Frontend
| File | Change |
|------|--------|
| `contexts/AuthContext.tsx` | Single unified auth (member-based login, full user info) |
| `hooks/useMemberAuth.ts` | **Deleted** |
| `pages/Login.tsx` | Rewritten as email/password login |
| `pages/LoginSelect.tsx` | **Deleted** |
| `pages/MemberLogin.tsx` | **Deleted** |
| `pages/Signup.tsx` | Uses AuthContext.signup instead of useMemberAuth |
| `pages/Settings.tsx` | NAS settings admin-gated, uses `/auth/nas/test` |
| `App.tsx` | Simplified routes: `/login`, `/signup` |

### Database
- 16 new FK constraints across 9 tables
- `note_access.granted_by` made nullable for `SET NULL` cascade
- ORM models aligned with actual DB constraints
