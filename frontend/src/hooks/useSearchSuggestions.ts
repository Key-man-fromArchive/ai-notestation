import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useEffect, useState } from 'react'

interface SuggestionResponse {
  suggestions: string[]
  prefix: string
}

/**
 * 검색 자동완성 훅 (200ms debounce)
 * - prefix가 2자 이상일 때만 호출
 * - 최대 5개 제안
 */
export function useSearchSuggestions(prefix: string) {
  const [debouncedPrefix, setDebouncedPrefix] = useState(prefix)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPrefix(prefix)
    }, 200)

    return () => clearTimeout(timer)
  }, [prefix])

  return useQuery<SuggestionResponse>({
    queryKey: ['search-suggestions', debouncedPrefix],
    queryFn: async () => {
      const params = new URLSearchParams({
        prefix: debouncedPrefix,
        limit: '5',
      })
      return apiClient.get(`/search/suggestions?${params.toString()}`)
    },
    enabled: debouncedPrefix.length >= 2,
    staleTime: 30 * 1000, // 30초
  })
}
