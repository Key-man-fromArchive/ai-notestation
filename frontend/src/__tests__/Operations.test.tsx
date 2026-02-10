import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Operations from '@/pages/Operations'

vi.mock('@/hooks/useSync', () => ({
  useSync: () => ({
    status: 'idle',
    lastSync: '2026-02-10T10:00:00Z',
    notesSynced: 100,
    error: null,
    triggerSync: vi.fn(),
  }),
}))

vi.mock('@/hooks/useSearchIndex', () => ({
  useSearchIndex: () => ({
    status: 'completed',
    totalNotes: 100,
    indexedNotes: 100,
    pendingNotes: 0,
    error: null,
    triggerIndex: vi.fn(),
    isIndexing: false,
  }),
}))

vi.mock('@/hooks/useActivityLog', () => ({
  useActivityLog: () => ({
    data: { items: [], total: 0 },
    isLoading: false,
  }),
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Operations', () => {
  it('renders status cards', () => {
    renderWithProviders(<Operations />)
    expect(screen.getByText('NAS 동기화')).toBeInTheDocument()
    expect(screen.getByText('임베딩 인덱싱')).toBeInTheDocument()
    expect(screen.getByText('검색 준비 상태')).toBeInTheDocument()
  })

  it('shows empty state for activity log', () => {
    renderWithProviders(<Operations />)
    expect(screen.getByText('작업 기록이 없습니다')).toBeInTheDocument()
  })
})
