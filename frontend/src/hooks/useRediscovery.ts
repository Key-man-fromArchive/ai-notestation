import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

export interface RediscoveryItem {
  note_id: string
  title: string
  snippet: string
  similarity: number
  last_updated: string | null
  reason: string
}

interface RediscoveryResponse {
  items: RediscoveryItem[]
}

export function useRediscovery(limit = 5) {
  const queryClient = useQueryClient()

  const query = useQuery<RediscoveryResponse>({
    queryKey: ['rediscovery', limit],
    queryFn: () => apiClient.get(`/discovery/rediscovery?limit=${limit}`),
    staleTime: 5 * 60 * 1000, // 5 min
    retry: 1,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['rediscovery'] })
  }

  return { ...query, refresh }
}
