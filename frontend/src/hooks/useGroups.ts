// @TASK Groups Feature - Groups management hook
// @SPEC Groups CRUD operations

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'

export interface Group {
  id: number
  name: string
  description: string
  color: string
  member_count: number
  created_at: string
}

interface GroupListResponse {
  groups: Group[]
  total: number
}

interface CreateGroupRequest {
  name: string
  description?: string
  color?: string
}

interface UpdateGroupRequest {
  name?: string
  description?: string
  color?: string
}

const GROUPS_QUERY_KEY = ['groups']

export function useGroups() {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery<GroupListResponse>({
    queryKey: GROUPS_QUERY_KEY,
    queryFn: () => apiClient.get<GroupListResponse>('/groups'),
  })

  const createMutation = useMutation<Group, ApiError, CreateGroupRequest>({
    mutationFn: (req) => apiClient.post<Group>('/groups', req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY }),
  })

  const updateMutation = useMutation<Group, ApiError, { groupId: number } & UpdateGroupRequest>({
    mutationFn: ({ groupId, ...data }) => apiClient.put<Group>(`/groups/${groupId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY }),
  })

  const deleteMutation = useMutation<{ message: string }, ApiError, number>({
    mutationFn: (groupId) => apiClient.delete<{ message: string }>(`/groups/${groupId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY }),
  })

  return {
    groups: data?.groups ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
    refetch,
    createGroup: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateGroup: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteGroup: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  }
}
