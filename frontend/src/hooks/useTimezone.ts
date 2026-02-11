import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

/**
 * Returns the user-configured timezone from settings.
 * Falls back to 'Asia/Seoul' if not yet loaded.
 */
export function useTimezone(): string {
  const { data } = useQuery<{ settings: Array<{ key: string; value: string }> }>({
    queryKey: ['settings'],
    queryFn: () => apiClient.get('/settings'),
    staleTime: 5 * 60 * 1000, // cache 5 min
  })

  const tz = data?.settings?.find((s) => s.key === 'timezone')?.value
  return typeof tz === 'string' && tz ? tz : 'Asia/Seoul'
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
