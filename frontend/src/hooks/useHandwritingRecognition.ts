// Hook for handwriting recognition via POST /api/handwriting/recognize

import { useState, useCallback } from 'react'
import { apiClient } from '@/lib/api'

interface RecognizeResult {
  text: string
  latex: string | null
  mode: string
  model: string
  provider: string
}

export function useHandwritingRecognition() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recognize = useCallback(
    async (
      blob: Blob,
      mode: 'text' | 'ink' | 'math',
      model?: string,
    ): Promise<RecognizeResult | null> => {
      setIsLoading(true)
      setError(null)

      try {
        const formData = new FormData()
        formData.append('image', blob, 'handwriting.png')
        formData.append('mode', mode)
        if (model) formData.append('model', model)

        const token = apiClient.getToken()
        const response = await fetch('/api/handwriting/recognize', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: formData,
        })

        if (!response.ok) {
          const detail = await response.json().catch(() => ({}))
          throw new Error(detail.detail || `HTTP ${response.status}`)
        }

        return (await response.json()) as RecognizeResult
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Recognition failed'
        setError(message)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  return { recognize, isLoading, error }
}
