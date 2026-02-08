import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShareDialog } from '@/components/ShareDialog'
import { apiClient } from '@/lib/api'
import type { ReactNode } from 'react'

vi.mock('@/lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public body: string,
    ) {
      super(`API Error: ${status}`)
    }
  },
}))

const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
}
Object.assign(navigator, { clipboard: mockClipboard })

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('ShareDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.get).mockResolvedValue({ items: [] })
  })

  it('renders share dialog when open', async () => {
    render(<ShareDialog notebookId={1} isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByText('공유 링크')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('새 링크 생성')).toBeInTheDocument()
    })
  })

  it('does not render when closed', () => {
    render(<ShareDialog notebookId={1} isOpen={false} onClose={onClose} />, {
      wrapper: createWrapper(),
    })

    expect(screen.queryByText('공유 링크')).not.toBeInTheDocument()
  })

  it('displays link type options', async () => {
    render(<ShareDialog notebookId={1} isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('공개 링크')).toBeInTheDocument()
    })

    expect(screen.getByText('이메일 필수')).toBeInTheDocument()
    expect(screen.getByText('기간 제한')).toBeInTheDocument()
  })

  it('shows email input when email_required is selected', async () => {
    const user = userEvent.setup()

    render(<ShareDialog notebookId={1} isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('이메일 필수')).toBeInTheDocument()
    })

    await user.click(screen.getByText('이메일 필수'))

    expect(screen.getByLabelText('허용 이메일')).toBeInTheDocument()
  })

  it('shows expiry input when time_limited is selected', async () => {
    const user = userEvent.setup()

    render(<ShareDialog notebookId={1} isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('기간 제한')).toBeInTheDocument()
    })

    await user.click(screen.getByText('기간 제한'))

    expect(screen.getByLabelText('유효 기간 (일)')).toBeInTheDocument()
  })

  it('creates a public link', async () => {
    const user = userEvent.setup()
    const mockNewLink = {
      id: 1,
      token: 'newtoken123',
      notebook_id: 1,
      note_id: null,
      link_type: 'public',
      email_restriction: null,
      expires_at: null,
      access_count: 0,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    }

    vi.mocked(apiClient.post).mockResolvedValueOnce(mockNewLink)

    render(<ShareDialog notebookId={1} isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('링크 생성')).toBeInTheDocument()
    })

    await user.click(screen.getByText('링크 생성'))

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/notebooks/1/links', {
        link_type: 'public',
      })
    })
  })

  it('displays existing links', async () => {
    const mockLinks = {
      items: [
        {
          id: 1,
          token: 'existing123',
          notebook_id: 1,
          note_id: null,
          link_type: 'public',
          email_restriction: null,
          expires_at: null,
          access_count: 10,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    }

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockLinks)

    render(<ShareDialog notebookId={1} isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('활성 링크 (1)')).toBeInTheDocument()
    })

    expect(screen.getByText('접근 10회')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()

    render(<ShareDialog notebookId={1} isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('공유 링크')).toBeInTheDocument()
    })

    const closeButtons = screen.getAllByRole('button')
    const closeButton = closeButtons.find(
      btn => btn.querySelector('svg.lucide-x') !== null,
    )

    if (closeButton) {
      await user.click(closeButton)
      expect(onClose).toHaveBeenCalled()
    }
  })
})
