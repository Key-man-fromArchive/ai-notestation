import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface RefineResultItem {
  note_id: string
  title: string
  snippet: string
}

interface EngineContribution {
  engine: string
  rank: number
  raw_score: number
  rrf_score: number
}

interface MatchExplanation {
  engines: EngineContribution[]
  matched_terms: string[]
  combined_score: number
}

interface SearchResultResponse {
  note_id: string
  title: string
  snippet: string
  score: number
  search_type: string
  created_at: string | null
  updated_at: string | null
  match_explanation?: MatchExplanation | null
}

interface JudgeInfo {
  strategy: string
  engines: string[]
  skip_reason: string | null
  confidence: number
}

export interface RefineRequest {
  query: string
  results: RefineResultItem[]
  feedback?: string | null
  search_type?: string
  turn?: number
}

export interface RefineResponse {
  results: SearchResultResponse[]
  refined_query: string
  strategy: string
  reasoning: string
  query: string
  search_type: string
  total: number
  turn: number
  judge_info?: JudgeInfo | null
}

export function useSearchRefine() {
  return useMutation<RefineResponse, Error, RefineRequest>({
    mutationFn: (request) =>
      apiClient.post<RefineResponse>('/search/refine', request),
  })
}
