import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'

export interface ShareLink {
  id: number
  token: string
  notebook_id: number
  note_id: number | null
  link_type: 'public' | 'email_required' | 'time_limited'
  email_restriction: string | null
  expires_at: string | null
  access_count: number
  is_active: boolean
  created_at: string
}

interface ShareLinksListResponse {
  items: ShareLink[]
}

export interface CreateShareLinkRequest {
  link_type: 'public' | 'email_required' | 'time_limited'
  email_restriction?: string
  expires_in_days?: number
}

const SHARE_LINKS_QUERY_KEY = (notebookId: number) => ['share-links', notebookId]

export function useShareLinks(notebookId: number) {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery<ShareLinksListResponse>({
    queryKey: SHARE_LINKS_QUERY_KEY(notebookId),
    queryFn: () =>
      apiClient.get<ShareLinksListResponse>(`/notebooks/${notebookId}/links`),
    enabled: !!notebookId,
  })

  const createLinkMutation = useMutation<
    ShareLink,
    ApiError,
    CreateShareLinkRequest
  >({
    mutationFn: request =>
      apiClient.post<ShareLink>(`/notebooks/${notebookId}/links`, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHARE_LINKS_QUERY_KEY(notebookId) })
    },
  })

  const revokeLinkMutation = useMutation<void, ApiError, number>({
    mutationFn: linkId =>
      apiClient.delete<void>(`/notebooks/${notebookId}/links/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHARE_LINKS_QUERY_KEY(notebookId) })
    },
  })

  return {
    links: data?.items ?? [],
    isLoading,
    error,
    refetch,
    createLink: createLinkMutation.mutateAsync,
    isCreating: createLinkMutation.isPending,
    createError: createLinkMutation.error,
    revokeLink: revokeLinkMutation.mutateAsync,
    isRevoking: revokeLinkMutation.isPending,
    revokeError: revokeLinkMutation.error,
  }
}
