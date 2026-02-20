import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import DOMPurify from 'dompurify'
import { useSearch } from '@/hooks/useSearch'
import { useSearchIndex } from '@/hooks/useSearchIndex'
import { EmptyState } from '@/components/EmptyState'
import { InsightHistory } from '@/components/InsightHistory'
import { Breadcrumb } from '@/components/Breadcrumb'
import {
  BookOpenCheck,
  Search,
  FileText,
  AlertCircle,
  Loader2,
  Sparkles,
  Database,
  Brain,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const EXAMPLE_QUERY_KEYS = [
  'exampleQuery1',
  'exampleQuery2',
  'exampleQuery3',
  'exampleQuery4',
] as const

export default function Librarian() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') || 'search') as 'search' | 'history'
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSearch(query, 'semantic')

  const {
    totalNotes,
    indexedNotes,
    pendingNotes,
    isIndexing,
    triggerIndex,
  } = useSearchIndex()

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
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: '200px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleIntersect])

  // URL sync
  useEffect(() => {
    const params: Record<string, string> = {}
    if (activeTab !== 'search') params.tab = activeTab
    if (query && activeTab === 'search') params.q = query
    setSearchParams(params, { replace: true })
  }, [query, activeTab, setSearchParams])

  const setTab = (tab: 'search' | 'history') => {
    const params: Record<string, string> = {}
    if (tab !== 'search') params.tab = tab
    if (query && tab === 'search') params.q = query
    setSearchParams(params)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      inputRef.current?.blur()
    }
  }

  const allResults = data?.pages.flatMap((page) => page.results) ?? []
  const totalCount = data?.pages[0]?.total ?? 0
  const indexPercent = totalNotes > 0 ? Math.round((indexedNotes / totalNotes) * 100) : 0
  const hasEmbeddings = indexedNotes > 0

  return (
    <div className="p-6 flex flex-col gap-8 max-w-3xl mx-auto">
      <Breadcrumb items={[
        { label: t('sidebar.dashboard'), to: '/' },
        { label: t('librarian.title') }
      ]} />
      {/* Hero */}
      <div className="text-center pt-4">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <BookOpenCheck className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">{t('librarian.title')}</h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {t('librarian.subtitle')}
        </p>

        {/* Index status */}
        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 text-xs text-muted-foreground">
          <Database className="h-3.5 w-3.5" />
          <span>
            {indexedNotes.toLocaleString()}/{totalNotes.toLocaleString()} {t('settings.indexed')}
          </span>
          {totalNotes > 0 && (
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/60 transition-all duration-500"
                style={{ width: `${indexPercent}%` }}
              />
            </div>
          )}
          {pendingNotes > 0 && !isIndexing && (
            <button
              onClick={() => triggerIndex()}
              className="ml-1 text-primary hover:text-primary/80 font-medium"
            >
              {t('settings.startIndex')}
            </button>
          )}
          {isIndexing && (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex justify-center gap-1 p-1 rounded-lg bg-muted/50 w-fit mx-auto">
        <button
          onClick={() => setTab('search')}
          className={cn(
            'inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'search'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Search className="h-3.5 w-3.5" />
          {t('librarian.search')}
        </button>
        <button
          onClick={() => setTab('history')}
          className={cn(
            'inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'history'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Brain className="h-3.5 w-3.5" />
          {t('librarian.history')}
        </button>
      </div>

      {/* History tab */}
      {activeTab === 'history' && <InsightHistory />}

      {/* Search tab */}
      {activeTab === 'search' && <>

      {/* Search input */}
      <form onSubmit={handleSubmit} className="relative">
        <div className={cn(
          'relative rounded-xl border-2 transition-colors duration-200',
          'focus-within:border-primary/40 border-border',
          'bg-card shadow-sm',
        )}>
          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('librarian.askPlaceholder')}
            rows={2}
            className={cn(
              'w-full resize-none rounded-xl px-4 pt-4 pb-12 text-sm',
              'bg-transparent border-none outline-none',
              'placeholder:text-muted-foreground/60',
            )}
          />
          <div className="absolute bottom-3 right-3">
            <button
              type="submit"
              disabled={!query.trim()}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                'transition-colors duration-150',
                query.trim()
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('common.search')}
            </button>
          </div>
        </div>

        {/* Example chips */}
        {!query && (
          <div className="flex flex-wrap gap-2 mt-3 justify-center">
            {EXAMPLE_QUERY_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setQuery(t(`librarian.${key}`))}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs',
                  'border border-border bg-card text-muted-foreground',
                  'hover:border-primary/30 hover:text-foreground transition-colors',
                )}
              >
                {t(`librarian.${key}`)}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Results area */}
      <div>
        {/* No embeddings warning */}
        {!hasEmbeddings && query && !isLoading && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">{t('settings.searchIndexing')}</p>
              <p className="text-amber-700 mt-0.5">
                {t('settings.searchIndexDesc')}
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!query && (
          <EmptyState
            icon={Search}
            title={t('librarian.noConversation')}
            description={t('librarian.noConversationDesc')}
          />
        )}

        {/* Loading */}
        {isLoading && query && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t('librarian.thinking')}</p>
          </div>
        )}

        {/* Error */}
        {isError && query && (
          <EmptyState
            icon={AlertCircle}
            title={t('common.errorOccurred')}
            description={error instanceof Error ? error.message : t('common.unknownError')}
          />
        )}

        {/* No results */}
        {data && allResults.length === 0 && !isLoading && (
          <EmptyState
            icon={FileText}
            title={t('search.noResults')}
            description={t('search.noResultsDesc')}
          />
        )}

        {/* Results */}
        {allResults.length > 0 && (
          <div>
            <div className="text-sm text-muted-foreground mb-4">
              <Sparkles className="inline h-3.5 w-3.5 mr-1 text-primary" />
              {t('search.resultCount', { count: totalCount })}
            </div>

            <ul className="space-y-3" role="list">
              {allResults.map((result) => (
                <li key={result.note_id}>
                  <Link
                    to={`/notes/${result.note_id}`}
                    className={cn(
                      'block p-4 border border-border rounded-xl',
                      'hover:border-primary/30 hover:bg-muted/30 transition-colors duration-200',
                      'motion-reduce:transition-none',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
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
                        <div className="flex items-center gap-2 mt-2">
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xs',
                            result.score >= 0.7 ? 'text-green-600' :
                            result.score >= 0.4 ? 'text-amber-600' : 'text-muted-foreground',
                          )}>
                            <span className={cn(
                              'inline-block h-1.5 w-1.5 rounded-full',
                              result.score >= 0.7 ? 'bg-green-500' :
                              result.score >= 0.4 ? 'bg-amber-500' : 'bg-muted-foreground',
                            )} />
                            {t('search.relevance')} {(result.score * 100).toFixed(0)}%
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
              {!hasNextPage && allResults.length > 0 && (
                <p className="text-sm text-muted-foreground">{t('search.results')}</p>
              )}
            </div>
          </div>
        )}
      </div>

      </>}
    </div>
  )
}
