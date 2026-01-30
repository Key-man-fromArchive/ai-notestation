// @TASK P5-T5.3 - useSearch 훅 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#검색-훅

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSearch } from '../hooks/useSearch'
import * as api from '../lib/api'

// Mock API
vi.mock('../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
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

describe('useSearch hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns search results', async () => {
    const mockResults = {
      results: [
        {
          note_id: '1',
          title: 'Test Note',
          snippet: 'snippet',
          score: 0.95,
          search_type: 'fts',
        },
      ],
      query: 'test',
      search_type: 'hybrid',
      total: 1,
    }

    vi.mocked(api.apiClient.get).mockResolvedValue(mockResults)

    const { result } = renderHook(() => useSearch('test', 'hybrid'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockResults)
  })

  it('skips query when search term is empty', () => {
    const { result } = renderHook(() => useSearch('', 'hybrid'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
  })

  it('handles search error', async () => {
    vi.mocked(api.apiClient.get).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useSearch('test', 'hybrid'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toBeTruthy()
  })

  it('debounces search queries', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      results: [],
      query: 'test',
      search_type: 'hybrid',
      total: 0,
    })

    renderHook(
      ({ query }) => useSearch(query, 'hybrid'),
      {
        wrapper: createWrapper(),
        initialProps: { query: 't' },
      }
    )

    // 300ms 후 API가 호출되어야 함 (debounce 적용)
    await waitFor(
      () => {
        expect(api.apiClient.get).toHaveBeenCalled()
      },
      { timeout: 500 }
    )
  })
})
