// @TASK P5-T5.2 - 노트북 목록 데이터 페칭 훅
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#데이터-페칭

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'
import type { Notebook, NotebooksResponse } from '@/types/note'

const NOTEBOOKS_KEY = ['notebooks']
const NOTEBOOK_KEY = (id: number) => ['notebook', id]

interface NotebookCreateRequest {
  name: string
  description?: string
  category?: string | null
}

interface NotebookUpdateRequest {
  name?: string
  description?: string
  category?: string | null
}

export function useNotebooks() {
  return useQuery({
    queryKey: NOTEBOOKS_KEY,
    queryFn: () => apiClient.get<NotebooksResponse>('/notebooks'),
  })
}

export function useNotebook(id: number) {
  return useQuery({
    queryKey: NOTEBOOK_KEY(id),
    queryFn: () => apiClient.get<Notebook>(`/notebooks/${id}`),
    enabled: id > 0,
  })
}

export function useCreateNotebook() {
  const queryClient = useQueryClient()

  return useMutation<Notebook, ApiError, NotebookCreateRequest>({
    mutationFn: request => apiClient.post<Notebook>('/notebooks', request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTEBOOKS_KEY })
    },
  })
}

export function useUpdateNotebook() {
  const queryClient = useQueryClient()

  return useMutation<
    Notebook,
    ApiError,
    { id: number; data: NotebookUpdateRequest }
  >({
    mutationFn: ({ id, data }) =>
      apiClient.put<Notebook>(`/notebooks/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: NOTEBOOKS_KEY })
      queryClient.invalidateQueries({ queryKey: NOTEBOOK_KEY(variables.id) })
    },
  })
}

export function useDeleteNotebook() {
  const queryClient = useQueryClient()

  return useMutation<{ success: boolean }, ApiError, number>({
    mutationFn: id => apiClient.delete<{ success: boolean }>(`/notebooks/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: NOTEBOOKS_KEY })
      queryClient.removeQueries({ queryKey: NOTEBOOK_KEY(id) })
    },
  })
}
