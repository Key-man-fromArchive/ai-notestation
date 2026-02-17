# External API Documentation & API Key Authentication Plan

**Date:** 2026-02-16
**Target Version:** v2.1.0
**Status:** Planned

## Goal

Enable 3rd-party apps (OpenClaw, Claude Desktop, custom scripts, etc.) to integrate with LabNote AI by:
1. Adding Personal Access Token (API Key) authentication
2. Enhancing OpenAPI/Swagger documentation
3. Creating comprehensive Markdown API reference
4. Making CORS configurable for external access

## Current State

- **Auth**: JWT only (login → access_token + refresh_token). No API key system.
- **Docs**: FastAPI auto-generates OpenAPI at `/docs` but with minimal descriptions. No standalone docs.
- **CORS**: Hardcoded to `localhost:3000` only.
- **Endpoints**: 25+ routers, 100+ endpoints, 119 usages of `get_current_user` dependency.

---

## Phase 1: API Key Authentication

### 1.1 Database Model — `PersonalAccessToken`

**File:** `backend/app/models.py`
**Add after** the existing `EvaluationRun` class (~line 590)

```python
class PersonalAccessToken(Base):
    """Personal access tokens for external API authentication."""
    __tablename__ = "personal_access_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    org_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    token_prefix: Mapped[str] = mapped_column(String(8), nullable=False)  # "lnk_xxxx"
    scopes: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # ["read", "write", "admin"]
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_pat_user_id", "user_id"),
        Index("idx_pat_org_id", "org_id"),
        Index("idx_pat_token_hash", "token_hash"),
        Index("idx_pat_token_prefix", "token_prefix"),
    )
```

**Token format:** `lnk_<64 hex chars>` (68 chars total)
- `lnk_` prefix prevents confusion with JWT tokens
- SHA-256 hash stored in DB; plaintext shown once at creation only
- `token_prefix` (first 8 chars) lets users identify keys without seeing the full token

### 1.2 Alembic Migration 026

**File:** `backend/migrations/versions/026_add_personal_access_tokens.py`

```python
"""Add personal access tokens table

Revision ID: 026_add_personal_access_tokens
Revises: 025_add_member_groups
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "026_add_personal_access_tokens"
down_revision = "025_add_member_groups"

def upgrade() -> None:
    op.create_table(
        "personal_access_tokens",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("token_prefix", sa.String(8), nullable=False),
        sa.Column("scopes", JSONB, nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_ip", sa.String(45), nullable=True),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_pat_user_id", "personal_access_tokens", ["user_id"])
    op.create_index("idx_pat_org_id", "personal_access_tokens", ["org_id"])
    op.create_index("idx_pat_token_hash", "personal_access_tokens", ["token_hash"])
    op.create_index("idx_pat_token_prefix", "personal_access_tokens", ["token_prefix"])

def downgrade() -> None:
    op.drop_index("idx_pat_token_prefix", table_name="personal_access_tokens")
    op.drop_index("idx_pat_token_hash", table_name="personal_access_tokens")
    op.drop_index("idx_pat_org_id", table_name="personal_access_tokens")
    op.drop_index("idx_pat_user_id", table_name="personal_access_tokens")
    op.drop_table("personal_access_tokens")
```

### 1.3 API Key Service

**File:** `backend/app/services/api_key_service.py` (new)

```python
"""Personal Access Token (API Key) management service."""

import hashlib
import secrets
from datetime import UTC, datetime

from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PersonalAccessToken

TOKEN_PREFIX = "lnk_"
TOKEN_BYTES = 32  # 32 bytes = 64 hex chars


def generate_api_key() -> tuple[str, str, str]:
    """Generate a new API key.
    Returns: (plaintext_token, token_hash, token_prefix)
    """
    raw = secrets.token_hex(TOKEN_BYTES)
    plaintext = f"{TOKEN_PREFIX}{raw}"
    token_hash = hashlib.sha256(plaintext.encode()).hexdigest()
    prefix = plaintext[:8]
    return plaintext, token_hash, prefix


def hash_token(plaintext: str) -> str:
    """Hash a plaintext token for DB lookup."""
    return hashlib.sha256(plaintext.encode()).hexdigest()


async def create_token(
    db: AsyncSession,
    user_id: int,
    org_id: int,
    name: str,
    scopes: list[str] | None = None,
    expires_at: datetime | None = None,
) -> tuple[PersonalAccessToken, str]:
    """Create a new personal access token.
    Returns (token_record, plaintext) -- plaintext shown once only.
    """
    plaintext, token_hash, prefix = generate_api_key()
    pat = PersonalAccessToken(
        user_id=user_id,
        org_id=org_id,
        name=name,
        token_hash=token_hash,
        token_prefix=prefix,
        scopes=scopes or ["read"],
        expires_at=expires_at,
    )
    db.add(pat)
    await db.commit()
    await db.refresh(pat)
    return pat, plaintext


async def validate_token(db: AsyncSession, plaintext: str) -> PersonalAccessToken | None:
    """Validate a plaintext token. Returns the token record or None."""
    token_hash = hash_token(plaintext)
    result = await db.execute(
        select(PersonalAccessToken).where(
            PersonalAccessToken.token_hash == token_hash,
            PersonalAccessToken.is_active == True,  # noqa: E712
        )
    )
    pat = result.scalar_one_or_none()
    if pat and pat.expires_at and pat.expires_at < datetime.now(UTC):
        return None  # Expired
    return pat


async def list_user_tokens(
    db: AsyncSession, user_id: int, org_id: int
) -> list[PersonalAccessToken]:
    """List all tokens for a user in an organization."""
    result = await db.execute(
        select(PersonalAccessToken)
        .where(
            PersonalAccessToken.user_id == user_id,
            PersonalAccessToken.org_id == org_id,
        )
        .order_by(PersonalAccessToken.created_at.desc())
    )
    return list(result.scalars().all())


async def revoke_token(db: AsyncSession, token_id: int, user_id: int) -> bool:
    """Revoke (soft-delete) an API key. Returns True if found and revoked."""
    result = await db.execute(
        update(PersonalAccessToken)
        .where(
            PersonalAccessToken.id == token_id,
            PersonalAccessToken.user_id == user_id,
        )
        .values(is_active=False)
    )
    await db.commit()
    return result.rowcount > 0


async def update_last_used(
    db: AsyncSession, token_id: int, ip: str | None = None
) -> None:
    """Update last_used_at and last_used_ip."""
    await db.execute(
        update(PersonalAccessToken)
        .where(PersonalAccessToken.id == token_id)
        .values(last_used_at=datetime.now(UTC), last_used_ip=ip)
    )
    await db.commit()
```

### 1.4 Dual Authentication Dependency (CRITICAL CHANGE)

**File:** `backend/app/services/auth_service.py`

This is the most important change. Modify `get_current_user` to accept BOTH JWT and API keys **without changing its 119 downstream usages**.

**Before:**
```python
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    # JWT decode only
```

**After:**
```python
from fastapi import Request, Security
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def get_current_user(
    request: Request,
    bearer_token: str | None = Depends(oauth2_scheme),
    api_key: str | None = Security(api_key_header),
) -> dict:
    """Authenticate via JWT Bearer OR X-API-Key header.

    Priority:
    1. If Authorization: Bearer <token> present and NOT lnk_ prefix → try JWT
    2. If X-API-Key header present → validate as API key
    3. If Bearer token starts with lnk_ → treat as API key
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # --- Try JWT first ---
    if bearer_token and not bearer_token.startswith("lnk_"):
        try:
            payload = verify_token(bearer_token)
            if payload.get("type") != "access":
                raise credentials_exception
            username = payload.get("sub")
            user_id = payload.get("user_id")
            org_id = payload.get("org_id")
            role = payload.get("role")
            if not username or not user_id or not org_id:
                raise credentials_exception
            return {
                "username": username,
                "email": username,
                "user_id": user_id,
                "org_id": org_id,
                "role": role or "member",
                "auth_type": "jwt",
            }
        except JWTError:
            pass  # Fall through to API key check

    # --- Try API Key ---
    key_to_check = api_key or (
        bearer_token if bearer_token and bearer_token.startswith("lnk_") else None
    )
    if key_to_check:
        from app.database import async_session_factory
        from app.services.api_key_service import hash_token, update_last_used
        from app.models import PersonalAccessToken, User

        token_hash = hash_token(key_to_check)
        async with async_session_factory() as db:
            result = await db.execute(
                select(PersonalAccessToken).where(
                    PersonalAccessToken.token_hash == token_hash,
                    PersonalAccessToken.is_active == True,  # noqa: E712
                )
            )
            pat = result.scalar_one_or_none()

            if pat and (not pat.expires_at or pat.expires_at > datetime.now(UTC)):
                # Look up user for backward compatibility
                user_result = await db.execute(
                    select(User).where(User.id == pat.user_id)
                )
                user = user_result.scalar_one_or_none()
                if user:
                    client_ip = request.client.host if request.client else None
                    await update_last_used(db, pat.id, client_ip)
                    return {
                        "username": user.email,
                        "email": user.email,
                        "user_id": pat.user_id,
                        "org_id": pat.org_id,
                        "role": "member",  # API keys default to member
                        "auth_type": "api_key",
                        "token_id": pat.id,
                        "scopes": pat.scopes or ["read"],
                    }

    raise credentials_exception
```

**Why this works:**
- `auto_error=False` means missing auth doesn't auto-reject — we handle it manually
- Return dict keeps the same shape (username, email, user_id, org_id, role)
- New fields (`auth_type`, `scopes`, `token_id`) are additive — existing code accesses only known keys
- Both `X-API-Key: lnk_xxx` and `Authorization: Bearer lnk_xxx` work

### 1.5 API Key Management Endpoints

**File:** `backend/app/api/api_keys.py` (new)

```python
"""Personal Access Token (API Key) management endpoints."""

from datetime import UTC, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.auth_service import get_current_user
from app.services import api_key_service

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


class CreateApiKeyRequest(BaseModel):
    name: str = Field(..., max_length=100, description="Human-readable key name")
    scopes: list[str] = Field(
        default=["read"],
        description="Permission scopes: read, write, admin"
    )
    expires_in_days: int | None = Field(
        None, ge=1, le=365,
        description="Days until expiration (null = never expires)"
    )


class ApiKeyResponse(BaseModel):
    id: int
    name: str
    token_prefix: str
    scopes: list[str]
    expires_at: str | None
    last_used_at: str | None
    is_active: bool
    created_at: str


class ApiKeyCreatedResponse(ApiKeyResponse):
    token: str  # Plaintext — shown ONCE


@router.post("", response_model=ApiKeyCreatedResponse, status_code=201)
async def create_api_key(
    body: CreateApiKeyRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new personal access token.

    The token value is returned ONCE in this response.
    Store it securely — it cannot be retrieved again.
    """
    expires_at = None
    if body.expires_in_days:
        expires_at = datetime.now(UTC) + timedelta(days=body.expires_in_days)

    pat, plaintext = await api_key_service.create_token(
        db=db,
        user_id=user["user_id"],
        org_id=user["org_id"],
        name=body.name,
        scopes=body.scopes,
        expires_at=expires_at,
    )
    return ApiKeyCreatedResponse(
        id=pat.id,
        name=pat.name,
        token_prefix=pat.token_prefix,
        scopes=pat.scopes or ["read"],
        expires_at=pat.expires_at.isoformat() if pat.expires_at else None,
        last_used_at=None,
        is_active=True,
        created_at=pat.created_at.isoformat(),
        token=plaintext,
    )


@router.get("", response_model=list[ApiKeyResponse])
async def list_api_keys(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all API keys for the current user."""
    tokens = await api_key_service.list_user_tokens(db, user["user_id"], user["org_id"])
    return [
        ApiKeyResponse(
            id=t.id,
            name=t.name,
            token_prefix=t.token_prefix,
            scopes=t.scopes or ["read"],
            expires_at=t.expires_at.isoformat() if t.expires_at else None,
            last_used_at=t.last_used_at.isoformat() if t.last_used_at else None,
            is_active=t.is_active,
            created_at=t.created_at.isoformat(),
        )
        for t in tokens
    ]


@router.delete("/{token_id}", status_code=204)
async def revoke_api_key(
    token_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an API key. This action cannot be undone."""
    ok = await api_key_service.revoke_token(db, token_id, user["user_id"])
    if not ok:
        raise HTTPException(status_code=404, detail="API key not found")
```

### 1.6 Register Router

**File:** `backend/app/main.py`

Add at the end of router imports:
```python
from app.api.api_keys import router as api_keys_router
app.include_router(api_keys_router, prefix="/api")
```

### 1.7 Tests

**File:** `backend/tests/test_api_keys.py` (new)

Test cases:
- Create API key → returns plaintext starting with `lnk_`
- List API keys → shows prefix, not full token
- Authenticate via `X-API-Key` header → 200
- Authenticate via `Authorization: Bearer lnk_xxx` → 200
- Revoked key → 401
- Expired key → 401
- Invalid key → 401
- JWT auth still works as before (regression test)

---

## Phase 2: OpenAPI Enhancement

### 2.1 Tag Metadata & App Description

**File:** `backend/app/main.py`

```python
openapi_tags = [
    {"name": "health", "description": "Server health and readiness checks"},
    {"name": "auth", "description": "User authentication: login, token refresh, current user"},
    {"name": "api-keys", "description": "Personal access token management for external API access"},
    {"name": "notes", "description": "Note CRUD, tags, attachments, and batch operations"},
    {"name": "notebooks", "description": "Notebook management, categories, and access control"},
    {"name": "search", "description": "Hybrid search engine (FTS + semantic + trigram) with progressive results"},
    {"name": "ai", "description": "AI chat, streaming, and multi-provider model selection"},
    {"name": "sync", "description": "Synology NoteStation bidirectional sync"},
    {"name": "capture", "description": "External content capture from URL, arXiv, and PubMed"},
    {"name": "discovery", "description": "Note clustering, knowledge graph, timeline, and rediscovery"},
    {"name": "graph", "description": "Knowledge graph visualization and AI-powered cluster insights"},
    {"name": "sharing", "description": "Note and notebook sharing with users, groups, and organizations"},
    {"name": "share_links", "description": "Public/private share link management"},
    {"name": "members", "description": "Organization member management, invitations, and roles"},
    {"name": "groups", "description": "Member groups for bulk permission management"},
    {"name": "settings", "description": "Application configuration (AI providers, search params, categories)"},
    {"name": "oauth", "description": "OAuth2 provider connections (Google, OpenAI, Anthropic)"},
    {"name": "files", "description": "File upload, download, text extraction, and OCR"},
    {"name": "image-analysis", "description": "Batch image OCR and vision analysis"},
    {"name": "nas-images", "description": "NAS image proxy and OCR processing"},
    {"name": "nsx", "description": "NoteStation NSX format import/export"},
    {"name": "backup", "description": "Database backup, restore, and settings export"},
    {"name": "export", "description": "Note export in various formats"},
    {"name": "admin", "description": "Admin-only: database management, trash, diagnostics"},
    {"name": "metrics", "description": "Search quality metrics dashboard (admin)"},
    {"name": "feedback", "description": "User feedback on search results and AI responses"},
    {"name": "evaluation", "description": "A/B evaluation runs for AI model comparison (admin)"},
    {"name": "activity-log", "description": "System operation logs and audit trail"},
]

app = FastAPI(
    title="LabNote AI",
    description=(
        "LabNote AI enhances Synology NoteStation with AI capabilities: "
        "hybrid search (FTS + semantic), AI-powered insights, research note generation, "
        "spell checking, and template creation.\n\n"
        "## Authentication\n\n"
        "All endpoints (except health check and shared content) require authentication.\n\n"
        "**Option 1: JWT Bearer Token** (for browser/SPA clients)\n"
        "```\nPOST /api/auth/login {email, password} → {access_token, refresh_token}\n"
        "Authorization: Bearer <access_token>\n```\n\n"
        "**Option 2: Personal Access Token** (for scripts and external apps)\n"
        "```\nX-API-Key: lnk_your_api_key\n"
        "# OR\n"
        "Authorization: Bearer lnk_your_api_key\n```\n\n"
        "Create API keys at `POST /api/api-keys` (requires JWT auth).\n"
    ),
    version="2.1.0",
    lifespan=lifespan,
    openapi_tags=openapi_tags,
)
```

### 2.2 Route-Level Descriptions

Add `summary` and `responses` to each endpoint across all 28 router files. Priority order:

1. `api/auth.py` — Login, refresh, me
2. `api/api_keys.py` — Already has descriptions from Phase 1
3. `api/notes.py` — Core CRUD
4. `api/notebooks.py` — Notebook management
5. `api/search.py` — Hybrid search
6. `api/ai.py` — AI chat/stream
7. Remaining files

**Example pattern for each endpoint:**
```python
@router.get(
    "",
    summary="Search notes",
    description="Search notes using hybrid (FTS + semantic), full-text, or semantic mode.",
    responses={
        401: {"description": "Missing or invalid authentication"},
        422: {"description": "Invalid query parameters"},
    },
)
```

### 2.3 Error Response Schema

**File:** `backend/app/schemas/errors.py` (new, or add to existing schemas)

```python
from pydantic import BaseModel


class ErrorResponse(BaseModel):
    detail: str

    model_config = {
        "json_schema_extra": {
            "example": {"detail": "Not found"}
        }
    }


class ValidationErrorResponse(BaseModel):
    detail: list[dict]

    model_config = {
        "json_schema_extra": {
            "example": {
                "detail": [
                    {
                        "loc": ["query", "q"],
                        "msg": "field required",
                        "type": "value_error.missing",
                    }
                ]
            }
        }
    }
```

---

## Phase 3: Markdown API Documentation

### 3.1 Directory Structure

```
docs/api/
├── README.md                    # Overview, quickstart, TOC
├── authentication.md            # JWT + API Key auth guide
├── errors.md                    # Error codes reference
├── endpoints/
│   ├── auth.md                  # Login, refresh, me
│   ├── api-keys.md              # API key management
│   ├── notes.md                 # Notes CRUD + tags + attachments
│   ├── notebooks.md             # Notebooks + categories + access
│   ├── search.md                # Hybrid search + suggestions
│   ├── ai.md                    # Chat, stream, models, providers
│   ├── sync.md                  # NoteStation sync
│   ├── capture.md               # URL/arXiv/PubMed capture
│   ├── discovery.md             # Clustering + graph + timeline
│   ├── sharing.md               # Note/notebook sharing + links
│   ├── members.md               # Members + groups
│   ├── settings.md              # App settings
│   ├── admin.md                 # Admin operations
│   ├── files.md                 # File upload/download + OCR
│   └── backup.md                # Backup/restore
└── examples/
    ├── curl.md                  # curl workflow examples
    ├── python.md                # Python httpx examples
    └── typescript.md            # TypeScript fetch examples
```

### 3.2 README.md Template

```markdown
# LabNote AI API Reference

## Base URL

```
http://your-server:8001/api
```

## Authentication

Two methods are supported:

### 1. JWT Bearer Token (for browser/SPA clients)
```bash
# Login
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "your-password"}'

# Use access_token
curl http://localhost:8001/api/notes \
  -H "Authorization: Bearer eyJhbGciOi..."
```

### 2. API Key (for scripts and external apps)
```bash
# First, create an API key (requires JWT auth)
curl -X POST http://localhost:8001/api/api-keys \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-script", "scopes": ["read", "write"]}'
# Response includes `token` field — save it, shown once only!

# Use API key via header
curl http://localhost:8001/api/search?q=machine+learning \
  -H "X-API-Key: lnk_your_key_here"

# OR via Bearer token
curl http://localhost:8001/api/search?q=machine+learning \
  -H "Authorization: Bearer lnk_your_key_here"
```

## Quick Start

1. [Set up authentication](./authentication.md)
2. [Search notes](./endpoints/search.md)
3. [Get note details](./endpoints/notes.md)
4. [AI chat & streaming](./endpoints/ai.md)

## Endpoint Reference

| Domain | Prefix | Description |
|--------|--------|-------------|
| [Auth](./endpoints/auth.md) | `/api/auth` | Login, token refresh |
| [API Keys](./endpoints/api-keys.md) | `/api/api-keys` | Personal access tokens |
| [Notes](./endpoints/notes.md) | `/api/notes` | Note CRUD, tags, attachments |
| [Notebooks](./endpoints/notebooks.md) | `/api/notebooks` | Notebook management |
| [Search](./endpoints/search.md) | `/api/search` | Hybrid search engine |
| [AI](./endpoints/ai.md) | `/api/ai` | AI chat & streaming |
| [Sync](./endpoints/sync.md) | `/api/sync` | NoteStation sync |
| [Capture](./endpoints/capture.md) | `/api/capture` | URL/arXiv/PubMed capture |
| [Discovery](./endpoints/discovery.md) | `/api/discovery` | Clustering & graph |
| [Sharing](./endpoints/sharing.md) | `/api/notes/share` | Note sharing |
| [Members](./endpoints/members.md) | `/api/members` | Organization members |
| [Settings](./endpoints/settings.md) | `/api/settings` | App configuration |
| [Admin](./endpoints/admin.md) | `/api/admin` | Admin operations |
| [Files](./endpoints/files.md) | `/api/files` | File operations |
| [Backup](./endpoints/backup.md) | `/api/backup` | Backup/restore |

## Interactive Docs

When enabled, Swagger UI is available at:
- **Swagger UI:** `http://your-server:8001/docs`
- **ReDoc:** `http://your-server:8001/redoc`
- **OpenAPI JSON:** `http://your-server:8001/openapi.json`
```

### 3.3 Endpoint Document Template

Each endpoint file follows this pattern:

```markdown
# Search API

## GET /api/search

Search notes using hybrid, full-text, or semantic search.

**Authentication:** Required (JWT or API Key)
**Scopes:** `read`

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| q | string | Yes | - | Search query text |
| mode | string | No | `hybrid` | `hybrid`, `fts`, or `semantic` |
| limit | integer | No | 20 | Results per page (1-100) |
| offset | integer | No | 0 | Pagination offset |
| notebook_id | integer | No | - | Filter by notebook |

### Response 200

```json
{
  "results": [
    {
      "note_id": 42,
      "title": "Machine Learning Notes",
      "snippet": "...highlighted matched text...",
      "score": 0.85,
      "search_type": "hybrid",
      "notebook_title": "Research"
    }
  ],
  "total": 15,
  "query": "machine learning",
  "mode": "hybrid"
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| 401 | Missing or invalid authentication |
| 422 | Invalid query parameters |

### Example

```bash
curl "http://localhost:8001/api/search?q=machine+learning&mode=hybrid&limit=10" \
  -H "X-API-Key: lnk_your_key"
```
```

### 3.4 Integration Examples

**`examples/python.md`** — Complete workflow with httpx:
```python
import httpx

BASE_URL = "http://localhost:8001/api"
API_KEY = "lnk_your_key_here"
headers = {"X-API-Key": API_KEY}

# Search notes
resp = httpx.get(f"{BASE_URL}/search", params={"q": "machine learning"}, headers=headers)
results = resp.json()

# Get note details
note_id = results["results"][0]["note_id"]
resp = httpx.get(f"{BASE_URL}/notes/{note_id}", headers=headers)
note = resp.json()

# AI chat (synchronous)
resp = httpx.post(f"{BASE_URL}/ai/chat", json={
    "messages": [{"role": "user", "content": "Summarize this note"}],
    "context_note_ids": [note_id],
}, headers=headers)

# AI streaming (SSE)
with httpx.stream("POST", f"{BASE_URL}/ai/stream", json={
    "messages": [{"role": "user", "content": "Summarize this note"}],
    "context_note_ids": [note_id],
}, headers=headers) as resp:
    for line in resp.iter_lines():
        if line.startswith("data: ") and line != "data: [DONE]":
            chunk = json.loads(line[6:])
            print(chunk["content"], end="")
```

---

## Phase 4: CORS & Configuration

### 4.1 Add Config Settings

**File:** `backend/app/config.py`

```python
# --- CORS ---
CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

# --- API Documentation ---
API_DOCS_ENABLED: bool = True  # Set False to disable /docs and /redoc
```

### 4.2 Update CORS in main.py

**File:** `backend/app/main.py`

```python
from app.config import get_settings

settings = get_settings()

cors_origins = [
    origin.strip()
    for origin in settings.CORS_ORIGINS.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-API-Key"],
)
```

### 4.3 Conditional Docs Endpoints

**File:** `backend/app/main.py`

```python
app = FastAPI(
    ...
    docs_url="/docs" if settings.API_DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.API_DOCS_ENABLED else None,
)
```

### 4.4 Docker Compose

**File:** `docker-compose.yml`

Add to backend environment section:
```yaml
CORS_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000"
API_DOCS_ENABLED: "true"
```

---

## Execution Order

```
1. Phase 4 (CORS & Config)     ~30 min    — independent, low risk
2. Phase 1 (API Key Auth)      ~2-3 hours — core functionality
3. Phase 2 (OpenAPI)           ~1-2 hours — depends on Phase 1 for api-keys tag
4. Phase 3 (Markdown Docs)    ~2-3 hours — depends on Phase 1+2
```

## Verification Checklist

- [ ] `cd backend && alembic upgrade head` — migration 026 applies cleanly
- [ ] `cd backend && pytest tests/test_api_keys.py -v` — all API key tests pass
- [ ] `cd backend && pytest --tb=short` — no regressions in existing tests
- [ ] `curl -X POST /api/auth/login ...` → JWT login still works
- [ ] `curl -H "X-API-Key: lnk_xxx" /api/notes` → API key auth works
- [ ] `curl -H "Authorization: Bearer lnk_xxx" /api/notes` → Bearer API key works
- [ ] Visit `http://localhost:8001/docs` → Swagger UI with tag groups and descriptions
- [ ] Visit `http://localhost:8001/redoc` → ReDoc renders properly
- [ ] `docs/api/README.md` renders correctly on GitHub
- [ ] CORS: external origin can access API (test with different port)

## Files Changed Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 1 | `services/api_key_service.py`, `api/api_keys.py`, `migrations/.../026_...py`, `tests/test_api_keys.py` | `models.py`, `services/auth_service.py`, `main.py` |
| 2 | `schemas/errors.py` | `main.py`, 28 router files (add summaries) |
| 3 | ~18 markdown files in `docs/api/` | None |
| 4 | None | `config.py`, `main.py`, `docker-compose.yml` |
