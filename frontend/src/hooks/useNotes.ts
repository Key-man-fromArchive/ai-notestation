// @TASK P5-T5.2 - 노트 목록 데이터 페칭 훅
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#데이터-페칭
// @TEST frontend/src/__tests__/Notes.test.tsx

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'
import type { Note, NotesResponse } from '@/types/note'

interface NoteCreateRequest {
  title: string
  content: string
  notebook?: string
  tags?: string[]
}

export type SortBy = 'updated_at' | 'created_at'
export type SortOrder = 'desc' | 'asc'

interface UseNotesOptions {
  notebook?: string
  tag?: string
  emptyOnly?: boolean
  sortBy?: SortBy
  sortOrder?: SortOrder
  limit?: number
}

/**
 * 노트 목록 데이터 페칭 훅
 * - TanStack Query useInfiniteQuery
 * - 무한 스크롤 지원
 * - 노트북 필터링
 * - 태그 필터링
 */
export function useNotes({ notebook, tag, emptyOnly, sortBy = 'updated_at', sortOrder = 'desc', limit = 20 }: UseNotesOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['notes', { notebook, tag, emptyOnly, sortBy, sortOrder }],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        offset: pageParam.toString(),
        limit: limit.toString(),
        sort_by: sortBy,
        sort_order: sortOrder,
      })

      if (notebook) {
        params.append('notebook', notebook)
      }

      if (tag) {
        params.append('tag', tag)
      }

      if (emptyOnly) {
        params.append('empty_only', 'true')
      }

      return apiClient.get<NotesResponse>(`/notes?${params.toString()}`)
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit
      return nextOffset < lastPage.total ? nextOffset : undefined
    },
    initialPageParam: 0,
  })
}

export function useCreateNote() {
  const queryClient = useQueryClient()

  return useMutation<Note, ApiError, NoteCreateRequest>({
    mutationFn: request => apiClient.post<Note>('/notes', request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

interface BatchDeleteResponse {
  deleted: number
  failed: string[]
}

interface NoteUpdateRequest {
  title?: string
  notebook?: string | null
}

export function useUpdateNote() {
  const queryClient = useQueryClient()

  return useMutation<Note, ApiError, { noteId: string; data: NoteUpdateRequest }>({
    mutationFn: ({ noteId, data }) =>
      apiClient.put<Note>(`/notes/${noteId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: noteId => apiClient.delete(`/notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useBatchDeleteNotes() {
  const queryClient = useQueryClient()

  return useMutation<BatchDeleteResponse, ApiError, string[]>({
    mutationFn: noteIds =>
      apiClient.post<BatchDeleteResponse>('/notes/batch-delete', { note_ids: noteIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

interface BatchTrashResponse {
  trashed: number
  operation_id: number
}

export function useBatchTrashNotes() {
  const queryClient = useQueryClient()

  return useMutation<BatchTrashResponse, ApiError, string[]>({
    mutationFn: noteIds =>
      apiClient.post<BatchTrashResponse>('/notes/batch-trash', { note_ids: noteIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['notebooks'] })
    },
  })
}

interface BatchMoveResponse {
  moved: number
  failed: string[]
}

interface BatchMoveRequest {
  noteIds: string[]
  notebook: string | null
}

export function useBatchMoveNotes() {
  const queryClient = useQueryClient()

  return useMutation<BatchMoveResponse, ApiError, BatchMoveRequest>({
    mutationFn: ({ noteIds, notebook }) =>
      apiClient.post<BatchMoveResponse>('/notes/batch-move', { note_ids: noteIds, notebook }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['notebooks'] })
    },
  })
}
