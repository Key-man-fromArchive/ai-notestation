import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Network, SlidersHorizontal, BarChart3 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ObsidianGraph } from '@/components/ObsidianGraph'
import { GraphAnalysisPanel } from '@/components/GraphAnalysisPanel'
import { useGlobalGraph } from '@/hooks/useGlobalGraph'
import { useClusterInsight } from '@/hooks/useClusterInsight'
import { ModelSelector } from '@/components/ModelSelector'

const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH = 700
const DEFAULT_PANEL_WIDTH = 420

export default function Graph() {
  const [showSettings, setShowSettings] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [showAll, setShowAll] = useState(true)
  const [limit, setLimit] = useState(500)
  const [threshold, setThreshold] = useState(0.5)
  const [neighborsPerNote, setNeighborsPerNote] = useState(5)

  const effectiveLimit = showAll ? 0 : limit

  const { data, isLoading, error, refetch } = useGlobalGraph({
    limit: effectiveLimit,
    similarityThreshold: threshold,
    neighborsPerNote,
    includeAnalysis: showAnalysis,
  })

  const clusterInsight = useClusterInsight()
  const [insightHubLabel, setInsightHubLabel] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState('')
  const [pendingAnalysis, setPendingAnalysis] = useState<{ noteIds: number[]; hubLabel: string } | null>(null)

  // Resizable analysis panel
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(DEFAULT_PANEL_WIDTH)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = startX.current - e.clientX
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth.current + delta))
      setPanelWidth(newWidth)
    }
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = panelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }, [panelWidth])

  // Build adjacency map from graph links for hub→cluster resolution
  const adjacencyMap = useMemo(() => {
    const map = new Map<number, Set<number>>()
    if (!data?.links) return map
    for (const link of data.links) {
      const src = typeof link.source === 'object' ? (link.source as { id: number }).id : link.source
      const tgt = typeof link.target === 'object' ? (link.target as { id: number }).id : link.target
      if (!map.has(src)) map.set(src, new Set())
      if (!map.has(tgt)) map.set(tgt, new Set())
      map.get(src)!.add(tgt)
      map.get(tgt)!.add(src)
    }
    return map
  }, [data?.links])

  // Handle cluster analysis from graph right-click
  const handleAnalyzeCluster = useCallback(
    (noteIds: number[], hubLabel: string) => {
      setInsightHubLabel(hubLabel)
      setPendingAnalysis({ noteIds, hubLabel })
      if (!showAnalysis) setShowAnalysis(true)
    },
    [showAnalysis]
  )

  // Handle hub analysis from the analysis panel sparkle buttons
  const handleAnalyzeHub = useCallback(
    (noteId: number, label: string) => {
      const neighbors = adjacencyMap.get(noteId)
      const noteIds = [noteId, ...(neighbors ? [...neighbors].slice(0, 19) : [])]
      setInsightHubLabel(label)
      setPendingAnalysis({ noteIds, hubLabel: label })
    },
    [adjacencyMap]
  )

  // Actually start analysis when user clicks the "분석 시작" button
  const handleStartAnalysis = useCallback(() => {
    if (pendingAnalysis) {
      clusterInsight.analyze(pendingAnalysis.noteIds, undefined, selectedModel || undefined)
      setPendingAnalysis(null)
    }
  }, [pendingAnalysis, clusterInsight, selectedModel])

  return (
    <div className="h-[calc(100vh-4.5rem)] flex flex-col -mx-6">
      <div className="flex items-center justify-between mb-4 px-6">
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">그래프 뷰</h1>
            <p className="text-sm text-muted-foreground">
              노트 간 연결성을 시각화합니다
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ModelSelector
            value={selectedModel}
            onChange={setSelectedModel}
            className="text-xs py-1.5 px-2"
          />
          <button
            onClick={() => {
              setShowAnalysis(!showAnalysis)
            }}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border',
              showAnalysis ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            )}
          >
            <BarChart3 className="h-4 w-4" />
            분석
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border',
              showSettings ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            설정
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="mb-4 mx-6 p-4 border border-border rounded-lg bg-card">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-center gap-3 col-span-2 lg:col-span-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={e => setShowAll(e.target.checked)}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm font-medium">전체 노트 표시</span>
              </label>
            </div>

            <div className={cn(showAll && 'opacity-40 pointer-events-none')}>
              <label className="text-sm font-medium block mb-2">
                표시할 노트 수: {limit}
              </label>
              <input
                type="range"
                min={50}
                max={2500}
                step={50}
                value={limit}
                onChange={e => setLimit(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>50</span>
                <span>2500</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">
                유사도 임계값: {(threshold * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min={0.3}
                max={0.95}
                step={0.05}
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>30% (더 많은 연결)</span>
                <span>95% (강한 연결만)</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">
                노트당 이웃 수: {neighborsPerNote}
              </label>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={neighborsPerNote}
                onChange={e => setNeighborsPerNote(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>1 (간결)</span>
                <span>20 (밀집)</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            적용
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden border-y border-border">
        <div className="flex-1 overflow-hidden">
          <ObsidianGraph
            data={data}
            isLoading={isLoading}
            error={error}
            className="h-full"
            onAnalyzeCluster={handleAnalyzeCluster}
          />
        </div>

        {showAnalysis && data?.analysis && (
          <>
            {/* Resize handle */}
            <div
              onMouseDown={handleDragStart}
              className="w-1.5 flex-shrink-0 cursor-col-resize bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors"
              title="드래그하여 패널 크기 조절"
            />
            <GraphAnalysisPanel
              analysis={data.analysis}
              onClose={() => setShowAnalysis(false)}
              graphData={data}
              clusterInsight={{
                content: clusterInsight.content,
                isStreaming: clusterInsight.isStreaming,
                error: clusterInsight.error,
                notes: clusterInsight.notes,
                hubLabel: insightHubLabel,
              }}
              onAnalyzeHub={handleAnalyzeHub}
              onStopInsight={clusterInsight.stop}
              onResetInsight={() => {
                clusterInsight.reset()
                setInsightHubLabel(null)
                setPendingAnalysis(null)
              }}
              pendingAnalysis={pendingAnalysis}
              onStartAnalysis={handleStartAnalysis}
              selectedModel={selectedModel}
              width={panelWidth}
            />
          </>
        )}
      </div>
    </div>
  )
}
