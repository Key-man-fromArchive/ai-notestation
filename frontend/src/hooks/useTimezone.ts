import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

/**
 * Returns the user-configured timezone from settings.
 * Falls back to 'Asia/Seoul' if not yet loaded.
 *
 * Uses a dedicated query key to avoid conflicts with the Settings page,
 * which transforms the response into a different shape under the same
 * ['settings'] key.
 */
export function useTimezone(): string {
  const { data } = useQuery<string>({
    queryKey: ['settings', 'timezone', '_resolved'],
    queryFn: async () => {
      const response = await apiClient.get<{
        settings: Array<{ key: string; value: string }>
      }>('/settings')
      const item = response.settings?.find((s) => s.key === 'timezone')
      return typeof item?.value === 'string' && item.value ? item.value : 'Asia/Seoul'
    },
    staleTime: 5 * 60 * 1000, // cache 5 min
  })

  return data ?? 'Asia/Seoul'
}

/**
 * Format an ISO date string using the configured timezone.
 */
export function formatDateWithTz(iso: string, timezone: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return new Date(iso).toLocaleString('ko-KR')
  }
}
