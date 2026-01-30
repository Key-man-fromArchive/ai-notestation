// @TASK P5-T5.2 - 노트북 목록 데이터 페칭 훅
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#데이터-페칭

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import type { NotebooksResponse } from '@/types/note'

/**
 * 노트북 목록 데이터 페칭 훅
 * - 노트북 필터 사이드바용
 */
export function useNotebooks() {
  return useQuery({
    queryKey: ['notebooks'],
    queryFn: () => apiClient.get<NotebooksResponse>('/notebooks'),
  })
}
