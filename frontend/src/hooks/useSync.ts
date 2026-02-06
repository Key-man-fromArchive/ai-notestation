// @TASK P5-T5.3 - 동기화 상태 훅
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#동기화-훅
// @TEST src/__tests__/useSync.test.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface SyncStatus {
  status: 'idle' | 'syncing' | 'completed' | 'error'
  last_sync_at: string | null
  notes_synced: number | null
  error_message: string | null
  notes_missing_images: number | null
}

/**
 * 동기화 상태 훅
 * - 동기화 상태 조회
 * - 동기화 트리거
 * - 폴링으로 실시간 상태 업데이트
 */
export function useSync() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<SyncStatus>({
    queryKey: ['sync', 'status'],
    queryFn: () => apiClient.get('/sync/status'),
    refetchInterval: (query) => {
      // syncing 상태일 때는 2초마다 폴링
      const data = query.state.data as SyncStatus | undefined
      return data?.status === 'syncing' ? 2000 : false
    },
  })

  const triggerMutation = useMutation({
    mutationFn: () => apiClient.post('/sync/trigger', {}),
    onSuccess: () => {
      // 상태 즉시 갱신
      queryClient.invalidateQueries({ queryKey: ['sync', 'status'] })
    },
  })

  return {
    status: data?.status || 'idle',
    lastSync: data?.last_sync_at,
    notesSynced: data?.notes_synced,
    error: data?.error_message,
    notesMissingImages: data?.notes_missing_images ?? 0,
    isLoading,
    triggerSync: triggerMutation.mutateAsync,
    isSyncing: triggerMutation.isPending,
  }
}
