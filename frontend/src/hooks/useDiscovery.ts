import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import { ApiError, apiClient } from '@/lib/api'

export interface ClusterInfo {
  cluster_index: number
  note_ids: number[]
  summary: string
  keywords: string[]
}

interface ClusterTaskResponse {
  task_id: string
  status: string
}

interface ClusterStatusResponse {
  task_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
  clusters: ClusterInfo[] | null
}

export interface GraphNode {
  id: number
  label: string
  cluster_id: number
}

export interface GraphLink {
  source: number
  target: number
  weight: number
}

interface GraphDataResponse {
  nodes: GraphNode[]
  links: GraphLink[]
  total_notes: number
}

export interface TimelineEntry {
  date: string
  count: number
}

interface TimelineResponse {
  entries: TimelineEntry[]
}

const MAX_POLL_COUNT = 60
const POLL_INTERVAL_MS = 2000

const DISCOVERY_KEYS = {
  graph: (notebookId: number) => ['discovery', 'graph', notebookId],
  timeline: (notebookId: number) => ['discovery', 'timeline', notebookId],
  clusterStatus: (taskId: string) => ['discovery', 'cluster', taskId],
}

export function useTriggerClustering(notebookId: number) {
  const queryClient = useQueryClient()
  const [taskId, setTaskId] = useState<string | null>(null)
  const [pollCount, setPollCount] = useState(0)
  const [status, setStatus] = useState<
    'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'timeout'
  >('idle')
  const [clusters, setClusters] = useState<ClusterInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const triggerMutation = useMutation<
    ClusterTaskResponse,
    ApiError,
    { num_clusters: number }
  >({
    mutationFn: ({ num_clusters }) =>
      apiClient.post<ClusterTaskResponse>('/discovery/cluster', {
        notebook_id: notebookId,
        num_clusters,
      }),
    onSuccess: data => {
      setTaskId(data.task_id)
      setStatus('pending')
      setPollCount(0)
      setClusters(null)
      setError(null)
    },
    onError: err => {
      setStatus('failed')
      setError(err.body || err.message)
    },
  })

  const fetchStatus = useCallback(async () => {
    if (!taskId) return

    try {
      const response = await apiClient.get<ClusterStatusResponse>(
        `/discovery/cluster/${taskId}`
      )

      if (response.status === 'completed') {
        setStatus('completed')
        setClusters(response.clusters)
        queryClient.invalidateQueries({
          queryKey: DISCOVERY_KEYS.graph(notebookId),
        })
        setTaskId(null)
      } else if (response.status === 'failed') {
        setStatus('failed')
        setError(response.error_message || 'Clustering failed')
        setTaskId(null)
      } else {
        setStatus(response.status)
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body || err.message)
      }
      setStatus('failed')
      setTaskId(null)
    }
  }, [taskId, notebookId, queryClient])

  useEffect(() => {
    if (!taskId || status === 'completed' || status === 'failed') return

    if (pollCount >= MAX_POLL_COUNT) {
      setStatus('timeout')
      setError('Clustering timed out after 2 minutes')
      setTaskId(null)
      return
    }

    const timeoutId = setTimeout(() => {
      fetchStatus()
      setPollCount(prev => prev + 1)
    }, POLL_INTERVAL_MS)

    return () => clearTimeout(timeoutId)
  }, [taskId, pollCount, status, fetchStatus])

  const trigger = (numClusters: number = 5) => {
    setStatus('pending')
    triggerMutation.mutate({ num_clusters: numClusters })
  }

  const reset = () => {
    setTaskId(null)
    setStatus('idle')
    setClusters(null)
    setError(null)
    setPollCount(0)
  }

  return {
    trigger,
    reset,
    status,
    clusters,
    error,
    isPolling: !!taskId && status !== 'completed' && status !== 'failed',
    isPending: triggerMutation.isPending,
  }
}

export function useGraphData(notebookId: number) {
  const { data, isLoading, error, refetch } = useQuery<GraphDataResponse>({
    queryKey: DISCOVERY_KEYS.graph(notebookId),
    queryFn: () =>
      apiClient.get<GraphDataResponse>(`/discovery/graph?notebook_id=${notebookId}`),
    enabled: !!notebookId,
    staleTime: 5 * 60 * 1000,
  })

  return {
    nodes: data?.nodes ?? [],
    links: data?.links ?? [],
    totalNotes: data?.total_notes ?? 0,
    isLoading,
    error,
    refetch,
  }
}

export function useTimeline(notebookId: number) {
  const { data, isLoading, error, refetch } = useQuery<TimelineResponse>({
    queryKey: DISCOVERY_KEYS.timeline(notebookId),
    queryFn: () =>
      apiClient.get<TimelineResponse>(`/discovery/timeline?notebook_id=${notebookId}`),
    enabled: !!notebookId,
    staleTime: 5 * 60 * 1000,
  })

  return {
    entries: data?.entries ?? [],
    isLoading,
    error,
    refetch,
  }
}
