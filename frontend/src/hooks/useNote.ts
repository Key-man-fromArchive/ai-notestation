// @TASK P5-T5.2 - 단일 노트 데이터 페칭 훅
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#데이터-페칭
// @TEST frontend/src/__tests__/NoteDetail.test.tsx

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import type { Note } from '@/types/note'

/**
 * 단일 노트 데이터 페칭 훅
 * - TanStack Query useQuery
 * - 404 에러 처리
 */
export function useNote(noteId: string | undefined) {
  return useQuery({
    queryKey: ['note', noteId],
    queryFn: () => apiClient.get<Note>(`/notes/${noteId}`),
    enabled: !!noteId,
  })
}
