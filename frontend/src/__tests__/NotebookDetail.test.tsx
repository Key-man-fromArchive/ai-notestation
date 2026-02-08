import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import NotebookDetail from '../pages/NotebookDetail'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class extends Error {
    constructor(
      public status: number,
      public body: string,
    ) {
      super(`API Error: ${status}`)
    }
  },
}))

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

function renderNotebookDetail(notebookId = '1') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/notebooks/${notebookId}`]}>
        <Routes>
          <Route path="/notebooks/:id" element={<NotebookDetail />} />
          <Route path="/notebooks" element={<div>Notebooks List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const mockNotebook = {
  id: 1,
  name: 'Work Notebook',
  description: 'Work related notes',
  note_count: 2,
  is_public: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockNotesResponse = {
  items: [
    {
      note_id: '1',
      title: 'Note 1',
      snippet: 'Content 1',
      notebook: 'Work Notebook',
      updated_at: '2024-01-01T00:00:00Z',
      tags: [],
    },
    {
      note_id: '2',
      title: 'Note 2',
      snippet: 'Content 2',
      notebook: 'Work Notebook',
      updated_at: '2024-01-01T00:00:00Z',
      tags: [],
    },
  ],
  total: 2,
  offset: 0,
  limit: 50,
}

const mockAccessResponse = {
  items: [
    {
      id: 1,
      user_id: 1,
      org_id: null,
      user_email: 'admin@test.com',
      permission: 'admin',
      granted_by: 1,
      created_at: '2024-01-01T00:00:00Z',
    },
  ],
}

describe('NotebookDetail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    vi.mocked(api.apiClient.get).mockReturnValue(new Promise(() => {}))
    renderNotebookDetail()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders notebook details', async () => {
    vi.mocked(api.apiClient.get).mockImplementation((url: string) => {
      if (url === '/notebooks/1') return Promise.resolve(mockNotebook)
      if (url.includes('/notes')) return Promise.resolve(mockNotesResponse)
      if (url.includes('/access')) return Promise.resolve(mockAccessResponse)
      return Promise.resolve({})
    })

    renderNotebookDetail()

    await waitFor(() => {
      expect(screen.getByText('Work Notebook')).toBeInTheDocument()
    })

    expect(screen.getByText('Work related notes')).toBeInTheDocument()
  })

  it('shows access panel', async () => {
    vi.mocked(api.apiClient.get).mockImplementation((url: string) => {
      if (url === '/notebooks/1') return Promise.resolve(mockNotebook)
      if (url.includes('/notes')) return Promise.resolve(mockNotesResponse)
      if (url.includes('/access')) return Promise.resolve(mockAccessResponse)
      return Promise.resolve({})
    })

    renderNotebookDetail()

    await waitFor(() => {
      expect(screen.getByTestId('access-panel')).toBeInTheDocument()
    })

    expect(screen.getByText('접근 권한')).toBeInTheDocument()
    expect(screen.getByText('admin@test.com')).toBeInTheDocument()
  })

  it('shows edit and delete buttons', async () => {
    vi.mocked(api.apiClient.get).mockImplementation((url: string) => {
      if (url === '/notebooks/1') return Promise.resolve(mockNotebook)
      if (url.includes('/notes')) return Promise.resolve(mockNotesResponse)
      if (url.includes('/access')) return Promise.resolve(mockAccessResponse)
      return Promise.resolve({})
    })

    renderNotebookDetail()

    await waitFor(() => {
      expect(screen.getByText('Work Notebook')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /편집/i })).toBeInTheDocument()
    expect(screen.getByText('삭제')).toBeInTheDocument()
  })
})
