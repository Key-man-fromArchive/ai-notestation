// @TASK P5-T5.3 - Search 페이지
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-페이지
// @TEST src/__tests__/Search.test.tsx

import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { useSearch } from '@/hooks/useSearch'
import { SearchBar } from '@/components/SearchBar'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { Search as SearchIcon, FileText, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type SearchType = 'hybrid' | 'fts' | 'semantic'

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [searchType, setSearchType] = useState<SearchType>(
    (searchParams.get('type') as SearchType) || 'hybrid'
  )

  const { data, isLoading, isError, error } = useSearch(query, searchType)

  // URL 동기화
  useEffect(() => {
    if (query) {
      setSearchParams({ q: query, type: searchType })
    } else {
      setSearchParams({})
    }
  }, [query, searchType, setSearchParams])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold mb-4">노트 검색</h2>

        {/* 검색 바 */}
        <SearchBar value={query} onChange={setQuery} />

        {/* 검색 유형 선택 */}
        <div className="flex gap-2 mt-4" role="radiogroup" aria-label="검색 유형">
          {(['hybrid', 'fts', 'semantic'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setSearchType(type)}
              role="radio"
              aria-checked={searchType === type}
              className={cn(
                'px-4 py-2 rounded-md text-sm transition-colors duration-200',
                'motion-reduce:transition-none',
                searchType === type
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {type === 'hybrid' && '하이브리드'}
              {type === 'fts' && '전문 검색'}
              {type === 'semantic' && '의미 검색'}
            </button>
          ))}
        </div>
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

        {/* 로딩 */}
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
        {data && data.results.length === 0 && (
          <EmptyState
            icon={FileText}
            title="결과가 없습니다"
            description={`"${query}"에 대한 검색 결과가 없습니다`}
          />
        )}

        {/* 검색 결과 */}
        {data && data.results.length > 0 && (
          <div>
            <div className="text-sm text-muted-foreground mb-4">
              총 <span className="font-medium text-foreground">{data.total}</span>개의 결과
            </div>

            <ul className="space-y-3" role="list">
              {data.results.map((result) => (
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
                          <span className="px-1.5 py-0.5 rounded bg-muted text-xs">
                            {result.search_type === 'fts' ? 'FTS' :
                             result.search_type === 'semantic' ? 'Semantic' : 'Hybrid'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
