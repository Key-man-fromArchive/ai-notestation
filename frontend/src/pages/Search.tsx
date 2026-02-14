// @TASK P5-T5.3 - Search 페이지
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-페이지
// @TEST src/__tests__/Search.test.tsx

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import DOMPurify from 'dompurify'
import { useSearch } from '@/hooks/useSearch'
import { useNotebooks } from '@/hooks/useNotebooks'
import { useSearchRefine, type RefineResponse } from '@/hooks/useSearchRefine'
import { SearchBar } from '@/components/SearchBar'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { useSearchIndex } from '@/hooks/useSearchIndex'
import { Search as SearchIcon, FileText, AlertCircle, Loader2, Filter, X, Sparkles, TextSearch, Calendar, Zap, Brain, Layers, Wand2, ArrowRight, Expand, Target, Link2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTimezone } from '@/hooks/useTimezone'

const MAX_REFINE_TURNS = 4

interface RefineHistoryItem {
  query: string
  strategy: string
  reasoning: string
  resultCount: number
  turn: number
}

export default function Search() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [searchMode, setSearchMode] = useState<'search' | 'hybrid' | 'exact'>('search')
  const [showFilters, setShowFilters] = useState(false)
  const [notebook, setNotebook] = useState(searchParams.get('notebook') || '')
  const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') || '')
  const [dateTo, setDateTo] = useState(searchParams.get('date_to') || '')

  // Refine state
  const [refineFeedback, setRefineFeedback] = useState<string | null>(null)
  const [customFeedback, setCustomFeedback] = useState('')
  const [refineHistory, setRefineHistory] = useState<RefineHistoryItem[]>([])
  const [refinedResults, setRefinedResults] = useState<RefineResponse | null>(null)

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

  const refine = useSearchRefine()

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

  // Reset refine state when query changes
  useEffect(() => {
    setRefineHistory([])
    setRefinedResults(null)
    setRefineFeedback(null)
    setCustomFeedback('')
  }, [query])

  const clearFilters = () => {
    setNotebook('')
    setDateFrom('')
    setDateTo('')
  }

  // Flatten all pages into a single results array
  const allResults = data?.pages.flatMap((page) => page.results) ?? []
  const totalCount = data?.pages[0]?.total ?? 0
  const judgeInfo = data?.pages[0]?.judge_info

  const currentTurn = refineHistory.length + 1
  const canRefine = currentTurn <= MAX_REFINE_TURNS && allResults.length > 0

  const handleRefine = useCallback(() => {
    if (!canRefine) return

    const feedback = customFeedback.trim() || refineFeedback || undefined
    const currentQuery = refinedResults?.refined_query || query
    const resultsForContext = refinedResults?.results?.length
      ? refinedResults.results
      : allResults

    refine.mutate(
      {
        query: currentQuery,
        results: resultsForContext.slice(0, 10).map((r) => ({
          note_id: r.note_id,
          title: r.title,
          snippet: r.snippet,
        })),
        feedback: feedback,
        search_type: searchMode,
        turn: currentTurn,
      },
      {
        onSuccess: (data) => {
          setRefineHistory((prev) => [
            ...prev,
            {
              query: data.refined_query,
              strategy: data.strategy,
              reasoning: data.reasoning,
              resultCount: data.total,
              turn: currentTurn,
            },
          ])
          setRefinedResults(data)
          setRefineFeedback(null)
          setCustomFeedback('')
        },
      }
    )
  }, [canRefine, customFeedback, refineFeedback, refinedResults, query, allResults, refine, searchMode, currentTurn])

  const handleHistoryClick = useCallback((index: number) => {
    if (index === -1) {
      // Go back to original
      setRefineHistory([])
      setRefinedResults(null)
      return
    }
    // Truncate history to the clicked point
    setRefineHistory((prev) => prev.slice(0, index + 1))
    // We don't re-fetch here; just show the truncated history
  }, [])

  const strategyIcon = (strategy: string) => {
    switch (strategy) {
      case 'broaden': return <Expand className="h-3 w-3" />
      case 'narrow': return <Target className="h-3 w-3" />
      case 'related': return <Link2 className="h-3 w-3" />
      default: return <RotateCcw className="h-3 w-3" />
    }
  }

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
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium cursor-help',
                    judgeInfo.strategy === 'fts_only' && 'bg-blue-100 text-blue-700',
                    judgeInfo.strategy === 'hybrid' && 'bg-emerald-100 text-emerald-700',
                  )}
                  title={
                    judgeInfo.strategy === 'fts_only'
                      ? `FTS sufficient (${judgeInfo.fts_result_count ?? 0} results, avg score ${(judgeInfo.fts_avg_score ?? 0).toFixed(2)}, coverage ${((judgeInfo.term_coverage ?? 0) * 100).toFixed(0)}%)`
                      : judgeInfo.strategy === 'hybrid'
                      ? `FTS insufficient (${judgeInfo.fts_result_count ?? 0} results, avg score ${(judgeInfo.fts_avg_score ?? 0).toFixed(2)}) → Semantic boost`
                      : judgeInfo.skip_reason || undefined
                  }
                >
                  {judgeInfo.strategy === 'fts_only' && <Zap className="h-3 w-3" />}
                  {judgeInfo.strategy === 'hybrid' && <Layers className="h-3 w-3" />}
                  {t(`search.strategy_${judgeInfo.strategy}`)}
                  <span className="ml-0.5 opacity-80">{(judgeInfo.confidence * 100).toFixed(0)}</span>
                </span>
              )}
            </div>

            {/* 리파인 히스토리 */}
            {refineHistory.length > 0 && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-xs text-muted-foreground">{t('search.refineHistory')}:</span>
                <button
                  onClick={() => handleHistoryClick(-1)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs',
                    'border border-border hover:bg-muted transition-colors',
                    !refinedResults && 'bg-primary/10 border-primary/30 text-primary'
                  )}
                >
                  {t('search.refineOriginal')}
                </button>
                {refineHistory.map((item, idx) => (
                  <span key={idx} className="contents">
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <button
                      onClick={() => handleHistoryClick(idx)}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs',
                        'border border-border hover:bg-muted transition-colors',
                        idx === refineHistory.length - 1 && refinedResults && 'bg-primary/10 border-primary/30 text-primary'
                      )}
                      title={item.reasoning}
                    >
                      {strategyIcon(item.strategy)}
                      <span className="max-w-[120px] truncate">{item.query}</span>
                      <span className="text-muted-foreground">({item.resultCount})</span>
                    </button>
                  </span>
                ))}
              </div>
            )}

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

            {/* AI 추천 결과 */}
            {refinedResults && refinedResults.results.length > 0 && (
              <div className="mt-2 pt-4 border-t border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Wand2 className="h-4 w-4 text-violet-600" />
                  <h3 className="text-sm font-semibold text-violet-700">{t('search.refinedResults')}</h3>
                  <span className="text-xs text-muted-foreground">
                    {t('search.refineNewResults', { count: refinedResults.results.length })}
                  </span>
                </div>
                <div className="mb-3 p-2.5 rounded-md bg-violet-50 border border-violet-200 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-violet-700">{t('search.refinedQuery')}:</span>
                    <span className="text-violet-900">{refinedResults.refined_query}</span>
                    <span className={cn(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                      'bg-violet-100 text-violet-700'
                    )}>
                      {strategyIcon(refinedResults.strategy)}
                      {t(`search.refineStrategy_${refinedResults.strategy}`)}
                    </span>
                  </div>
                  <div className="mt-1 text-violet-600">
                    <span className="font-medium">{t('search.refineReasoning')}:</span> {refinedResults.reasoning}
                  </div>
                </div>
                <ul className="space-y-3" role="list">
                  {refinedResults.results.map((result) => (
                    <li key={result.note_id}>
                      <Link
                        to={`/notes/${result.note_id}`}
                        className={cn(
                          'block p-4 border border-violet-200 rounded-lg',
                          'hover:border-violet-300 hover:bg-violet-50/50 transition-colors duration-200',
                          'motion-reduce:transition-none'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <FileText className="h-5 w-5 mt-0.5 shrink-0 text-violet-400" aria-hidden="true" />
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
                              {result.created_at && (
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(result.created_at).toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', { timeZone: timezone })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* AI로 더 찾기 섹션 */}
            {canRefine && (
              <div className="mt-6 p-4 border border-dashed border-violet-300 rounded-lg bg-violet-50/50">
                <div className="flex items-center gap-2 mb-3">
                  <Wand2 className="h-4 w-4 text-violet-600" />
                  <span className="text-sm font-semibold text-violet-700">
                    {t('search.refineTitle')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({currentTurn}/{MAX_REFINE_TURNS})
                  </span>
                </div>

                {/* 퀵 피드백 버튼 */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <button
                    onClick={() => setRefineFeedback(refineFeedback === 'broaden' ? null : 'broaden')}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      'border',
                      refineFeedback === 'broaden'
                        ? 'bg-violet-100 border-violet-300 text-violet-700'
                        : 'border-border hover:bg-muted text-muted-foreground'
                    )}
                  >
                    <Expand className="h-3 w-3" />
                    {t('search.refineBroaden')}
                  </button>
                  <button
                    onClick={() => setRefineFeedback(refineFeedback === 'narrow' ? null : 'narrow')}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      'border',
                      refineFeedback === 'narrow'
                        ? 'bg-violet-100 border-violet-300 text-violet-700'
                        : 'border-border hover:bg-muted text-muted-foreground'
                    )}
                  >
                    <Target className="h-3 w-3" />
                    {t('search.refineNarrow')}
                  </button>
                  <button
                    onClick={() => setRefineFeedback(refineFeedback === 'related' ? null : 'related')}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      'border',
                      refineFeedback === 'related'
                        ? 'bg-violet-100 border-violet-300 text-violet-700'
                        : 'border-border hover:bg-muted text-muted-foreground'
                    )}
                  >
                    <Link2 className="h-3 w-3" />
                    {t('search.refineRelated')}
                  </button>
                </div>

                {/* 자유 텍스트 입력 + 실행 버튼 */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customFeedback}
                    onChange={(e) => setCustomFeedback(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                    placeholder={t('search.refineFeedbackPlaceholder')}
                    className={cn(
                      'flex-1 px-3 py-2 text-sm rounded-md',
                      'border border-input bg-background',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
                      'placeholder:text-muted-foreground'
                    )}
                  />
                  <button
                    onClick={handleRefine}
                    disabled={refine.isPending}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium',
                      'bg-violet-600 text-white hover:bg-violet-700 transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    {refine.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('search.refining')}
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        {t('search.refineButton')}
                      </>
                    )}
                  </button>
                </div>

                {/* 에러 표시 */}
                {refine.isError && (
                  <p className="mt-2 text-xs text-red-600">
                    {refine.error instanceof Error ? refine.error.message : t('common.unknownError')}
                  </p>
                )}
              </div>
            )}

            {/* 최대 턴 도달 */}
            {!canRefine && refineHistory.length >= MAX_REFINE_TURNS && (
              <p className="mt-4 text-xs text-center text-muted-foreground">
                {t('search.refineTurnLimit')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
