import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api'

interface AnalysisStatus {
  status: string
  total: number
  processed: number
  ocr_done: number
  vision_done: number
  failed: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
}

export function useBatchImageAnalysis() {
  const [status, setStatus] = useState<AnalysisStatus>({
    status: 'idle',
    total: 0,
    processed: 0,
    ocr_done: 0,
    vision_done: 0,
    failed: 0,
    error_message: null,
    started_at: null,
    completed_at: null,
  })
  const [isProcessing, setIsProcessing] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiClient.get<AnalysisStatus>('/image-analysis/status')
      setStatus(data)
      setIsProcessing(data.status === 'processing')
    } catch {
      // Ignore errors during status fetch
    }
  }, [])

  const triggerBatch = useCallback(async () => {
    try {
      setIsProcessing(true)
      await apiClient.post('/image-analysis/trigger', {})
      fetchStatus()
    } catch (err) {
      setIsProcessing(false)
      throw err
    }
  }, [fetchStatus])

  const cancelBatch = useCallback(async () => {
    try {
      await apiClient.post('/image-analysis/cancel', {})
      fetchStatus()
    } catch {
      // Ignore errors during cancel
    }
  }, [fetchStatus])

  // Poll status while processing
  useEffect(() => {
    if (!isProcessing) return

    const interval = setInterval(() => {
      fetchStatus()
    }, 2000)

    return () => clearInterval(interval)
  }, [isProcessing, fetchStatus])

  // Initial fetch
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const progress =
    status.total > 0
      ? Math.round((status.processed / status.total) * 100)
      : 0

  return {
    status: status.status,
    total: status.total,
    processed: status.processed,
    ocrDone: status.ocr_done,
    visionDone: status.vision_done,
    failed: status.failed,
    error: status.error_message,
    startedAt: status.started_at,
    completedAt: status.completed_at,
    progress,
    isProcessing,
    triggerBatch,
    cancelBatch,
    refetch: fetchStatus,
  }
}
