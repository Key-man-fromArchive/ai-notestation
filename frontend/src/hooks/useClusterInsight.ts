import { useState, useRef, useCallback } from 'react'
import { apiClient } from '@/lib/api'

interface ClusterNote {
  id: number
  title: string
  notebook: string | null
}

interface ClusterInsightState {
  content: string
  isStreaming: boolean
  error: string | null
  notes: ClusterNote[]
}

export interface ClusterInsightCompleteData {
  content: string
  notes: ClusterNote[]
}

export function useClusterInsight(onComplete?: (data: ClusterInsightCompleteData) => void) {
  const [state, setState] = useState<ClusterInsightState>({
    content: '',
    isStreaming: false,
    error: null,
    notes: [],
  })
  const abortRef = useRef<AbortController | null>(null)
  const contentRef = useRef('')
  const notesRef = useRef<ClusterNote[]>([])
  const hadErrorRef = useRef(false)

  const analyze = useCallback(
    async (noteIds: number[], focus?: string, model?: string) => {
      // Reset
      contentRef.current = ''
      notesRef.current = []
      hadErrorRef.current = false
      setState({ content: '', isStreaming: true, error: null, notes: [] })

      abortRef.current = new AbortController()

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        const token = apiClient.getToken()
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch('/api/graph/cluster-insight', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            note_ids: noteIds,
            focus: focus || undefined,
            model: model || undefined,
          }),
          signal: abortRef.current.signal,
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          let currentEvent = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
              continue
            }

            if (line.startsWith('data: ')) {
              const data = line.slice(6)

              if (currentEvent === 'metadata') {
                try {
                  const meta = JSON.parse(data)
                  if (meta.notes) {
                    notesRef.current = meta.notes
                    setState(prev => ({ ...prev, notes: meta.notes }))
                  }
                } catch {
                  // ignore
                }
                currentEvent = ''
                continue
              }

              if (currentEvent === 'error') {
                hadErrorRef.current = true
                setState(prev => ({
                  ...prev,
                  error: data,
                  isStreaming: false,
                }))
                currentEvent = ''
                return
              }

              currentEvent = ''

              if (data === '[DONE]') {
                setState(prev => ({ ...prev, isStreaming: false }))
                if (!hadErrorRef.current && contentRef.current && onComplete) {
                  onComplete({ content: contentRef.current, notes: notesRef.current })
                }
                return
              }

              try {
                const msg = JSON.parse(data)
                if (msg.error) {
                  hadErrorRef.current = true
                  setState(prev => ({
                    ...prev,
                    error: msg.error,
                    isStreaming: false,
                  }))
                  return
                }
                if (msg.chunk) {
                  contentRef.current += msg.chunk
                  setState(prev => ({
                    ...prev,
                    content: prev.content + msg.chunk,
                  }))
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }

        setState(prev => ({ ...prev, isStreaming: false }))
        if (!hadErrorRef.current && contentRef.current && onComplete) {
          onComplete({ content: contentRef.current, notes: notesRef.current })
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setState(prev => ({ ...prev, isStreaming: false }))
        } else {
          setState(prev => ({
            ...prev,
            error: err instanceof Error ? err.message : 'Unknown error',
            isStreaming: false,
          }))
        }
      }
    },
    [onComplete]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setState(prev => ({ ...prev, isStreaming: false }))
  }, [])

  const reset = useCallback(() => {
    setState({ content: '', isStreaming: false, error: null, notes: [] })
  }, [])

  return {
    ...state,
    analyze,
    stop,
    reset,
  }
}
