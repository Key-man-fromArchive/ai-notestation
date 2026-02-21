import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

export interface NotificationItem {
  id: number
  type: 'comment_added' | 'mention'
  actor_name: string
  note_title: string
  synology_note_id: string
  comment_id: string | null
  is_read: boolean
  created_at: string
}

interface NotificationsResponse {
  items: NotificationItem[]
  unread_count: number
}

export function useNotifications() {
  const queryClient = useQueryClient()

  const query = useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: () => apiClient.get('/notifications?limit=20'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const markRead = useMutation({
    mutationFn: (ids?: number[]) =>
      apiClient.post('/notifications/mark-read', {
        notification_ids: ids ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  return {
    notifications: query.data?.items ?? [],
    unreadCount: query.data?.unread_count ?? 0,
    isLoading: query.isLoading,
    markRead: (ids: number[]) => markRead.mutate(ids),
    markAllRead: () => markRead.mutate(undefined),
  }
}
