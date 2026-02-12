import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X, TrendingUp, AlertCircle, BarChart3, Layers, Sparkles, Loader2, Square, ChevronDown, ChevronRight, ExternalLink, Send, Play } from 'lucide-react'
import type { GraphAnalysis, GraphData } from '@/hooks/useGlobalGraph'
import { useAIStream } from '@/hooks/useAIStream'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

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
  /** Pending analysis (not yet started) */
  pendingAnalysis?: { noteIds: number[]; hubLabel: string } | null
  onStartAnalysis?: () => void
  /** Selected model (read-only, selector is in header) */
  selectedModel: string
  /** Panel width in pixels (controlled by parent resize) */
  width?: number
}

export function GraphAnalysisPanel({
  analysis,
  onClose,
  graphData,
  clusterInsight,
  onAnalyzeHub,
  onStopInsight,
  onResetInsight,
  pendingAnalysis,
  onStartAnalysis,
  selectedModel,
  width,
}: GraphAnalysisPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'stats' | 'insight'>(
    clusterInsight?.content || clusterInsight?.isStreaming ? 'insight' : 'stats'
  )
  const [expandedHub, setExpandedHub] = useState<number | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const followUpStream = useAIStream()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const prevStreamingRef = useRef(false)
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
    if (!graphData?.nodes) return new Map<number, GraphData['nodes'][number]>()
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
        .map(n => ({ id: n!.id, label: n!.label, notebook: n!.notebook }))
    },
    [adjacencyMap, nodeMap]
  )

  // Capture completed follow-up responses
  useEffect(() => {
    if (prevStreamingRef.current && !followUpStream.isStreaming && followUpStream.content) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: followUpStream.content }])
      followUpStream.reset()
    }
    prevStreamingRef.current = followUpStream.isStreaming
  }, [followUpStream.isStreaming, followUpStream.content, followUpStream.reset])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, followUpStream.content])

  const handleSendFollowUp = useCallback(() => {
    if (!chatInput.trim() || followUpStream.isStreaming) return
    const userMessage = chatInput.trim()
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setChatInput('')
    const contextMessage = `${t('graph.followUpContext')}:\n${clusterInsight?.content}\n\n${t('graph.userQuestion')}: ${userMessage}`
    followUpStream.startStream({
      message: contextMessage,
      feature: 'insight',
      model: selectedModel || undefined,
    })
  }, [chatInput, followUpStream, clusterInsight?.content, selectedModel])

  // Switch to insight tab when streaming starts or pending analysis is set
  if ((clusterInsight?.isStreaming || pendingAnalysis) && activeTab !== 'insight') {
    setActiveTab('insight')
  }

  return (
    <div
      className="border-l border-border bg-card overflow-y-auto flex-shrink-0"
      style={{ width: width ? `${width}px` : '420px' }}
    >
      <div className="sticky top-0 bg-card z-10 border-b border-border">
        <div className="p-4 flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('graph.analysisPanel')}
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
            {t('graph.stats')}
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
            {t('graph.aiInsight')}
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
              {t('graph.networkStats')}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label={t('graph.nodes')} value={network_stats.nodes.toLocaleString()} />
              <StatCard label={t('graph.edges')} value={network_stats.edges.toLocaleString()} />
              <StatCard label={t('graph.avgConnections')} value={network_stats.avg_degree.toFixed(1)} />
              <StatCard label={t('graph.density')} value={(network_stats.density * 100).toFixed(2) + '%'} />
              <StatCard label={t('graph.components')} value={String(network_stats.components)} />
              <StatCard label={t('graph.orphanNotes')} value={String(orphan_count)} highlight={orphan_count > 0} />
            </div>
          </div>

          {/* Hub Notes */}
          <div className="p-4 border-b border-border">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              {t('graph.hubNotes')}
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
                        title={t('graph.viewNote')}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </button>
                      {onAnalyzeHub && (
                        <button
                          onClick={() => onAnalyzeHub(note.id, note.label)}
                          className="p-1 rounded hover:bg-amber-500/20 text-muted-foreground hover:text-amber-400 flex-shrink-0"
                          title={t('graph.analyzeCluster')}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="ml-6 mt-0.5 mb-1 space-y-0.5 border-l-2 border-border pl-2">
                        {neighbors.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-1">{t('graph.noConnectedNotes')}</p>
                        ) : (
                          neighbors.map(n => (
                            <button
                              key={n.id}
                              onClick={() => navigate(`/notes/${n.id}`)}
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
                {t('graph.orphanNotes')} ({t('graph.orphanNotesCount', { count: orphan_count })})
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
                    {t('graph.moreCount', { count: orphan_notes.length - 50 })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Cluster Summary */}
          <div className="p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              {t('graph.notebookSummary')}
            </h4>
            <div className="space-y-2">
              {cluster_summary.map(cluster => (
                <div
                  key={cluster.notebook}
                  className="px-2 py-2 rounded bg-accent/30 text-sm"
                >
                  <div className="font-medium truncate">{cluster.notebook}</div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                    <span>{t('graph.noteCount', { count: cluster.note_count })}</span>
                    <span>{t('graph.edgeCount', { count: cluster.edge_count })}</span>
                    {cluster.avg_similarity > 0 && (
                      <span>{t('graph.similarityPercent', { percent: (cluster.avg_similarity * 100).toFixed(0) })}</span>
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
          {!pendingAnalysis && !clusterInsight?.content && !clusterInsight?.isStreaming && !clusterInsight?.error ? (
            /* Default state - no analysis pending or active */
            <div className="text-center py-8">
              <Sparkles className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-2">
                {t('graph.selectClusterPrompt')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('graph.clickSparkleIcon')} <Sparkles className="h-3 w-3 inline" /> {t('graph.clickSparkleIconSuffix')}<br />
                {t('graph.rightClickNode')}
              </p>
            </div>
          ) : pendingAnalysis && !clusterInsight?.content && !clusterInsight?.isStreaming ? (
            /* Pending state - ready to start analysis */
            <div className="text-center py-8">
              <Sparkles className="h-8 w-8 text-amber-400 mx-auto mb-3" />
              <div className="mb-4">
                <div className="text-xs text-muted-foreground">{t('graph.analysisFocus')}</div>
                <div className="font-medium text-sm">{pendingAnalysis.hubLabel}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t('graph.notesSelected', { count: pendingAnalysis.noteIds.length })}
                </div>
              </div>
              <button
                onClick={onStartAnalysis}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
              >
                <Play className="h-4 w-4" />
                {t('graph.startAnalysis')}
              </button>
            </div>
          ) : (
            /* Active state - streaming or completed */
            <>
              {/* Cluster info header */}
              {clusterInsight?.hubLabel && (
                <div className="mb-3 pb-3 border-b border-border">
                  <div className="text-xs text-muted-foreground">{t('graph.analysisFocusLabel')}</div>
                  <div className="font-medium text-sm truncate">{clusterInsight.hubLabel}</div>
                  {clusterInsight.notes.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {t('graph.notesAnalyzed', { count: clusterInsight.notes.length })}
                    </div>
                  )}
                </div>
              )}

              {/* Streaming controls */}
              {clusterInsight?.isStreaming && (
                <div className="mb-3 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">{t('graph.aiAnalyzing')}</span>
                  <button
                    onClick={onStopInsight}
                    className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground"
                    title={t('graph.stopAnalysis')}
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

              {/* Follow-up Chat Section */}
              {!clusterInsight?.isStreaming && clusterInsight?.content && (
                <div className="mt-4 pt-4 border-t border-border">
                  {/* Chat history */}
                  {chatMessages.length > 0 && (
                    <div className="space-y-3 mb-3 max-h-60 overflow-y-auto">
                      {chatMessages.map((msg, i) => (
                        <div key={i}>
                          {msg.role === 'user' ? (
                            <div className="text-xs font-medium text-primary mb-1">{t('graph.question')}</div>
                          ) : (
                            <div className="text-xs font-medium text-muted-foreground mb-1">{t('graph.answer')}</div>
                          )}
                          <MarkdownRenderer content={msg.content} className="text-sm" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Current streaming response */}
                  {followUpStream.isStreaming && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        <span className="text-xs text-muted-foreground">{t('graph.generating')}</span>
                      </div>
                      {followUpStream.content && (
                        <MarkdownRenderer content={followUpStream.content} className="text-sm" />
                      )}
                    </div>
                  )}

                  {followUpStream.error && (
                    <div className="mb-3 p-2 rounded bg-destructive/10 text-destructive text-xs">
                      {followUpStream.error}
                    </div>
                  )}

                  <div ref={chatEndRef} />

                  {/* Chat input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendFollowUp()
                        }
                      }}
                      placeholder={t('graph.followUpPlaceholder')}
                      disabled={followUpStream.isStreaming}
                      className="flex-1 px-3 py-2 border border-input rounded-md text-xs bg-background placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    />
                    <button
                      onClick={handleSendFollowUp}
                      disabled={!chatInput.trim() || followUpStream.isStreaming}
                      className="p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={t('graph.send')}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Reset button */}
              {!clusterInsight?.isStreaming && clusterInsight?.content && (
                <button
                  onClick={() => {
                    setChatMessages([])
                    setChatInput('')
                    followUpStream.reset()
                    onResetInsight?.()
                  }}
                  className="mt-4 w-full px-3 py-2 rounded border border-border text-xs text-muted-foreground hover:bg-accent"
                >
                  {t('graph.resetAnalysis')}
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
