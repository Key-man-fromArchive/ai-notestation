import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface EvaluationRunSummary {
  id: number
  status: string
  task_type: string
  models: string[]
  test_count: number
  progress: number
  triggered_by: string | null
  created_at: string | null
  completed_at: string | null
  winner: string | null
}

interface EvaluationRunDetail {
  id: number
  status: string
  task_type: string
  models: string[]
  test_count: number
  progress: number
  results: {
    winner: string | null
    summary: string
    models: Record<string, Record<string, number>>
    metrics: string[]
    task_type: string
  } | null
  error: string | null
  triggered_by: string | null
  created_at: string | null
  completed_at: string | null
}

export function useEvaluationRuns() {
  return useQuery({
    queryKey: ['admin', 'evaluation', 'list'],
    queryFn: () => apiClient.get<{ runs: EvaluationRunSummary[]; total: number }>('/admin/evaluation/list'),
  })
}

export function useEvaluationRun(runId: number | null) {
  return useQuery({
    queryKey: ['admin', 'evaluation', runId],
    queryFn: () => apiClient.get<EvaluationRunDetail>(`/admin/evaluation/${runId}`),
    enabled: runId !== null,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data && (data.status === 'running' || data.status === 'pending')) {
        return 3000
      }
      return false
    },
  })
}

export function useStartEvaluation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { task_type: string; models: string[]; test_count: number }) =>
      apiClient.post<{ run_id: number; status: string }>('/admin/evaluation/run', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'evaluation'] })
    },
  })
}
