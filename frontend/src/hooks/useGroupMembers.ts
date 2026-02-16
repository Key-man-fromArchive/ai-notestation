// @TASK Groups Feature - Group members management hook
// @SPEC Group members add/remove operations

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'

export interface GroupMember {
  membership_id: number
  user_id: number
  email: string
  name: string
  role: string
  added_at: string | null
}

const groupMembersKey = (groupId: number) => ['group-members', groupId]

export function useGroupMembers(groupId: number) {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery<GroupMember[]>({
    queryKey: groupMembersKey(groupId),
    queryFn: () => apiClient.get<GroupMember[]>(`/groups/${groupId}/members`),
    enabled: groupId > 0,
  })

  const addMembersMutation = useMutation<
    { added: number; already_exists: number; errors: string[] },
    ApiError,
    number[]
  >({
    mutationFn: (membershipIds) =>
      apiClient.post(`/groups/${groupId}/members`, { membership_ids: membershipIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupMembersKey(groupId) })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  const removeMembersMutation = useMutation<{ message: string }, ApiError, number[]>({
    mutationFn: (membershipIds) =>
      apiClient.request(`/groups/${groupId}/members`, {
        method: 'DELETE',
        body: JSON.stringify({ membership_ids: membershipIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupMembersKey(groupId) })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  return {
    members: data ?? [],
    isLoading,
    error,
    refetch,
    addMembers: addMembersMutation.mutateAsync,
    isAdding: addMembersMutation.isPending,
    removeMembers: removeMembersMutation.mutateAsync,
    isRemoving: removeMembersMutation.isPending,
  }
}
