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

interface HubNote {
  id: number
  note_key: string
  label: string
  degree: number
}

interface OrphanNote {
  id: number
  note_key: string
  label: string
}

interface ClusterSummary {
  notebook: string
  note_count: number
  edge_count: number
  avg_similarity: number
}

interface NetworkStats {
  nodes: number
  edges: number
  avg_degree: number
  density: number
  components: number
}

export interface GraphAnalysis {
  hub_notes: HubNote[]
  orphan_notes: OrphanNote[]
  orphan_count: number
  network_stats: NetworkStats
  cluster_summary: ClusterSummary[]
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
  total_notes: number
  indexed_notes: number
  analysis: GraphAnalysis | null
}

interface UseGlobalGraphOptions {
  limit?: number
  similarityThreshold?: number
  neighborsPerNote?: number
  maxEdges?: number
  includeAnalysis?: boolean
}

export function useGlobalGraph(options: UseGlobalGraphOptions = {}) {
  const {
    limit = 200,
    similarityThreshold = 0.75,
    neighborsPerNote = 5,
    maxEdges = 0,
    includeAnalysis = false,
  } = options

  const { data, isLoading, error, refetch } = useQuery<GraphData>({
    queryKey: ['graph', 'global', limit, similarityThreshold, neighborsPerNote, maxEdges, includeAnalysis],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(limit),
        similarity_threshold: String(similarityThreshold),
        neighbors_per_note: String(neighborsPerNote),
        max_edges: String(maxEdges),
        include_analysis: String(includeAnalysis),
      })
      return apiClient.get<GraphData>(`/graph?${params}`)
    },
    staleTime: 5 * 60 * 1000,
  })

  return {
    data,
    isLoading,
    error: error as Error | null,
    refetch,
  }
}
