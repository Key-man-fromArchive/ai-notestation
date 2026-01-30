// @TASK P5-T5.2 - 노트 목록 데이터 페칭 훅
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#데이터-페칭
// @TEST frontend/src/__tests__/Notes.test.tsx

import { useInfiniteQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import type { NotesResponse } from '@/types/note'

interface UseNotesOptions {
  notebook?: string
  limit?: number
}

/**
 * 노트 목록 데이터 페칭 훅
 * - TanStack Query useInfiniteQuery
 * - 무한 스크롤 지원
 * - 노트북 필터링
 */
export function useNotes({ notebook, limit = 20 }: UseNotesOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['notes', { notebook }],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        offset: pageParam.toString(),
        limit: limit.toString(),
      })

      if (notebook) {
        params.append('notebook', notebook)
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
