import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NoteSharing } from '@/components/NoteSharing'
import { apiClient } from '@/lib/api'

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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('NoteSharing Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when closed', () => {
    vi.mocked(apiClient.get).mockResolvedValue({ accesses: [], can_manage: true })

    const { container } = render(
      <NoteSharing noteId={1} isOpen={false} onClose={() => {}} />,
      { wrapper: createWrapper() },
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders modal when open', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ accesses: [], can_manage: true })

    render(<NoteSharing noteId={1} isOpen={true} onClose={() => {}} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('노트 공유')).toBeInTheDocument()
    })
  })

  it('shows loading spinner while fetching', () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}),
    )

    render(<NoteSharing noteId={1} isOpen={true} onClose={() => {}} />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows empty state when no accesses', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ accesses: [], can_manage: true })

    render(<NoteSharing noteId={1} isOpen={true} onClose={() => {}} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('아직 공유된 사용자가 없습니다')).toBeInTheDocument()
    })
  })

  it('shows access list with users', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      accesses: [
        {
          id: 1,
          note_id: 1,
          user_id: 2,
          user_email: 'user@example.com',
          user_name: 'Test User',
          org_id: null,
          permission: 'read',
          granted_by: 1,
          is_org_wide: false,
        },
      ],
      can_manage: true,
    })

    render(<NoteSharing noteId={1} isOpen={true} onClose={() => {}} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument()
      expect(screen.getByText('user@example.com')).toBeInTheDocument()
    })

    const permissionBadges = screen.getAllByText('읽기')
    expect(permissionBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('shows org-wide access badge', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      accesses: [
        {
          id: 1,
          note_id: 1,
          user_id: null,
          user_email: null,
          user_name: null,
          org_id: 1,
          permission: 'write',
          granted_by: 1,
          is_org_wide: true,
        },
      ],
      can_manage: true,
    })

    render(<NoteSharing noteId={1} isOpen={true} onClose={() => {}} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('전체 조직')).toBeInTheDocument()
    })

    const permissionBadges = screen.getAllByText('편집')
    expect(permissionBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('hides add user form when cannot manage', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ accesses: [], can_manage: false })

    render(<NoteSharing noteId={1} isOpen={true} onClose={() => {}} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText(/접근 권한/)).toBeInTheDocument()
    })

    expect(screen.queryByPlaceholderText('이메일 주소')).not.toBeInTheDocument()
  })

  it('shows add user form when can manage', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ accesses: [], can_manage: true })

    render(<NoteSharing noteId={1} isOpen={true} onClose={() => {}} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText(/접근 권한/)).toBeInTheDocument()
    })

    expect(screen.getByPlaceholderText('이메일 주소')).toBeInTheDocument()
  })

  it('grants access when form submitted', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.get).mockResolvedValue({ accesses: [], can_manage: true })
    vi.mocked(apiClient.post).mockResolvedValue({
      id: 1,
      note_id: 1,
      user_id: 2,
      user_email: 'new@example.com',
      user_name: 'New User',
      org_id: null,
      permission: 'read',
      granted_by: 1,
      is_org_wide: false,
    })

    render(<NoteSharing noteId={1} isOpen={true} onClose={() => {}} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText(/접근 권한/)).toBeInTheDocument()
    })

    const emailInput = screen.getByPlaceholderText('이메일 주소')
    await user.type(emailInput, 'new@example.com')
    
    const submitButton = screen.getByRole('button', { name: /사용자 추가/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/notes/1/share', {
        email: 'new@example.com',
        permission: 'read',
      })
    })
  })

  it('calls onClose when clicking backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    vi.mocked(apiClient.get).mockResolvedValue({ accesses: [], can_manage: true })

    render(<NoteSharing noteId={1} isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('노트 공유')).toBeInTheDocument()
    })

    const backdrop = document.querySelector('.bg-black\\/50')
    if (backdrop) {
      await user.click(backdrop)
      expect(onClose).toHaveBeenCalled()
    }
  })

  it('calls onClose when clicking close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    vi.mocked(apiClient.get).mockResolvedValue({ accesses: [], can_manage: true })

    render(<NoteSharing noteId={1} isOpen={true} onClose={onClose} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('노트 공유')).toBeInTheDocument()
    })

    const closeButton = screen.getByRole('button', { name: '' })
    await user.click(closeButton)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows error message on grant failure', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.get).mockResolvedValue({ accesses: [], can_manage: true })
    vi.mocked(apiClient.post).mockRejectedValue(
      new Error('Failed'),
    )

    render(<NoteSharing noteId={1} isOpen={true} onClose={() => {}} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('이메일 주소')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('이메일 주소'), 'bad@example.com')
    await user.click(screen.getByRole('button', { name: /사용자 추가/i }))

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })
  })
})
