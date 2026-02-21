import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

export interface Comment {
  id: number
  comment_id: string
  note_id: number
  user_id: number | null
  user_name: string
  content: string
  is_resolved: boolean
  resolved_by: number | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export function useComments(noteId: string | undefined) {
  const queryClient = useQueryClient()
  const queryKey = ['comments', noteId]

  const query = useQuery<Comment[]>({
    queryKey,
    queryFn: () => apiClient.get(`/notes/${noteId}/comments`),
    enabled: !!noteId,
  })

  const createComment = useMutation({
    mutationFn: (data: { comment_id: string; content: string }) =>
      apiClient.post<Comment>(`/notes/${noteId}/comments`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const resolveComment = useMutation({
    mutationFn: (commentId: string) =>
      apiClient.patch<Comment>(`/notes/${noteId}/comments/${commentId}/resolve`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const deleteComment = useMutation({
    mutationFn: (commentId: string) =>
      apiClient.delete(`/notes/${noteId}/comments/${commentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    comments: query.data ?? [],
    isLoading: query.isLoading,
    createComment,
    resolveComment,
    deleteComment,
  }
}
