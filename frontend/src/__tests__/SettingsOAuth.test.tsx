// @TASK P6D-T6D.4 - Settings OAuth UI 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#설정-페이지

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Settings from '../pages/Settings'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../hooks/useSync', () => ({
  useSync: () => ({
    status: 'idle',
    lastSync: null,
    error: null,
    triggerSync: vi.fn(),
  }),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

/** Default mock: OpenAI + Google OAuth configured but not connected */
function mockDefaultApi(overrides?: Record<string, unknown>) {
  vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
    if (path === '/settings') {
      return Promise.resolve({
        settings: {
          openai_api_key: '',
          anthropic_api_key: '',
          google_api_key: '',
          zhipuai_api_key: '',
          nas_url: '',
          ...((overrides as Record<string, unknown>)?.settings ?? {}),
        },
      })
    }
    if (path === '/oauth/openai/config-status') {
      return Promise.resolve({ configured: true, provider: 'openai' })
    }
    if (path === '/oauth/openai/status') {
      return Promise.resolve(
        (overrides as Record<string, unknown>)?.openaiStatus ?? { connected: false, provider: 'openai' }
      )
    }
    if (path === '/oauth/google/config-status') {
      return Promise.resolve({ configured: true, provider: 'google' })
    }
    if (path === '/oauth/google/status') {
      return Promise.resolve(
        (overrides as Record<string, unknown>)?.googleStatus ?? { connected: false, provider: 'google' }
      )
    }
    return Promise.resolve({})
  })
}

describe('Settings OAuth UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('renders OAuth connect buttons for ChatGPT and Google', async () => {
    mockDefaultApi()

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /설정/ })).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Google로 연결/i })
      ).toBeInTheDocument()
      // OpenAI OAuth via ChatGPT Codex flow
      expect(
        screen.getByRole('button', { name: /ChatGPT \(Plus\/Pro\)로 연결/i })
      ).toBeInTheDocument()
    })
  })

  it('shows connected status for OAuth provider', async () => {
    mockDefaultApi({
      googleStatus: {
        connected: true,
        provider: 'google',
        email: 'user@gmail.com',
      },
    })

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /설정/ })).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText(/user@gmail.com/)).toBeInTheDocument()
    })
  })

  it('shows disconnect button for connected OAuth provider', async () => {
    mockDefaultApi({
      googleStatus: {
        connected: true,
        provider: 'google',
        email: 'user@gmail.com',
      },
    })

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /연결 해제/i })
      ).toBeInTheDocument()
    })
  })

  it('disconnects OAuth provider', async () => {
    mockDefaultApi({
      googleStatus: {
        connected: true,
        provider: 'google',
        email: 'user@gmail.com',
      },
    })

    vi.mocked(api.apiClient.delete).mockResolvedValue({
      connected: false,
      provider: 'google',
    })

    const user = userEvent.setup()
    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /연결 해제/i })
      ).toBeInTheDocument()
    })

    const disconnectButton = screen.getByRole('button', { name: /연결 해제/i })
    await user.click(disconnectButton)

    await waitFor(() => {
      expect(api.apiClient.delete).toHaveBeenCalledWith('/oauth/google/disconnect')
    })
  })

  it('shows API key fallback toggle for OAuth providers', async () => {
    mockDefaultApi()

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /설정/ })).toBeInTheDocument()
    })

    await waitFor(() => {
      const toggleButtons = screen.getAllByText(/API 키로 직접 입력/i)
      expect(toggleButtons.length).toBe(2) // OpenAI + Google
    })
  })

  it('does not show OAuth for Anthropic and ZhipuAI', async () => {
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path === '/settings') {
        return Promise.resolve({
          settings: {
            openai_api_key: '',
            anthropic_api_key: 'ant****',
            google_api_key: '',
            zhipuai_api_key: '',
            nas_url: '',
          },
        })
      }
      if (path === '/oauth/openai/config-status') {
        return Promise.resolve({ configured: true, provider: 'openai' })
      }
      if (path === '/oauth/openai/status') {
        return Promise.resolve({ connected: false, provider: 'openai' })
      }
      if (path === '/oauth/google/config-status') {
        return Promise.resolve({ configured: true, provider: 'google' })
      }
      if (path === '/oauth/google/status') {
        return Promise.resolve({ connected: false, provider: 'google' })
      }
      return Promise.resolve({})
    })

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /설정/ })).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByLabelText(/Anthropic API Key/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/ZhipuAI API Key/i)).toBeInTheDocument()
    })

    // Verify no OAuth buttons for these providers
    expect(
      screen.queryByRole('button', { name: /Anthropic로 연결/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /ZhipuAI로 연결/i })
    ).not.toBeInTheDocument()
  })

  it('handles OAuth connection error', async () => {
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path === '/settings') {
        return Promise.resolve({
          settings: {
            openai_api_key: '',
            anthropic_api_key: '',
            google_api_key: '',
            zhipuai_api_key: '',
            nas_url: '',
          },
        })
      }
      if (path === '/oauth/openai/config-status') {
        return Promise.resolve({ configured: true, provider: 'openai' })
      }
      if (path === '/oauth/openai/status') {
        return Promise.resolve({ connected: false, provider: 'openai' })
      }
      if (path === '/oauth/google/config-status') {
        return Promise.resolve({ configured: true, provider: 'google' })
      }
      if (path === '/oauth/google/status') {
        return Promise.reject(new Error('Connection failed'))
      }
      return Promise.resolve({})
    })

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /설정/ })).toBeInTheDocument()
    })

    // Should still show OAuth button even if status check failed
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Google로 연결/i })
      ).toBeInTheDocument()
    })
  })

  it('initiates OAuth flow with correct state', async () => {
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=abc'
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path === '/settings') {
        return Promise.resolve({
          settings: {
            openai_api_key: '',
            anthropic_api_key: '',
            google_api_key: '',
            zhipuai_api_key: '',
            nas_url: '',
          },
        })
      }
      if (path === '/oauth/google/authorize') {
        return Promise.resolve({
          authorization_url: authUrl,
          state: 'abc',
        })
      }
      if (path === '/oauth/openai/config-status') {
        return Promise.resolve({ configured: true, provider: 'openai' })
      }
      if (path === '/oauth/openai/status') {
        return Promise.resolve({ connected: false, provider: 'openai' })
      }
      if (path === '/oauth/google/config-status') {
        return Promise.resolve({ configured: true, provider: 'google' })
      }
      if (path === '/oauth/google/status') {
        return Promise.resolve({ connected: false, provider: 'google' })
      }
      return Promise.resolve({})
    })

    // Mock window.location.href setter
    const originalLocation = window.location
    const locationMock = { ...originalLocation, href: '' }
    Object.defineProperty(window, 'location', {
      value: locationMock,
      writable: true,
    })

    const user = userEvent.setup()
    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Google로 연결/i })
      ).toBeInTheDocument()
    })

    const connectButton = screen.getByRole('button', { name: /Google로 연결/i })
    await user.click(connectButton)

    await waitFor(() => {
      expect(sessionStorage.getItem('oauth_provider')).toBe('google')
    })

    // Verify redirect to OAuth URL
    expect(window.location.href).toBe(authUrl)

    // Restore
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
  })

  it('displays all available provider sections', async () => {
    mockDefaultApi()

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /설정/ })).toBeInTheDocument()
    })

    // Should display labels for all providers
    await waitFor(() => {
      expect(screen.getByText('Google API Key (Gemini)')).toBeInTheDocument()
      expect(screen.getByText('OpenAI API Key')).toBeInTheDocument()
      expect(screen.getByText('Anthropic API Key')).toBeInTheDocument()
      expect(screen.getByText('ZhipuAI API Key (GLM)')).toBeInTheDocument()
    })
  })
})
