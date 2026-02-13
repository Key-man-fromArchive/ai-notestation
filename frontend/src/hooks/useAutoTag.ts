import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface TaggingStatus {
  status: 'idle' | 'tagging' | 'completed' | 'error'
  total: number
  tagged: number
  failed: number
  error_message: string | null
}

interface TaggingTriggerResponse {
  status: string
  message: string
}

interface LocalTagItem {
  name: string
  count: number
}

export function useAutoTag() {
  const queryClient = useQueryClient()

  const { data } = useQuery<TaggingStatus>({
    queryKey: ['notes', 'batch-auto-tag', 'status'],
    queryFn: () => apiClient.get('/notes/batch-auto-tag/status'),
    refetchInterval: query => {
      const data = query.state.data as TaggingStatus | undefined
      return data?.status === 'tagging' ? 2000 : false
    },
  })

  const triggerMutation = useMutation<TaggingTriggerResponse>({
    mutationFn: () => apiClient.post('/notes/batch-auto-tag', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', 'batch-auto-tag', 'status'] })
    },
  })

  return {
    status: data?.status || 'idle',
    total: data?.total ?? 0,
    tagged: data?.tagged ?? 0,
    failed: data?.failed ?? 0,
    error: data?.error_message,
    triggerTag: triggerMutation.mutateAsync,
    isTagging: triggerMutation.isPending || data?.status === 'tagging',
  }
}

export function useLocalTags() {
  return useQuery<LocalTagItem[]>({
    queryKey: ['tags', 'local'],
    queryFn: () => apiClient.get('/tags/local'),
  })
}

export function useAutoTagNote() {
  const queryClient = useQueryClient()

  return useMutation<{ tags: string[] }, Error, string>({
    mutationFn: (noteId: string) => apiClient.post(`/notes/${noteId}/auto-tag`, {}),
    onSuccess: (_data, noteId) => {
      queryClient.invalidateQueries({ queryKey: ['note', noteId] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['tags', 'local'] })
    },
  })
}
