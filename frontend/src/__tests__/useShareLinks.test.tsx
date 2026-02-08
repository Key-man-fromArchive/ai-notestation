import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useShareLinks } from '@/hooks/useShareLinks'
import { apiClient } from '@/lib/api'
import type { ReactNode } from 'react'

vi.mock('@/lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public body: string,
    ) {
      super(`API Error: ${status}`)
    }
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('useShareLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches share links for a notebook', async () => {
    const mockLinks = {
      items: [
        {
          id: 1,
          token: 'abc123',
          notebook_id: 1,
          note_id: null,
          link_type: 'public',
          email_restriction: null,
          expires_at: null,
          access_count: 5,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    }

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockLinks)

    const { result } = renderHook(() => useShareLinks(1), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.links).toHaveLength(1)
    expect(result.current.links[0].token).toBe('abc123')
    expect(apiClient.get).toHaveBeenCalledWith('/notebooks/1/links')
  })

  it('creates a new share link', async () => {
    const mockLinks = { items: [] }
    const mockNewLink = {
      id: 2,
      token: 'newtoken',
      notebook_id: 1,
      note_id: null,
      link_type: 'public',
      email_restriction: null,
      expires_at: null,
      access_count: 0,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    }

    vi.mocked(apiClient.get).mockResolvedValue(mockLinks)
    vi.mocked(apiClient.post).mockResolvedValueOnce(mockNewLink)

    const { result } = renderHook(() => useShareLinks(1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const created = await result.current.createLink({ link_type: 'public' })

    expect(created.token).toBe('newtoken')
    expect(apiClient.post).toHaveBeenCalledWith('/notebooks/1/links', {
      link_type: 'public',
    })
  })

  it('revokes a share link', async () => {
    const mockLinks = {
      items: [
        {
          id: 1,
          token: 'abc123',
          notebook_id: 1,
          note_id: null,
          link_type: 'public',
          email_restriction: null,
          expires_at: null,
          access_count: 0,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    }

    vi.mocked(apiClient.get).mockResolvedValue(mockLinks)
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useShareLinks(1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await result.current.revokeLink(1)

    expect(apiClient.delete).toHaveBeenCalledWith('/notebooks/1/links/1')
  })

  it('returns empty array when no links exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [] })

    const { result } = renderHook(() => useShareLinks(1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.links).toEqual([])
  })
})
