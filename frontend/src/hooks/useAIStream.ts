// @TASK P5-T5.3 - AI SSE 스트리밍 훅
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#ai-스트리밍-훅
// @TEST src/__tests__/useAIStream.test.ts

import { useState, useRef, useCallback } from 'react'
import { apiClient } from '@/lib/api'

interface StreamOptions {
  message: string
  feature: 'insight' | 'search_qa' | 'writing' | 'spellcheck' | 'template'
  model?: string
  noteId?: string
  note_ids?: string[]
  options?: Record<string, unknown>
}

interface SSEMessage {
  chunk?: string
  error?: string
}

interface MatchedNote {
  note_id: string
  title: string
  score: number
}

interface QualityCheckItem {
  question: string
  passed: boolean | null
  note: string
}

export interface QualityResult {
  passed: boolean
  score: number
  details: QualityCheckItem[]
  summary: string
}

interface MetadataMessage {
  matched_notes?: MatchedNote[]
}

/**
 * AI SSE 스트리밍 훅
 * - fetch + ReadableStream으로 SSE 파싱
 * - AbortController로 스트림 정리
 * - 실시간 텍스트 누적
 */
export function useAIStream() {
  const [content, setContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matchedNotes, setMatchedNotes] = useState<MatchedNote[]>([])
  const [qualityResult, setQualityResult] = useState<QualityResult | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const startStream = useCallback(async (options: StreamOptions) => {
    // 초기화
    setContent('')
    setError(null)
    setMatchedNotes([])
    setQualityResult(null)
    setIsStreaming(true)

    // AbortController 생성
    abortControllerRef.current = new AbortController()

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      const token = apiClient.getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch('/api/ai/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          feature: options.feature,
          content: options.message,
          model: options.model || undefined,
          note_id: options.noteId || undefined,
          options: {
            ...(options.note_ids ? { note_ids: options.note_ids } : {}),
            ...(options.options || {}),
          },
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE 메시지 파싱 (라인 단위)
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 마지막 불완전한 라인 보관

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
            continue
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6) // "data: " 제거

            // Handle metadata event (matched notes from search mode)
            if (currentEvent === 'metadata') {
              try {
                const meta: MetadataMessage = JSON.parse(data)
                if (meta.matched_notes) {
                  setMatchedNotes(meta.matched_notes)
                }
              } catch {
                console.warn('Failed to parse metadata SSE:', data)
              }
              currentEvent = ''
              continue
            }

            // Handle quality event (quality gate evaluation)
            if (currentEvent === 'quality') {
              try {
                const quality: QualityResult = JSON.parse(data)
                setQualityResult(quality)
              } catch {
                console.warn('Failed to parse quality SSE:', data)
              }
              currentEvent = ''
              continue
            }

            currentEvent = ''

            // [DONE] 신호 — 스트리밍 텍스트 완료, quality 이벤트는 이후 도착 가능
            if (data === '[DONE]') {
              setIsStreaming(false)
              continue
            }

            try {
              const message: SSEMessage = JSON.parse(data)

              if (message.error) {
                setError(message.error)
                setIsStreaming(false)
                return
              }

              if (message.chunk) {
                setContent((prev) => prev + message.chunk)
              }
            } catch {
              // JSON 파싱 실패 무시
              console.warn('Failed to parse SSE message:', data)
            }
          }
        }
      }

      setIsStreaming(false)
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          // 사용자 중단은 에러가 아님
          setIsStreaming(false)
        } else {
          setError(err.message)
          setIsStreaming(false)
        }
      } else {
        setError('Unknown error')
        setIsStreaming(false)
      }
    }
  }, [])

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsStreaming(false)
  }, [])

  const reset = useCallback(() => {
    setContent('')
    setError(null)
    setMatchedNotes([])
    setQualityResult(null)
    setIsStreaming(false)
  }, [])

  return {
    content,
    isStreaming,
    error,
    matchedNotes,
    qualityResult,
    startStream,
    stopStream,
    reset,
  }
}
