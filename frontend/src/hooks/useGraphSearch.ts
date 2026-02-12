import { useState, useCallback, useRef } from 'react'
import { apiClient } from '@/lib/api'

interface GraphSearchHit {
  note_id: number
  title: string
  score: number
  search_type: string
}

interface GraphSearchResponse {
  hits: GraphSearchHit[]
  query: string
}

export function useGraphSearch() {
  const [hits, setHits] = useState<GraphSearchHit[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [query, setQuery] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback((q: string) => {
    setQuery(q)

    // Clear previous timer
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    // Empty query: clear results immediately
    if (!q.trim()) {
      setHits([])
      setIsSearching(false)
      return
    }

    // Debounce 400ms
    setIsSearching(true)
    timerRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: q.trim(),
          limit: '50',
          search_type: 'hybrid',
        })
        const result = await apiClient.get<GraphSearchResponse>(
          `/graph/search?${params}`
        )
        setHits(result.hits)
      } catch (err) {
        console.error('Graph search failed:', err)
        setHits([])
      } finally {
        setIsSearching(false)
      }
    }, 400)
  }, [])

  const clear = useCallback(() => {
    setQuery('')
    setHits([])
    setIsSearching(false)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
  }, [])

  // Build a Map<noteId, score> for fast lookups in the graph renderer
  const hitMap = new Map(hits.map(h => [h.note_id, h.score]))

  return {
    query,
    hits,
    hitMap,
    isSearching,
    search,
    clear,
  }
}
