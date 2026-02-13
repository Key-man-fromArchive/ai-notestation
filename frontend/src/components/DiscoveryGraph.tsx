// @TASK P4-T4.4 - Discovery Graph Component
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#discovery-library

import { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from 'react-force-graph-2d'

import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  useGraphData,
  type GraphNode,
  type GraphLink,
} from '@/hooks/useDiscovery'

const CLUSTER_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
]
const UNCLUSTERED_COLOR = '#9ca3af' // gray-400

function getClusterColor(clusterId: number): string {
  if (clusterId < 0) return UNCLUSTERED_COLOR
  return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length]
}

interface DiscoveryGraphProps {
  notebookId: number
  onNodeClick?: (nodeId: number) => void
  className?: string
}

interface GraphNodeObject extends NodeObject {
  id: number
  label: string
  cluster_id: number
}

interface GraphLinkObject extends LinkObject {
  source: number | GraphNodeObject
  target: number | GraphNodeObject
  weight: number
}

export function DiscoveryGraph({
  notebookId,
  onNodeClick,
  className,
}: DiscoveryGraphProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  type GraphMethods = ForceGraphMethods<NodeObject<GraphNodeObject>, LinkObject<GraphNodeObject, GraphLinkObject>>
  const graphRef = useRef<GraphMethods | undefined>(undefined)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  const { nodes, links, totalNotes, isLoading, error } =
    useGraphData(notebookId)

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
    if (nodes.length > 0 && graphRef.current) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 50)
      }, 500)
    }
  }, [nodes.length])

  const handleNodeClick = useCallback(
    (node: GraphNodeObject) => {
      onNodeClick?.(node.id)
    },
    [onNodeClick],
  )

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted/30 rounded-lg',
          className,
        )}
        style={{ minHeight: 400 }}
      >
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted/30 rounded-lg text-muted-foreground',
          className,
        )}
        style={{ minHeight: 400 }}
      >
        <p>{t('graph.loadError')}</p>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-muted/30 rounded-lg text-muted-foreground',
          className,
        )}
        style={{ minHeight: 400 }}
      >
        <p className="text-lg font-medium">{t('graph.noNotes')}</p>
        <p className="text-sm mt-1">
          {t('graph.noNotesDesc')}
        </p>
      </div>
    )
  }

  const graphData = {
    nodes: nodes.map(
      (n: GraphNode): GraphNodeObject => ({
        id: n.id,
        label: n.label,
        cluster_id: n.cluster_id,
      }),
    ),
    links: links.map(
      (l: GraphLink): GraphLinkObject => ({
        source: l.source,
        target: l.target,
        weight: l.weight,
      }),
    ),
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="absolute top-2 right-2 z-10 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs text-muted-foreground">
        {t('graph.noteCountDisplay', { count: nodes.length, total: totalNotes })}
      </div>
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        nodeLabel={(node: GraphNodeObject) => node.label}
        nodeColor={(node: GraphNodeObject) => getClusterColor(node.cluster_id)}
        nodeRelSize={6}
        linkWidth={(link: GraphLinkObject) => {
          const weight =
            typeof link.weight === 'number' ? link.weight : 1
          return Math.sqrt(weight)
        }}
        linkColor={(link: GraphLinkObject) => {
          const weight = typeof link.weight === 'number' ? link.weight : 0
          return weight > 0.5 ? '#93c5fd' : '#e5e7eb'
        }}
        onNodeClick={handleNodeClick}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
        cooldownTicks={100}
        onEngineStop={() => graphRef.current?.zoomToFit(400, 50)}
      />
    </div>
  )
}

export { CLUSTER_COLORS, UNCLUSTERED_COLOR, getClusterColor }
