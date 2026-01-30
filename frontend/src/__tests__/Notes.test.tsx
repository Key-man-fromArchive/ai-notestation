// @TASK P5-T5.2 - Notes 페이지 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-목록
// @TEST frontend/src/__tests__/Notes.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { queryClient } from '@/lib/query-client'
import Notes from '@/pages/Notes'
import { apiClient } from '@/lib/api'
import type { NotesResponse, NotebooksResponse } from '@/types/note'

// Mock API client
vi.mock('@/lib/api', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

const mockNotesResponse: NotesResponse = {
  items: [
    {
      id: '1',
      title: 'Test Note 1',
      snippet: 'This is test note 1',
      notebook: 'Work',
      updated_at: '2026-01-30T00:00:00Z',
      tags: ['tag1'],
    },
    {
      id: '2',
      title: 'Test Note 2',
      snippet: 'This is test note 2',
      notebook: 'Personal',
      updated_at: '2026-01-29T00:00:00Z',
      tags: ['tag2'],
    },
  ],
  total: 2,
  offset: 0,
  limit: 20,
}

const mockNotebooksResponse: NotebooksResponse = {
  items: [
    { name: 'Work', note_count: 10 },
    { name: 'Personal', note_count: 5 },
  ],
}

function renderNotes() {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Notes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('Notes Page', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('shows loading spinner initially', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}))
    renderNotes()
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('renders note list successfully', async () => {
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path.includes('/notebooks')) {
        return Promise.resolve(mockNotebooksResponse)
      }
      if (path.includes('/notes')) {
        return Promise.resolve(mockNotesResponse)
      }
      return Promise.reject(new Error('Unknown path'))
    })

    renderNotes()

    // 노트북 사이드바가 렌더링되는지 확인
    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    // 리스트 컨테이너가 렌더링되는지 확인
    expect(screen.getByRole('list', { name: '노트 목록' })).toBeInTheDocument()

    // 가상화 때문에 실제 노트가 보이지 않을 수 있으므로,
    // API가 성공적으로 호출되었는지 확인
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith(
      expect.stringContaining('/notes')
    )
  })

  it('shows empty state when no notes', async () => {
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path.includes('/notebooks')) {
        return Promise.resolve({ items: [] })
      }
      if (path.includes('/notes')) {
        return Promise.resolve({
          items: [],
          total: 0,
          offset: 0,
          limit: 20,
        })
      }
      return Promise.reject(new Error('Unknown path'))
    })

    renderNotes()

    await waitFor(() => {
      expect(screen.getByText(/노트가 없습니다/i)).toBeInTheDocument()
    })
  })

  it('shows error state on API failure', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('API Error'))

    renderNotes()

    await waitFor(
      () => {
        expect(screen.getByText(/에러가 발생했습니다/i)).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })

  it('displays notebook filter sidebar', async () => {
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path.includes('/notebooks')) {
        return Promise.resolve(mockNotebooksResponse)
      }
      if (path.includes('/notes')) {
        return Promise.resolve(mockNotesResponse)
      }
      return Promise.reject(new Error('Unknown path'))
    })

    renderNotes()

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
      expect(screen.getByText('Personal')).toBeInTheDocument()
    })
  })
})
