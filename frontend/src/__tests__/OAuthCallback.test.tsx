// @TASK P6D-T6D.4 - OAuthCallback 페이지 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#oauth-인증

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import OAuthCallback from '../pages/OAuthCallback'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

const mockNavigate = vi.fn()

// Track what useSearchParams should return — controllable per test
let mockSearchParams = new URLSearchParams('code=abc&state=xyz')

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams],
  }
})

const createWrapper = (initialEntries: string[]) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('OAuthCallback page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    // Reset to default params with code and state
    mockSearchParams = new URLSearchParams('code=abc&state=xyz')
  })

  it('shows processing state initially', () => {
    sessionStorage.setItem('oauth_provider', 'google')

    vi.mocked(api.apiClient.post).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(<OAuthCallback />, {
      wrapper: createWrapper(['/oauth/callback?code=abc&state=xyz']),
    })

    expect(screen.getByText(/OAuth 인증 처리 중/i)).toBeInTheDocument()
  })

  it('shows success and redirects after exchange', async () => {
    sessionStorage.setItem('oauth_provider', 'google')

    vi.mocked(api.apiClient.post).mockResolvedValue({
      connected: true,
      provider: 'google',
      email: 'user@gmail.com',
    })

    render(<OAuthCallback />, {
      wrapper: createWrapper(['/oauth/callback?code=abc&state=xyz']),
    })

    await waitFor(() => {
      expect(screen.getByText(/연결 완료/i)).toBeInTheDocument()
    })

    expect(api.apiClient.post).toHaveBeenCalledWith('/oauth/google/callback', {
      code: 'abc',
      state: 'xyz',
    })
  })

  it('shows error when code is missing', async () => {
    // Override search params to have no code/state
    mockSearchParams = new URLSearchParams('')

    render(<OAuthCallback />, {
      wrapper: createWrapper(['/oauth/callback']),
    })

    await waitFor(() => {
      expect(screen.getByText(/연결 실패/i)).toBeInTheDocument()
    })

    expect(
      screen.getByText(/인증 코드가 없습니다/i)
    ).toBeInTheDocument()
  })

  it('shows error on exchange failure', async () => {
    sessionStorage.setItem('oauth_provider', 'google')

    vi.mocked(api.apiClient.post).mockRejectedValue(
      new Error('Token exchange failed')
    )

    render(<OAuthCallback />, {
      wrapper: createWrapper(['/oauth/callback?code=abc&state=xyz']),
    })

    await waitFor(() => {
      expect(screen.getByText(/연결 실패/i)).toBeInTheDocument()
    })
  })

  it('defaults to google when provider not in session', async () => {
    // Don't set provider in sessionStorage — component defaults to 'google'

    vi.mocked(api.apiClient.post).mockResolvedValue({
      connected: true,
      provider: 'google',
      email: 'user@gmail.com',
    })

    render(<OAuthCallback />, {
      wrapper: createWrapper(['/oauth/callback?code=abc&state=xyz']),
    })

    await waitFor(() => {
      expect(api.apiClient.post).toHaveBeenCalledWith('/oauth/google/callback', {
        code: 'abc',
        state: 'xyz',
      })
    })
  })

  it('displays back button on error', async () => {
    vi.mocked(api.apiClient.post).mockRejectedValue(
      new Error('Network error')
    )

    sessionStorage.setItem('oauth_provider', 'google')

    render(<OAuthCallback />, {
      wrapper: createWrapper(['/oauth/callback?code=abc&state=xyz']),
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /설정으로 돌아가기/i })).toBeInTheDocument()
    })
  })

  it('closes or redirects on success', async () => {
    sessionStorage.setItem('oauth_provider', 'google')

    vi.mocked(api.apiClient.post).mockResolvedValue({
      connected: true,
      provider: 'google',
      email: 'user@gmail.com',
    })

    render(<OAuthCallback />, {
      wrapper: createWrapper(['/oauth/callback?code=abc&state=xyz']),
    })

    // Wait for success state first
    await waitFor(() => {
      expect(screen.getByText(/연결 완료/i)).toBeInTheDocument()
    })

    // Wait for the setTimeout redirect (1500ms)
    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith('/settings', { replace: true })
      },
      { timeout: 3000 }
    )
  })

  it('exchanges code for OpenAI OAuth', async () => {
    sessionStorage.setItem('oauth_provider', 'openai')

    vi.mocked(api.apiClient.post).mockResolvedValue({
      connected: true,
      provider: 'openai',
      email: 'user@openai.com',
    })

    render(<OAuthCallback />, {
      wrapper: createWrapper(['/oauth/callback?code=abc&state=xyz']),
    })

    await waitFor(() => {
      expect(api.apiClient.post).toHaveBeenCalledWith(
        '/oauth/openai/callback',
        {
          code: 'abc',
          state: 'xyz',
        }
      )
    })
  })

  it('clears sessionStorage after successful exchange', async () => {
    sessionStorage.setItem('oauth_provider', 'google')

    vi.mocked(api.apiClient.post).mockResolvedValue({
      connected: true,
      provider: 'google',
      email: 'user@gmail.com',
    })

    render(<OAuthCallback />, {
      wrapper: createWrapper(['/oauth/callback?code=abc&state=xyz']),
    })

    await waitFor(() => {
      expect(sessionStorage.getItem('oauth_provider')).toBeNull()
    })
  })
})
