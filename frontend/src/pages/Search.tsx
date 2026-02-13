// @TASK P5-T5.3 - Search 페이지
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-페이지
// @TEST src/__tests__/Search.test.tsx

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import DOMPurify from 'dompurify'
import { useSearch } from '@/hooks/useSearch'
import { useNotebooks } from '@/hooks/useNotebooks'
import { SearchBar } from '@/components/SearchBar'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { useSearchIndex } from '@/hooks/useSearchIndex'
import { Search as SearchIcon, FileText, AlertCircle, Loader2, Filter, X, Sparkles, TextSearch, Calendar, Zap, Brain, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTimezone } from '@/hooks/useTimezone'

export default function Search() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [searchMode, setSearchMode] = useState<'search' | 'hybrid' | 'exact'>('search')
  const [showFilters, setShowFilters] = useState(false)
  const [notebook, setNotebook] = useState(searchParams.get('notebook') || '')
  const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') || '')
  const [dateTo, setDateTo] = useState(searchParams.get('date_to') || '')

  const filters = useMemo(() => ({
    notebook: notebook || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [notebook, dateFrom, dateTo])

  const activeFilterCount = [notebook, dateFrom, dateTo].filter(Boolean).length

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSearch(query, searchMode, filters)

  const {
    indexedNotes,
    pendingNotes,
    isIndexing,
    triggerIndex,
  } = useSearchIndex()

  const timezone = useTimezone()
  const hasEmbeddings = indexedNotes > 0

  // Notebooks for filter dropdown
  const { data: notebooksData } = useNotebooks()
  const notebooks = notebooksData?.items ?? []

  // Intersection Observer for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  )

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '200px',
    })
    observer.observe(sentinel)

    return () => observer.disconnect()
  }, [handleIntersect])

  // URL 동기화
  useEffect(() => {
    const params: Record<string, string> = {}
    if (query) {
      params.q = query
      if (notebook) params.notebook = notebook
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
    }
    setSearchParams(params)
  }, [query, notebook, dateFrom, dateTo, setSearchParams])

  const clearFilters = () => {
    setNotebook('')
    setDateFrom('')
    setDateTo('')
  }

  // Flatten all pages into a single results array
  const allResults = data?.pages.flatMap((page) => page.results) ?? []
  const totalCount = data?.pages[0]?.total ?? 0
  const judgeInfo = data?.pages[0]?.judge_info

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold mb-4">{t('search.title')}</h1>

        {/* 검색 바 */}
        <SearchBar value={query} onChange={setQuery} />

        {/* 검색 모드 + 필터 */}
        <div className="flex items-center gap-3 mt-4">
          {/* 모드 세그먼트 */}
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
            <button
              onClick={() => setSearchMode('exact')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                searchMode === 'exact'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <TextSearch className="h-3.5 w-3.5" />
              {t('search.fts')}
            </button>
            <button
              onClick={() => setSearchMode('search')}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                searchMode === 'search'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('search.fts')}
            </button>
            <button
              onClick={() => setSearchMode('hybrid')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                searchMode === 'hybrid'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('search.hybrid')}
            </button>
          </div>

          {/* 필터 버튼 */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm',
              'border border-border transition-colors',
              showFilters || activeFilterCount > 0
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'hover:bg-muted text-muted-foreground'
            )}
          >
            <Filter className="h-4 w-4" />
            {t('common.filter')}
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* 하이브리드 모드 임베딩 경고 */}
        {searchMode === 'hybrid' && !hasEmbeddings && (
          <div className="flex items-start gap-3 mt-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-amber-800">{t('settings.searchIndexing')}</p>
              <p className="text-amber-700 mt-0.5">
                {t('settings.searchIndexDesc')}
              </p>
            </div>
            {pendingNotes > 0 && !isIndexing && (
              <button
                onClick={() => triggerIndex()}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-md text-xs font-medium',
                  'bg-amber-600 text-white hover:bg-amber-700 transition-colors'
                )}
              >
                {t('settings.startIndex')}
              </button>
            )}
            {isIndexing && (
              <Loader2 className="h-4 w-4 animate-spin text-amber-600 shrink-0 mt-0.5" />
            )}
          </div>
        )}

        {/* 필터 패널 */}
        {showFilters && (
          <div className="mt-3 p-4 border border-border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">{t('common.filter')}</span>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  {t('common.clearFilter')}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 노트북 필터 */}
              <div>
                <label htmlFor="filter-notebook" className="block text-xs text-muted-foreground mb-1">
                  {t('notes.notebooks')}
                </label>
                <select
                  id="filter-notebook"
                  value={notebook}
                  onChange={(e) => setNotebook(e.target.value)}
                  className={cn(
                    'w-full px-3 py-1.5 text-sm rounded-md',
                    'border border-input bg-background',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                >
                  <option value="">{t('notes.allNotes')}</option>
                  {notebooks.map((nb) => (
                    <option key={nb.id} value={nb.name}>
                      {nb.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 시작 날짜 */}
              <div>
                <label htmlFor="filter-date-from" className="block text-xs text-muted-foreground mb-1">
                  {t('settings.lastSync')}
                </label>
                <input
                  id="filter-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={cn(
                    'w-full px-3 py-1.5 text-sm rounded-md',
                    'border border-input bg-background',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                />
              </div>

              {/* 종료 날짜 */}
              <div>
                <label htmlFor="filter-date-to" className="block text-xs text-muted-foreground mb-1">
                  {t('settings.lastSync')}
                </label>
                <input
                  id="filter-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={cn(
                    'w-full px-3 py-1.5 text-sm rounded-md',
                    'border border-input bg-background',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 결과 영역 */}
      <div>
        {/* 빈 검색 */}
        {!query && (
          <EmptyState
            icon={SearchIcon}
            title={t('search.placeholder')}
            description={t('dashboard.searchDesc')}
          />
        )}

        {/* 초기 로딩 */}
        {isLoading && query && <LoadingSpinner className="py-12" />}

        {/* 에러 */}
        {isError && query && (
          <EmptyState
            icon={AlertCircle}
            title={t('common.errorOccurred')}
            description={error instanceof Error ? error.message : t('common.unknownError')}
          />
        )}

        {/* 결과 없음 */}
        {data && allResults.length === 0 && (
          <EmptyState
            icon={FileText}
            title={t('search.noResults')}
            description={t('search.noResultsDesc')}
          />
        )}

        {/* 검색 결과 */}
        {allResults.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <span>{t('search.resultCount', { count: totalCount })}</span>
              {judgeInfo && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                    judgeInfo.strategy === 'fts_only' && 'bg-blue-100 text-blue-700',
                    judgeInfo.strategy === 'semantic_only' && 'bg-purple-100 text-purple-700',
                    judgeInfo.strategy === 'hybrid' && 'bg-emerald-100 text-emerald-700',
                  )}
                  title={judgeInfo.skip_reason || undefined}
                >
                  {judgeInfo.strategy === 'fts_only' && <Zap className="h-3 w-3" />}
                  {judgeInfo.strategy === 'semantic_only' && <Brain className="h-3 w-3" />}
                  {judgeInfo.strategy === 'hybrid' && <Layers className="h-3 w-3" />}
                  {t(`search.strategy_${judgeInfo.strategy}`)}
                </span>
              )}
            </div>

            <ul className="space-y-3" role="list">
              {allResults.map((result) => (
                <li key={result.note_id}>
                  <Link
                    to={`/notes/${result.note_id}`}
                    className={cn(
                      'block p-4 border border-border rounded-lg',
                      'hover:border-primary/30 hover:bg-muted/30 transition-colors duration-200',
                      'motion-reduce:transition-none'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-foreground mb-1 truncate">
                          {result.title}
                        </h3>
                        <p
                          className="text-sm text-muted-foreground line-clamp-2 [&_b]:font-semibold [&_b]:text-foreground"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(result.snippet, {
                              ALLOWED_TAGS: ['b'],
                            }),
                          }}
                        />
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <span
                              className={cn(
                                'inline-block h-1.5 w-1.5 rounded-full',
                                result.score >= 0.7 ? 'bg-green-500' :
                                result.score >= 0.4 ? 'bg-yellow-500' : 'bg-muted-foreground'
                              )}
                            />
                            {(result.score * 100).toFixed(0)}%
                          </span>
                          {result.match_explanation?.engines?.map((e) => (
                            <span
                              key={e.engine}
                              className={cn(
                                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                                e.engine === 'fts' && 'bg-blue-100 text-blue-700',
                                e.engine === 'semantic' && 'bg-purple-100 text-purple-700',
                                e.engine === 'trigram' && 'bg-amber-100 text-amber-700',
                              )}
                            >
                              {e.engine === 'fts' ? t('search.engineFts') :
                               e.engine === 'semantic' ? t('search.engineSemantic') :
                               t('search.engineTrigram')}
                              {' #'}{e.rank + 1}
                            </span>
                          ))}
                          {result.created_at && (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {t('notes.created')} {new Date(result.created_at).toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', { timeZone: timezone })}
                            </span>
                          )}
                          {result.updated_at && (
                            <span>
                              {new Date(result.updated_at).toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', { timeZone: timezone })}
                            </span>
                          )}
                        </div>
                        {result.match_explanation?.matched_terms && result.match_explanation.matched_terms.length > 0 && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            <span className="font-medium">{t('search.matchedTerms')}:</span>{' '}
                            {result.match_explanation.matched_terms.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="py-4 flex justify-center">
              {isFetchingNextPage && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
              {!hasNextPage && allResults.length > 0 && (
                <p className="text-sm text-muted-foreground">{t('search.results')}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
