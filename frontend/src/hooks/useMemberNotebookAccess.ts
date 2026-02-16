import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'

export interface MemberNotebookAccessItem {
  access_id: number
  notebook_id: number
  notebook_name: string
  permission: string
}

interface MemberNotebookAccessResponse {
  items: MemberNotebookAccessItem[]
}

interface NotebookAccessUpdateItem {
  notebook_id: number
  permission: string
}

const MEMBER_ACCESS_KEY = (memberId: number) => ['member-notebook-access', memberId]

export function useMemberNotebookAccess(memberId: number) {
  const queryClient = useQueryClient()

  const query = useQuery<MemberNotebookAccessResponse>({
    queryKey: MEMBER_ACCESS_KEY(memberId),
    queryFn: () =>
      apiClient.get<MemberNotebookAccessResponse>(
        `/members/${memberId}/notebook-access`,
      ),
    enabled: memberId > 0,
  })

  const updateMutation = useMutation<
    MemberNotebookAccessResponse,
    ApiError,
    NotebookAccessUpdateItem[]
  >({
    mutationFn: (accesses) =>
      apiClient.put<MemberNotebookAccessResponse>(
        `/members/${memberId}/notebook-access`,
        { accesses },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBER_ACCESS_KEY(memberId) })
    },
  })

  const revokeMutation = useMutation<{ message: string }, ApiError, number>({
    mutationFn: (accessId) =>
      apiClient.delete<{ message: string }>(
        `/members/${memberId}/notebook-access/${accessId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBER_ACCESS_KEY(memberId) })
    },
  })

  return {
    accesses: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    updateAccess: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    revokeAccess: revokeMutation.mutateAsync,
    isRevoking: revokeMutation.isPending,
  }
}
