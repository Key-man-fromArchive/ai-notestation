// @TASK P5-T5.3 - Dashboard 페이지
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#dashboard
// @TEST src/__tests__/Dashboard.test.tsx

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useSync } from '@/hooks/useSync'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import {
  FileText,
  Search,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Clock,
  Notebook,
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Note {
  note_id: string
  title: string
  snippet: string
  notebook: string | null
  updated_at: string | null
}

interface NotesResponse {
  items: Note[]
  total: number
}

interface NotebookItem {
  name: string
  note_count: number
}

interface NotebooksResponse {
  items: NotebookItem[]
}

export default function Dashboard() {
  const { status: syncStatus, lastSync, error: syncError, triggerSync } = useSync()

  const { data, isLoading } = useQuery<NotesResponse>({
    queryKey: ['notes', 'recent'],
    queryFn: () => apiClient.get('/notes?limit=5'),
  })

  const { data: notebooksData } = useQuery<NotebooksResponse>({
    queryKey: ['notebooks'],
    queryFn: () => apiClient.get('/notebooks'),
  })

  // Compute total from sum of notebook counts (more accurate than paginated total)
  const totalNotes = notebooksData?.items?.reduce((sum, nb) => sum + nb.note_count, 0) ?? data?.total ?? 0
  const totalNotebooks = notebooksData?.items?.length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">대시보드</h2>
        <p className="text-muted-foreground">
          LabNote AI에 오신 것을 환영합니다
        </p>
      </div>

      {/* NAS 연결 에러 배너 */}
      {syncStatus === 'error' && (
        <div
          className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-md"
          role="alert"
        >
          <AlertCircle
            className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1">
            <h3 className="font-semibold text-destructive mb-1">
              NAS 연결에 실패했습니다
            </h3>
            <p className="text-sm text-destructive/80 mb-2">{syncError}</p>
            <Link
              to="/settings"
              className="inline-block px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm hover:bg-destructive/90 transition-colors"
            >
              설정 확인하기
            </Link>
          </div>
        </div>
      )}

      {/* 통계 카드 + 동기화 상태 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          to="/notes"
          className="p-4 border border-border rounded-lg hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalNotes}</div>
              <div className="text-xs text-muted-foreground">전체 노트</div>
            </div>
          </div>
        </Link>

        <Link
          to="/notes"
          className="p-4 border border-border rounded-lg hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalNotebooks}</div>
              <div className="text-xs text-muted-foreground">노트북</div>
            </div>
          </div>
        </Link>

        <div className="p-4 border border-border rounded-lg">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              syncStatus === 'error' ? 'bg-destructive/10' : 'bg-green-500/10'
            )}>
              <RefreshCw
                className={cn(
                  'h-5 w-5',
                  syncStatus === 'syncing' && 'animate-spin text-yellow-600',
                  syncStatus === 'error' && 'text-destructive',
                  syncStatus !== 'syncing' && syncStatus !== 'error' && 'text-green-600',
                )}
                aria-hidden="true"
              />
            </div>
            <div>
              <div className="text-sm font-semibold">
                {syncStatus === 'idle' && '대기 중'}
                {syncStatus === 'syncing' && '동기화 중...'}
                {syncStatus === 'completed' && '동기화 완료'}
                {syncStatus === 'error' && '동기화 오류'}
              </div>
              <div className="text-xs text-muted-foreground">
                {lastSync
                  ? new Date(lastSync).toLocaleString('ko-KR')
                  : '동기화 기록 없음'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 빠른 액션 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Link
          to="/search"
          className={cn(
            'flex items-center gap-3 p-4 border border-border rounded-lg',
            'hover:border-primary/30 hover:bg-muted/30 transition-colors duration-200',
            'motion-reduce:transition-none'
          )}
        >
          <Search className="h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <div className="font-semibold text-sm">노트 검색</div>
            <div className="text-xs text-muted-foreground">
              키워드, 의미 검색
            </div>
          </div>
        </Link>

        <Link
          to="/ai"
          className={cn(
            'flex items-center gap-3 p-4 border border-border rounded-lg',
            'hover:border-primary/30 hover:bg-muted/30 transition-colors duration-200',
            'motion-reduce:transition-none'
          )}
        >
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <div className="font-semibold text-sm">AI 분석</div>
            <div className="text-xs text-muted-foreground">
              노트 요약, 인사이트
            </div>
          </div>
        </Link>

        <button
          onClick={() => triggerSync()}
          disabled={syncStatus === 'syncing'}
          className={cn(
            'flex items-center gap-3 p-4 border border-border rounded-lg',
            'hover:border-primary/30 hover:bg-muted/30 transition-colors duration-200',
            'motion-reduce:transition-none',
            'text-left',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <RefreshCw
            className={cn(
              'h-5 w-5 text-primary',
              syncStatus === 'syncing' && 'animate-spin'
            )}
            aria-hidden="true"
          />
          <div>
            <div className="font-semibold text-sm">NAS 동기화</div>
            <div className="text-xs text-muted-foreground">
              {syncStatus === 'syncing' ? '동기화 중...' : '노트 데이터 갱신'}
            </div>
          </div>
        </button>
      </div>

      {/* 최근 노트 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">최근 노트</h3>
          <Link to="/notes" className="text-sm text-primary hover:text-primary/80">
            전체 보기
          </Link>
        </div>
        {isLoading ? (
          <LoadingSpinner className="py-8" />
        ) : data?.items && data.items.length > 0 ? (
          <ul className="space-y-2" role="list">
            {data.items.map((note) => (
              <li key={note.note_id}>
                <Link
                  to={`/notes/${note.note_id}`}
                  className={cn(
                    'block p-4 border border-border rounded-lg',
                    'hover:border-primary/30 hover:bg-muted/30 transition-colors duration-200',
                    'motion-reduce:transition-none'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <FileText
                      className="h-5 w-5 mt-0.5 text-muted-foreground flex-shrink-0"
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {note.title}
                      </div>
                      {note.snippet && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {note.snippet}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        {note.notebook && (
                          <span className="flex items-center gap-1">
                            <Notebook className="h-3 w-3" aria-hidden="true" />
                            {note.notebook}
                          </span>
                        )}
                        {note.updated_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {new Date(note.updated_at).toLocaleDateString('ko-KR')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={FileText}
            title="노트가 없습니다"
            description="NAS와 동기화하여 노트를 불러오세요"
            action={{
              label: '동기화 시작',
              onClick: () => triggerSync(),
            }}
          />
        )}
      </div>
    </div>
  )
}
