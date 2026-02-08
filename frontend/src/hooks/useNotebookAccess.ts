import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'
import type { NotebookAccess, NotebookAccessListResponse } from '@/types/note'

interface GrantAccessRequest {
  email: string
  permission: string
}

interface UpdateAccessRequest {
  permission: string
}

const NOTEBOOK_ACCESS_KEY = (notebookId: number) => ['notebook-access', notebookId]

export function useNotebookAccess(notebookId: number) {
  const queryClient = useQueryClient()

  const query = useQuery<NotebookAccessListResponse>({
    queryKey: NOTEBOOK_ACCESS_KEY(notebookId),
    queryFn: () =>
      apiClient.get<NotebookAccessListResponse>(
        `/notebooks/${notebookId}/access`,
      ),
    enabled: notebookId > 0,
  })

  const grantMutation = useMutation<
    NotebookAccess,
    ApiError,
    GrantAccessRequest
  >({
    mutationFn: request =>
      apiClient.post<NotebookAccess>(
        `/notebooks/${notebookId}/access`,
        request,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTEBOOK_ACCESS_KEY(notebookId) })
    },
  })

  const updateMutation = useMutation<
    NotebookAccess,
    ApiError,
    { accessId: number; data: UpdateAccessRequest }
  >({
    mutationFn: ({ accessId, data }) =>
      apiClient.put<NotebookAccess>(
        `/notebooks/${notebookId}/access/${accessId}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTEBOOK_ACCESS_KEY(notebookId) })
    },
  })

  const revokeMutation = useMutation<{ success: boolean }, ApiError, number>({
    mutationFn: accessId =>
      apiClient.delete<{ success: boolean }>(
        `/notebooks/${notebookId}/access/${accessId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTEBOOK_ACCESS_KEY(notebookId) })
    },
  })

  return {
    accesses: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    grantAccess: grantMutation.mutateAsync,
    isGranting: grantMutation.isPending,
    grantError: grantMutation.error,
    updateAccess: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    revokeAccess: revokeMutation.mutateAsync,
    isRevoking: revokeMutation.isPending,
    revokeError: revokeMutation.error,
  }
}
