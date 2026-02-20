import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiClient } from '@/lib/api'
import { Save, CheckCircle, Network } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GraphSettings {
  similarity_threshold: number
  neighbors_per_note: number
  node_limit: number
  show_all: boolean
}

interface GraphSettingsResponse {
  key: string
  value: GraphSettings
  description: string
}

const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  similarity_threshold: 0.8,
  neighbors_per_note: 5,
  node_limit: 500,
  show_all: true,
}

export function GraphSettingsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [local, setLocal] = useState<GraphSettings>(DEFAULT_GRAPH_SETTINGS)
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data } = useQuery<GraphSettingsResponse>({
    queryKey: ['settings', 'graph_settings'],
    queryFn: () => apiClient.get('/settings/graph_settings'),
  })

  const saveMutation = useMutation({
    mutationFn: (settings: GraphSettings) =>
      apiClient.put('/settings/graph_settings', { value: settings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'graph_settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  useEffect(() => {
    if (!data?.value || initialized) return
    setLocal({ ...DEFAULT_GRAPH_SETTINGS, ...data.value })
    setInitialized(true)
  }, [data, initialized])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await saveMutation.mutateAsync(local)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Network className="h-5 w-5" aria-hidden="true" />
        {t('settings.graphSettings')}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.graphSettingsDesc')}
      </p>

      <div className="space-y-4">
        {/* Similarity threshold */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">{t('graph.similarity')}</label>
            <span className="text-sm font-mono tabular-nums">
              {(local.similarity_threshold * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0.3}
            max={0.95}
            step={0.05}
            value={local.similarity_threshold}
            onChange={(e) =>
              setLocal((prev) => ({ ...prev, similarity_threshold: parseFloat(e.target.value) }))
            }
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
            <span>30% ({t('graph.moreConnections')})</span>
            <span>95% ({t('graph.strongConnectionsOnly')})</span>
          </div>
        </div>

        {/* Neighbors per note */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">{t('graph.connections')}</label>
            <span className="text-sm font-mono tabular-nums">{local.neighbors_per_note}</span>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={local.neighbors_per_note}
            onChange={(e) =>
              setLocal((prev) => ({ ...prev, neighbors_per_note: parseInt(e.target.value) }))
            }
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
            <span>1 ({t('graph.concise')})</span>
            <span>20 ({t('graph.dense')})</span>
          </div>
        </div>

        {/* Node limit */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">{t('graph.nodes')}</label>
            <span className="text-sm font-mono tabular-nums">{local.node_limit}</span>
          </div>
          <input
            type="range"
            min={50}
            max={2500}
            step={50}
            value={local.node_limit}
            onChange={(e) =>
              setLocal((prev) => ({ ...prev, node_limit: parseInt(e.target.value) }))
            }
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
            <span>50</span>
            <span>2500</span>
          </div>
        </div>

        {/* Show all toggle */}
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm font-medium">{t('common.viewAll')}</span>
          <button
            onClick={() => setLocal((prev) => ({ ...prev, show_all: !prev.show_all }))}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              local.show_all ? 'bg-primary' : 'bg-input',
            )}
            role="switch"
            aria-checked={local.show_all}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
                local.show_all ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? t('common.saving') : t('common.save')}
        </button>
        {saved && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">{t('common.saved')}</span>
          </div>
        )}
      </div>

      {saveMutation.isError && (
        <div
          className="mt-4 flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
          role="alert"
        >
          <span className="text-sm text-destructive">{t('settings.settingsSaveFailed')}</span>
        </div>
      )}
    </div>
  )
}
