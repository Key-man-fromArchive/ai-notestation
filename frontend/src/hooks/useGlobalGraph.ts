import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface GraphNode {
  id: number
  label: string
  notebook: string | null
  size: number
}

interface GraphLink {
  source: number
  target: number
  weight: number
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
  total_notes: number
  indexed_notes: number
}

interface UseGlobalGraphOptions {
  limit?: number
  similarityThreshold?: number
}

export function useGlobalGraph(options: UseGlobalGraphOptions = {}) {
  const { limit = 200, similarityThreshold = 0.75 } = options

  const { data, isLoading, error, refetch } = useQuery<GraphData>({
    queryKey: ['graph', 'global', limit, similarityThreshold],
    queryFn: () =>
      apiClient.get<GraphData>(
        `/graph?limit=${limit}&similarity_threshold=${similarityThreshold}`
      ),
    staleTime: 5 * 60 * 1000,
  })

  return {
    data,
    isLoading,
    error: error as Error | null,
    refetch,
  }
}
