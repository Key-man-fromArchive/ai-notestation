import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import '@/lib/i18n' // Initialize i18next
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

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'test@example.com', role: 'owner' },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('../hooks/useSearchIndex', () => ({
  useSearchIndex: () => ({
    status: 'idle',
    totalNotes: 0,
    indexedNotes: 0,
    pendingNotes: 0,
    progress: null,
    error: null,
    triggerIndex: vi.fn(),
    isIndexing: false,
  }),
}))

vi.mock('../hooks/useImageSync', () => ({
  useImageSync: () => ({
    status: 'idle',
    totalImages: 0,
    syncedImages: 0,
    pendingImages: 0,
    progress: null,
    error: null,
    triggerSync: vi.fn(),
    isSyncing: false,
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

describe('OcrEngineSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path === '/settings') {
        return Promise.resolve({
          settings: [
            { key: 'nas_url', value: 'https://nas.example.com' },
            { key: 'nas_user', value: 'admin' },
            { key: 'nas_password', value: '****' },
            { key: 'openai_api_key', value: '' },
            { key: 'anthropic_api_key', value: '' },
            { key: 'zhipuai_api_key', value: '' },
          ],
        })
      }
      if (path === '/settings/ocr_engine') {
        return Promise.resolve({ key: 'ocr_engine', value: 'ai_vision' })
      }
      if (path === '/settings/quality_gate_enabled') {
        return Promise.resolve({ key: 'quality_gate_enabled', value: 'false' })
      }
      if (path === '/settings/quality_gate_auto_retry') {
        return Promise.resolve({ key: 'quality_gate_auto_retry', value: 'false' })
      }
      if (path === '/settings/ai_enabled_models') {
        return Promise.resolve({ key: 'ai_enabled_models', value: [] })
      }
      if (path === '/settings/ai_default_model') {
        return Promise.resolve({ key: 'ai_default_model', value: '' })
      }
      if (path === '/ai/models') {
        return Promise.resolve({ models: [] })
      }
      if (path.includes('/oauth/') && path.includes('/status')) {
        return Promise.resolve({ connected: false })
      }
      return Promise.resolve({})
    })
    vi.mocked(api.apiClient.put).mockResolvedValue({ updated: true })
  })

  it('renders OCR engine dropdown with both options', async () => {
    render(<Settings />, { wrapper: createWrapper() })
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox')
      // Find the select that has the OCR options
      const ocrSelect = selects.find(s =>
        s.querySelector('option[value="tesseract"]')
      )
      expect(ocrSelect).toBeTruthy()
      expect(ocrSelect!.querySelector('option[value="ai_vision"]')).toBeTruthy()
      expect(ocrSelect!.querySelector('option[value="tesseract"]')).toBeTruthy()
    })
  })

  it('reflects current engine from API', async () => {
    vi.mocked(api.apiClient.get).mockImplementation((path: string) => {
      if (path === '/settings/ocr_engine') {
        return Promise.resolve({ key: 'ocr_engine', value: 'tesseract' })
      }
      if (path === '/settings') {
        return Promise.resolve({ settings: [] })
      }
      if (path === '/settings/quality_gate_enabled') {
        return Promise.resolve({ key: 'quality_gate_enabled', value: 'false' })
      }
      if (path === '/settings/quality_gate_auto_retry') {
        return Promise.resolve({ key: 'quality_gate_auto_retry', value: 'false' })
      }
      if (path === '/settings/ai_enabled_models') {
        return Promise.resolve({ key: 'ai_enabled_models', value: [] })
      }
      if (path === '/settings/ai_default_model') {
        return Promise.resolve({ key: 'ai_default_model', value: '' })
      }
      if (path === '/ai/models') {
        return Promise.resolve({ models: [] })
      }
      if (path.includes('/oauth/') && path.includes('/status')) {
        return Promise.resolve({ connected: false })
      }
      return Promise.resolve({})
    })

    render(<Settings />, { wrapper: createWrapper() })
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox')
      const ocrSelect = selects.find(s =>
        s.querySelector('option[value="tesseract"]')
      ) as HTMLSelectElement | undefined
      expect(ocrSelect).toBeTruthy()
      expect(ocrSelect!.value).toBe('tesseract')
    })
  })

  it('saves on change', async () => {
    const user = userEvent.setup()
    render(<Settings />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
    })

    const selects = screen.getAllByRole('combobox')
    const ocrSelect = selects.find(s =>
      s.querySelector('option[value="tesseract"]')
    )!
    await user.selectOptions(ocrSelect, 'tesseract')

    await waitFor(() => {
      expect(api.apiClient.put).toHaveBeenCalledWith(
        '/settings/ocr_engine',
        { value: 'tesseract' },
      )
    })
  })
})
