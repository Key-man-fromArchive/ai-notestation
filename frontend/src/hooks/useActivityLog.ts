import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface ActivityLogItem {
  id: number
  operation: 'sync' | 'embedding' | 'image_sync' | 'nsx' | 'auth' | 'member' | 'oauth' | 'note' | 'notebook' | 'access' | 'share_link' | 'settings' | 'admin'
  status: 'started' | 'completed' | 'error'
  message: string | null
  details: Record<string, unknown> | null
  triggered_by: string | null
  created_at: string
}

interface ActivityLogResponse {
  items: ActivityLogItem[]
  total: number
}

export function useActivityLog(operation?: string) {
  const params = new URLSearchParams({ limit: '50' })
  if (operation) params.set('operation', operation)

  return useQuery<ActivityLogResponse>({
    queryKey: ['activity-log', operation ?? 'all'],
    queryFn: () => apiClient.get(`/activity-log?${params.toString()}`),
    refetchInterval: 10_000,
  })
}
