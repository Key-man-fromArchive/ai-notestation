import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, TrendingUp, AlertCircle, BarChart3, Layers, Sparkles, Loader2, Square, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import type { GraphAnalysis, GraphData } from '@/hooks/useGlobalGraph'
import { ModelSelector } from '@/components/ModelSelector'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'

interface GraphAnalysisPanelProps {
  analysis: GraphAnalysis
  onClose: () => void
  /** Full graph data for resolving neighbor notes */
  graphData?: GraphData | null
  /** Cluster insight state (from parent) */
  clusterInsight?: {
    content: string
    isStreaming: boolean
    error: string | null
    notes: { id: number; title: string; notebook: string | null }[]
    hubLabel: string | null
  }
  onAnalyzeHub?: (noteId: number, label: string) => void
  onStopInsight?: () => void
  onResetInsight?: () => void
  /** Model selection */
  selectedModel: string
  onModelChange: (modelId: string) => void
}

export function GraphAnalysisPanel({
  analysis,
  onClose,
  graphData,
  clusterInsight,
  onAnalyzeHub,
  onStopInsight,
  onResetInsight,
  selectedModel,
  onModelChange,
}: GraphAnalysisPanelProps) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'stats' | 'insight'>(
    clusterInsight?.content || clusterInsight?.isStreaming ? 'insight' : 'stats'
  )
  const [expandedHub, setExpandedHub] = useState<number | null>(null)
  const { network_stats, hub_notes, orphan_notes, orphan_count, cluster_summary } = analysis

  // Pre-built adjacency map + node map (computed once per graphData change)
  const adjacencyMap = useMemo(() => {
    const map = new Map<number, Set<number>>()
    if (!graphData?.links) return map
    for (const link of graphData.links) {
      const src = typeof link.source === 'object' ? (link.source as { id: number }).id : link.source
      const tgt = typeof link.target === 'object' ? (link.target as { id: number }).id : link.target
      if (!map.has(src)) map.set(src, new Set())
      if (!map.has(tgt)) map.set(tgt, new Set())
      map.get(src)!.add(tgt)
      map.get(tgt)!.add(src)
    }
    return map
  }, [graphData?.links])

  const nodeMap = useMemo(() => {
    if (!graphData?.nodes) return new Map<number, (typeof graphData.nodes)[number]>()
    return new Map(graphData.nodes.map(n => [n.id, n]))
  }, [graphData?.nodes])

  // O(degree) lookup instead of O(links) full scan
  const getNeighbors = useCallback(
    (noteId: number) => {
      const neighborIds = adjacencyMap.get(noteId)
      if (!neighborIds) return []
      return [...neighborIds]
        .map(id => nodeMap.get(id))
        .filter(Boolean)
        .map(n => ({ id: n!.id, note_key: n!.note_key, label: n!.label, notebook: n!.notebook }))
    },
    [adjacencyMap, nodeMap]
  )

  // Switch to insight tab when streaming starts
  if (clusterInsight?.isStreaming && activeTab !== 'insight') {
    setActiveTab('insight')
  }

  return (
    <div className="w-80 border-l border-border bg-card overflow-y-auto flex-shrink-0">
      <div className="sticky top-0 bg-card z-10 border-b border-border">
        <div className="p-4 flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            그래프 분석
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-t border-border">
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'stats'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            통계
          </button>
          <button
            onClick={() => setActiveTab('insight')}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
              activeTab === 'insight'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            AI 인사이트
            {clusterInsight?.isStreaming && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
          </button>
        </div>
      </div>

      {activeTab === 'stats' ? (
        <>
          {/* Network Stats */}
          <div className="p-4 border-b border-border">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              네트워크 통계
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="노드" value={network_stats.nodes.toLocaleString()} />
              <StatCard label="엣지" value={network_stats.edges.toLocaleString()} />
              <StatCard label="평균 연결" value={network_stats.avg_degree.toFixed(1)} />
              <StatCard label="밀도" value={(network_stats.density * 100).toFixed(2) + '%'} />
              <StatCard label="컴포넌트" value={String(network_stats.components)} />
              <StatCard label="고립 노트" value={String(orphan_count)} highlight={orphan_count > 0} />
            </div>
          </div>

          {/* Hub Notes */}
          <div className="p-4 border-b border-border">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              허브 노트 (상위 10)
            </h4>
            <div className="space-y-0.5">
              {hub_notes.map(note => {
                const isExpanded = expandedHub === note.id
                const neighbors = isExpanded ? getNeighbors(note.id) : []
                return (
                  <div key={note.id}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setExpandedHub(isExpanded ? null : note.id)}
                        className="flex-1 text-left px-2 py-1.5 rounded hover:bg-accent flex items-center gap-1.5 group min-w-0"
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                          : <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        }
                        <span className="text-sm truncate flex-1">{note.label}</span>
                        <span className="text-xs text-muted-foreground group-hover:text-foreground flex-shrink-0">
                          {note.degree}
                        </span>
                      </button>
                      <button
                        onClick={() => navigate(`/notes/${note.note_key}`)}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground flex-shrink-0"
                        title="노트 보기"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </button>
                      {onAnalyzeHub && (
                        <button
                          onClick={() => onAnalyzeHub(note.id, note.label)}
                          className="p-1 rounded hover:bg-amber-500/20 text-muted-foreground hover:text-amber-400 flex-shrink-0"
                          title="이 클러스터 AI 분석"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="ml-6 mt-0.5 mb-1 space-y-0.5 border-l-2 border-border pl-2">
                        {neighbors.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-1">연결된 노트 없음</p>
                        ) : (
                          neighbors.map(n => (
                            <button
                              key={n.id}
                              onClick={() => navigate(`/notes/${n.note_key}`)}
                              className="w-full text-left px-1.5 py-1 rounded hover:bg-accent text-xs truncate text-muted-foreground hover:text-foreground flex items-center gap-1"
                            >
                              <span className="truncate">{n.label}</span>
                              {n.notebook && (
                                <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
                                  {n.notebook}
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Orphan Notes */}
          {orphan_notes.length > 0 && (
            <div className="p-4 border-b border-border">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                고립 노트 ({orphan_count}개)
              </h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {orphan_notes.slice(0, 50).map(note => (
                  <button
                    key={note.id}
                    onClick={() => navigate(`/notes/${note.note_key}`)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-accent text-sm truncate text-muted-foreground hover:text-foreground"
                  >
                    {note.label}
                  </button>
                ))}
                {orphan_notes.length > 50 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    +{orphan_notes.length - 50}개 더...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Cluster Summary */}
          <div className="p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              노트북별 요약
            </h4>
            <div className="space-y-2">
              {cluster_summary.map(cluster => (
                <div
                  key={cluster.notebook}
                  className="px-2 py-2 rounded bg-accent/30 text-sm"
                >
                  <div className="font-medium truncate">{cluster.notebook}</div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                    <span>{cluster.note_count}개 노트</span>
                    <span>{cluster.edge_count}개 연결</span>
                    {cluster.avg_similarity > 0 && (
                      <span>유사도 {(cluster.avg_similarity * 100).toFixed(0)}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* AI Insight Tab */
        <div className="p-4">
          {/* Model selector */}
          <div className="mb-3">
            <ModelSelector
              value={selectedModel}
              onChange={onModelChange}
              className="w-full text-xs py-1.5 px-2"
            />
          </div>

          {!clusterInsight?.content && !clusterInsight?.isStreaming && !clusterInsight?.error ? (
            <div className="text-center py-8">
              <Sparkles className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-2">
                클러스터를 선택하여 AI 인사이트를 생성하세요
              </p>
              <p className="text-xs text-muted-foreground">
                허브 노트 옆의 <Sparkles className="h-3 w-3 inline" /> 아이콘을 클릭하거나,<br />
                그래프에서 노트를 우클릭하세요
              </p>
            </div>
          ) : (
            <>
              {/* Cluster info header */}
              {clusterInsight?.hubLabel && (
                <div className="mb-3 pb-3 border-b border-border">
                  <div className="text-xs text-muted-foreground">분석 중심:</div>
                  <div className="font-medium text-sm truncate">{clusterInsight.hubLabel}</div>
                  {clusterInsight.notes.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {clusterInsight.notes.length}개 노트 분석
                    </div>
                  )}
                </div>
              )}

              {/* Streaming controls */}
              {clusterInsight?.isStreaming && (
                <div className="mb-3 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">AI 분석 중...</span>
                  <button
                    onClick={onStopInsight}
                    className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground"
                    title="중단"
                  >
                    <Square className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Error */}
              {clusterInsight?.error && (
                <div className="mb-3 p-2 rounded bg-destructive/10 text-destructive text-xs">
                  {clusterInsight.error}
                </div>
              )}

              {/* AI Content */}
              {clusterInsight?.content && (
                <MarkdownRenderer content={clusterInsight.content} className="text-sm" />
              )}

              {/* Reset button */}
              {!clusterInsight?.isStreaming && clusterInsight?.content && (
                <button
                  onClick={onResetInsight}
                  className="mt-4 w-full px-3 py-2 rounded border border-border text-xs text-muted-foreground hover:bg-accent"
                >
                  분석 초기화
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="bg-accent/30 rounded-lg p-2 text-center">
      <div className={`text-lg font-bold ${highlight ? 'text-orange-400' : ''}`}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
