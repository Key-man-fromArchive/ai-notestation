# Operations Dashboard & Activity Log Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a unified Operations page that shows live sync/embedding/search status with action buttons, plus a persistent activity log recording all operation history.

**Architecture:** New `ActivityLog` DB model persists operation events (sync, embedding, image-sync). Backend background tasks write log entries on start/complete/error. New `/api/activity-log` endpoints serve paginated history. Frontend gets a new `/operations` page combining live status cards + historical timeline.

**Tech Stack:** SQLAlchemy model + Alembic migration, FastAPI endpoints, React page with TanStack Query, existing `useSync`/`useSearchIndex`/`useImageSync` hooks for live status.

---

### Task 1: Add ActivityLog DB model

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/migrations/versions/011_add_activity_log.py`

**Step 1: Write the ActivityLog model**

Add to `backend/app/models.py` after the `NoteCluster` class:

```python
class ActivityLog(Base):
    """Persistent log of system operations (sync, embedding, image-sync)."""

    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    operation: Mapped[str] = mapped_column(String(50), index=True)  # 'sync' | 'embedding' | 'image_sync'
    status: Mapped[str] = mapped_column(String(20))  # 'started' | 'completed' | 'error'
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # {added: 5, updated: 3, deleted: 1, total: 100}
    triggered_by: Mapped[str | None] = mapped_column(String(255), nullable=True)  # username or 'system'
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        Index("idx_activity_log_op_created", "operation", "created_at"),
    )
```

**Step 2: Create Alembic migration**

Create `backend/migrations/versions/011_add_activity_log.py`:

```python
"""Add activity_logs table.

Revision ID: 011
Revises: 010
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "011"
down_revision = "010"

def upgrade() -> None:
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("operation", sa.String(50), nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("details", JSONB, nullable=True),
        sa.Column("triggered_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )
    op.create_index("idx_activity_log_op_created", "activity_logs", ["operation", "created_at"])

def downgrade() -> None:
    op.drop_table("activity_logs")
```

**Step 3: Run migration**

Run: `cd backend && alembic upgrade head`
Expected: Migration applies successfully

**Step 4: Commit**

```bash
git add backend/app/models.py backend/migrations/versions/011_add_activity_log.py
git commit -m "feat: add ActivityLog model and migration"
```

---

### Task 2: Add activity logging helper

**Files:**
- Create: `backend/app/services/activity_log.py`

**Step 1: Write the activity log service**

Create `backend/app/services/activity_log.py`:

```python
"""Thin helper for writing activity log entries."""

import logging
from datetime import datetime, UTC
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityLog
from app.database import async_session_factory

logger = logging.getLogger(__name__)


async def log_activity(
    operation: str,
    status: str,
    message: str | None = None,
    details: dict | None = None,
    triggered_by: str | None = None,
) -> None:
    """Write one row to activity_logs using a fresh session."""
    try:
        async with async_session_factory() as session:
            entry = ActivityLog(
                operation=operation,
                status=status,
                message=message,
                details=details,
                triggered_by=triggered_by,
            )
            session.add(entry)
            await session.commit()
    except Exception:
        logger.exception("Failed to write activity log")
```

**Step 2: Commit**

```bash
git add backend/app/services/activity_log.py
git commit -m "feat: add activity log helper service"
```

---

### Task 3: Wire sync background task to write activity logs

**Files:**
- Modify: `backend/app/api/sync.py`

**Step 1: Add log_activity calls to _run_sync_background**

At the top of `_run_sync_background`, after setting `state.status = "syncing"`:

```python
from app.services.activity_log import log_activity
await log_activity("sync", "started", triggered_by=state.triggered_by)
```

On success (after `state.status = "completed"`):

```python
await log_activity(
    "sync",
    "completed",
    message=f"동기화 완료: {result.total}개 노트",
    details={
        "added": result.added,
        "updated": result.updated,
        "deleted": result.deleted,
        "total": result.total,
        "notes_indexed": state.notes_indexed,
    },
    triggered_by=state.triggered_by,
)
```

On error (in the `except` block):

```python
await log_activity(
    "sync",
    "error",
    message=str(exc),
    triggered_by=state.triggered_by,
)
```

**Step 2: Add `triggered_by` to SyncState**

Add to `SyncState.__init__`:

```python
self.triggered_by: str | None = None
```

**Step 3: Pass username in trigger_sync**

In `trigger_sync`, before `background_tasks.add_task(...)`:

```python
_sync_state.triggered_by = current_user.get("username", "unknown")
```

**Step 4: Verify backend starts**

Run: `cd backend && python -c "from app.api.sync import router; print('OK')"`
Expected: `OK`

**Step 5: Commit**

```bash
git add backend/app/api/sync.py
git commit -m "feat: write activity logs from sync background task"
```

---

### Task 4: Wire embedding index background task to write activity logs

**Files:**
- Modify: `backend/app/api/search.py`

**Step 1: Add log_activity calls to _run_index_background**

At the start (after setting `state.status = "indexing"`):

```python
from app.services.activity_log import log_activity
await log_activity("embedding", "started", triggered_by=state.triggered_by)
```

On success (after `state.status = "completed"`):

```python
await log_activity(
    "embedding",
    "completed",
    message=f"임베딩 완료: {state.indexed}개 인덱싱",
    details={
        "total_notes": state.total_notes,
        "indexed": state.indexed,
        "failed": state.failed,
    },
    triggered_by=state.triggered_by,
)
```

On error:

```python
await log_activity(
    "embedding",
    "error",
    message=str(exc),
    triggered_by=state.triggered_by,
)
```

**Step 2: Add `triggered_by` to IndexState**

Add field to the `IndexState` dataclass:

```python
triggered_by: str | None = None
```

**Step 3: Pass username in trigger_index**

In `trigger_index`, before `background_tasks.add_task(...)`:

```python
_index_state.triggered_by = current_user.get("username", "unknown")
```

**Step 4: Commit**

```bash
git add backend/app/api/search.py
git commit -m "feat: write activity logs from embedding background task"
```

---

### Task 5: Add activity log API endpoints

**Files:**
- Create: `backend/app/api/activity_log.py`
- Modify: `backend/app/main.py` (add router include)

**Step 1: Write the failing test**

Create `backend/tests/test_activity_log_api.py`:

```python
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_activity_logs_empty(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/activity-log", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_activity_log_api.py -v`
Expected: FAIL (404 - route doesn't exist yet)

**Step 3: Write the API router**

Create `backend/app/api/activity_log.py`:

```python
"""Activity log API endpoints."""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ActivityLog
from app.api.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/activity-log", tags=["activity-log"])


class ActivityLogItem(BaseModel):
    id: int
    operation: str
    status: str
    message: str | None
    details: dict | None
    triggered_by: str | None
    created_at: datetime


class ActivityLogResponse(BaseModel):
    items: list[ActivityLogItem]
    total: int


@router.get("", response_model=ActivityLogResponse)
async def get_activity_logs(
    operation: str | None = Query(None, description="Filter by operation type"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActivityLogResponse:
    """Return paginated activity logs, newest first."""
    query = select(ActivityLog).order_by(desc(ActivityLog.created_at))
    count_query = select(func.count(ActivityLog.id))

    if operation:
        query = query.where(ActivityLog.operation == operation)
        count_query = count_query.where(ActivityLog.operation == operation)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    return ActivityLogResponse(
        items=[
            ActivityLogItem(
                id=log.id,
                operation=log.operation,
                status=log.status,
                message=log.message,
                details=log.details,
                triggered_by=log.triggered_by,
                created_at=log.created_at,
            )
            for log in logs
        ],
        total=total,
    )
```

**Step 4: Register router in main.py**

Add to `backend/app/main.py` alongside other router includes:

```python
from app.api.activity_log import router as activity_log_router
app.include_router(activity_log_router, prefix="/api")
```

**Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_activity_log_api.py -v`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/app/api/activity_log.py backend/app/main.py backend/tests/test_activity_log_api.py
git commit -m "feat: add activity log API endpoint with pagination and filtering"
```

---

### Task 6: Add useActivityLog frontend hook

**Files:**
- Create: `frontend/src/hooks/useActivityLog.ts`

**Step 1: Write the hook**

Create `frontend/src/hooks/useActivityLog.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface ActivityLogItem {
  id: number
  operation: 'sync' | 'embedding' | 'image_sync'
  status: 'started' | 'completed' | 'error'
  message: string | null
  details: Record<string, unknown> | null
  triggered_by: string | null
  created_at: string
}

interface ActivityLogResponse {
  items: ActivityLogItem[]
  total: number
}

export function useActivityLog(operation?: string) {
  const params = new URLSearchParams({ limit: '50' })
  if (operation) params.set('operation', operation)

  return useQuery<ActivityLogResponse>({
    queryKey: ['activity-log', operation ?? 'all'],
    queryFn: () => apiClient.get(`/activity-log?${params.toString()}`),
    refetchInterval: 10_000, // 10s polling for recent updates
  })
}
```

**Step 2: Commit**

```bash
git add frontend/src/hooks/useActivityLog.ts
git commit -m "feat: add useActivityLog hook"
```

---

### Task 7: Create the Operations page

**Files:**
- Create: `frontend/src/pages/Operations.tsx`

**Step 1: Write the Operations page**

Create `frontend/src/pages/Operations.tsx`:

```tsx
import { useState } from 'react'
import { useSync } from '@/hooks/useSync'
import { useSearchIndex } from '@/hooks/useSearchIndex'
import { useActivityLog } from '@/hooks/useActivityLog'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import {
  RefreshCw,
  Database,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  AlertCircle,
  Filter,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type FilterType = 'all' | 'sync' | 'embedding' | 'image_sync'

export default function Operations() {
  const [filter, setFilter] = useState<FilterType>('all')

  // Live status
  const {
    status: syncStatus,
    lastSync,
    notesSynced,
    error: syncError,
    triggerSync,
  } = useSync()

  const {
    status: indexStatus,
    totalNotes,
    indexedNotes,
    pendingNotes,
    error: indexError,
    triggerIndex,
    isIndexing,
  } = useSearchIndex()

  // Activity log
  const { data: logData, isLoading: logLoading } = useActivityLog(
    filter === 'all' ? undefined : filter,
  )

  const indexPercentage =
    totalNotes > 0 ? Math.round((indexedNotes / totalNotes) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">운영 현황</h1>
        <p className="text-sm text-muted-foreground">
          동기화, 임베딩, 검색 상태를 한눈에 확인하고 관리합니다
        </p>
      </div>

      {/* Live Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Sync Status Card */}
        <div className="p-4 border border-border rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <RefreshCw
                className={cn(
                  'h-5 w-5',
                  syncStatus === 'syncing' && 'animate-spin text-yellow-600',
                  syncStatus === 'completed' && 'text-green-600',
                  syncStatus === 'error' && 'text-destructive',
                  syncStatus === 'idle' && 'text-muted-foreground',
                )}
              />
              <h3 className="font-semibold">NAS 동기화</h3>
            </div>
            <StatusBadge status={syncStatus} />
          </div>
          <div className="space-y-1 text-sm text-muted-foreground mb-3">
            {notesSynced != null && (
              <p>동기화된 노트: <span className="text-foreground font-medium">{notesSynced.toLocaleString()}개</span></p>
            )}
            {lastSync && (
              <p>마지막 동기화: {new Date(lastSync).toLocaleString('ko-KR')}</p>
            )}
            {syncError && <p className="text-destructive text-xs">{syncError}</p>}
          </div>
          <button
            onClick={() => triggerSync()}
            disabled={syncStatus === 'syncing'}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm',
              'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <Play className="h-4 w-4" />
            {syncStatus === 'syncing' ? '동기화 중...' : '동기화 시작'}
          </button>
        </div>

        {/* Embedding Status Card */}
        <div className="p-4 border border-border rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database
                className={cn(
                  'h-5 w-5',
                  indexStatus === 'indexing' && 'text-yellow-600',
                  indexStatus === 'completed' && 'text-green-600',
                  indexStatus === 'error' && 'text-destructive',
                  indexStatus === 'idle' && 'text-muted-foreground',
                )}
              />
              <h3 className="font-semibold">임베딩 인덱싱</h3>
            </div>
            <StatusBadge status={indexStatus} />
          </div>
          <div className="space-y-1 text-sm text-muted-foreground mb-3">
            <p>
              인덱싱 완료:{' '}
              <span className="text-foreground font-medium">
                {indexedNotes.toLocaleString()} / {totalNotes.toLocaleString()}개
              </span>{' '}
              ({indexPercentage}%)
            </p>
            {pendingNotes > 0 && (
              <p>대기 중: <span className="text-amber-600 font-medium">{pendingNotes.toLocaleString()}개</span></p>
            )}
            {indexError && <p className="text-destructive text-xs">{indexError}</p>}
          </div>
          <button
            onClick={() => triggerIndex()}
            disabled={isIndexing || pendingNotes === 0}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm',
              'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <Play className="h-4 w-4" />
            {isIndexing ? '인덱싱 중...' : pendingNotes === 0 ? '인덱싱 완료' : '인덱싱 시작'}
          </button>
        </div>

        {/* Search Readiness Card */}
        <div className="p-4 border border-border rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Search
                className={cn(
                  'h-5 w-5',
                  indexPercentage === 100 ? 'text-green-600' :
                  indexPercentage > 0 ? 'text-yellow-600' : 'text-muted-foreground',
                )}
              />
              <h3 className="font-semibold">검색 준비 상태</h3>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground mb-3">
            <p>전문 검색 (FTS): <span className="text-green-600 font-medium">사용 가능</span></p>
            <p>
              의미 검색:{' '}
              <span className={cn('font-medium', indexPercentage === 100 ? 'text-green-600' : 'text-amber-600')}>
                {indexPercentage === 100 ? '사용 가능' : `${indexPercentage}% 준비`}
              </span>
            </p>
            <p>하이브리드 검색: <span className={cn('font-medium', indexPercentage > 0 ? 'text-green-600' : 'text-amber-600')}>
              {indexPercentage > 0 ? '사용 가능' : '임베딩 필요'}
            </span></p>
          </div>
          {/* Progress bar */}
          <div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  indexPercentage === 100 ? 'bg-green-500' : 'bg-primary',
                )}
                style={{ width: `${indexPercentage}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              전체 검색 준비도 {indexPercentage}%
            </p>
          </div>
        </div>
      </div>

      {/* Activity Log Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">작업 로그</h2>
          <div className="flex gap-1">
            {(['all', 'sync', 'embedding', 'image_sync'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs transition-colors',
                  filter === type
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {type === 'all' && '전체'}
                {type === 'sync' && '동기화'}
                {type === 'embedding' && '임베딩'}
                {type === 'image_sync' && '이미지'}
              </button>
            ))}
          </div>
        </div>

        {logLoading && <LoadingSpinner className="py-8" />}

        {!logLoading && (!logData?.items || logData.items.length === 0) && (
          <EmptyState
            icon={Clock}
            title="작업 기록이 없습니다"
            description="동기화나 인덱싱을 실행하면 여기에 기록됩니다"
          />
        )}

        {logData?.items && logData.items.length > 0 && (
          <div className="border border-border rounded-lg divide-y divide-border">
            {logData.items.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3">
                <div className="mt-0.5">
                  {item.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {item.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                  {item.status === 'started' && <Play className="h-4 w-4 text-yellow-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      item.operation === 'sync' && 'bg-blue-100 text-blue-700',
                      item.operation === 'embedding' && 'bg-purple-100 text-purple-700',
                      item.operation === 'image_sync' && 'bg-amber-100 text-amber-700',
                    )}>
                      {item.operation === 'sync' && '동기화'}
                      {item.operation === 'embedding' && '임베딩'}
                      {item.operation === 'image_sync' && '이미지'}
                    </span>
                    {item.message && (
                      <span className="text-sm text-foreground truncate">{item.message}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{new Date(item.created_at).toLocaleString('ko-KR')}</span>
                    {item.triggered_by && <span>by {item.triggered_by}</span>}
                    {item.details && item.status === 'completed' && (
                      <span className="text-foreground/60">
                        {item.operation === 'sync' && `+${item.details.added} / ~${item.details.updated} / -${item.details.deleted}`}
                        {item.operation === 'embedding' && `${item.details.indexed}개 인덱싱`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'text-xs px-2 py-0.5 rounded-full font-medium',
        status === 'idle' && 'bg-muted text-muted-foreground',
        status === 'syncing' && 'bg-yellow-100 text-yellow-700',
        status === 'indexing' && 'bg-yellow-100 text-yellow-700',
        status === 'completed' && 'bg-green-100 text-green-700',
        status === 'error' && 'bg-red-100 text-red-700',
      )}
    >
      {status === 'idle' && '대기'}
      {(status === 'syncing' || status === 'indexing') && '진행 중'}
      {status === 'completed' && '완료'}
      {status === 'error' && '오류'}
    </span>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Operations.tsx
git commit -m "feat: add Operations page with live status cards and activity log"
```

---

### Task 8: Add route and navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

**Step 1: Add lazy import in App.tsx**

After the existing lazy imports, add:

```typescript
const Operations = lazy(() => import('./pages/Operations'))
```

**Step 2: Add route in ProtectedRoutes**

Inside the `<Routes>` in `ProtectedRoutes`, add alongside existing routes:

```tsx
<Route path="/operations" element={<Operations />} />
```

**Step 3: Add nav item in Sidebar.tsx**

Add to the `baseNavItems` array, after the '설정' entry:

```typescript
import { Activity } from 'lucide-react'
// ...
{ to: '/operations', icon: Activity, label: '운영 현황' },
```

**Step 4: Verify the app compiles**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat: add /operations route and sidebar navigation"
```

---

### Task 9: Backend tests

**Files:**
- Create: `backend/tests/test_activity_log_service.py`

**Step 1: Write the test**

```python
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityLog
from app.services.activity_log import log_activity


@pytest.mark.asyncio
async def test_log_activity_writes_entry(db_session: AsyncSession):
    await log_activity(
        operation="sync",
        status="completed",
        message="Test sync done",
        details={"added": 5, "total": 100},
        triggered_by="test_user",
    )

    result = await db_session.execute(select(ActivityLog))
    logs = result.scalars().all()
    assert len(logs) == 1
    assert logs[0].operation == "sync"
    assert logs[0].status == "completed"
    assert logs[0].details["added"] == 5
```

**Step 2: Run test**

Run: `cd backend && pytest tests/test_activity_log_service.py -v`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/tests/test_activity_log_service.py
git commit -m "test: add activity log service tests"
```

---

### Task 10: Frontend test for Operations page

**Files:**
- Create: `frontend/src/__tests__/Operations.test.tsx`

**Step 1: Write the test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Operations from '@/pages/Operations'

// Mock hooks
vi.mock('@/hooks/useSync', () => ({
  useSync: () => ({
    status: 'idle',
    lastSync: '2026-02-10T10:00:00Z',
    notesSynced: 100,
    error: null,
    triggerSync: vi.fn(),
  }),
}))

vi.mock('@/hooks/useSearchIndex', () => ({
  useSearchIndex: () => ({
    status: 'completed',
    totalNotes: 100,
    indexedNotes: 100,
    pendingNotes: 0,
    error: null,
    triggerIndex: vi.fn(),
    isIndexing: false,
  }),
}))

vi.mock('@/hooks/useActivityLog', () => ({
  useActivityLog: () => ({
    data: { items: [], total: 0 },
    isLoading: false,
  }),
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Operations', () => {
  it('renders status cards', () => {
    renderWithProviders(<Operations />)
    expect(screen.getByText('NAS 동기화')).toBeInTheDocument()
    expect(screen.getByText('임베딩 인덱싱')).toBeInTheDocument()
    expect(screen.getByText('검색 준비 상태')).toBeInTheDocument()
  })

  it('shows empty state for activity log', () => {
    renderWithProviders(<Operations />)
    expect(screen.getByText('작업 기록이 없습니다')).toBeInTheDocument()
  })
})
```

**Step 2: Run test**

Run: `cd frontend && npm test -- --run src/__tests__/Operations.test.tsx`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/__tests__/Operations.test.tsx
git commit -m "test: add Operations page component tests"
```
