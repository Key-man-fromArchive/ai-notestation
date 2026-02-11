import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'
import type { ConflictListResponse, Note } from '@/types/note'

const CONFLICTS_QUERY_KEY = ['notes', 'conflicts']

export function useConflicts() {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery<ConflictListResponse>({
    queryKey: CONFLICTS_QUERY_KEY,
    queryFn: () => apiClient.get<ConflictListResponse>('/notes/conflicts'),
    refetchInterval: 30_000,
  })

  const resolveConflictMutation = useMutation<
    Note,
    ApiError,
    { noteId: string; resolution: 'keep_local' | 'keep_remote' }
  >({
    mutationFn: ({ noteId, resolution }) =>
      apiClient.post<Note>(`/notes/${noteId}/resolve-conflict`, { resolution }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFLICTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['note'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })

  return {
    conflicts: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
    refetch,
    resolveConflict: resolveConflictMutation.mutateAsync,
    isResolving: resolveConflictMutation.isPending,
  }
}
