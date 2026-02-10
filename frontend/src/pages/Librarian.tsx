import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { useSearch } from '@/hooks/useSearch'
import { useSearchIndex } from '@/hooks/useSearchIndex'
import { EmptyState } from '@/components/EmptyState'
import {
  BookOpenCheck,
  Search,
  FileText,
  AlertCircle,
  Loader2,
  Sparkles,
  Database,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const EXAMPLE_QUERIES = [
  'PCR 실험 프로토콜',
  '바이러스 검출 방법',
  '시퀀싱 데이터 분석',
  'DNA 추출 과정',
]

export default function Librarian() {
  const [searchParams, setSearchParams] = useSearchParams()
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
    if (query) params.q = query
    setSearchParams(params)
  }, [query, setSearchParams])

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
  const totalLoaded = allResults.length
  const indexPercent = totalNotes > 0 ? Math.round((indexedNotes / totalNotes) * 100) : 0
  const hasEmbeddings = indexedNotes > 0

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto">
      {/* Hero */}
      <div className="text-center pt-4">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <BookOpenCheck className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">AI 사서</h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          의미 기반으로 노트를 찾아드립니다. 자연어로 질문하세요.
        </p>

        {/* Index status */}
        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 text-xs text-muted-foreground">
          <Database className="h-3.5 w-3.5" />
          <span>
            {indexedNotes.toLocaleString()}/{totalNotes.toLocaleString()} 노트 색인 완료
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
              색인 시작
            </button>
          )}
          {isIndexing && (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          )}
        </div>
      </div>

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
            placeholder="어떤 내용을 찾고 계신가요?"
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
              검색
            </button>
          </div>
        </div>

        {/* Example chips */}
        {!query && (
          <div className="flex flex-wrap gap-2 mt-3 justify-center">
            {EXAMPLE_QUERIES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs',
                  'border border-border bg-card text-muted-foreground',
                  'hover:border-primary/30 hover:text-foreground transition-colors',
                )}
              >
                {example}
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
              <p className="font-medium text-amber-800">색인이 필요합니다</p>
              <p className="text-amber-700 mt-0.5">
                의미 검색을 사용하려면 먼저 노트 임베딩 색인이 필요합니다.
                설정에서 OpenAI API 키를 등록한 후 색인을 실행해주세요.
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!query && (
          <EmptyState
            icon={Search}
            title="자연어로 검색해보세요"
            description="키워드가 아닌 의미로 찾습니다. 예: '온도에 따른 효소 활성 변화'"
          />
        )}

        {/* Loading */}
        {isLoading && query && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">노트를 살펴보고 있습니다...</p>
          </div>
        )}

        {/* Error */}
        {isError && query && (
          <EmptyState
            icon={AlertCircle}
            title="검색 중 오류가 발생했습니다"
            description={error instanceof Error ? error.message : '알 수 없는 오류'}
          />
        )}

        {/* No results */}
        {data && allResults.length === 0 && !isLoading && (
          <EmptyState
            icon={FileText}
            title="관련 노트를 찾지 못했습니다"
            description="다른 표현으로 다시 검색해보세요"
          />
        )}

        {/* Results */}
        {allResults.length > 0 && (
          <div>
            <div className="text-sm text-muted-foreground mb-4">
              <Sparkles className="inline h-3.5 w-3.5 mr-1 text-primary" />
              <span className="font-medium text-foreground">{totalLoaded}</span>개의 관련 노트
              {hasNextPage && '+'}
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
                            관련도 {(result.score * 100).toFixed(0)}%
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
