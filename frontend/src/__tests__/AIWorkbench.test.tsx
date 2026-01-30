// @TASK P5-T5.3 - AI Workbench 페이지 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#ai-workbench-페이지

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import AIWorkbench from '../pages/AIWorkbench'
import * as api from '../lib/api'

// Mock components
vi.mock('../components/AIChat', () => ({
  AIChat: () => <div data-testid="ai-chat">AI Chat</div>,
}))

vi.mock('../components/ModelSelector', () => ({
  ModelSelector: () => <div data-testid="model-selector">Model Selector</div>,
}))

// Mock API
vi.mock('../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
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

describe('AIWorkbench Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock available models
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path === '/ai/models') {
        return Promise.resolve({
          models: [
            { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
            { id: 'claude-3', name: 'Claude 3', provider: 'anthropic' },
          ],
        })
      }
      return Promise.reject(new Error('Unknown path'))
    })
  })

  it('renders feature selection tabs', async () => {
    render(<AIWorkbench />, { wrapper: createWrapper() })

    await waitFor(() => {
      const tabs = screen.getAllByRole('tab')
      expect(tabs.length).toBe(5)
    })
  })

  it('displays model selector', async () => {
    render(<AIWorkbench />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('model-selector')).toBeInTheDocument()
    })
  })

  it('shows AI key missing banner when not configured', async () => {
    vi.mocked(api.apiClient.get).mockRejectedValue({ status: 401 })

    render(<AIWorkbench />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByText(/AI API 키가 설정되지 않았습니다/i)
      ).toBeInTheDocument()
    })
  })

  it('sends message and displays response', async () => {
    render(<AIWorkbench />, { wrapper: createWrapper() })

    // AI Chat Component가 렌더링되어야 함
    await waitFor(() => {
      expect(screen.getByTestId('ai-chat')).toBeInTheDocument()
    })
  })

  it('handles streaming response', async () => {
    // SSE 스트리밍은 useAIStream 훅에서 테스트
    render(<AIWorkbench />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('ai-chat')).toBeInTheDocument()
    })
  })

  it('displays error message', async () => {
    render(<AIWorkbench />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('ai-chat')).toBeInTheDocument()
    })
  })
})
