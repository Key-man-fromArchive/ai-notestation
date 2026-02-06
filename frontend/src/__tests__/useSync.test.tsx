// @TASK P5-T5.3 - useSync 훅 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#동기화-훅

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSync } from '../hooks/useSync'
import * as api from '../lib/api'

// Mock API
vi.mock('../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useSync hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns sync status', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      status: 'idle',
      last_sync_at: '2026-01-30T00:00:00Z',
      notes_synced: 42,
      error_message: null,
    })

    const { result } = renderHook(() => useSync(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.status).toBe('idle')
      expect(result.current.lastSync).toBe('2026-01-30T00:00:00Z')
      expect(result.current.notesSynced).toBe(42)
    })
  })

  it('triggers sync', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      status: 'idle',
      last_sync_at: null,
      notes_synced: null,
      error_message: null,
    })

    vi.mocked(api.apiClient.post).mockResolvedValue({
      status: 'syncing',
      message: 'Sync started',
    })

    const { result } = renderHook(() => useSync(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.triggerSync()
    })

    expect(api.apiClient.post).toHaveBeenCalledWith('/sync/trigger', {})
  })

  it('handles sync error', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      status: 'error',
      last_sync_at: null,
      notes_synced: null,
      error_message: 'NAS connection failed',
    })

    const { result } = renderHook(() => useSync(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('NAS connection failed')
    })
  })
})
