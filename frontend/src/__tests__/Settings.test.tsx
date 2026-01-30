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
  },
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
    vi.mocked(api.apiClient.get).mockResolvedValue({
      settings: {
        openai_api_key: 'sk-****',
        anthropic_api_key: 'ant****',
        nas_url: 'https://nas.example.com',
      },
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

    await waitFor(() => {
      expect(screen.getByDisplayValue('sk-****')).toBeInTheDocument()
      expect(screen.getByDisplayValue('ant****')).toBeInTheDocument()
    })
  })

  it('updates setting value', async () => {
    vi.mocked(api.apiClient.put).mockResolvedValue({
      key: 'openai_api_key',
      value: 'sk-new-key',
    })

    const user = userEvent.setup()
    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByDisplayValue('sk-****')).toBeInTheDocument()
    })

    // 수정 버튼 클릭
    const editButtons = screen.getAllByText('수정')
    await user.click(editButtons[0]) // OpenAI 키 수정

    // 입력 필드가 편집 가능해졌는지 확인
    await waitFor(() => {
      const input = screen.getByDisplayValue('sk-****')
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
      expect(screen.getByText(/NAS 연결 상태/i)).toBeInTheDocument()
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
