import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface SearchFeedbackPayload {
  search_event_id: number
  note_id: string
  relevant: boolean
}

interface AIFeedbackPayload {
  feature: string
  rating: number
  comment?: string
  model_used?: string
  request_summary?: string
}

export function useSearchFeedback() {
  return useMutation({
    mutationFn: (payload: SearchFeedbackPayload) =>
      apiClient.post<{ id: number; relevant: boolean }>('/feedback/search', payload),
  })
}

export function useAIFeedback() {
  return useMutation({
    mutationFn: (payload: AIFeedbackPayload) =>
      apiClient.post<{ id: number; rating: number }>('/feedback/ai', payload),
  })
}
