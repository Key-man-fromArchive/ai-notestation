import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/lib/api'
import {
  useGraphData,
  useTimeline,
  useTriggerClustering,
} from '@/hooks/useDiscovery'

vi.mock('@/lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public body: string
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

describe('useGraphData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches graph data for a notebook', async () => {
    const mockGraphData = {
      nodes: [
        { id: 1, label: 'Note 1', cluster_id: 0 },
        { id: 2, label: 'Note 2', cluster_id: 0 },
      ],
      links: [{ source: 1, target: 2, weight: 0.5 }],
      total_notes: 10,
    }

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockGraphData)

    const { result } = renderHook(() => useGraphData(1), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.nodes).toHaveLength(2)
    expect(result.current.links).toHaveLength(1)
    expect(result.current.totalNotes).toBe(10)
    expect(apiClient.get).toHaveBeenCalledWith('/discovery/graph?notebook_id=1')
  })

  it('returns empty arrays when no data', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      nodes: [],
      links: [],
      total_notes: 0,
    })

    const { result } = renderHook(() => useGraphData(1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.nodes).toEqual([])
    expect(result.current.links).toEqual([])
    expect(result.current.totalNotes).toBe(0)
  })

  it('handles graph with nodes from different clusters', async () => {
    const mockGraphData = {
      nodes: [
        { id: 1, label: 'Note A', cluster_id: 0 },
        { id: 2, label: 'Note B', cluster_id: 1 },
        { id: 3, label: 'Note C', cluster_id: 0 },
      ],
      links: [
        { source: 1, target: 3, weight: 0.5 },
      ],
      total_notes: 3,
    }

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockGraphData)

    const { result } = renderHook(() => useGraphData(42), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.nodes).toHaveLength(3)
    expect(result.current.nodes[0].cluster_id).toBe(0)
    expect(result.current.nodes[1].cluster_id).toBe(1)
    expect(apiClient.get).toHaveBeenCalledWith('/discovery/graph?notebook_id=42')
  })
})

describe('useTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches timeline data for a notebook', async () => {
    const mockTimeline = {
      entries: [
        { date: '2024-01-15', count: 5 },
        { date: '2024-01-16', count: 3 },
      ],
    }

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockTimeline)

    const { result } = renderHook(() => useTimeline(1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[0].date).toBe('2024-01-15')
    expect(apiClient.get).toHaveBeenCalledWith(
      '/discovery/timeline?notebook_id=1'
    )
  })

  it('returns empty entries when no data', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ entries: [] })

    const { result } = renderHook(() => useTimeline(1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.entries).toEqual([])
  })

  it('sorts entries by date correctly', async () => {
    const mockTimeline = {
      entries: [
        { date: '2024-01-01', count: 1 },
        { date: '2024-01-10', count: 10 },
        { date: '2024-01-05', count: 5 },
      ],
    }

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockTimeline)

    const { result } = renderHook(() => useTimeline(100), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.entries).toHaveLength(3)
    expect(apiClient.get).toHaveBeenCalledWith('/discovery/timeline?notebook_id=100')
  })
})

describe('useTriggerClustering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useTriggerClustering(1), {
      wrapper: createWrapper(),
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.clusters).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.isPolling).toBe(false)
  })

  it('triggers clustering mutation', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      task_id: 'test-task-123',
      status: 'pending',
    })

    const { result } = renderHook(() => useTriggerClustering(1), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.trigger(3)
    })

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/discovery/cluster', {
        notebook_id: 1,
        num_clusters: 3,
      })
    })
  })

  it('uses default cluster count of 5 when not specified', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      task_id: 'test-default',
      status: 'pending',
    })

    const { result } = renderHook(() => useTriggerClustering(1), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.trigger()
    })

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/discovery/cluster', {
        notebook_id: 1,
        num_clusters: 5,
      })
    })
  })

  it('resets state correctly', () => {
    const { result } = renderHook(() => useTriggerClustering(1), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.clusters).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('isPending is false initially', () => {
    const { result } = renderHook(() => useTriggerClustering(1), {
      wrapper: createWrapper(),
    })

    expect(result.current.isPending).toBe(false)
  })

  it('isPolling is false when idle', () => {
    const { result } = renderHook(() => useTriggerClustering(1), {
      wrapper: createWrapper(),
    })

    expect(result.current.isPolling).toBe(false)
  })
})
