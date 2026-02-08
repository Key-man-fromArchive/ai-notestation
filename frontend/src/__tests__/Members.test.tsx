// @TASK P6-T6.5 - Members 페이지 테스트
// @SPEC docs/plans/phase6-member-auth.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Members from '../pages/Members'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public body: string,
    ) {
      super(`API Error: ${status}`)
      this.name = 'ApiError'
    }
  },
}))

const mockMembers = [
  {
    id: 1,
    user_id: 1,
    email: 'owner@example.com',
    name: 'Team Owner',
    role: 'owner',
    accepted_at: '2025-01-01T00:00:00Z',
    is_pending: false,
  },
  {
    id: 2,
    user_id: 2,
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    accepted_at: '2025-01-02T00:00:00Z',
    is_pending: false,
  },
  {
    id: 3,
    user_id: 3,
    email: 'member@example.com',
    name: 'Team Member',
    role: 'member',
    accepted_at: '2025-01-03T00:00:00Z',
    is_pending: false,
  },
  {
    id: 4,
    user_id: 4,
    email: 'pending@example.com',
    name: '',
    role: 'viewer',
    accepted_at: null,
    is_pending: true,
  },
]

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

describe('Members Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.apiClient.get).mockResolvedValue({
      members: mockMembers,
      total: mockMembers.length,
    })
  })

  describe('rendering', () => {
    it('renders page title and member count', async () => {
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /멤버/i })).toBeInTheDocument()
        expect(screen.getByText(/4명/)).toBeInTheDocument()
      })
    })

    it('renders invite button', async () => {
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /invite member/i })).toBeInTheDocument()
      })
    })

    it('renders member list with roles', async () => {
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('owner@example.com')).toBeInTheDocument()
        expect(screen.getByText('admin@example.com')).toBeInTheDocument()
        expect(screen.getByText('member@example.com')).toBeInTheDocument()
        expect(screen.getAllByText('pending@example.com').length).toBeGreaterThan(0)
      })

      expect(screen.getByText('Owner')).toBeInTheDocument()
      expect(screen.getByText('Admin')).toBeInTheDocument()
      expect(screen.getByText('Member')).toBeInTheDocument()
      expect(screen.getByText('Viewer')).toBeInTheDocument()
    })

    it('shows pending badge for pending members', async () => {
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Pending')).toBeInTheDocument()
      })
    })

    it('shows Edit button for non-owner members', async () => {
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        const editButtons = screen.getAllByText('Edit')
        expect(editButtons).toHaveLength(3)
      })
    })

    it('does not show Edit button for owner', async () => {
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        const ownerRow = screen.getByText('owner@example.com').closest('div[class*="flex items-center justify-between"]') as HTMLElement | null
        expect(ownerRow).toBeInTheDocument()
        expect(within(ownerRow!).queryByText('Edit')).not.toBeInTheDocument()
      })
    })
  })

  describe('loading state', () => {
    it('shows loading spinner while fetching', async () => {
      vi.mocked(api.apiClient.get).mockImplementation(
        () => new Promise(() => {}),
      )

      render(<Members />, { wrapper: createWrapper() })

      expect(screen.getByRole('status')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows error message when fetch fails', async () => {
      vi.mocked(api.apiClient.get).mockRejectedValue(new Error('Network error'))

      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/failed to load members/i)).toBeInTheDocument()
      })
    })
  })

  describe('empty state', () => {
    it('shows empty state when no members', async () => {
      vi.mocked(api.apiClient.get).mockResolvedValue({
        members: [],
        total: 0,
      })

      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/no members yet/i)).toBeInTheDocument()
      })
    })
  })

  describe('invite modal', () => {
    it('opens invite modal when clicking invite button', async () => {
      const user = userEvent.setup()
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /invite member/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /invite member/i }))

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /invite member/i })).toBeInTheDocument()
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/role/i)).toBeInTheDocument()
      })
    })

    it('closes modal when clicking cancel', async () => {
      const user = userEvent.setup()
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /invite member/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /invite member/i }))

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /invite member/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /invite member/i })).not.toBeInTheDocument()
      })
    })

    it('sends invite and shows success message', async () => {
      vi.mocked(api.apiClient.post).mockResolvedValue({
        invite_token: 'token123',
        email: 'new@example.com',
        role: 'member',
        expires_at: '2025-02-01T00:00:00Z',
      })

      const user = userEvent.setup()
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /invite member/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /invite member/i }))

      await waitFor(() => {
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/email address/i), 'new@example.com')
      await user.click(screen.getByRole('button', { name: /send invitation/i }))

      await waitFor(() => {
        expect(screen.getByText(/invitation sent/i)).toBeInTheDocument()
      })

      expect(api.apiClient.post).toHaveBeenCalledWith('/members/invite', {
        email: 'new@example.com',
        role: 'member',
      })
    })

    it('shows error when invite fails', async () => {
      const error = new Error('User already invited')
      vi.mocked(api.apiClient.post).mockRejectedValue(error)

      const user = userEvent.setup()
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /invite member/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /invite member/i }))

      await waitFor(() => {
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/email address/i), 'existing@example.com')
      await user.click(screen.getByRole('button', { name: /send invitation/i }))

      await waitFor(() => {
        expect(screen.getByText(/user already invited/i)).toBeInTheDocument()
      })
    })
  })

  describe('role editing', () => {
    it('opens role editor when clicking Edit', async () => {
      const user = userEvent.setup()
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getAllByText('Edit')).toHaveLength(3)
      })

      const editButtons = screen.getAllByText('Edit')
      await user.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      })
    })

    it('updates role when saving', async () => {
      vi.mocked(api.apiClient.put).mockResolvedValue({
        id: 2,
        user_id: 2,
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'member',
        accepted_at: '2025-01-02T00:00:00Z',
        is_pending: false,
      })

      const user = userEvent.setup()
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getAllByText('Edit')).toHaveLength(3)
      })

      const editButtons = screen.getAllByText('Edit')
      await user.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      await user.selectOptions(screen.getByRole('combobox'), 'member')
      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(api.apiClient.put).toHaveBeenCalledWith('/members/2/role', { role: 'member' })
      })
    })

    it('cancels role editing', async () => {
      const user = userEvent.setup()
      render(<Members />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getAllByText('Edit')).toHaveLength(3)
      })

      const editButtons = screen.getAllByText('Edit')
      await user.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      await waitFor(() => {
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
        expect(screen.getAllByText('Edit')).toHaveLength(3)
      })
    })
  })
})
