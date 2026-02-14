import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from 'react-force-graph-2d'
import { Search, ZoomIn, ZoomOut, Maximize2, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { useGraphSearch } from '@/hooks/useGraphSearch'
import type { GraphData } from '@/hooks/useGlobalGraph'

interface GraphNodeObject extends NodeObject {
  id: number
  note_key: string
  label: string
  notebook: string | null
  size: number
  _degree?: number
  x?: number
  y?: number
}

interface GraphLinkObject extends LinkObject {
  source: number | GraphNodeObject
  target: number | GraphNodeObject
  weight: number
}

const NOTEBOOK_COLORS: Record<string, string> = {}
const COLOR_PALETTE = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
]
let colorIndex = 0

// Module-level cache: persists across client-side route navigations
const positionCache = new Map<number, { x: number; y: number }>()

function getNotebookColor(notebook: string | null): string {
  if (!notebook) return '#9ca3af'
  if (!NOTEBOOK_COLORS[notebook]) {
    NOTEBOOK_COLORS[notebook] = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length]
    colorIndex++
  }
  return NOTEBOOK_COLORS[notebook]
}

// Performance mode thresholds
const LARGE_GRAPH_THRESHOLD = 200
const HUGE_GRAPH_THRESHOLD = 1000

interface ObsidianGraphProps {
  data: GraphData | undefined
  isLoading: boolean
  error: Error | null
  className?: string
  /** Called when user wants to analyze the cluster around a node */
  onAnalyzeCluster?: (noteIds: number[], hubLabel: string) => void
  /** Called when user clicks retry after an error */
  onRetry?: () => void
}

export function ObsidianGraph({
  data,
  isLoading,
  error,
  className,
  onAnalyzeCluster,
  onRetry,
}: ObsidianGraphProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  type GraphMethods = ForceGraphMethods<
    NodeObject<GraphNodeObject>,
    LinkObject<GraphNodeObject, GraphLinkObject>
  >
  const graphRef = useRef<GraphMethods | undefined>(undefined)
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNodeObject | null>(null)
  const [showLegend, setShowLegend] = useState(false)
  const [simulationRunning, setSimulationRunning] = useState(false)

  // Semantic search
  const { query: searchQuery, hits, hitMap, isSearching, search: doSearch, clear: clearSearch } = useGraphSearch()
  const hasSearchResults = searchQuery.trim().length > 0 && hits.length > 0
  const isSearchActive = searchQuery.trim().length > 0

  // Build set of neighbors of search hits (for secondary highlighting)
  const searchNeighborIds = useMemo(() => {
    if (!hasSearchResults || !data?.links) return new Set<number>()
    const hitIds = new Set(hitMap.keys())
    const neighbors = new Set<number>()
    for (const link of data.links) {
      const src = typeof link.source === 'number' ? link.source : (link.source as any).id
      const tgt = typeof link.target === 'number' ? link.target : (link.target as any).id
      if (hitIds.has(src) && !hitIds.has(tgt)) neighbors.add(tgt)
      if (hitIds.has(tgt) && !hitIds.has(src)) neighbors.add(src)
    }
    return neighbors
  }, [hasSearchResults, hitMap, data?.links])

  // Track the live node objects that d3-force mutates with x,y positions
  const liveNodesRef = useRef<GraphNodeObject[]>([])

  // Ref callback: sets up ResizeObserver when the container div mounts (handles loading→loaded transition)
  const containerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    // Clean up previous observer
    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = null
    containerRef.current = node

    if (node) {
      const updateDimensions = () => {
        const w = node.clientWidth
        const h = node.clientHeight
        if (w > 0 && h > 0) {
          setDimensions(prev =>
            prev && prev.width === w && prev.height === h ? prev : { width: w, height: h }
          )
        }
      }
      requestAnimationFrame(updateDimensions)
      resizeObserverRef.current = new ResizeObserver(updateDimensions)
      resizeObserverRef.current.observe(node)
    }
  }, [])

  // Cleanup ResizeObserver on unmount
  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
    }
  }, [])

  // Force-sync canvas size on resize (react-kapsule prop propagation unreliable in React 18)
  useEffect(() => {
    if (!dimensions || !containerRef.current) return
    const container = containerRef.current
    const pxScale = window.devicePixelRatio || 1
    // Update all canvases (main + shadow)
    container.querySelectorAll('canvas').forEach(canvas => {
      canvas.style.width = `${dimensions.width}px`
      canvas.style.height = `${dimensions.height}px`
      canvas.width = dimensions.width * pxScale
      canvas.height = dimensions.height * pxScale
    })
    // Update force-graph wrapper div
    const fgContainer = container.querySelector('.force-graph-container') as HTMLElement | null
    if (fgContainer) {
      fgContainer.style.width = `${dimensions.width}px`
      fgContainer.style.height = `${dimensions.height}px`
    }
    // Also update the react-kapsule wrapper div (direct child of containerRef)
    const kapsuleWrapper = container.firstElementChild as HTMLElement | null
    if (kapsuleWrapper && !kapsuleWrapper.className) {
      kapsuleWrapper.style.width = `${dimensions.width}px`
      kapsuleWrapper.style.height = `${dimensions.height}px`
    }
  }, [dimensions])

  // Check if we have cached positions for the current data
  const hasCache = positionCache.size > 0

  const nodeCount = data?.nodes.length ?? 0
  const isLargeGraph = nodeCount > LARGE_GRAPH_THRESHOLD
  const isHugeGraph = nodeCount > HUGE_GRAPH_THRESHOLD

  useEffect(() => {
    if (data && data.nodes.length > 0 && graphRef.current && !hasCache) {
      setSimulationRunning(true)
    }
  }, [data?.nodes.length, hasCache])

  // Compute degree map from links
  const degreeMap = useMemo(() => {
    const map = new Map<number, number>()
    if (!data?.links) return map
    for (const link of data.links) {
      const src = typeof link.source === 'number' ? link.source : (link.source as any).id
      const tgt = typeof link.target === 'number' ? link.target : (link.target as any).id
      map.set(src, (map.get(src) ?? 0) + 1)
      map.set(tgt, (map.get(tgt) ?? 0) + 1)
    }
    return map
  }, [data?.links])

  // Build adjacency list for cluster extraction
  const adjacency = useMemo(() => {
    const adj = new Map<number, Set<number>>()
    if (!data?.links) return adj
    for (const link of data.links) {
      const src = typeof link.source === 'number' ? link.source : (link.source as any).id
      const tgt = typeof link.target === 'number' ? link.target : (link.target as any).id
      if (!adj.has(src)) adj.set(src, new Set())
      if (!adj.has(tgt)) adj.set(tgt, new Set())
      adj.get(src)!.add(tgt)
      adj.get(tgt)!.add(src)
    }
    return adj
  }, [data?.links])

  const orphanIds = useMemo(() => {
    if (!data?.nodes) return new Set<number>()
    const connected = new Set(degreeMap.keys())
    return new Set(data.nodes.filter(n => !connected.has(n.id)).map(n => n.id))
  }, [data?.nodes, degreeMap])

  const fitConnected = useCallback(() => {
    const hasConnected = liveNodesRef.current.some(n => (n._degree ?? 0) > 0)
    if (hasConnected) {
      graphRef.current?.zoomToFit(400, 50, (node: GraphNodeObject) => (node._degree ?? 0) > 0)
    } else {
      graphRef.current?.zoomToFit(400, 50)
    }
  }, [])

  // Auto-save all node positions when d3-force simulation finishes
  const handleEngineStop = useCallback(() => {
    setSimulationRunning(false)
    for (const node of liveNodesRef.current) {
      if (node.x != null && node.y != null) {
        positionCache.set(node.id, { x: node.x, y: node.y })
      }
    }
    // Delay to ensure canvas render cycle completes before fitting
    setTimeout(() => fitConnected(), 500)
  }, [fitConnected])

  const handleNodeClick = useCallback(
    (node: GraphNodeObject) => {
      // Save positions
      for (const n of liveNodesRef.current) {
        if (n.x != null && n.y != null) {
          positionCache.set(n.id, { x: n.x, y: n.y })
        }
      }
      navigate(`/notes/${node.note_key}`)
    },
    [navigate]
  )

  // Right-click: analyze cluster around this node
  const handleNodeRightClick = useCallback(
    (node: GraphNodeObject, event: MouseEvent) => {
      event.preventDefault()
      if (!onAnalyzeCluster) return

      const neighbors = adjacency.get(node.id)
      if (!neighbors || neighbors.size === 0) return

      // Collect the hub + its direct neighbors (up to 20)
      const clusterIds = [node.id, ...Array.from(neighbors).slice(0, 19)]
      onAnalyzeCluster(clusterIds, node.label)
    },
    [onAnalyzeCluster, adjacency]
  )

  const handleZoomIn = () => graphRef.current?.zoom(1.5, 300)
  const handleZoomOut = () => graphRef.current?.zoom(0.67, 300)
  const handleFit = () => fitConnected()

  // Collect unique notebooks for legend
  const notebooks = useMemo(() => {
    if (!data?.nodes) return []
    const seen = new Set<string>()
    const result: { name: string; color: string }[] = []
    for (const node of data.nodes) {
      const nb = node.notebook ?? t('graph.noCategory')
      if (!seen.has(nb)) {
        seen.add(nb)
        result.push({ name: nb, color: getNotebookColor(node.notebook) })
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [data?.nodes])

  // Build graphData: no more client-side filtering — show all nodes, highlight via renderer
  const graphData = useMemo(() => {
    if (!data?.nodes) return { nodes: [] as GraphNodeObject[], links: [] as GraphLinkObject[] }

    const nodes = data.nodes.map(node => {
      const cached = positionCache.get(node.id)
      const degree = degreeMap.get(node.id) ?? 0
      if (cached) {
        return { ...node, _degree: degree, x: cached.x, y: cached.y, fx: cached.x, fy: cached.y }
      }
      return { ...node, _degree: degree }
    }) as GraphNodeObject[]

    liveNodesRef.current = nodes

    return {
      nodes,
      links: data.links as unknown as GraphLinkObject[],
    }
  }, [data?.nodes, data?.links, degreeMap])

  // After restoring cached positions, unpin nodes so dragging works
  useEffect(() => {
    if (hasCache && graphData.nodes.length > 0) {
      const timer = setTimeout(() => {
        for (const node of liveNodesRef.current) {
          (node as any).fx = undefined;
          (node as any).fy = undefined;
        }
        fitConnected()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [hasCache, graphData.nodes.length, fitConnected])

  // Stable link color callback — skip typeof checks when search is inactive
  const linkColor = useCallback(
    (link: GraphLinkObject) => {
      if (!isSearchActive) return 'rgba(156, 163, 175, 0.3)'
      const src = typeof link.source === 'number' ? link.source : (link.source as any).id
      const tgt = typeof link.target === 'number' ? link.target : (link.target as any).id
      if (hitMap.has(src) || hitMap.has(tgt)) return 'rgba(251, 191, 36, 0.4)'
      return 'rgba(100, 100, 100, 0.08)'
    },
    [isSearchActive, hitMap]
  )

  // Stable link width callback — skip typeof checks when search is inactive
  const linkWidth = useCallback(
    (link: GraphLinkObject) => {
      if (!isSearchActive) return Math.max(0.3, link.weight * 1.5)
      const src = typeof link.source === 'number' ? link.source : (link.source as any).id
      const tgt = typeof link.target === 'number' ? link.target : (link.target as any).id
      if (hitMap.has(src) || hitMap.has(tgt)) return Math.max(1, link.weight * 2.5)
      return 0.2
    },
    [isSearchActive, hitMap]
  )

  // Custom node canvas renderer with semantic search highlighting
  const nodeCanvasObject = useCallback(
    (node: GraphNodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const degree = node._degree ?? 0
      const isOrphan = degree === 0
      const searchScore = hitMap.get(node.id)
      const isSearchHit = searchScore !== undefined
      const isNeighborOfHit = searchNeighborIds.has(node.id)

      // Size based on degree + search relevance boost (3-tier)
      const baseSize = isHugeGraph ? 2 : isLargeGraph ? 2.5 : 4
      const sizeBoost = Math.min(degree * 0.5, isHugeGraph ? 4 : isLargeGraph ? 6 : 8)
      let radius = baseSize + sizeBoost

      // Search hits get a size boost proportional to score
      if (isSearchHit) {
        radius += 3 + searchScore * 4
      }

      const x = node.x ?? 0
      const y = node.y ?? 0

      // Determine color and opacity
      let fillColor: string
      let labelAlpha = 0.85

      if (isSearchActive) {
        if (isSearchHit) {
          // Warm orange-yellow gradient based on score
          const r = Math.round(255 - searchScore * 30)
          const g = Math.round(140 + searchScore * 80)
          const b = Math.round(20 + searchScore * 20)
          fillColor = `rgb(${r}, ${g}, ${b})`
          labelAlpha = 1.0
        } else if (isNeighborOfHit) {
          // Neighbors: slightly brighter than default
          fillColor = getNotebookColor(node.notebook)
          labelAlpha = 0.6
        } else {
          // Non-matching: dimmed
          fillColor = 'rgba(100, 100, 100, 0.15)'
          labelAlpha = 0.15
        }
      } else if (isOrphan) {
        fillColor = 'rgba(156, 163, 175, 0.35)'
        labelAlpha = 0.4
      } else {
        fillColor = getNotebookColor(node.notebook)
      }

      // Draw glow for search hits
      if (isSearchHit && isSearchActive) {
        ctx.beginPath()
        ctx.arc(x, y, radius + 3, 0, 2 * Math.PI)
        ctx.fillStyle = `rgba(251, 191, 36, ${0.15 + searchScore * 0.2})`
        ctx.fill()
      }

      // Draw node circle
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = fillColor
      ctx.fill()

      // Orphan: dashed border
      if (isOrphan && !isSearchActive) {
        ctx.setLineDash([2, 2])
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.6)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Labels: always show for search hits, zoom-based otherwise (3-tier)
      const labelThreshold = isHugeGraph ? 5.0 : isLargeGraph ? 3.5 : 1.5
      const showLabel = isSearchHit
        ? globalScale > 0.5
        : globalScale > labelThreshold

      if (showLabel) {
        const label = node.label.length > 25 ? node.label.slice(0, 23) + '...' : node.label
        const fontSize = isSearchHit
          ? Math.max(12 / globalScale, 3)
          : Math.max(10 / globalScale, 2)
        ctx.font = `${isSearchHit ? 'bold ' : ''}${fontSize}px Sans-Serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = `rgba(255, 255, 255, ${labelAlpha})`
        ctx.fillText(label, x, y + radius + 2)
      }
    },
    [hitMap, searchNeighborIds, isSearchActive, isLargeGraph, isHugeGraph]
  )

  if (isLoading) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full gap-3', className)}>
        <LoadingSpinner size="lg" />
        <p className="text-sm text-muted-foreground">{t('graph.loading')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={Search}
        title={t('graph.loadError')}
        description={error.message}
        action={onRetry ? { label: t('common.retry'), onClick: onRetry } : undefined}
      />
    )
  }

  if (!data || data.nodes.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title={t('graph.noData')}
        description={t('graph.noDataDesc')}
      />
    )
  }

  return (
    <div className={cn('relative h-full', className)}>
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {/* Semantic search bar */}
        <div className="flex items-center gap-2 bg-card/95 backdrop-blur rounded-lg p-2 shadow-lg border border-border">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('graph.semanticSearch')}
            value={searchQuery}
            onChange={e => doSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-52 placeholder:text-muted-foreground"
          />
          {isSearching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {searchQuery && !isSearching && (
            <button onClick={clearSearch} className="text-xs text-muted-foreground hover:text-foreground">
              &times;
            </button>
          )}
        </div>

        {/* Search results summary */}
        {isSearchActive && !isSearching && (
          <div className="bg-card/95 backdrop-blur rounded-lg px-3 py-1.5 shadow-lg border border-border text-xs text-muted-foreground">
            {hits.length > 0 ? (
              <span>
                <span className="font-medium text-amber-400">{hits.length}</span>{t('graph.notesFound')}
                {searchNeighborIds.size > 0 && (
                  <span> + {t('graph.neighbors', { count: searchNeighborIds.size })}</span>
                )}
              </span>
            ) : (
              <span>{t('graph.noResults')}</span>
            )}
          </div>
        )}

        <div className="flex gap-1 bg-card/95 backdrop-blur rounded-lg p-1 shadow-lg border border-border">
          <button onClick={handleZoomIn} className="p-2 rounded hover:bg-accent" title={t('graph.zoomIn')}>
            <ZoomIn className="h-4 w-4" />
          </button>
          <button onClick={handleZoomOut} className="p-2 rounded hover:bg-accent" title={t('graph.zoomOut')}>
            <ZoomOut className="h-4 w-4" />
          </button>
          <button onClick={handleFit} className="p-2 rounded hover:bg-accent" title={t('graph.resetZoom')}>
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 bg-card/95 backdrop-blur rounded-lg p-3 shadow-lg border border-border">
        <div className="text-xs text-muted-foreground space-y-1">
          <div>{t('graph.totalNotes')}: <span className="font-medium text-foreground">{data.total_notes}</span></div>
          <div>{t('graph.indexed')}: <span className="font-medium text-foreground">{data.indexed_notes}</span></div>
          <div>{t('graph.showing')}: <span className="font-medium text-foreground">{graphData.nodes.length}</span></div>
          <div>{t('graph.connections')}: <span className="font-medium text-foreground">{graphData.links.length}</span></div>
          {orphanIds.size > 0 && (
            <div>{t('graph.orphanNotes')}: <span className="font-medium text-orange-400">{orphanIds.size}</span></div>
          )}
          {simulationRunning && (
            <div className="flex items-center gap-1 text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('graph.simulationRunning')}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="mt-2 text-xs text-primary hover:underline"
        >
          {showLegend ? t('graph.hideLegend') : t('graph.showLegend')}
        </button>
        {showLegend && (
          <div className="mt-2 pt-2 border-t border-border max-h-40 overflow-y-auto space-y-1">
            {notebooks.map(nb => (
              <div key={nb.name} className="flex items-center gap-2 text-xs">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: nb.color }}
                />
                <span className="truncate">{nb.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {hoveredNode && (
        <div className="absolute bottom-4 left-4 z-10 bg-card/95 backdrop-blur rounded-lg p-3 shadow-lg border border-border max-w-xs">
          <div className="font-medium text-sm truncate">{hoveredNode.label}</div>
          {hoveredNode.notebook && (
            <div className="text-xs text-muted-foreground mt-1">
              {hoveredNode.notebook}
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-1">
            {t('graph.connections')}: {hoveredNode._degree ?? 0}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-primary">{t('graph.clickToOpen')}</span>
            {onAnalyzeCluster && (hoveredNode._degree ?? 0) > 0 && (
              <span className="text-xs text-amber-400">{t('graph.rightClickAnalyze')}</span>
            )}
          </div>
        </div>
      )}

      <div ref={containerCallbackRef} className="w-full h-full bg-zinc-900">
        {dimensions && <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeId="id"
          nodeLabel=""
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(node: GraphNodeObject, color, ctx) => {
            const degree = node._degree ?? 0
            const baseSize = isHugeGraph ? 2 : isLargeGraph ? 2.5 : 4
            const searchScore = hitMap.get(node.id)
            let radius = baseSize + Math.min(degree * 0.5, isHugeGraph ? 4 : isLargeGraph ? 6 : 8)
            if (searchScore !== undefined) radius += 3 + searchScore * 4
            ctx.beginPath()
            ctx.arc(node.x ?? 0, node.y ?? 0, radius + 2, 0, 2 * Math.PI)
            ctx.fillStyle = color
            ctx.fill()
          }}
          linkColor={linkColor}
          linkWidth={linkWidth}
          onNodeClick={handleNodeClick}
          onNodeRightClick={handleNodeRightClick}
          onNodeHover={(node: GraphNodeObject | null) => setHoveredNode(node)}
          onEngineStop={handleEngineStop}
          cooldownTicks={hasCache ? 0 : (isHugeGraph ? 100 : isLargeGraph ? 80 : 80)}
          d3AlphaDecay={isHugeGraph ? 0.08 : isLargeGraph ? 0.05 : 0.03}
          d3VelocityDecay={isHugeGraph ? 0.5 : isLargeGraph ? 0.4 : 0.3}
          warmupTicks={hasCache ? 0 : (isHugeGraph ? 100 : isLargeGraph ? 60 : 0)}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />}
      </div>
    </div>
  )
}
