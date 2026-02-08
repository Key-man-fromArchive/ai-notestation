import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import Notebooks from '../pages/Notebooks'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
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

function renderNotebooks() {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Notebooks />
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

describe('Notebooks Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    vi.mocked(api.apiClient.get).mockReturnValue(new Promise(() => {}))
    renderNotebooks()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders notebooks grid', async () => {
    const mockData = {
      items: [
        {
          id: 1,
          name: 'Work Notebook',
          description: 'Work related notes',
          note_count: 10,
          is_public: false,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          name: 'Personal',
          description: null,
          note_count: 5,
          is_public: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
      total: 2,
    }

    vi.mocked(api.apiClient.get).mockResolvedValue(mockData)

    renderNotebooks()

    await waitFor(() => {
      expect(screen.getByText('Work Notebook')).toBeInTheDocument()
    })

    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.getByText('Work related notes')).toBeInTheDocument()
    expect(screen.getByText('10개 노트')).toBeInTheDocument()
    expect(screen.getByText('5개 노트')).toBeInTheDocument()
  })

  it('shows empty state when no notebooks', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({ items: [], total: 0 })

    renderNotebooks()

    await waitFor(() => {
      expect(screen.getByText('노트북이 없습니다')).toBeInTheDocument()
    })
  })

  it('opens create modal when button clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(api.apiClient.get).mockResolvedValue({ items: [], total: 0 })

    renderNotebooks()

    await waitFor(() => {
      expect(screen.getByText('노트북이 없습니다')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /새 노트북/i }))

    expect(screen.getByText('새 노트북 만들기')).toBeInTheDocument()
    expect(screen.getByLabelText('이름')).toBeInTheDocument()
  })

  it('creates notebook on form submit', async () => {
    const user = userEvent.setup()
    vi.mocked(api.apiClient.get).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(api.apiClient.post).mockResolvedValue({
      id: 1,
      name: 'New Notebook',
      description: null,
      note_count: 0,
      is_public: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })

    renderNotebooks()

    await waitFor(() => {
      expect(screen.getByText('노트북이 없습니다')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /새 노트북/i }))
    await user.type(screen.getByLabelText('이름'), 'New Notebook')
    await user.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => {
      expect(api.apiClient.post).toHaveBeenCalledWith('/notebooks', {
        name: 'New Notebook',
        description: undefined,
      })
    })
  })
})
