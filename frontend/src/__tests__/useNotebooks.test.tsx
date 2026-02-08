import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useNotebooks,
  useNotebook,
  useCreateNotebook,
  useUpdateNotebook,
  useDeleteNotebook,
} from '../hooks/useNotebooks'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class extends Error {
    constructor(
      public status: number,
      public body: string,
    ) {
      super(`API Error: ${status}`)
    }
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useNotebooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches notebooks list', async () => {
    const mockData = {
      items: [
        {
          id: 1,
          name: 'Test Notebook',
          description: 'Test',
          note_count: 5,
          is_public: false,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
      total: 1,
    }

    vi.mocked(api.apiClient.get).mockResolvedValue(mockData)

    const { result } = renderHook(() => useNotebooks(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockData)
    expect(api.apiClient.get).toHaveBeenCalledWith('/notebooks')
  })
})

describe('useNotebook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches single notebook', async () => {
    const mockNotebook = {
      id: 1,
      name: 'Test Notebook',
      description: 'Test',
      note_count: 5,
      is_public: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    vi.mocked(api.apiClient.get).mockResolvedValue(mockNotebook)

    const { result } = renderHook(() => useNotebook(1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockNotebook)
    expect(api.apiClient.get).toHaveBeenCalledWith('/notebooks/1')
  })

  it('skips fetch when id is 0', () => {
    const { result } = renderHook(() => useNotebook(0), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(api.apiClient.get).not.toHaveBeenCalled()
  })
})

describe('useCreateNotebook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates notebook', async () => {
    const mockNotebook = {
      id: 1,
      name: 'New Notebook',
      description: 'Description',
      note_count: 0,
      is_public: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    vi.mocked(api.apiClient.post).mockResolvedValue(mockNotebook)

    const { result } = renderHook(() => useCreateNotebook(), {
      wrapper: createWrapper(),
    })

    const notebook = await result.current.mutateAsync({
      name: 'New Notebook',
      description: 'Description',
    })

    expect(notebook).toEqual(mockNotebook)
    expect(api.apiClient.post).toHaveBeenCalledWith('/notebooks', {
      name: 'New Notebook',
      description: 'Description',
    })
  })
})

describe('useUpdateNotebook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates notebook', async () => {
    const mockNotebook = {
      id: 1,
      name: 'Updated Name',
      description: 'Test',
      note_count: 5,
      is_public: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    vi.mocked(api.apiClient.put).mockResolvedValue(mockNotebook)

    const { result } = renderHook(() => useUpdateNotebook(), {
      wrapper: createWrapper(),
    })

    const notebook = await result.current.mutateAsync({
      id: 1,
      data: { name: 'Updated Name' },
    })

    expect(notebook).toEqual(mockNotebook)
    expect(api.apiClient.put).toHaveBeenCalledWith('/notebooks/1', {
      name: 'Updated Name',
    })
  })
})

describe('useDeleteNotebook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes notebook', async () => {
    vi.mocked(api.apiClient.delete).mockResolvedValue({ success: true })

    const { result } = renderHook(() => useDeleteNotebook(), {
      wrapper: createWrapper(),
    })

    const response = await result.current.mutateAsync(1)

    expect(response).toEqual({ success: true })
    expect(api.apiClient.delete).toHaveBeenCalledWith('/notebooks/1')
  })
})
