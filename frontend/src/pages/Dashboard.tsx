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
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Note {
  id: string
  title: string
  updated_at: string
}

interface NotesResponse {
  notes: Note[]
  total: number
}

export default function Dashboard() {
  const { status: syncStatus, lastSync, error: syncError, triggerSync } = useSync()

  const { data, isLoading } = useQuery<NotesResponse>({
    queryKey: ['notes', 'recent'],
    queryFn: () => apiClient.get('/notes?limit=5&sort=updated_at'),
  })

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

      {/* 빠른 액션 */}
      <div>
        <h3 className="text-lg font-semibold mb-3">빠른 액션</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/search"
            className={cn(
              'flex items-center gap-3 p-4 border border-input rounded-md',
              'hover:bg-muted/50 transition-colors duration-200',
              'motion-reduce:transition-none'
            )}
          >
            <Search className="h-6 w-6 text-primary" aria-hidden="true" />
            <div>
              <div className="font-semibold">검색</div>
              <div className="text-sm text-muted-foreground">
                노트 검색하기
              </div>
            </div>
          </Link>

          <Link
            to="/ai"
            className={cn(
              'flex items-center gap-3 p-4 border border-input rounded-md',
              'hover:bg-muted/50 transition-colors duration-200',
              'motion-reduce:transition-none'
            )}
          >
            <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
            <div>
              <div className="font-semibold">AI 작업</div>
              <div className="text-sm text-muted-foreground">
                AI로 노트 분석
              </div>
            </div>
          </Link>

          <button
            onClick={() => triggerSync()}
            disabled={syncStatus === 'syncing'}
            className={cn(
              'flex items-center gap-3 p-4 border border-input rounded-md',
              'hover:bg-muted/50 transition-colors duration-200',
              'motion-reduce:transition-none',
              'text-left',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <RefreshCw
              className={cn(
                'h-6 w-6 text-primary',
                syncStatus === 'syncing' && 'animate-spin'
              )}
              aria-hidden="true"
            />
            <div>
              <div className="font-semibold">동기화</div>
              <div className="text-sm text-muted-foreground">
                {syncStatus === 'syncing' ? '동기화 중...' : 'NAS와 동기화'}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* 동기화 상태 */}
      <div className="p-4 border border-input rounded-md">
        <h3 className="text-lg font-semibold mb-3">동기화 상태</h3>
        <div className="flex items-center gap-2 mb-2">
          <div
            className={cn(
              'h-3 w-3 rounded-full',
              syncStatus === 'idle' && 'bg-green-500',
              syncStatus === 'syncing' && 'bg-yellow-500 animate-pulse',
              syncStatus === 'completed' && 'bg-green-500',
              syncStatus === 'error' && 'bg-red-500'
            )}
            aria-hidden="true"
          />
          <span className="text-sm font-medium">
            {syncStatus === 'idle' && '대기 중'}
            {syncStatus === 'syncing' && '동기화 중'}
            {syncStatus === 'completed' && '완료'}
            {syncStatus === 'error' && '오류'}
          </span>
        </div>
        {lastSync && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden="true" />
            마지막 동기화: {new Date(lastSync).toLocaleString('ko-KR')}
          </div>
        )}
      </div>

      {/* 최근 노트 */}
      <div>
        <h3 className="text-lg font-semibold mb-3">최근 노트</h3>
        {isLoading ? (
          <LoadingSpinner className="py-8" />
        ) : data && data.notes.length > 0 ? (
          <ul className="space-y-2" role="list">
            {data.notes.map((note) => (
              <li key={note.id}>
                <Link
                  to={`/notes/${note.id}`}
                  className={cn(
                    'flex items-center gap-3 p-3 border border-input rounded-md',
                    'hover:bg-muted/50 transition-colors duration-200',
                    'motion-reduce:transition-none'
                  )}
                >
                  <FileText
                    className="h-5 w-5 text-muted-foreground flex-shrink-0"
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {note.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(note.updated_at).toLocaleString('ko-KR')}
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
