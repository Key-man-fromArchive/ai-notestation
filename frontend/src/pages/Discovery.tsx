// @TASK P4-T4.4 - Discovery Page
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#discovery-library

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Sparkles, Loader2, Network, Tag, FileText } from 'lucide-react'

import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import {
  DiscoveryGraph,
  CLUSTER_COLORS,
  UNCLUSTERED_COLOR,
  getClusterColor,
} from '@/components/DiscoveryGraph'
import { useTriggerClustering, type ClusterInfo } from '@/hooks/useDiscovery'
import { useNotebook } from '@/hooks/useNotebooks'

const CLUSTER_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10]

function ClusterCard({
  cluster,
  isSelected,
  onClick,
}: {
  cluster: ClusterInfo
  isSelected: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()
  const color = getClusterColor(cluster.cluster_index)

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-colors',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-accent/50',
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="font-medium text-sm">
          {t('graph.clusters')} {cluster.cluster_index + 1}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {cluster.note_ids.length}
        </span>
      </div>
      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
        {cluster.summary}
      </p>
      {cluster.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cluster.keywords.slice(0, 5).map((keyword, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground"
            >
              <Tag className="h-2.5 w-2.5" />
              {keyword}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

function ClusterLegend() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg">
      {CLUSTER_COLORS.slice(0, 5).map((color, i) => (
        <div key={i} className="flex items-center gap-1">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs text-muted-foreground">{i + 1}</span>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: UNCLUSTERED_COLOR }}
        />
        <span className="text-xs text-muted-foreground">{t('graph.clusters')}</span>
      </div>
    </div>
  )
}

export default function Discovery() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const notebookId = parseInt(id ?? '0', 10)

  const [numClusters, setNumClusters] = useState(5)
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null)

  const { data: notebook, isLoading: notebookLoading } = useNotebook(notebookId)
  const {
    trigger,
    status,
    clusters,
    error,
    isPolling,
    isPending,
  } = useTriggerClustering(notebookId)

  const isAnalyzing = isPending || isPolling || status === 'pending' || status === 'processing'

  const handleAnalyze = () => {
    trigger(numClusters)
    setSelectedCluster(null)
  }

  const handleNodeClick = (nodeId: number) => {
    if (clusters) {
      const clusterIndex = clusters.findIndex(c => c.note_ids.includes(nodeId))
      if (clusterIndex >= 0) {
        setSelectedCluster(clusterIndex)
      }
    }
  }

  if (notebookLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!notebook) {
    return (
      <EmptyState
        icon={Network}
        title={t('notebooks.notFound')}
        description={t('notebooks.notFoundDesc')}
        action={{
          label: t('notebooks.backToList'),
          onClick: () => navigate('/notebooks'),
        }}
      />
    )
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center gap-4 mb-4 flex-shrink-0">
        <button
          onClick={() => navigate(`/notebooks/${notebookId}`)}
          className="p-2 rounded-lg hover:bg-accent"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold mb-1">{t('graph.discoveryTitle')}</h1>
          <p className="text-sm text-muted-foreground">{notebook.name}</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('graph.clusters')}:</span>
            <select
              value={numClusters}
              onChange={e => setNumClusters(parseInt(e.target.value, 10))}
              disabled={isAnalyzing}
              className="px-2 py-1 rounded-md border border-input bg-background text-sm"
            >
              {CLUSTER_OPTIONS.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 disabled:opacity-50',
            )}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('ai.analyzing')}</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>{t('ai.analyze')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex-shrink-0">
          {error}
        </div>
      )}

      <div className="flex-1 flex gap-4 min-h-0">
        <aside className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
          <ClusterLegend />

          {status === 'idle' && !clusters && (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {t('ai.analyze')}
              </p>
            </div>
          )}

          {isAnalyzing && (
            <div className="text-center py-8">
              <LoadingSpinner />
              <p className="text-sm text-muted-foreground mt-2">
                {t('ai.analyzing')}
              </p>
            </div>
          )}

          {status === 'completed' && clusters && (
            <div className="space-y-2">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t('graph.clusters')} ({clusters.length})
              </h3>
              {clusters.map((cluster, i) => (
                <ClusterCard
                  key={cluster.cluster_index}
                  cluster={cluster}
                  isSelected={selectedCluster === i}
                  onClick={() => setSelectedCluster(i)}
                />
              ))}
            </div>
          )}
        </aside>

        <main className="flex-1 min-w-0 bg-muted/20 rounded-lg overflow-hidden">
          <DiscoveryGraph
            notebookId={notebookId}
            onNodeClick={handleNodeClick}
            className="w-full h-full"
          />
        </main>
      </div>
    </div>
  )
}
