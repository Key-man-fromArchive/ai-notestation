// @TASK P5-T5.3 - Search 페이지
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-페이지
// @TEST src/__tests__/Search.test.tsx

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { useSearch } from '@/hooks/useSearch'
import { useNotebooks } from '@/hooks/useNotebooks'
import { SearchBar } from '@/components/SearchBar'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { Search as SearchIcon, FileText, AlertCircle, Loader2, Filter, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
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
  } = useSearch(query, 'search', filters)

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
  const totalLoaded = allResults.length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold mb-4">노트 검색</h1>

        {/* 검색 바 */}
        <SearchBar value={query} onChange={setQuery} />

        {/* 필터 토글 */}
        <div className="flex items-center gap-2 mt-4">
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
            필터
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* 필터 패널 */}
        {showFilters && (
          <div className="mt-3 p-4 border border-border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">검색 필터</span>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  초기화
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 노트북 필터 */}
              <div>
                <label htmlFor="filter-notebook" className="block text-xs text-muted-foreground mb-1">
                  노트북
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
                  <option value="">전체 노트북</option>
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
                  시작일
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
                  종료일
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
            title="검색어를 입력하세요"
            description="노트 제목, 내용, 태그를 검색할 수 있습니다"
          />
        )}

        {/* 초기 로딩 */}
        {isLoading && query && <LoadingSpinner className="py-12" />}

        {/* 에러 */}
        {isError && query && (
          <EmptyState
            icon={AlertCircle}
            title="검색 중 오류가 발생했습니다"
            description={error instanceof Error ? error.message : '알 수 없는 오류'}
          />
        )}

        {/* 결과 없음 */}
        {data && allResults.length === 0 && (
          <EmptyState
            icon={FileText}
            title="결과가 없습니다"
            description={`"${query}"에 대한 검색 결과가 없습니다`}
          />
        )}

        {/* 검색 결과 */}
        {allResults.length > 0 && (
          <div>
            <div className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{totalLoaded}</span>개의 결과
              {hasNextPage && '+'}
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
                        </div>
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
              {!hasNextPage && totalLoaded > 0 && (
                <p className="text-sm text-muted-foreground">모든 결과를 불러왔습니다</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
