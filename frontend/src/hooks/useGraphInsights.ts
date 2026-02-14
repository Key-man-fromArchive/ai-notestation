import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

export interface GraphInsightSummary {
  id: number
  hub_label: string
  note_count: number
  model: string | null
  has_chat: boolean
  created_at: string
}

export interface GraphInsightDetail {
  id: number
  hub_label: string
  content: string
  notes: Array<{ id: number; title: string; notebook: string | null }>
  note_ids: number[]
  chat_messages: Array<{ role: string; content: string }> | null
  model: string | null
  created_at: string
}

interface GraphInsightListResponse {
  items: GraphInsightSummary[]
  total: number
}

interface SaveInsightPayload {
  hub_label: string
  content: string
  notes: Array<{ id: number; title: string; notebook: string | null }>
  note_ids: number[]
  model?: string
}

const INSIGHTS_KEY = ['graph-insights']

export function useGraphInsightList(limit = 20, offset = 0) {
  return useQuery<GraphInsightListResponse>({
    queryKey: [...INSIGHTS_KEY, 'list', limit, offset],
    queryFn: () => apiClient.get(`/graph/insights?limit=${limit}&offset=${offset}`),
  })
}

export function useGraphInsightDetail(id: number | null) {
  return useQuery<GraphInsightDetail>({
    queryKey: [...INSIGHTS_KEY, 'detail', id],
    queryFn: () => apiClient.get(`/graph/insights/${id}`),
    enabled: id !== null,
  })
}

export function useSaveGraphInsight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: SaveInsightPayload) =>
      apiClient.post<GraphInsightDetail>('/graph/insights', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INSIGHTS_KEY })
    },
  })
}

export function useDeleteGraphInsight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/graph/insights/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INSIGHTS_KEY })
    },
  })
}

export function useUpdateInsightChat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, chat_messages }: { id: number; chat_messages: Array<{ role: string; content: string }> }) =>
      apiClient.patch<GraphInsightDetail>(`/graph/insights/${id}/chat`, { chat_messages }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INSIGHTS_KEY })
    },
  })
}
