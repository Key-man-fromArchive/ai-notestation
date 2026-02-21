// @TASK P5-T5.3 - 검색 데이터 페칭 훅
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#검색-훅
// @TEST src/__tests__/useSearch.test.ts

import { useInfiniteQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useEffect, useState } from 'react'

interface EngineContribution {
  engine: string
  rank: number
  raw_score: number
  rrf_score: number
}

interface MatchExplanation {
  engines: EngineContribution[]
  matched_terms: string[]
  combined_score: number
}

interface SearchResult {
  note_id: string
  title: string
  snippet: string
  score: number
  search_type: string
  created_at: string | null
  updated_at: string | null
  match_explanation?: MatchExplanation | null
}

interface JudgeInfo {
  strategy: string
  engines: string[]
  skip_reason: string | null
  confidence: number
  fts_result_count?: number
  fts_best_score?: number
  term_coverage?: number
}

interface SearchResponse {
  results: SearchResult[]
  query: string
  search_type: string
  total: number
  judge_info?: JudgeInfo | null
  search_event_id?: number | null
}

type SearchType = 'search' | 'semantic' | 'hybrid' | 'exact'

interface SearchFilters {
  notebook?: string
  dateFrom?: string
  dateTo?: string
}

const PAGE_SIZE = 20

/**
 * 검색 데이터 페칭 훅 (무한 스크롤)
 * - 300ms debounce 적용
 * - TanStack Query useInfiniteQuery로 페이지네이션
 * - 빈 검색어는 스킵
 * - 노트북/날짜 필터 지원
 */
export function useSearch(
  query: string,
  searchType: SearchType = 'search',
  filters: SearchFilters = {},
) {
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  // 300ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  return useInfiniteQuery<SearchResponse>({
    queryKey: ['search', debouncedQuery, searchType, filters.notebook, filters.dateFrom, filters.dateTo],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        q: debouncedQuery,
        type: searchType,
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
      })
      if (filters.notebook) {
        params.set('notebook', filters.notebook)
      }
      if (filters.dateFrom) {
        params.set('date_from', filters.dateFrom)
      }
      if (filters.dateTo) {
        params.set('date_to', filters.dateTo)
      }
      return apiClient.get(`/search?${params.toString()}`)
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // 마지막 페이지의 결과가 PAGE_SIZE 미만이면 더 이상 없음
      if (lastPage.results.length < PAGE_SIZE) return undefined
      // 다음 offset = 지금까지 로드한 총 결과 수
      const totalLoaded = allPages.reduce((sum, page) => sum + page.results.length, 0)
      return totalLoaded
    },
    enabled: debouncedQuery.length > 0,
    staleTime: 5 * 60 * 1000, // 5분
  })
}
