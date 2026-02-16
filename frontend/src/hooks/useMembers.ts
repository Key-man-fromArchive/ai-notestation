import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'

export interface Member {
  id: number
  user_id: number
  email: string
  name: string
  role: string
  accepted_at: string | null
  is_pending: boolean
}

interface MemberListResponse {
  members: Member[]
  total: number
}

interface InviteRequest {
  email: string
  role: string
}

interface InviteResponse {
  invite_token: string
  email: string
  role: string
  expires_at: string
}

interface UpdateRoleRequest {
  role: string
}

const MEMBERS_QUERY_KEY = ['members']

export function useMembers() {
  const queryClient = useQueryClient()

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<MemberListResponse>({
    queryKey: MEMBERS_QUERY_KEY,
    queryFn: () => apiClient.get<MemberListResponse>('/members'),
  })

  const inviteMutation = useMutation<InviteResponse, ApiError, InviteRequest>({
    mutationFn: (request) => apiClient.post<InviteResponse>('/members/invite', request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY })
    },
  })

  const updateRoleMutation = useMutation<
    Member,
    ApiError,
    { memberId: number; role: string }
  >({
    mutationFn: ({ memberId, role }) =>
      apiClient.put<Member>(`/members/${memberId}/role`, { role } as UpdateRoleRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY })
    },
  })

  const removeMemberMutation = useMutation<
    { message: string },
    ApiError,
    number
  >({
    mutationFn: (memberId) =>
      apiClient.delete<{ message: string }>(`/members/${memberId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY })
    },
  })

  const batchRemoveMutation = useMutation<
    { removed: number; failed: number; errors: string[] },
    ApiError,
    number[]
  >({
    mutationFn: (memberIds) =>
      apiClient.post<{ removed: number; failed: number; errors: string[] }>(
        '/members/batch-remove',
        { member_ids: memberIds },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY })
    },
  })

  const batchRoleMutation = useMutation<
    { updated: number; failed: number; errors: string[] },
    ApiError,
    { memberIds: number[]; role: string }
  >({
    mutationFn: ({ memberIds, role }) =>
      apiClient.post<{ updated: number; failed: number; errors: string[] }>(
        '/members/batch-role',
        { member_ids: memberIds, role },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY })
    },
  })

  return {
    members: data?.members ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
    refetch,
    inviteMember: inviteMutation.mutateAsync,
    isInviting: inviteMutation.isPending,
    inviteError: inviteMutation.error,
    updateRole: updateRoleMutation.mutateAsync,
    isUpdatingRole: updateRoleMutation.isPending,
    updateRoleError: updateRoleMutation.error,
    removeMember: removeMemberMutation.mutateAsync,
    isRemoving: removeMemberMutation.isPending,
    batchRemoveMembers: batchRemoveMutation.mutateAsync,
    isBatchRemoving: batchRemoveMutation.isPending,
    batchUpdateRole: batchRoleMutation.mutateAsync,
    isBatchUpdatingRole: batchRoleMutation.isPending,
  }
}
