// @TASK Groups Feature - Group notebook access control hook
// @SPEC Group notebook access CRUD operations

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'

export interface GroupNotebookAccessItem {
  id: number
  notebook_id: number
  notebook_name: string
  permission: string
}

const groupAccessKey = (groupId: number) => ['group-notebook-access', groupId]

export function useGroupNotebookAccess(groupId: number) {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery<GroupNotebookAccessItem[]>({
    queryKey: groupAccessKey(groupId),
    queryFn: () => apiClient.get<GroupNotebookAccessItem[]>(`/groups/${groupId}/notebook-access`),
    enabled: groupId > 0,
  })

  const updateAccessMutation = useMutation<
    GroupNotebookAccessItem[],
    ApiError,
    { notebook_id: number; permission: string }[]
  >({
    mutationFn: (accesses) =>
      apiClient.put<GroupNotebookAccessItem[]>(`/groups/${groupId}/notebook-access`, { accesses }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupAccessKey(groupId) }),
  })

  const revokeAccessMutation = useMutation<{ message: string }, ApiError, number>({
    mutationFn: (notebookId) =>
      apiClient.delete<{ message: string }>(`/groups/${groupId}/notebook-access/${notebookId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupAccessKey(groupId) }),
  })

  return {
    accesses: data ?? [],
    isLoading,
    error,
    refetch,
    updateAccess: updateAccessMutation.mutateAsync,
    isUpdating: updateAccessMutation.isPending,
    revokeAccess: revokeAccessMutation.mutateAsync,
    isRevoking: revokeAccessMutation.isPending,
  }
}
