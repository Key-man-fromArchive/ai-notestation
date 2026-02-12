import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAutoSaveOptions {
  /** Debounce delay in ms after last change (default: 3000) */
  debounceMs?: number
  /** Max interval in ms for periodic save during continuous editing (default: 30000) */
  maxIntervalMs?: number
  /** Callback to perform the save */
  onSave: () => Promise<void>
}

/**
 * Auto-save hook with:
 * - Debounced save (fires N ms after last change)
 * - Max-interval save (fires every M ms during continuous editing)
 * - Save on unmount (navigating away)
 * - beforeunload warning for unsaved changes
 */
export function useAutoSave({
  debounceMs = 3000,
  maxIntervalMs = 30000,
  onSave,
}: UseAutoSaveOptions) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [isDirty, setIsDirty] = useState(false)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSaving = useRef(false)
  const isDirtyRef = useRef(false)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const save = useCallback(async () => {
    if (isSaving.current || !isDirtyRef.current) return
    isSaving.current = true
    setStatus('saving')
    try {
      await onSaveRef.current()
      isDirtyRef.current = false
      setIsDirty(false)
      setStatus('saved')
    } catch {
      setStatus('error')
    } finally {
      isSaving.current = false
    }
  }, [])

  const markDirty = useCallback(() => {
    isDirtyRef.current = true
    setIsDirty(true)
    setStatus('idle')

    // Reset debounce timer
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      save()
    }, debounceMs)

    // Start max-interval timer if not already running
    if (!intervalTimer.current) {
      intervalTimer.current = setTimeout(() => {
        intervalTimer.current = null
        save()
      }, maxIntervalMs)
    }
  }, [debounceMs, maxIntervalMs, save])

  // Save on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (intervalTimer.current) clearTimeout(intervalTimer.current)
      if (isDirtyRef.current && !isSaving.current) {
        // Fire-and-forget save on unmount (navigation)
        onSaveRef.current().catch(() => {})
      }
    }
  }, [])

  // Warn before closing tab with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  return { status, isDirty, markDirty, save }
}
