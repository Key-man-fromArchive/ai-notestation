// @TASK P5-T5.3 - AI SSE 스트리밍 훅
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#ai-스트리밍-훅
// @TEST src/__tests__/useAIStream.test.ts

import { useState, useRef, useCallback } from 'react'
import { apiClient } from '@/lib/api'

interface StreamOptions {
  message: string
  feature: 'insight' | 'search_qa' | 'writing' | 'spellcheck' | 'template'
  model?: string
  note_ids?: string[]
}

interface SSEMessage {
  chunk?: string
  error?: string
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
  const abortControllerRef = useRef<AbortController | null>(null)

  const startStream = useCallback(async (options: StreamOptions) => {
    // 초기화
    setContent('')
    setError(null)
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
          options: options.note_ids ? { note_ids: options.note_ids } : undefined,
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

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6) // "data: " 제거

            // [DONE] 신호
            if (data === '[DONE]') {
              setIsStreaming(false)
              return
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
          } else if (line.startsWith('event: error')) {
            // 다음 라인이 data일 것
            continue
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
    setIsStreaming(false)
  }, [])

  return {
    content,
    isStreaming,
    error,
    startStream,
    stopStream,
    reset,
  }
}
