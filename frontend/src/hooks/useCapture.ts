import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'
import type { Note } from '@/types/note'

interface CaptureURLRequest {
  url: string
  notebook?: string
  tags?: string[]
}

interface CaptureArxivRequest {
  arxiv_id: string
  notebook?: string
  tags?: string[]
}

interface CapturePubmedRequest {
  pmid: string
  notebook?: string
  tags?: string[]
}

export function useCaptureURL() {
  const queryClient = useQueryClient()

  return useMutation<Note, ApiError, CaptureURLRequest>({
    mutationFn: request => apiClient.post<Note>('/capture/url', request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useCaptureArxiv() {
  const queryClient = useQueryClient()

  return useMutation<Note, ApiError, CaptureArxivRequest>({
    mutationFn: request => apiClient.post<Note>('/capture/arxiv', request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useCapturePubmed() {
  const queryClient = useQueryClient()

  return useMutation<Note, ApiError, CapturePubmedRequest>({
    mutationFn: request => apiClient.post<Note>('/capture/pubmed', request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}
