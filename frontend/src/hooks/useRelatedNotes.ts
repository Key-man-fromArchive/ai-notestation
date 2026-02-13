import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

export interface RelatedNoteItem {
  note_id: string
  title: string
  snippet: string
  similarity: number
  notebook: string | null
}

interface RelatedNotesResponse {
  items: RelatedNoteItem[]
}

export function useRelatedNotes(noteId: string | undefined, limit = 5) {
  return useQuery<RelatedNotesResponse>({
    queryKey: ['relatedNotes', noteId, limit],
    queryFn: () => apiClient.get(`/notes/${noteId}/related?limit=${limit}`),
    enabled: !!noteId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}
