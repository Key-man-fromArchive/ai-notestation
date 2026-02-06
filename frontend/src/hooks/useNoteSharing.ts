import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'

export interface NoteAccess {
  id: number
  note_id: number
  user_id: number | null
  user_email: string | null
  user_name: string | null
  org_id: number | null
  permission: string
  granted_by: number
  is_org_wide: boolean
}

interface AccessListResponse {
  accesses: NoteAccess[]
  can_manage: boolean
}

interface GrantAccessRequest {
  email: string
  permission: string
}

const SHARING_QUERY_KEY = (noteId: number) => ['note-sharing', noteId]

export function useNoteSharing(noteId: number) {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery<AccessListResponse>({
    queryKey: SHARING_QUERY_KEY(noteId),
    queryFn: () => apiClient.get<AccessListResponse>(`/notes/${noteId}/share`),
    enabled: noteId > 0,
  })

  const grantAccessMutation = useMutation<
    NoteAccess,
    ApiError,
    GrantAccessRequest
  >({
    mutationFn: request =>
      apiClient.post<NoteAccess>(`/notes/${noteId}/share`, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHARING_QUERY_KEY(noteId) })
    },
  })

  const grantOrgAccessMutation = useMutation<NoteAccess, ApiError, string>({
    mutationFn: permission =>
      apiClient.post<NoteAccess>(
        `/notes/${noteId}/share/org?permission=${permission}`,
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHARING_QUERY_KEY(noteId) })
    },
  })

  const revokeAccessMutation = useMutation<{ message: string }, ApiError, number>({
    mutationFn: accessId =>
      apiClient.delete<{ message: string }>(
        `/notes/${noteId}/share/${accessId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHARING_QUERY_KEY(noteId) })
    },
  })

  return {
    accesses: data?.accesses ?? [],
    canManage: data?.can_manage ?? false,
    isLoading,
    error,
    refetch,
    grantAccess: grantAccessMutation.mutateAsync,
    isGranting: grantAccessMutation.isPending,
    grantError: grantAccessMutation.error,
    grantOrgAccess: grantOrgAccessMutation.mutateAsync,
    isGrantingOrg: grantOrgAccessMutation.isPending,
    revokeAccess: revokeAccessMutation.mutateAsync,
    isRevoking: revokeAccessMutation.isPending,
    revokeError: revokeAccessMutation.error,
  }
}
