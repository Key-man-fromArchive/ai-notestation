import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface ImageAnalysisStats {
  total: number
  ocr_done: number
  vision_done: number
  ocr_failed: number
  vision_failed: number
  pending: number
  vision_pending: number
}

export function useImageAnalysisStats() {
  const { data, isLoading } = useQuery<ImageAnalysisStats>({
    queryKey: ['image-analysis-stats'],
    queryFn: () => apiClient.get('/image-analysis/stats'),
    refetchInterval: 10000,
  })

  return {
    stats: data ?? null,
    isLoading,
  }
}
