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
          search_type: 'search',
        },
      ],
      query: 'test',
      search_type: 'search',
      total: 1,
    }

    vi.mocked(api.apiClient.get).mockResolvedValue(mockResults)

    const { result } = renderHook(() => useSearch('test', 'search'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // useInfiniteQuery returns data.pages array
    expect(result.current.data?.pages).toHaveLength(1)
    expect(result.current.data?.pages[0]).toEqual(mockResults)
  })

  it('skips query when search term is empty', () => {
    const { result } = renderHook(() => useSearch('', 'search'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
  })

  it('handles search error', async () => {
    vi.mocked(api.apiClient.get).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useSearch('test', 'search'), {
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
      search_type: 'search',
      total: 0,
    })

    renderHook(
      ({ query }) => useSearch(query, 'search'),
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

  it('has no next page when results < PAGE_SIZE', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      results: [{ note_id: '1', title: 'Note', snippet: '', score: 0.9, search_type: 'search' }],
      query: 'test',
      search_type: 'search',
      total: 1,
    })

    const { result } = renderHook(() => useSearch('test', 'search'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.hasNextPage).toBe(false)
  })
})
