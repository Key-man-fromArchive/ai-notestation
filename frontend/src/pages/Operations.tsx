import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { useTimezone } from '@/hooks/useTimezone'

type FilterType = 'all' | 'sync' | 'embedding' | 'image_sync' | 'nsx' | 'auth' | 'member' | 'oauth' | 'note' | 'notebook' | 'access' | 'share_link' | 'settings' | 'admin'

export default function Operations() {
  const { t, i18n } = useTranslation()
  const [filter, setFilter] = useState<FilterType>('all')
  const timezone = useTimezone()

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
    <div className="p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">{t('operations.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('operations.systemHealth')}
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
              <h3 className="font-semibold">{t('dashboard.nasSync')}</h3>
            </div>
            <StatusBadge status={syncStatus} />
          </div>
          <div className="space-y-1 text-sm text-muted-foreground mb-3">
            {notesSynced != null && (
              <p>{t('operations.notesCreated')}: <span className="text-foreground font-medium">{notesSynced.toLocaleString()}</span></p>
            )}
            {lastSync && (
              <p>{t('operations.lastSync')}: {new Date(lastSync).toLocaleString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', { timeZone: timezone })}</p>
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
            {syncStatus === 'syncing' ? t('dashboard.syncing') : t('dashboard.startSync')}
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
              <h3 className="font-semibold">{t('settings.searchIndexing')}</h3>
            </div>
            <StatusBadge status={indexStatus} />
          </div>
          <div className="space-y-1 text-sm text-muted-foreground mb-3">
            <p>
              {t('settings.indexed')}:{' '}
              <span className="text-foreground font-medium">
                {indexedNotes.toLocaleString()} / {totalNotes.toLocaleString()}
              </span>{' '}
              ({indexPercentage}%)
            </p>
            {pendingNotes > 0 && (
              <p>{t('settings.pendingIndex')}: <span className="text-amber-600 font-medium">{pendingNotes.toLocaleString()}</span></p>
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
            {isIndexing ? t('settings.indexing') : pendingNotes === 0 ? t('settings.allIndexed') : t('settings.startIndex')}
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
              <h3 className="font-semibold">{t('search.title')}</h3>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground mb-3">
            <p>{t('search.fts')}: <span className="text-green-600 font-medium">{t('admin.available')}</span></p>
            <p>
              {t('search.semantic')}:{' '}
              <span className={cn('font-medium', indexPercentage === 100 ? 'text-green-600' : 'text-amber-600')}>
                {indexPercentage === 100 ? t('admin.available') : `${indexPercentage}%`}
              </span>
            </p>
            <p>{t('search.hybrid')}: <span className={cn('font-medium', indexPercentage > 0 ? 'text-green-600' : 'text-amber-600')}>
              {indexPercentage > 0 ? t('admin.available') : t('settings.pendingIndex')}
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
              {indexPercentage}%
            </p>
          </div>
        </div>
      </div>

      {/* Activity Log Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('operations.activityLog')}</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {/* 전체 */}
            <div className="flex gap-1">
              <FilterButton label={t('common.viewAll')} value="all" current={filter} onClick={setFilter} />
            </div>
            {/* 시스템 */}
            <div className="flex gap-1 items-center">
              <span className="text-xs text-muted-foreground mr-1">{t('operations.categorySystem')}</span>
              <FilterButton label={t('operations.categorySync')} value="sync" current={filter} onClick={setFilter} />
              <FilterButton label={t('operations.categoryEmbedding')} value="embedding" current={filter} onClick={setFilter} />
              <FilterButton label={t('operations.categoryImage')} value="image_sync" current={filter} onClick={setFilter} />
              <FilterButton label="NSX" value="nsx" current={filter} onClick={setFilter} />
            </div>
            {/* 사용자 */}
            <div className="flex gap-1 items-center">
              <span className="text-xs text-muted-foreground mr-1">{t('operations.categoryUser')}</span>
              <FilterButton label={t('operations.categoryAuth')} value="auth" current={filter} onClick={setFilter} />
              <FilterButton label={t('operations.categoryMember')} value="member" current={filter} onClick={setFilter} />
              <FilterButton label="OAuth" value="oauth" current={filter} onClick={setFilter} />
            </div>
            {/* 콘텐츠 */}
            <div className="flex gap-1 items-center">
              <span className="text-xs text-muted-foreground mr-1">{t('operations.categoryContent')}</span>
              <FilterButton label={t('operations.categoryNote')} value="note" current={filter} onClick={setFilter} />
              <FilterButton label={t('operations.categoryNotebook')} value="notebook" current={filter} onClick={setFilter} />
              <FilterButton label={t('operations.categoryAccess')} value="access" current={filter} onClick={setFilter} />
              <FilterButton label={t('operations.categoryShareLink')} value="share_link" current={filter} onClick={setFilter} />
            </div>
            {/* 관리 */}
            <div className="flex gap-1 items-center">
              <span className="text-xs text-muted-foreground mr-1">{t('operations.categoryManagement')}</span>
              <FilterButton label={t('operations.categorySettings')} value="settings" current={filter} onClick={setFilter} />
              <FilterButton label={t('admin.title')} value="admin" current={filter} onClick={setFilter} />
            </div>
          </div>
        </div>

        {logLoading && <LoadingSpinner className="py-8" />}

        {!logLoading && (!logData?.items || logData.items.length === 0) && (
          <EmptyState
            icon={Clock}
            title={t('operations.noActivity')}
            description=""
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
                    <span>{new Date(item.created_at).toLocaleString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', { timeZone: timezone })}</span>
                    {item.triggered_by && <span>by {item.triggered_by}</span>}
                    {item.details && item.status === 'completed' && (
                      <span className="text-foreground/60">
                        {item.operation === 'sync' && `+${(item.details as Record<string, number>).added ?? 0} / ~${(item.details as Record<string, number>).updated ?? 0} / -${(item.details as Record<string, number>).deleted ?? 0}`}
                        {item.operation === 'embedding' && t('operations.indexedCount', { count: (item.details as Record<string, number>).indexed ?? 0 })}
                        {item.operation === 'nsx' && t('operations.notesCount', { count: (item.details as Record<string, number>).notes ?? 0 })}
                        {item.operation === 'image_sync' && t('operations.imagesCount', { count: (item.details as Record<string, number>).images ?? 0 })}
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

function OperationBadge({ operation }: { operation: string }) {
  const { t } = useTranslation()
  const OPERATION_LABELS: Record<string, { labelKey: string; color: string }> = {
    sync: { labelKey: 'operations.syncHistory', color: 'bg-blue-100 text-blue-700' },
    embedding: { labelKey: 'admin.embeddingCount', color: 'bg-purple-100 text-purple-700' },
    image_sync: { labelKey: 'settings.imageSync', color: 'bg-amber-100 text-amber-700' },
    nsx: { labelKey: 'settings.nsxImport', color: 'bg-indigo-100 text-indigo-700' },
    auth: { labelKey: 'auth.login', color: 'bg-green-100 text-green-700' },
    member: { labelKey: 'members.title', color: 'bg-teal-100 text-teal-700' },
    oauth: { labelKey: 'settings.oauth', color: 'bg-cyan-100 text-cyan-700' },
    note: { labelKey: 'notes.title', color: 'bg-pink-100 text-pink-700' },
    notebook: { labelKey: 'notebooks.title', color: 'bg-rose-100 text-rose-700' },
    access: { labelKey: 'notebooks.accessPermissions', color: 'bg-violet-100 text-violet-700' },
    share_link: { labelKey: 'sharing.publicLink', color: 'bg-fuchsia-100 text-fuchsia-700' },
    settings: { labelKey: 'settings.title', color: 'bg-slate-100 text-slate-700' },
    admin: { labelKey: 'admin.title', color: 'bg-red-100 text-red-700' },
  }
  const info = OPERATION_LABELS[operation] ?? { labelKey: operation, color: 'bg-gray-100 text-gray-700' }
  return (
    <span className={cn('text-xs px-1.5 py-0.5 rounded', info.color)}>
      {t(info.labelKey)}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
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
      {status === 'idle' && t('dashboard.syncIdle')}
      {(status === 'syncing' || status === 'indexing') && t('settings.inProgress')}
      {status === 'completed' && t('notes.done')}
      {status === 'error' && t('dashboard.syncError')}
    </span>
  )
}
