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

/** Convert a Record of settings to the array format the real API returns */
function toSettingsArray(record: Record<string, string>): Array<{ key: string; value: string }> {
  return Object.entries(record).map(([key, value]) => ({ key, value }))
}

const DEFAULT_SETTINGS: Record<string, string> = {
  openai_api_key: '',
  anthropic_api_key: '',
  google_api_key: '',
  zhipuai_api_key: '',
  nas_url: '',
  nas_user: '',
  nas_password: '',
}

/** Default mock: OpenAI + Google OAuth configured but not connected */
function mockDefaultApi(overrides?: Record<string, unknown>) {
  vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
    if (path === '/settings') {
      const merged = {
        ...DEFAULT_SETTINGS,
        ...((overrides as Record<string, unknown>)?.settings ?? {}),
      }
      return Promise.resolve({
        settings: toSettingsArray(merged as Record<string, string>),
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
    if (path === '/oauth/anthropic/config-status') {
      return Promise.resolve({ configured: true, provider: 'anthropic' })
    }
    if (path === '/oauth/anthropic/status') {
      return Promise.resolve(
        (overrides as Record<string, unknown>)?.anthropicStatus ?? { connected: false, provider: 'anthropic' }
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
      expect(toggleButtons.length).toBe(3) // OpenAI + Google + Anthropic
    })
  })

  it('shows direct API key input only for ZhipuAI (non-OAuth provider)', async () => {
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path === '/settings') {
        return Promise.resolve({
          settings: toSettingsArray({ ...DEFAULT_SETTINGS, zhipuai_api_key: 'glm****' }),
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
      if (path === '/oauth/anthropic/config-status') {
        return Promise.resolve({ configured: true, provider: 'anthropic' })
      }
      if (path === '/oauth/anthropic/status') {
        return Promise.resolve({ connected: false, provider: 'anthropic' })
      }
      return Promise.resolve({})
    })

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /설정/ })).toBeInTheDocument()
    })

    // ZhipuAI has no OAuth, so input is directly visible
    await waitFor(() => {
      expect(screen.getByLabelText(/ZhipuAI API Key/i)).toBeInTheDocument()
    })

    // Verify no OAuth button for ZhipuAI
    expect(
      screen.queryByRole('button', { name: /ZhipuAI로 연결/i })
    ).not.toBeInTheDocument()
  })

  it('handles OAuth connection error', async () => {
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path === '/settings') {
        return Promise.resolve({
          settings: toSettingsArray(DEFAULT_SETTINGS),
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

  it('shows OAuth URL after clicking connect', async () => {
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=abc'
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path === '/settings') {
        return Promise.resolve({
          settings: toSettingsArray(DEFAULT_SETTINGS),
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

    const user = userEvent.setup()
    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Google로 연결/i })
      ).toBeInTheDocument()
    })

    const connectButton = screen.getByRole('button', { name: /Google로 연결/i })
    await user.click(connectButton)

    // Verify OAuth URL is displayed instead of redirect
    await waitFor(() => {
      expect(screen.getByDisplayValue(authUrl)).toBeInTheDocument()
    })

    // Verify copy and open buttons are shown
    expect(screen.getByTitle('복사')).toBeInTheDocument()
    expect(screen.getByTitle('새 탭에서 열기')).toBeInTheDocument()
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
