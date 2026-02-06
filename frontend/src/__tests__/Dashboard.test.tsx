// @TASK P5-T5.3 - Dashboard 페이지 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#dashboard

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../pages/Dashboard'
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
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Dashboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dashboard title', () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      items: [],
    })

    render(<Dashboard />, { wrapper: createWrapper() })
    expect(screen.getByText(/대시보드/i)).toBeInTheDocument()
  })

  it('displays recent notes', async () => {
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path.includes('/notes')) {
        return Promise.resolve({
          items: [
            { note_id: '1', title: 'Recent Note 1', updated_at: '2026-01-30T00:00:00Z' },
            { note_id: '2', title: 'Recent Note 2', updated_at: '2026-01-29T00:00:00Z' },
          ],
          total: 2,
        })
      }
      if (path === '/sync/status') {
        return Promise.resolve({ status: 'idle', last_sync_at: '2026-01-30T00:00:00Z', notes_synced: null, error_message: null })
      }
      return Promise.reject(new Error('Unknown path'))
    })

    render(<Dashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Recent Note 1')).toBeInTheDocument()
      expect(screen.getByText('Recent Note 2')).toBeInTheDocument()
    })
  })

  it('displays sync status', async () => {
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path === '/sync/status') {
        return Promise.resolve({
          status: 'idle',
          last_sync_at: '2026-01-30T00:00:00Z',
          notes_synced: 10,
          error_message: null,
        })
      }
      return Promise.resolve({ items: [], total: 0 })
    })

    render(<Dashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/대기 중/i)).toBeInTheDocument()
    })
  })

  it('shows error banner when NAS connection fails', async () => {
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path === '/sync/status') {
        return Promise.resolve({
          status: 'error',
          last_sync_at: null,
          notes_synced: null,
          error_message: 'Synology authentication failed (error code: 400)',
        })
      }
      return Promise.resolve({ items: [], total: 0 })
    })

    render(<Dashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/NAS 동기화에 실패했습니다/i)).toBeInTheDocument()
      // Check that the user-friendly message is shown
      expect(screen.getByText(/NAS 계정 정보가 올바르지 않습니다/i)).toBeInTheDocument()
    })
  })

  it('displays quick action links', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      items: [],
      total: 0,
    })

    render(<Dashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /검색/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /AI 분석/i })).toBeInTheDocument()
    })
  })
})
