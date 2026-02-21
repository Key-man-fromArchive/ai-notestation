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
  Lightbulb,
  RotateCw,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTimezone } from '@/hooks/useTimezone'
import { useTranslation } from 'react-i18next'
import { useRediscovery } from '@/hooks/useRediscovery'
import { useImageAnalysisStats } from '@/hooks/useImageAnalysisStats'
import { NotificationSection } from '@/components/dashboard/NotificationSection'

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
  const { t, i18n } = useTranslation()
  const { status: syncStatus, lastSync, error: syncError, triggerSync } = useSync()
  const timezone = useTimezone()
  const { data: rediscoveryData, refresh: refreshRediscovery } = useRediscovery()
  const { stats: imageStats } = useImageAnalysisStats()

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
    <div className="p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.welcome')}
        </p>
      </div>

      {/* NAS 연결 에러 배너 */}
      {syncStatus === 'error' && (
        <div
          className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg"
          role="alert"
        >
          <AlertCircle
            className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1">
            <h3 className="font-semibold text-destructive mb-1">
              {t('dashboard.syncFailed')}
            </h3>
            <p className="text-sm text-destructive/80 mb-2">
              {syncError?.includes('400')
                ? t('dashboard.syncErrorInvalidCredentials')
                : syncError?.includes('401')
                  ? t('dashboard.syncErrorDisabled')
                  : syncError?.includes('timeout') || syncError?.includes('connect')
                    ? t('dashboard.syncErrorConnection')
                    : syncError || t('dashboard.syncErrorUnknown')}
            </p>
            {syncError && (
              <p className="text-xs text-muted-foreground mb-2 font-mono">
                {syncError}
              </p>
            )}
            <Link
              to="/settings"
              className="inline-block px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm hover:bg-destructive/90 transition-colors"
            >
              {t('dashboard.goToSettings')}
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
              <div className="text-xs text-muted-foreground">{t('dashboard.totalNotes')}</div>
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
              <div className="text-xs text-muted-foreground">{t('dashboard.notebooks')}</div>
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
                {syncStatus === 'idle' && t('dashboard.syncIdle')}
                {syncStatus === 'syncing' && t('dashboard.syncing')}
                {syncStatus === 'completed' && t('dashboard.syncCompleted')}
                {syncStatus === 'error' && t('dashboard.syncError')}
              </div>
              <div className="text-xs text-muted-foreground">
                {lastSync
                  ? new Date(lastSync).toLocaleString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', { timeZone: timezone })
                  : t('dashboard.noSyncRecord')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 이미지 분석 현황 */}
      {imageStats && imageStats.total > 0 && (
        <div className="p-4 border border-border rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="font-semibold text-sm">{t('dashboard.imageAnalysis')}</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-lg font-bold">{imageStats.total}</div>
              <div className="text-xs text-muted-foreground">{t('dashboard.totalImages')}</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600 dark:text-green-400">{imageStats.ocr_done}</div>
              <div className="text-xs text-muted-foreground">OCR</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{imageStats.vision_done}</div>
              <div className="text-xs text-muted-foreground">Vision</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{imageStats.pending}</div>
              <div className="text-xs text-muted-foreground">OCR {t('dashboard.pendingAnalysis')}</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{imageStats.vision_pending}</div>
              <div className="text-xs text-muted-foreground">Vision {t('dashboard.pendingAnalysis')}</div>
            </div>
          </div>
          {imageStats.total > 0 && (
            <div className="mt-3">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-green-500 dark:bg-green-600 transition-all duration-300"
                  style={{ width: `${Math.round((imageStats.ocr_done / imageStats.total) * 100)}%` }}
                />
                <div
                  className="h-full bg-blue-500 dark:bg-blue-600 transition-all duration-300"
                  style={{ width: `${Math.round(((imageStats.vision_done - imageStats.ocr_done) / imageStats.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

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
            <div className="font-semibold text-sm">{t('dashboard.searchNotes')}</div>
            <div className="text-xs text-muted-foreground">
              {t('dashboard.searchDesc')}
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
            <div className="font-semibold text-sm">{t('dashboard.aiAnalysis')}</div>
            <div className="text-xs text-muted-foreground">
              {t('dashboard.aiAnalysisDesc')}
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
            <div className="font-semibold text-sm">{t('dashboard.nasSync')}</div>
            <div className="text-xs text-muted-foreground">
              {syncStatus === 'syncing' ? t('dashboard.syncingData') : t('dashboard.refreshData')}
            </div>
          </div>
        </button>
      </div>

      {/* 최근 노트 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{t('dashboard.recentNotes')}</h3>
          <Link to="/notes" className="text-sm text-primary hover:text-primary/80">
            {t('common.viewAll')}
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
                            {new Date(note.updated_at).toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', { timeZone: timezone })}
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
            title={t('dashboard.noNotes')}
            description={t('dashboard.noNotesDesc')}
            action={{
              label: t('dashboard.startSync'),
              onClick: () => triggerSync(),
            }}
          />
        )}
      </div>

      {/* 알림 */}
      <NotificationSection />

      {/* 오늘의 재발견 */}
      {rediscoveryData && rediscoveryData.items.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500 dark:text-amber-400" aria-hidden="true" />
              <h3 className="text-lg font-semibold">{t('dashboard.rediscoveryTitle')}</h3>
            </div>
            <button
              onClick={refreshRediscovery}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" />
              {t('dashboard.rediscoveryRefresh')}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {t('dashboard.rediscoveryDesc')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {rediscoveryData.items.map((item) => {
              const daysAgo = item.last_updated
                ? Math.floor((Date.now() - new Date(item.last_updated).getTime()) / (1000 * 60 * 60 * 24))
                : null
              const percent = Math.round(item.similarity * 100)

              return (
                <Link
                  key={item.note_id}
                  to={`/notes/${item.note_id}`}
                  className={cn(
                    'block p-4 border border-border rounded-lg',
                    'hover:border-amber-500/40 hover:bg-amber-50/30 dark:hover:bg-amber-900/20 transition-colors duration-200',
                    'motion-reduce:transition-none'
                  )}
                >
                  <div className="font-medium text-foreground truncate mb-1">
                    {item.title || t('common.noData')}
                  </div>
                  {item.snippet && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {item.snippet}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                      {t('dashboard.rediscoverySimilarity', { percent })}
                    </span>
                    {daysAgo !== null && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {t('dashboard.rediscoveryDaysAgo', { days: daysAgo })}
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
