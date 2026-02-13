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

interface UseNotesOptions {
  notebook?: string
  tag?: string
  limit?: number
}

/**
 * 노트 목록 데이터 페칭 훅
 * - TanStack Query useInfiniteQuery
 * - 무한 스크롤 지원
 * - 노트북 필터링
 * - 태그 필터링
 */
export function useNotes({ notebook, tag, limit = 20 }: UseNotesOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['notes', { notebook, tag }],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        offset: pageParam.toString(),
        limit: limit.toString(),
      })

      if (notebook) {
        params.append('notebook', notebook)
      }

      if (tag) {
        params.append('tag', tag)
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
