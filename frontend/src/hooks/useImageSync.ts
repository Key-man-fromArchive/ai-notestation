import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api'

interface ImageSyncStatus {
  status: string
  total_notes: number
  processed_notes: number
  images_extracted: number
  failed_notes: number
  last_sync_at: string | null
  error_message: string | null
  remaining_notes: number
}

interface ImageSyncTriggerResponse {
  status: string
  message: string
  total_notes: number
}

export function useImageSync() {
  const [status, setStatus] = useState<ImageSyncStatus>({
    status: 'idle',
    total_notes: 0,
    processed_notes: 0,
    images_extracted: 0,
    failed_notes: 0,
    last_sync_at: null,
    error_message: null,
    remaining_notes: 0,
  })
  const [isSyncing, setIsSyncing] = useState(false)
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiClient.get<ImageSyncStatus>('/nsx/sync-images/status')
      setStatus(data)
      setIsSyncing(data.status === 'syncing')
    } catch {
      // Ignore errors during status fetch
    }
  }, [])

  const triggerSync = useCallback(async () => {
    try {
      setIsSyncing(true)
      setTriggerMessage(null)
      const response = await apiClient.post<ImageSyncTriggerResponse>('/nsx/sync-images', {})
      if (response.status === 'no_work' || response.status === 'already_syncing') {
        setIsSyncing(false)
        setTriggerMessage(response.message)
        return
      }
      // Start polling for status
      fetchStatus()
    } catch (err) {
      setIsSyncing(false)
      throw err
    }
  }, [fetchStatus])

  // Poll status while syncing
  useEffect(() => {
    if (!isSyncing) return

    const interval = setInterval(() => {
      fetchStatus()
    }, 2000)

    return () => clearInterval(interval)
  }, [isSyncing, fetchStatus])

  // Initial fetch
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const progress =
    status.total_notes > 0
      ? Math.round((status.processed_notes / status.total_notes) * 100)
      : 0

  return {
    status: status.status,
    totalNotes: status.total_notes,
    processedNotes: status.processed_notes,
    imagesExtracted: status.images_extracted,
    failedNotes: status.failed_notes,
    lastSyncAt: status.last_sync_at,
    error: status.error_message,
    remainingNotes: status.remaining_notes,
    triggerMessage,
    progress,
    isSyncing,
    triggerSync,
    refetch: fetchStatus,
  }
}
