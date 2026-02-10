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
} from 'lucide-react'
import { cn } from '@/lib/utils'

type FilterType = 'all' | 'sync' | 'embedding' | 'image_sync'

export default function Operations() {
  const [filter, setFilter] = useState<FilterType>('all')

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
                        {item.operation === 'sync' && `+${(item.details as Record<string, number>).added} / ~${(item.details as Record<string, number>).updated} / -${(item.details as Record<string, number>).deleted}`}
                        {item.operation === 'embedding' && `${(item.details as Record<string, number>).indexed}개 인덱싱`}
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
