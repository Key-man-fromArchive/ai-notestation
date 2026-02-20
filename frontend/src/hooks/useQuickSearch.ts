// @TASK v3.0.0-T3 - Command Palette Quick Search Hook
// @SPEC docs/roadmap/UI_UX_INNOVATION_ROADMAP.md#foundation-ux

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface QuickSearchItem {
  note_id: string
  title: string
  notebook: string | null
}

interface QuickSearchResponse {
  items: QuickSearchItem[]
}

/**
 * Quick search hook for command palette
 * - Searches note titles with ILIKE pattern matching
 * - Debounced by staleTime (30s)
 * - Only runs when query length >= 2
 */
export function useQuickSearch(query: string) {
  return useQuery({
    queryKey: ['quick-search', query],
    queryFn: async () => {
      const response = await apiClient.get<QuickSearchResponse>(
        `/notes/quick-search?q=${encodeURIComponent(query)}&limit=10`
      )
      return response
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
  })
}
