// @TASK P5-T5.3 - Search 페이지 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-페이지

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Search from '../pages/Search'
import * as api from '../lib/api'

// Mock API
vi.mock('../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

const createWrapper = (initialRoute = '/search') => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/search" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Search Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders search input', () => {
    render(<Search />, { wrapper: createWrapper() })
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('shows empty state when no query', () => {
    render(<Search />, { wrapper: createWrapper() })
    expect(screen.getByText(/검색어를 입력하세요/i)).toBeInTheDocument()
  })

  it('displays search results', async () => {
    const mockResults = {
      results: [
        {
          note_id: '1',
          title: 'Test Note',
          snippet: 'This is a test snippet',
          score: 0.95,
          search_type: 'fts',
        },
      ],
      query: 'test',
      search_type: 'hybrid',
      total: 1,
    }

    vi.mocked(api.apiClient.get).mockResolvedValue(mockResults)

    render(<Search />, { wrapper: createWrapper('/search?q=test&type=hybrid') })

    await waitFor(() => {
      expect(screen.getByText('Test Note')).toBeInTheDocument()
    })
  })

  it('shows empty results message', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      results: [],
      query: 'nonexistent',
      search_type: 'hybrid',
      total: 0,
    })

    render(<Search />, { wrapper: createWrapper('/search?q=nonexistent') })

    await waitFor(() => {
      const elements = screen.getAllByText(/결과가 없습니다/i)
      expect(elements.length).toBeGreaterThan(0)
    })
  })

  it('handles search error', async () => {
    vi.mocked(api.apiClient.get).mockRejectedValue(new Error('Network error'))

    render(<Search />, { wrapper: createWrapper('/search?q=error') })

    await waitFor(() => {
      expect(screen.getByText(/검색 중 오류가 발생했습니다/i)).toBeInTheDocument()
    })
  })

  it('reflects search query in URL', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      results: [],
      query: 'test',
      search_type: 'hybrid',
      total: 0,
    })

    render(<Search />, { wrapper: createWrapper('/search?q=test&type=hybrid') })

    // URL 파라미터가 초기 상태와 일치하는지 확인
    expect(screen.getByRole('searchbox')).toHaveValue('test')
  })
})
