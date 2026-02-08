import { useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from 'react-force-graph-2d'
import { Search, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'

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

interface GraphNodeObject extends NodeObject {
  id: number
  label: string
  notebook: string | null
  size: number
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

function getNotebookColor(notebook: string | null): string {
  if (!notebook) return '#9ca3af'
  if (!NOTEBOOK_COLORS[notebook]) {
    NOTEBOOK_COLORS[notebook] = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length]
    colorIndex++
  }
  return NOTEBOOK_COLORS[notebook]
}

interface ObsidianGraphProps {
  data: GraphData | undefined
  isLoading: boolean
  error: Error | null
  className?: string
}

export function ObsidianGraph({
  data,
  isLoading,
  error,
  className,
}: ObsidianGraphProps) {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  type GraphMethods = ForceGraphMethods<
    NodeObject<GraphNodeObject>,
    LinkObject<GraphNodeObject, GraphLinkObject>
  >
  const graphRef = useRef<GraphMethods | undefined>(undefined)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNode, setHoveredNode] = useState<GraphNodeObject | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateDimensions = () => {
      setDimensions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
    }

    updateDimensions()
    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (data && data.nodes.length > 0 && graphRef.current) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 50)
      }, 500)
    }
  }, [data?.nodes.length])

  const handleNodeClick = useCallback(
    (node: GraphNodeObject) => {
      navigate(`/notes/${node.id}`)
    },
    [navigate]
  )

  const handleZoomIn = () => graphRef.current?.zoom(1.5, 300)
  const handleZoomOut = () => graphRef.current?.zoom(0.67, 300)
  const handleFit = () => graphRef.current?.zoomToFit(400, 50)

  const filteredNodes = data?.nodes.filter(node =>
    searchQuery
      ? node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.notebook?.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  )

  const filteredNodeIds = new Set(filteredNodes?.map(n => n.id))
  const filteredLinks = data?.links.filter(link => {
    const sourceId = typeof link.source === 'number' ? link.source : link.source
    const targetId = typeof link.target === 'number' ? link.target : link.target
    return filteredNodeIds.has(sourceId as number) && filteredNodeIds.has(targetId as number)
  })

  const graphData = {
    nodes: filteredNodes ?? [],
    links: filteredLinks ?? [],
  }

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={Search}
        title="그래프를 불러올 수 없습니다"
        description={error.message}
      />
    )
  }

  if (!data || data.nodes.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="인덱싱된 노트가 없습니다"
        description="Settings에서 노트 인덱싱을 먼저 실행하세요"
      />
    )
  }

  return (
    <div className={cn('relative h-full', className)}>
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-2 bg-card/95 backdrop-blur rounded-lg p-2 shadow-lg border border-border">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="노트 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-48 placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex gap-1 bg-card/95 backdrop-blur rounded-lg p-1 shadow-lg border border-border">
          <button
            onClick={handleZoomIn}
            className="p-2 rounded hover:bg-accent"
            title="확대"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 rounded hover:bg-accent"
            title="축소"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={handleFit}
            className="p-2 rounded hover:bg-accent"
            title="전체 보기"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 bg-card/95 backdrop-blur rounded-lg p-3 shadow-lg border border-border">
        <div className="text-xs text-muted-foreground space-y-1">
          <div>전체 노트: <span className="font-medium text-foreground">{data.total_notes}</span></div>
          <div>인덱싱됨: <span className="font-medium text-foreground">{data.indexed_notes}</span></div>
          <div>표시중: <span className="font-medium text-foreground">{graphData.nodes.length}</span></div>
          <div>연결: <span className="font-medium text-foreground">{graphData.links.length}</span></div>
        </div>
      </div>

      {hoveredNode && (
        <div className="absolute bottom-4 left-4 z-10 bg-card/95 backdrop-blur rounded-lg p-3 shadow-lg border border-border max-w-xs">
          <div className="font-medium text-sm truncate">{hoveredNode.label}</div>
          {hoveredNode.notebook && (
            <div className="text-xs text-muted-foreground mt-1">
              📓 {hoveredNode.notebook}
            </div>
          )}
          <div className="text-xs text-primary mt-1">클릭하여 노트 열기</div>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full bg-background">
        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeId="id"
          nodeLabel=""
          nodeColor={(node: GraphNodeObject) => {
            if (searchQuery && node.label.toLowerCase().includes(searchQuery.toLowerCase())) {
              return '#fbbf24'
            }
            return getNotebookColor(node.notebook)
          }}
          nodeRelSize={6}
          nodeVal={(node: GraphNodeObject) => node.size + 1}
          linkColor={() => 'rgba(156, 163, 175, 0.3)'}
          linkWidth={(link: GraphLinkObject) => Math.max(0.5, link.weight * 2)}
          onNodeClick={handleNodeClick}
          onNodeHover={(node: GraphNodeObject | null) => setHoveredNode(node)}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
      </div>
    </div>
  )
}
