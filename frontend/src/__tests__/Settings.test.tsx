// @TASK P5-T5.3 - Settings 페이지 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#settings-페이지

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Settings from '../pages/Settings'
import * as api from '../lib/api'

// Mock API
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

vi.mock('../hooks/useOAuth', () => ({
  useOAuth: () => ({
    connected: false,
    email: null,
    isLoading: false,
    isConnecting: false,
    isDisconnecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    exchangeCode: vi.fn(),
    callbackError: null,
  }),
}))

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

describe('Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path === '/settings') {
        return Promise.resolve({
          settings: [
            { key: 'nas_url', value: 'https://nas.example.com' },
            { key: 'nas_user', value: 'admin' },
            { key: 'nas_password', value: '****' },
            { key: 'openai_api_key', value: 'sk-****' },
            { key: 'anthropic_api_key', value: 'ant****' },
          ],
        })
      }
      // OAuth status endpoints
      if (path.includes('/oauth/') && path.includes('/status')) {
        return Promise.resolve({ connected: false })
      }
      return Promise.resolve({})
    })
  })

  it('renders settings list', async () => {
    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/OpenAI API Key/i)).toBeInTheDocument()
      expect(screen.getByText(/Anthropic API Key/i)).toBeInTheDocument()
    })
  })

  it('masks API keys', async () => {
    render(<Settings />, { wrapper: createWrapper() })

    // Anthropic key is always visible (no OAuth)
    await waitFor(() => {
      expect(screen.getByDisplayValue('ant****')).toBeInTheDocument()
    })

    // OpenAI key is behind a collapsible toggle (OAuth provider)
    // Verify the label is present
    expect(screen.getByText(/OpenAI API Key/i)).toBeInTheDocument()
  })

  it('updates setting value', async () => {
    vi.mocked(api.apiClient.put).mockResolvedValue({
      key: 'nas_url',
      value: 'http://new-nas:5000',
    })

    const user = userEvent.setup()
    render(<Settings />, { wrapper: createWrapper() })

    // NAS URL is always visible in the NAS section
    await waitFor(() => {
      expect(screen.getByDisplayValue('https://nas.example.com')).toBeInTheDocument()
    })

    // 수정 버튼 클릭 (NAS URL is the first editable field)
    const editButtons = screen.getAllByText('수정')
    await user.click(editButtons[0])

    // 입력 필드가 편집 가능해졌는지 확인
    await waitFor(() => {
      const input = screen.getByDisplayValue('https://nas.example.com')
      expect(input).not.toHaveAttribute('readonly')
    })

    // 저장 버튼이 나타났는지 확인
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /저장/i })).toBeInTheDocument()
    })
  })

  it('displays NAS connection status', async () => {
    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/Synology NAS 연결/i)).toBeInTheDocument()
    })
  })

  it('handles settings load error', async () => {
    vi.mocked(api.apiClient.get).mockRejectedValue(new Error('Load failed'))

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/설정을 불러올 수 없습니다/i)).toBeInTheDocument()
    })
  })
})
