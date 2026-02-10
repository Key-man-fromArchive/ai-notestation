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

type FilterType = 'all' | 'sync' | 'embedding' | 'image_sync' | 'nsx' | 'auth' | 'member' | 'oauth' | 'note' | 'notebook' | 'access' | 'share_link' | 'settings' | 'admin'

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
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {/* 전체 */}
            <div className="flex gap-1">
              <FilterButton label="전체" value="all" current={filter} onClick={setFilter} />
            </div>
            {/* 시스템 */}
            <div className="flex gap-1 items-center">
              <span className="text-xs text-muted-foreground mr-1">시스템</span>
              <FilterButton label="동기화" value="sync" current={filter} onClick={setFilter} />
              <FilterButton label="임베딩" value="embedding" current={filter} onClick={setFilter} />
              <FilterButton label="이미지" value="image_sync" current={filter} onClick={setFilter} />
              <FilterButton label="NSX" value="nsx" current={filter} onClick={setFilter} />
            </div>
            {/* 사용자 */}
            <div className="flex gap-1 items-center">
              <span className="text-xs text-muted-foreground mr-1">사용자</span>
              <FilterButton label="인증" value="auth" current={filter} onClick={setFilter} />
              <FilterButton label="멤버" value="member" current={filter} onClick={setFilter} />
              <FilterButton label="OAuth" value="oauth" current={filter} onClick={setFilter} />
            </div>
            {/* 콘텐츠 */}
            <div className="flex gap-1 items-center">
              <span className="text-xs text-muted-foreground mr-1">콘텐츠</span>
              <FilterButton label="노트" value="note" current={filter} onClick={setFilter} />
              <FilterButton label="노트북" value="notebook" current={filter} onClick={setFilter} />
              <FilterButton label="권한" value="access" current={filter} onClick={setFilter} />
              <FilterButton label="공유링크" value="share_link" current={filter} onClick={setFilter} />
            </div>
            {/* 관리 */}
            <div className="flex gap-1 items-center">
              <span className="text-xs text-muted-foreground mr-1">관리</span>
              <FilterButton label="설정" value="settings" current={filter} onClick={setFilter} />
              <FilterButton label="관리" value="admin" current={filter} onClick={setFilter} />
            </div>
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
                    <OperationBadge operation={item.operation} />
                    {item.message && (
                      <span className="text-sm text-foreground truncate">{item.message}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{new Date(item.created_at).toLocaleString('ko-KR')}</span>
                    {item.triggered_by && <span>by {item.triggered_by}</span>}
                    {item.details && item.status === 'completed' && (
                      <span className="text-foreground/60">
                        {item.operation === 'sync' && `+${(item.details as Record<string, number>).added ?? 0} / ~${(item.details as Record<string, number>).updated ?? 0} / -${(item.details as Record<string, number>).deleted ?? 0}`}
                        {item.operation === 'embedding' && `${(item.details as Record<string, number>).indexed ?? 0}개 인덱싱`}
                        {item.operation === 'nsx' && `${(item.details as Record<string, number>).notes ?? 0}개 노트`}
                        {item.operation === 'image_sync' && `${(item.details as Record<string, number>).images ?? 0}개 이미지`}
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

function FilterButton({ label, value, current, onClick }: { label: string; value: FilterType; current: FilterType; onClick: (v: FilterType) => void }) {
  return (
    <button
      onClick={() => onClick(value)}
      className={cn(
        'px-3 py-1.5 rounded-md text-xs transition-colors',
        current === value
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80',
      )}
    >
      {label}
    </button>
  )
}

const OPERATION_LABELS: Record<string, { label: string; color: string }> = {
  sync: { label: '동기화', color: 'bg-blue-100 text-blue-700' },
  embedding: { label: '임베딩', color: 'bg-purple-100 text-purple-700' },
  image_sync: { label: '이미지', color: 'bg-amber-100 text-amber-700' },
  nsx: { label: 'NSX', color: 'bg-indigo-100 text-indigo-700' },
  auth: { label: '인증', color: 'bg-green-100 text-green-700' },
  member: { label: '멤버', color: 'bg-teal-100 text-teal-700' },
  oauth: { label: 'OAuth', color: 'bg-cyan-100 text-cyan-700' },
  note: { label: '노트', color: 'bg-pink-100 text-pink-700' },
  notebook: { label: '노트북', color: 'bg-rose-100 text-rose-700' },
  access: { label: '권한', color: 'bg-violet-100 text-violet-700' },
  share_link: { label: '공유링크', color: 'bg-fuchsia-100 text-fuchsia-700' },
  settings: { label: '설정', color: 'bg-slate-100 text-slate-700' },
  admin: { label: '관리', color: 'bg-red-100 text-red-700' },
}

function OperationBadge({ operation }: { operation: string }) {
  const info = OPERATION_LABELS[operation] ?? { label: operation, color: 'bg-gray-100 text-gray-700' }
  return (
    <span className={cn('text-xs px-1.5 py-0.5 rounded', info.color)}>
      {info.label}
    </span>
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
