import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface IndexStatus {
  status: 'idle' | 'indexing' | 'completed' | 'error'
  total_notes: number
  indexed_notes: number
  pending_notes: number
  current_batch: number
  total_batches: number
  error_message: string | null
}

interface IndexTriggerResponse {
  message: string
  pending_notes: number
}

export function useSearchIndex() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<IndexStatus>({
    queryKey: ['search', 'index', 'status'],
    queryFn: () => apiClient.get('/search/index/status'),
    refetchInterval: query => {
      const data = query.state.data as IndexStatus | undefined
      return data?.status === 'indexing' ? 2000 : false
    },
  })

  const triggerMutation = useMutation<IndexTriggerResponse>({
    mutationFn: () => apiClient.post('/search/index', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search', 'index', 'status'] })
    },
  })

  const progress =
    data && data.total_batches > 0
      ? Math.round((data.current_batch / data.total_batches) * 100)
      : 0

  return {
    status: data?.status || 'idle',
    totalNotes: data?.total_notes ?? 0,
    indexedNotes: data?.indexed_notes ?? 0,
    pendingNotes: data?.pending_notes ?? 0,
    progress,
    error: data?.error_message,
    isLoading,
    triggerIndex: triggerMutation.mutateAsync,
    isIndexing: triggerMutation.isPending || data?.status === 'indexing',
  }
}
