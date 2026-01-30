// @TASK P5-T5.3 - useAIStream 훅 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#ai-스트리밍-훅

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAIStream } from '../hooks/useAIStream'

// Mock fetch
global.fetch = vi.fn()

describe('useAIStream hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('streams AI response chunks', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"chunk": "Hello"}\n\n'))
        controller.enqueue(new TextEncoder().encode('data: {"chunk": " World"}\n\n'))
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      body: mockStream,
    } as Response)

    const { result } = renderHook(() => useAIStream())

    await act(async () => {
      await result.current.startStream({
        message: 'Test message',
        feature: 'insight',
      })
    })

    await waitFor(() => {
      expect(result.current.content).toBe('Hello World')
    })

    expect(result.current.isStreaming).toBe(false)
  })

  it('handles stream errors', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('event: error\ndata: {"error": "API error"}\n\n')
        )
        controller.close()
      },
    })

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      body: mockStream,
    } as Response)

    const { result } = renderHook(() => useAIStream())

    await act(async () => {
      await result.current.startStream({
        message: 'Test',
        feature: 'insight',
      })
    })

    await waitFor(() => {
      expect(result.current.error).toBe('API error')
    })
  })

  it('aborts stream on stopStream', async () => {
    const mockAbort = vi.fn()
    global.AbortController = vi.fn(() => ({
      signal: {},
      abort: mockAbort,
    })) as unknown as typeof AbortController

    const mockStream = new ReadableStream({
      start(controller) {
        // 무한 스트림
        setInterval(() => {
          controller.enqueue(new TextEncoder().encode('data: {"chunk": "x"}\n\n'))
        }, 100)
      },
    })

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      body: mockStream,
    } as Response)

    const { result } = renderHook(() => useAIStream())

    act(() => {
      result.current.startStream({ message: 'Test', feature: 'insight' })
    })

    act(() => {
      result.current.stopStream()
    })

    expect(mockAbort).toHaveBeenCalled()
  })

  it('resets state on reset', () => {
    const { result } = renderHook(() => useAIStream())

    act(() => {
      result.current.reset()
    })

    expect(result.current.content).toBe('')
    expect(result.current.error).toBeNull()
    expect(result.current.isStreaming).toBe(false)
  })
})
