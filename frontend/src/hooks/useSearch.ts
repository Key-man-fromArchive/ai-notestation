// @TASK P5-T5.3 - 검색 데이터 페칭 훅
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#검색-훅
// @TEST src/__tests__/useSearch.test.ts

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useEffect, useState } from 'react'

interface SearchResult {
  note_id: string
  title: string
  snippet: string
  score: number
  search_type: string
}

interface SearchResponse {
  results: SearchResult[]
  query: string
  search_type: string
  total: number
}

type SearchType = 'hybrid' | 'fts' | 'semantic'

/**
 * 검색 데이터 페칭 훅
 * - 300ms debounce 적용
 * - TanStack Query로 캐싱
 * - 빈 검색어는 스킵
 */
export function useSearch(query: string, searchType: SearchType = 'hybrid') {
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  // 300ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  return useQuery<SearchResponse>({
    queryKey: ['search', debouncedQuery, searchType],
    queryFn: async () => {
      const params = new URLSearchParams({
        q: debouncedQuery,
        type: searchType,
        limit: '20',
      })
      return apiClient.get(`/search?${params.toString()}`)
    },
    enabled: debouncedQuery.length > 0,
    staleTime: 5 * 60 * 1000, // 5분
  })
}
