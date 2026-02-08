import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useNotebookAccess } from '../hooks/useNotebookAccess'
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

describe('useNotebookAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches access list', async () => {
    const mockData = {
      items: [
        {
          id: 1,
          user_id: 1,
          org_id: null,
          user_email: 'user@test.com',
          permission: 'admin',
          granted_by: 1,
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
    }

    vi.mocked(api.apiClient.get).mockResolvedValue(mockData)

    const { result } = renderHook(() => useNotebookAccess(1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.accesses).toEqual(mockData.items)
    expect(api.apiClient.get).toHaveBeenCalledWith('/notebooks/1/access')
  })

  it('skips fetch when notebookId is 0', () => {
    const { result } = renderHook(() => useNotebookAccess(0), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(api.apiClient.get).not.toHaveBeenCalled()
  })

  it('grants access', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({ items: [] })

    const mockAccess = {
      id: 2,
      user_id: 2,
      org_id: null,
      user_email: 'new@test.com',
      permission: 'read',
      granted_by: 1,
      created_at: '2024-01-01T00:00:00Z',
    }

    vi.mocked(api.apiClient.post).mockResolvedValue(mockAccess)

    const { result } = renderHook(() => useNotebookAccess(1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const access = await result.current.grantAccess({
      email: 'new@test.com',
      permission: 'read',
    })

    expect(access).toEqual(mockAccess)
    expect(api.apiClient.post).toHaveBeenCalledWith('/notebooks/1/access', {
      email: 'new@test.com',
      permission: 'read',
    })
  })

  it('updates access', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({ items: [] })

    const mockAccess = {
      id: 1,
      user_id: 1,
      org_id: null,
      user_email: 'user@test.com',
      permission: 'write',
      granted_by: 1,
      created_at: '2024-01-01T00:00:00Z',
    }

    vi.mocked(api.apiClient.put).mockResolvedValue(mockAccess)

    const { result } = renderHook(() => useNotebookAccess(1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const access = await result.current.updateAccess({
      accessId: 1,
      data: { permission: 'write' },
    })

    expect(access).toEqual(mockAccess)
    expect(api.apiClient.put).toHaveBeenCalledWith('/notebooks/1/access/1', {
      permission: 'write',
    })
  })

  it('revokes access', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({ items: [] })
    vi.mocked(api.apiClient.delete).mockResolvedValue({ success: true })

    const { result } = renderHook(() => useNotebookAccess(1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const response = await result.current.revokeAccess(1)

    expect(response).toEqual({ success: true })
    expect(api.apiClient.delete).toHaveBeenCalledWith('/notebooks/1/access/1')
  })
})
