import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  Database,
  Users,
  Server,
  Brain,
  FileText,
  HardDrive,
  Building2,
  Crown,
  Shield,
  Eye,
  UserCheck,
  UserX,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  AlertTriangle,
  Search,
  FileX,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingSpinner } from '@/components/LoadingSpinner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverviewData {
  active_users: number
  total_notes: number
  total_embeddings: number
  total_organizations: number
}

interface UsageData {
  notes: { count: number; text_size: string; html_size: string }
  notebooks: { count: number }
  embeddings: { count: number; indexed_notes: number }
  images: { count: number; dir_size: string }
  storage: {
    total: string
    images: { human: string }
    exports: { human: string; bytes: number }
    uploads: { human: string }
  }
  activity_logs: { count: number }
  vision_data: { ocr_completed: number; vision_completed: number }
  exports: { count: number; size: number; size_pretty: string }
}

interface DbStatsData {
  database_size: string
  database_size_bytes: number
  active_connections: number
  total_connections: number
  tables: Array<{
    name: string
    row_count: number
    total_size: string
    total_size_bytes: number
    data_size: string
    index_size: string
  }>
}

interface AdminUser {
  id: number
  email: string
  name: string
  is_active: boolean
  email_verified: boolean
  role: string
  org_id: number | null
  org_name: string | null
  created_at: string | null
  accepted_at: string | null
  updated_at: string | null
}

interface NasStatusData {
  configured: boolean
  nas_url: string | null
  last_sync: string | null
  synced_notes: number
}

interface ProviderModel {
  id: string
  name: string
  max_tokens: number
  supports_streaming: boolean
}

interface ProviderData {
  name: string
  status: string
  model_count: number
  error?: string
  models: ProviderModel[]
}

interface ProvidersResponse {
  providers: ProviderData[]
  api_keys: Record<string, boolean>
  total_models: number
}

interface TrashItem {
  id: number
  operation_type: string
  description: string
  item_count: number
  size_bytes: number
  size_pretty: string
  created_at: string | null
  triggered_by: string | null
}

interface TrashListResponse {
  items: TrashItem[]
  total_count: number
  total_size_bytes: number
  total_size_pretty: string
}

const OPERATION_ICON: Record<string, typeof FileX> = {
  activity_logs: FileX,
  orphan_files: HardDrive,
  export_files: Trash2,
  embeddings: Search,
  vision_data: Eye,
  notes_reset: Database,
}

// ---------------------------------------------------------------------------
// Tab Config
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'overview', labelKey: 'admin.overview', icon: LayoutDashboard },
  { id: 'database', labelKey: 'admin.database', icon: Database },
  { id: 'users', labelKey: 'admin.users', icon: Users },
  { id: 'nas', labelKey: 'admin.nas', icon: Server },
  { id: 'providers', labelKey: 'admin.providers', icon: Brain },
  { id: 'storage', labelKey: 'admin.storageManagement', icon: Trash2 },
] as const

type TabId = (typeof TABS)[number]['id']

const ROLE_CONFIG: Record<string, { icon: typeof Crown; color: string; label: string }> = {
  owner: { icon: Crown, color: 'bg-amber-100 text-amber-700', label: 'Owner' },
  admin: { icon: Shield, color: 'bg-blue-100 text-blue-700', label: 'Admin' },
  member: { icon: Users, color: 'bg-green-100 text-green-700', label: 'Member' },
  viewer: { icon: Eye, color: 'bg-gray-100 text-gray-700', label: 'Viewer' },
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Admin() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">{t('admin.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.systemInfo')}</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              <Icon className="h-4 w-4" />
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'database' && <DatabaseTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'nas' && <NasTab />}
        {activeTab === 'providers' && <ProvidersTab />}
        {activeTab === 'storage' && <StorageTab />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function StorageItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function OverviewTab() {
  const { t } = useTranslation()
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => apiClient.get<OverviewData>('/admin/overview'),
  })

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['admin', 'data-usage'],
    queryFn: () => apiClient.get<UsageData>('/admin/data/usage'),
  })

  if (overviewLoading || usageLoading) return <LoadingSpinner />

  const stats = [
    { label: t('operations.user'), value: overview?.active_users ?? 0, icon: Users },
    { label: t('dashboard.totalNotes'), value: overview?.total_notes ?? 0, icon: FileText },
    { label: t('admin.embeddingCount'), value: overview?.total_embeddings ?? 0, icon: Brain },
    { label: t('admin.orgSettings'), value: overview?.total_organizations ?? 0, icon: Building2 },
  ]

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="p-4 border border-border rounded-lg bg-card">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Storage */}
      {usage && (
        <div className="p-4 border border-border rounded-lg bg-card">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            {t('admin.storageUsed')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StorageItem label={t('common.default')} value={usage.storage.total} />
            <StorageItem label={t('admin.imageCount')} value={usage.storage.images.human} sub={`${usage.images.count} ${t('common.count_items', {count: usage.images.count})}`} />
            <StorageItem label={t('settings.backup')} value={usage.storage.exports.human} />
            <StorageItem label={t('common.default')} value={usage.storage.uploads.human} />
          </div>
        </div>
      )}

      {/* Data Summary */}
      {usage && (
        <div className="p-4 border border-border rounded-lg bg-card">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Database className="h-5 w-5" />
            {t('admin.dataSummary')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">{t('admin.noteText')}</p>
              <p className="font-medium">{usage.notes.text_size}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('admin.notebook')}</p>
              <p className="font-medium">{t('common.count_items', {count: usage.notebooks.count})}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('admin.indexedNotes')}</p>
              <p className="font-medium">
                {usage.embeddings.indexed_notes} / {t('common.count_items', {count: usage.notes.count})}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Database Tab
// ---------------------------------------------------------------------------

function DatabaseTab() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'db-stats'],
    queryFn: () => apiClient.get<DbStatsData>('/admin/db/stats'),
    refetchInterval: 30000,
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* DB Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">{t('admin.databaseSize')}</p>
          <p className="text-2xl font-bold">{data?.database_size}</p>
        </div>
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">{t('admin.activeConnections')}</p>
          <p className="text-2xl font-bold">{data?.active_connections}</p>
        </div>
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">{t('admin.totalConnections')}</p>
          <p className="text-2xl font-bold">{data?.total_connections}</p>
        </div>
      </div>

      {/* Table Stats */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-muted/50 border-b border-border">
          <h3 className="font-semibold">{t('admin.tableStats')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-medium">{t('admin.table')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('admin.rowCount')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('admin.totalSize')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('admin.dataSize')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('admin.indexSize')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.tables.map((table) => (
                <tr key={table.name} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono text-xs">{table.name}</td>
                  <td className="px-4 py-2 text-right">{table.row_count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">{table.total_size}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{table.data_size}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{table.index_size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Users Tab
// ---------------------------------------------------------------------------

function UsersTab() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiClient.get<{ users: AdminUser[]; total: number }>('/admin/users'),
  })

  const toggleActive = useMutation({
    mutationFn: ({ userId, isActive }: { userId: number; isActive: boolean }) =>
      apiClient.put(`/admin/users/${userId}`, { is_active: isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('admin.totalUsers', { count: data?.total ?? 0 })}</p>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-medium">{t('admin.userColumn')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('admin.role')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('admin.organization')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('admin.status')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('admin.joinedAt')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => {
                const roleInfo = ROLE_CONFIG[u.role] || ROLE_CONFIG.member
                const RoleIcon = roleInfo.icon
                return (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{u.name || t('admin.noName')}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                          roleInfo.color
                        )}
                      >
                        <RoleIcon className="h-3 w-3" />
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.org_name || '-'}</td>
                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <UserCheck className="h-3 w-3" /> {t('admin.active')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <UserX className="h-3 w-3" /> {t('admin.inactive')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('ko-KR') : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.role !== 'owner' && (
                        <button
                          onClick={() => toggleActive.mutate({ userId: u.id, isActive: !u.is_active })}
                          disabled={toggleActive.isPending}
                          className={cn(
                            'px-3 py-1 rounded text-xs font-medium transition-colors',
                            u.is_active
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-green-50 text-green-600 hover:bg-green-100'
                          )}
                        >
                          {toggleActive.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : u.is_active ? (
                            t('admin.deactivate')
                          ) : (
                            t('admin.activate')
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NAS Tab
// ---------------------------------------------------------------------------

function NasTab() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'nas-status'],
    queryFn: () => apiClient.get<NasStatusData>('/admin/nas/status'),
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="p-6 border border-border rounded-lg bg-card">
        <div className="flex items-center gap-4 mb-6">
          {data?.configured ? (
            <div className="p-3 rounded-full bg-green-100">
              <Wifi className="h-6 w-6 text-green-600" />
            </div>
          ) : (
            <div className="p-3 rounded-full bg-red-100">
              <WifiOff className="h-6 w-6 text-red-600" />
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold">{data?.configured ? t('admin.nasConnected') : t('admin.nasNotConfigured')}</h3>
            <p className="text-sm text-muted-foreground">
              {data?.nas_url || t('admin.nasSetupPrompt')}
            </p>
          </div>
        </div>

        {data?.configured && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border">
            <div>
              <p className="text-sm text-muted-foreground">NAS URL</p>
              <p className="font-medium font-mono text-sm">{data.nas_url}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('admin.syncedNotes')}</p>
              <p className="font-medium">{t('common.count_items', {count: data.synced_notes})}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('admin.lastSync')}</p>
              <p className="font-medium">
                {data.last_sync ? new Date(data.last_sync).toLocaleString('ko-KR') : t('admin.none')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Providers Tab
// ---------------------------------------------------------------------------

function ProvidersTab() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'providers'],
    queryFn: () => apiClient.get<ProvidersResponse>('/admin/providers'),
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">{t('admin.activeProviders')}</p>
          <p className="text-2xl font-bold">{data?.providers.length ?? 0}</p>
        </div>
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">{t('admin.availableModels')}</p>
          <p className="text-2xl font-bold">{data?.total_models ?? 0}</p>
        </div>
      </div>

      {/* Provider Cards */}
      <div className="space-y-4">
        {data?.providers.map((provider) => (
          <div key={provider.name} className="border border-border rounded-lg bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold capitalize">{provider.name}</h3>
                {provider.status === 'active' ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> {t('admin.active')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-red-600">
                    <XCircle className="h-3 w-3" /> {t('admin.error')}
                  </span>
                )}
              </div>
              <span className="text-sm text-muted-foreground">{t('admin.modelCount', {count: provider.model_count})}</span>
            </div>

            {provider.error && (
              <div className="px-4 py-2 bg-red-50 text-red-600 text-sm">{provider.error}</div>
            )}

            {provider.models.length > 0 && (
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {provider.models.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/30 text-sm"
                    >
                      <span className="font-mono text-xs truncate">{model.id}</span>
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">
                        {(model.max_tokens / 1000).toFixed(0)}K
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {data?.providers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('admin.noProviders')}</p>
            <p className="text-sm">{t('admin.addApiKey')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Storage Management Tab
// ---------------------------------------------------------------------------

function StorageTab() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: usage, isLoading } = useQuery({
    queryKey: ['admin', 'data-usage'],
    queryFn: () => apiClient.get<UsageData>('/admin/data/usage'),
  })

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    desc: string
    requireText?: string
    onConfirm: () => Promise<void>
  } | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)
  const [result, setResult] = useState<{ key: string; ok: boolean; msg: string } | null>(null)

  const exec = async (key: string, action: () => Promise<unknown>) => {
    setProcessing(key)
    setResult(null)
    try {
      await action()
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      setResult({ key, ok: true, msg: t('admin.dataActionSuccess') })
    } catch {
      setResult({ key, ok: false, msg: t('admin.dataActionFailed') })
    } finally {
      setProcessing(null)
    }
  }

  const confirm = (
    title: string,
    desc: string,
    onConfirm: () => Promise<void>,
    requireText?: string,
  ) => {
    setConfirmDialog({ title, desc, onConfirm, requireText })
    setConfirmText('')
  }

  const handleConfirm = async () => {
    if (!confirmDialog) return
    const fn = confirmDialog.onConfirm
    setConfirmDialog(null)
    await fn()
  }

  if (isLoading) return <LoadingSpinner />

  const notesCount = usage?.notes?.count ?? 0
  const notebooksCount = usage?.notebooks?.count ?? 0
  const embeddingsCount = usage?.embeddings?.count ?? 0
  const logsCount = usage?.activity_logs?.count ?? 0
  const visionTotal = (usage?.vision_data?.ocr_completed ?? 0) + (usage?.vision_data?.vision_completed ?? 0)
  const exportsCount = usage?.exports?.count ?? 0
  const exportsSizePretty = usage?.exports?.size_pretty ?? '0 B'

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t('admin.storageManagementDesc')}
      </p>

      {/* Safe cleanup actions */}
      <div className="border border-border rounded-lg bg-card">
        <div className="px-4 py-3 bg-muted/50 border-b border-border">
          <h3 className="font-semibold">{t('admin.actionClean')}</h3>
        </div>
        <div className="divide-y divide-border">
          <StorageRow
            icon={<FileX className="h-4 w-4" />}
            label={t('admin.clearActivityLogs')}
            desc={t('admin.clearActivityLogsDesc')}
            info={t('admin.clearActivityLogsCount', { count: logsCount })}
            processing={processing === 'clear-logs'}
            result={result?.key === 'clear-logs' ? result : null}
            actions={
              <>
                <button
                  onClick={() =>
                    confirm(
                      t('admin.clearLogsConfirmTitle'),
                      t('admin.clearLogsConfirmDesc'),
                      () => exec('clear-logs', () =>
                        apiClient.post('/admin/db/clear-activity-logs?confirm=true&older_than_days=30', {}),
                      ),
                    )
                  }
                  disabled={processing === 'clear-logs' || logsCount === 0}
                  className="text-xs px-3 py-1.5 rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {t('admin.clearLogsOlder')}
                </button>
                <button
                  onClick={() =>
                    confirm(
                      t('admin.clearLogsConfirmTitle'),
                      t('admin.clearLogsConfirmDesc'),
                      () => exec('clear-logs', () =>
                        apiClient.post('/admin/db/clear-activity-logs?confirm=true', {}),
                      ),
                    )
                  }
                  disabled={processing === 'clear-logs' || logsCount === 0}
                  className="text-xs px-3 py-1.5 rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {t('admin.clearLogsAll')}
                </button>
              </>
            }
          />

          <StorageRow
            icon={<HardDrive className="h-4 w-4" />}
            label={t('admin.cleanOrphans')}
            desc={t('admin.cleanOrphansDesc')}
            processing={processing === 'clean-orphans'}
            result={result?.key === 'clean-orphans' ? result : null}
            actions={
              <button
                onClick={() =>
                  confirm(
                    t('admin.cleanOrphansConfirmTitle'),
                    t('admin.cleanOrphansConfirmDesc'),
                    () => exec('clean-orphans', () =>
                      apiClient.post('/admin/storage/clean-orphans?confirm=true', {}),
                    ),
                  )
                }
                disabled={processing === 'clean-orphans'}
                className="text-xs px-3 py-1.5 rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-50"
              >
                {t('admin.actionClean')}
              </button>
            }
          />

          <StorageRow
            icon={<Trash2 className="h-4 w-4" />}
            label={t('admin.cleanExports')}
            desc={t('admin.cleanExportsDesc')}
            info={t('admin.cleanExportsCount', { count: exportsCount, size: exportsSizePretty })}
            processing={processing === 'clean-exports'}
            result={result?.key === 'clean-exports' ? result : null}
            actions={
              <button
                onClick={() =>
                  confirm(
                    t('admin.cleanExportsConfirmTitle'),
                    t('admin.cleanExportsConfirmDesc'),
                    () => exec('clean-exports', () =>
                      apiClient.post('/admin/storage/clean-exports?confirm=true', {}),
                    ),
                  )
                }
                disabled={processing === 'clean-exports' || exportsCount === 0}
                className="text-xs px-3 py-1.5 rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-50"
              >
                {t('admin.actionClear')}
              </button>
            }
          />
        </div>
      </div>

      {/* Trash Section */}
      <TrashSection
        confirm={confirm}
        exec={exec}
        processing={processing}
        result={result}
      />

      {/* Data reset actions (dangerous) */}
      <div className="border border-destructive/30 rounded-lg bg-card">
        <div className="px-4 py-3 bg-destructive/5 border-b border-destructive/20">
          <h3 className="font-semibold text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {t('admin.dangerZone')}
          </h3>
        </div>
        <div className="divide-y divide-border">
          <StorageRow
            icon={<Search className="h-4 w-4" />}
            label={t('admin.clearEmbeddings')}
            desc={t('admin.clearEmbeddingsDesc')}
            info={t('admin.clearEmbeddingsCount', { count: embeddingsCount })}
            processing={processing === 'clear-embeddings'}
            result={result?.key === 'clear-embeddings' ? result : null}
            actions={
              <button
                onClick={() =>
                  confirm(
                    t('admin.clearEmbeddingsConfirmTitle'),
                    t('admin.clearEmbeddingsConfirmDesc'),
                    () => exec('clear-embeddings', () =>
                      apiClient.post('/admin/db/clear-embeddings?confirm=true', {}),
                    ),
                  )
                }
                disabled={processing === 'clear-embeddings' || embeddingsCount === 0}
                className="text-xs px-3 py-1.5 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
              >
                {t('admin.actionClear')}
              </button>
            }
          />

          <StorageRow
            icon={<Eye className="h-4 w-4" />}
            label={t('admin.clearVisionData')}
            desc={t('admin.clearVisionDataDesc')}
            info={t('admin.clearVisionDataCount', { count: visionTotal })}
            processing={processing === 'clear-vision'}
            result={result?.key === 'clear-vision' ? result : null}
            actions={
              <button
                onClick={() =>
                  confirm(
                    t('admin.clearVisionDataConfirmTitle'),
                    t('admin.clearVisionDataConfirmDesc'),
                    () => exec('clear-vision', () =>
                      apiClient.post('/admin/db/clear-vision-data?confirm=true', {}),
                    ),
                  )
                }
                disabled={processing === 'clear-vision' || visionTotal === 0}
                className="text-xs px-3 py-1.5 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
              >
                {t('admin.actionClear')}
              </button>
            }
          />

          <StorageRow
            icon={<Database className="h-4 w-4" />}
            label={t('admin.resetNotes')}
            desc={t('admin.resetNotesDesc')}
            info={t('admin.resetNotesCount', { notes: notesCount, notebooks: notebooksCount })}
            processing={processing === 'reset-notes'}
            result={result?.key === 'reset-notes' ? result : null}
            actions={
              <button
                onClick={() =>
                  confirm(
                    t('admin.resetNotesConfirmTitle'),
                    t('admin.resetNotesConfirmDesc'),
                    () => exec('reset-notes', () =>
                      apiClient.post('/admin/db/reset-notes?confirm=true', {}),
                    ),
                    t('admin.resetNotesConfirmPlaceholder'),
                  )
                }
                disabled={processing === 'reset-notes' || notesCount === 0}
                className="text-xs px-3 py-1.5 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
              >
                {t('admin.actionReset')}
              </button>
            }
          />
        </div>
      </div>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-input rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h4 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {confirmDialog.title}
            </h4>
            <p className="text-sm text-muted-foreground mb-4">{confirmDialog.desc}</p>

            {confirmDialog.requireText && (
              <div className="mb-4">
                <label className="text-sm text-muted-foreground block mb-1">
                  {t('admin.resetNotesConfirmInput')}
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={confirmDialog.requireText}
                  className={cn(
                    'w-full px-3 py-2 text-sm rounded-md',
                    'border border-input bg-background',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive',
                  )}
                  autoFocus
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-sm rounded-md border border-input hover:bg-muted transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirmDialog.requireText ? confirmText !== confirmDialog.requireText : false}
                className={cn(
                  'px-4 py-2 text-sm rounded-md transition-colors',
                  'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trash Section
// ---------------------------------------------------------------------------

function TrashSection({
  confirm,
  exec,
  processing,
  result,
}: {
  confirm: (title: string, desc: string, onConfirm: () => Promise<void>) => void
  exec: (key: string, action: () => Promise<unknown>) => Promise<void>
  processing: string | null
  result: { key: string; ok: boolean; msg: string } | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: trash, isLoading } = useQuery({
    queryKey: ['admin', 'trash'],
    queryFn: () => apiClient.get<TrashListResponse>('/admin/trash'),
  })

  const items = trash?.items ?? []
  const totalSize = trash?.total_size_pretty ?? '0 B'

  const opLabel = (type: string) => {
    const map: Record<string, string> = {
      activity_logs: t('admin.trashOpActivityLogs'),
      orphan_files: t('admin.trashOpOrphanFiles'),
      export_files: t('admin.trashOpExportFiles'),
      embeddings: t('admin.trashOpEmbeddings'),
      vision_data: t('admin.trashOpVisionData'),
      notes_reset: t('admin.trashOpNotesReset'),
    }
    return map[type] ?? type
  }

  return (
    <div className="border border-border rounded-lg bg-card">
      <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          {t('admin.trash')}
          {items.length > 0 && (
            <span className="text-xs font-normal bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
          {items.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {t('admin.trashSize', { size: totalSize })}
            </span>
          )}
        </h3>
        {items.length > 0 && (
          <button
            onClick={() =>
              confirm(
                t('admin.trashEmptyConfirmTitle'),
                t('admin.trashEmptyConfirmDesc'),
                () => exec('trash-empty', () =>
                  apiClient.delete('/admin/trash?confirm=true'),
                ),
              )
            }
            disabled={processing === 'trash-empty'}
            className="text-xs px-3 py-1.5 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
          >
            {t('admin.trashEmptyAll')}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="px-4 py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          <Trash2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
          {t('admin.trashEmpty')}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => {
            const Icon = OPERATION_ICON[item.operation_type] ?? Trash2
            const restoreKey = `trash-restore-${item.id}`
            const purgeKey = `trash-purge-${item.id}`
            return (
              <div key={item.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground shrink-0">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium">{item.description}</span>
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      {opLabel(item.operation_type)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 ml-6 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {t('common.count_items', { count: item.item_count })}
                    </span>
                    <span className="text-xs text-muted-foreground">{item.size_pretty}</span>
                    {item.created_at && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString('ko-KR')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {processing === restoreKey || processing === purgeKey ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <button
                        onClick={() =>
                          confirm(
                            t('admin.trashRestoreConfirmTitle'),
                            t('admin.trashRestoreConfirmDesc'),
                            () => exec(restoreKey, async () => {
                              const res = await apiClient.post<{ restored_count: number; needs_reindex: boolean }>(
                                `/admin/trash/${item.id}/restore?confirm=true`, {}
                              )
                              if (res.needs_reindex) {
                                // Show a note to user about re-indexing
                                queryClient.invalidateQueries({ queryKey: ['admin'] })
                              }
                            }),
                          )
                        }
                        className="text-xs px-2.5 py-1 rounded-md border border-input hover:bg-muted transition-colors flex items-center gap-1"
                      >
                        <RotateCcw className="h-3 w-3" />
                        {t('admin.trashRestore')}
                      </button>
                      <button
                        onClick={() =>
                          confirm(
                            t('admin.trashPurgeConfirmTitle'),
                            t('admin.trashPurgeConfirmDesc'),
                            () => exec(purgeKey, () =>
                              apiClient.delete(`/admin/trash/${item.id}?confirm=true`),
                            ),
                          )
                        }
                        className="text-xs px-2.5 py-1 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-1"
                      >
                        <X className="h-3 w-3" />
                        {t('admin.trashPurge')}
                      </button>
                    </>
                  )}
                  {result?.key === restoreKey && (
                    result.ok
                      ? <CheckCircle className="h-4 w-4 text-green-600" />
                      : <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  {result?.key === purgeKey && (
                    result.ok
                      ? <CheckCircle className="h-4 w-4 text-green-600" />
                      : <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StorageRow({
  icon,
  label,
  desc,
  info,
  processing,
  result,
  actions,
}: {
  icon: React.ReactNode
  label: string
  desc: string
  info?: string
  processing: boolean
  result: { ok: boolean; msg: string } | null
  actions: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground shrink-0">{icon}</span>
          <span className="text-sm font-medium">{label}</span>
          {info && <span className="text-xs text-muted-foreground ml-1">{info}</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 ml-6">{desc}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        {processing ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          actions
        )}
        {result && (
          result.ok
            ? <CheckCircle className="h-4 w-4 text-green-600" />
            : <AlertCircle className="h-4 w-4 text-destructive" />
        )}
      </div>
    </div>
  )
}
