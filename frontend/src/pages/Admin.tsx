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
  Download,
  Upload,
  Settings,
  FileArchive,
  ChevronDown,
  ChevronUp,
  Package,
  BarChart3,
  MessageSquare,
  FlaskConical,
  Star,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api'
import { LoadingSpinner } from '@/components/LoadingSpinner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverviewData {
  active_users: number
  total_notes: number
  total_embeddings: number
  total_organizations: number
}

export interface UsageData {
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

interface DbBackupItem {
  filename: string
  size: number
  size_pretty: string
  created_at: string
}

interface NativeBackupItem {
  filename: string
  size: number
  size_pretty: string
  created_at: string
}

interface SettingsBackupItem {
  filename: string
  size: number
  size_pretty: string
  created_at: string
  setting_count: number
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

export const ADMIN_TABS = [
  { id: 'overview', labelKey: 'admin.overview', icon: LayoutDashboard },
  { id: 'database', labelKey: 'admin.database', icon: Database },
  { id: 'users', labelKey: 'admin.users', icon: Users },
  { id: 'nas', labelKey: 'admin.nas', icon: Server },
  { id: 'providers', labelKey: 'admin.providers', icon: Brain },
  { id: 'storage', labelKey: 'admin.storageManagement', icon: Trash2 },
  { id: 'metrics', labelKey: 'admin.searchMetrics', icon: BarChart3 },
  { id: 'feedback', labelKey: 'admin.feedback', icon: MessageSquare },
  { id: 'evaluation', labelKey: 'admin.evaluation', icon: FlaskConical },
] as const

export type AdminTabId = (typeof ADMIN_TABS)[number]['id']

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
  return <Navigate to="/settings?tab=admin" replace />
}

/**
 * Admin tab content with sub-navigation, used by Settings page
 */
export function AdminTabContent() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<AdminTabId>('overview')

  return (
    <div className="flex flex-col gap-6">
      {/* Sub-Tab Navigation (pill style) */}
      <div className="flex gap-2 flex-wrap">
        {ADMIN_TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
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
        {activeTab === 'metrics' && <MetricsTab />}
        {activeTab === 'feedback' && <FeedbackTab />}
        {activeTab === 'evaluation' && <EvaluationTab />}
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
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'db-stats'],
    queryFn: () => apiClient.get<DbStatsData>('/admin/db/stats'),
    refetchInterval: 30000,
  })

  // --- Full backup state ---
  const [fullMsg, setFullMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [isCreatingFull, setIsCreatingFull] = useState(false)

  // --- Native backup state ---
  const { data: nativeBackups, refetch: refetchNativeBackups } = useQuery({
    queryKey: ['admin', 'native-backups'],
    queryFn: () => apiClient.get<{ backups: NativeBackupItem[]; total: number }>('/backup/native/list'),
  })
  const [nativeMsg, setNativeMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [isCreatingNative, setIsCreatingNative] = useState(false)
  const [showAllNative, setShowAllNative] = useState(false)
  const [nativeImportFile, setNativeImportFile] = useState<File | null>(null)
  const [isImportingNative, setIsImportingNative] = useState(false)

  // --- Settings backup state ---
  const [settingsFile, setSettingsFile] = useState<File | null>(null)
  const [settingsMsg, setSettingsMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [isExportingSettings, setIsExportingSettings] = useState(false)
  const [isImportingSettings, setIsImportingSettings] = useState(false)
  const [showAllSettings, setShowAllSettings] = useState(false)

  // --- Settings backup list ---
  const { data: settingsBackups, refetch: refetchSettingsBackups } = useQuery({
    queryKey: ['admin', 'settings-backups'],
    queryFn: () => apiClient.get<{ backups: SettingsBackupItem[]; total: number }>('/backup/settings/list'),
  })

  // --- DB backup state ---
  const { data: backups, refetch: refetchBackups } = useQuery({
    queryKey: ['admin', 'db-backups'],
    queryFn: () => apiClient.get<{ backups: DbBackupItem[]; total: number }>('/admin/db/backup/list'),
  })
  const [dbMsg, setDbMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [isCreatingBackup, setIsCreatingBackup] = useState(false)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreConfirmText, setRestoreConfirmText] = useState('')
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [showAllDb, setShowAllDb] = useState(false)

  // --- Full backup create ---
  const handleCreateFullBackup = async () => {
    setIsCreatingFull(true)
    setFullMsg(null)
    try {
      const result = await apiClient.post<{ db: unknown; db_error: string | null; native: unknown; native_error: string | null }>('/backup/full', {})
      if (result.db_error || result.native_error) {
        setFullMsg({ ok: false, text: t('admin.fullBackupPartial') })
      } else {
        setFullMsg({ ok: true, text: t('admin.fullBackupSuccess') })
      }
      refetchBackups()
      refetchNativeBackups()
    } catch (e) {
      setFullMsg({ ok: false, text: e instanceof Error ? e.message : t('admin.fullBackupFailed') })
    } finally {
      setIsCreatingFull(false)
    }
  }

  // --- Native backup create ---
  const handleCreateNativeBackup = async () => {
    setIsCreatingNative(true)
    setNativeMsg(null)
    try {
      const token = apiClient.getToken()
      const response = await fetch('/api/backup/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) throw new Error(await response.text())
      // Don't download - just refresh the list
      // The file is saved server-side
      const blob = await response.blob()
      const cd = response.headers.get('Content-Disposition')
      const filename = cd?.split('filename=')[1]?.replace(/"/g, '') || 'ainx_backup.zip'
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      refetchNativeBackups()
      setNativeMsg({ ok: true, text: t('settings.backupExportSuccess') })
    } catch (e) {
      setNativeMsg({ ok: false, text: e instanceof Error ? e.message : t('settings.backupExportFailed') })
    } finally {
      setIsCreatingNative(false)
    }
  }

  // --- Native backup download ---
  const handleDownloadNativeBackup = async (filename: string) => {
    const token = apiClient.getToken()
    const response = await fetch(`/api/backup/native/download/${filename}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) return
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  // --- Native backup delete ---
  const handleDeleteNativeBackup = async (filename: string) => {
    try {
      await apiClient.delete(`/backup/native/${filename}`)
      refetchNativeBackups()
      setNativeMsg({ ok: true, text: t('admin.nativeBackupDeleted') })
    } catch {
      setNativeMsg({ ok: false, text: t('admin.nativeBackupDeleteFailed') })
    }
  }

  // --- Native backup import ---
  const handleNativeImport = async () => {
    if (!nativeImportFile) return
    setIsImportingNative(true)
    setNativeMsg(null)
    try {
      const token = apiClient.getToken()
      const formData = new FormData()
      formData.append('file', nativeImportFile)
      const response = await fetch('/api/backup/import', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!response.ok) throw new Error(await response.text())
      setNativeImportFile(null)
      setNativeMsg({ ok: true, text: t('settings.backupImportSuccess') })
    } catch (e) {
      setNativeMsg({ ok: false, text: e instanceof Error ? e.message : t('settings.backupImportFailed') })
    } finally {
      setIsImportingNative(false)
    }
  }

  // --- Settings export ---
  const handleSettingsExport = async () => {
    setIsExportingSettings(true)
    setSettingsMsg(null)
    try {
      const token = apiClient.getToken()
      const response = await fetch('/api/backup/settings/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) throw new Error(await response.text())
      const blob = await response.blob()
      const cd = response.headers.get('Content-Disposition')
      const filename = cd?.split('filename=')[1]?.replace(/"/g, '') || 'settings_backup.json'
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setSettingsMsg({ ok: true, text: t('admin.settingsExportSuccess') })
      refetchSettingsBackups()
    } catch (e) {
      setSettingsMsg({ ok: false, text: e instanceof Error ? e.message : t('admin.settingsExportFailed') })
    } finally {
      setIsExportingSettings(false)
    }
  }

  // --- Settings import ---
  const handleSettingsImport = async () => {
    if (!settingsFile) return
    setIsImportingSettings(true)
    setSettingsMsg(null)
    try {
      const token = apiClient.getToken()
      const formData = new FormData()
      formData.append('file', settingsFile)
      const response = await fetch('/api/backup/settings/import', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!response.ok) throw new Error(await response.text())
      const result = await response.json()
      setSettingsFile(null)
      setSettingsMsg({ ok: true, text: t('admin.settingsImportSuccess', { count: result.setting_count }) })
    } catch (e) {
      setSettingsMsg({ ok: false, text: e instanceof Error ? e.message : t('admin.settingsImportFailed') })
    } finally {
      setIsImportingSettings(false)
    }
  }

  // --- Settings backup download ---
  const handleDownloadSettingsBackup = async (filename: string) => {
    const token = apiClient.getToken()
    const response = await fetch(`/api/backup/settings/download/${filename}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) return
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  // --- Settings backup delete ---
  const handleDeleteSettingsBackup = async (filename: string) => {
    try {
      await apiClient.delete(`/backup/settings/${filename}`)
      refetchSettingsBackups()
      setSettingsMsg({ ok: true, text: t('admin.settingsBackupDeleted') })
    } catch {
      setSettingsMsg({ ok: false, text: t('admin.settingsBackupDeleteFailed') })
    }
  }

  // --- DB backup create ---
  const handleCreateBackup = async () => {
    setIsCreatingBackup(true)
    setDbMsg(null)
    try {
      const result = await apiClient.post<{ filename: string }>('/admin/db/backup', {})
      setDbMsg({ ok: true, text: t('admin.dbBackupSuccess', { filename: result.filename }) })
      refetchBackups()
    } catch (e) {
      setDbMsg({ ok: false, text: e instanceof Error ? e.message : t('admin.dbBackupFailed') })
    } finally {
      setIsCreatingBackup(false)
    }
  }

  // --- DB backup download ---
  const handleDownloadBackup = async (filename: string) => {
    const token = apiClient.getToken()
    const response = await fetch(`/api/admin/db/backup/download/${filename}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) return
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  // --- DB backup delete ---
  const handleDeleteBackup = async (filename: string) => {
    try {
      await apiClient.delete(`/admin/db/backup/${filename}`)
      refetchBackups()
      setDbMsg({ ok: true, text: t('admin.dbBackupDeleted') })
    } catch {
      setDbMsg({ ok: false, text: t('admin.dbBackupDeleteFailed') })
    }
  }

  // --- DB restore ---
  const handleRestore = async () => {
    if (!restoreFile) return
    setIsRestoring(true)
    setDbMsg(null)
    try {
      const token = apiClient.getToken()
      const formData = new FormData()
      formData.append('file', restoreFile)
      const response = await fetch('/api/admin/db/restore?confirm=true', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!response.ok) throw new Error(await response.text())
      setRestoreFile(null)
      setShowRestoreConfirm(false)
      setRestoreConfirmText('')
      setDbMsg({ ok: true, text: t('admin.dbRestoreSuccess') })
      queryClient.invalidateQueries({ queryKey: ['admin'] })
    } catch (e) {
      setDbMsg({ ok: false, text: e instanceof Error ? e.message : t('admin.dbRestoreFailed') })
    } finally {
      setIsRestoring(false)
    }
  }

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

      {/* Full Backup */}
      <div className="border-2 border-primary/30 rounded-lg bg-card">
        <div className="px-4 py-3 bg-primary/5 border-b border-primary/20 flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">{t('admin.fullBackup')}</h3>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">{t('admin.fullBackupDesc')}</p>
          <button
            onClick={handleCreateFullBackup}
            disabled={isCreatingFull}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
              'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isCreatingFull ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            {isCreatingFull ? t('admin.fullBackupCreating') : t('admin.fullBackupCreate')}
          </button>
          {fullMsg && (
            <div
              className={cn(
                'flex items-center gap-2 p-3 rounded-md',
                fullMsg.ok
                  ? 'bg-green-500/10 border border-green-500/20'
                  : 'bg-destructive/10 border border-destructive/20',
              )}
            >
              {fullMsg.ok ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              <span className={cn('text-sm', fullMsg.ok ? 'text-green-700' : 'text-destructive')}>
                {fullMsg.text}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Native Backup */}
      <div className="border border-border rounded-lg bg-card">
        <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center gap-2">
          <FileArchive className="h-4 w-4" />
          <h3 className="font-semibold">{t('admin.nativeBackup')}</h3>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">{t('admin.nativeBackupDesc')}</p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCreateNativeBackup}
              disabled={isCreatingNative}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
                'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isCreatingNative ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isCreatingNative ? t('admin.nativeBackupCreating') : t('admin.nativeBackupCreate')}
            </button>
          </div>

          {/* Native backup list */}
          {nativeBackups && nativeBackups.backups.length > 0 && (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border">
                <p className="text-sm font-medium">{t('admin.nativeBackupList')}</p>
              </div>
              <div className="divide-y divide-border">
                {(showAllNative ? nativeBackups.backups : nativeBackups.backups.slice(0, 5)).map((b) => (
                  <div key={b.filename} className="flex items-center justify-between px-3 py-2 hover:bg-muted/20">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileArchive className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-mono truncate">{b.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.size_pretty} &middot; {new Date(b.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDownloadNativeBackup(b.filename)}
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteNativeBackup(b.filename)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {nativeBackups.total > 5 && (
                <div
                  onClick={() => setShowAllNative(!showAllNative)}
                  className="text-xs text-muted-foreground hover:text-foreground text-center py-1.5 cursor-pointer border-t border-border"
                >
                  {showAllNative ? (
                    <span className="flex items-center justify-center gap-1">
                      <ChevronUp className="h-3 w-3" />
                      {t('admin.hideList')}
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1">
                      <ChevronDown className="h-3 w-3" />
                      {t('admin.showAll', { count: nativeBackups.total })}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {nativeBackups && nativeBackups.backups.length === 0 && (
            <p className="text-sm text-muted-foreground italic">{t('admin.nativeBackupEmpty')}</p>
          )}

          {/* Native backup import */}
          <div className="pt-2 border-t border-border space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              {t('admin.nativeBackupImport')}
            </p>
            <label
              className={cn(
                'flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-input rounded-md cursor-pointer',
                'hover:border-primary/50 hover:bg-muted/30 transition-colors',
                isImportingNative && 'opacity-50 cursor-not-allowed',
              )}
            >
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setNativeImportFile(e.target.files?.[0] || null)}
                disabled={isImportingNative}
                className="sr-only"
              />
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {nativeImportFile ? nativeImportFile.name : t('common.selectFile', 'Select .zip file')}
              </span>
            </label>

            {nativeImportFile && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2">
                  <FileArchive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{nativeImportFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(nativeImportFile.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
                <button
                  onClick={handleNativeImport}
                  disabled={isImportingNative}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
                    'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <Upload className="h-4 w-4" />
                  {isImportingNative ? t('common.importing', 'Importing...') : t('common.import', 'Import')}
                </button>
              </div>
            )}
          </div>

          {nativeMsg && (
            <div
              className={cn(
                'flex items-center gap-2 p-3 rounded-md',
                nativeMsg.ok
                  ? 'bg-green-500/10 border border-green-500/20'
                  : 'bg-destructive/10 border border-destructive/20',
              )}
            >
              {nativeMsg.ok ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              <span className={cn('text-sm', nativeMsg.ok ? 'text-green-700' : 'text-destructive')}>
                {nativeMsg.text}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Database Backup */}
      <div className="border border-border rounded-lg bg-card">
        <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center gap-2">
          <Database className="h-4 w-4" />
          <h3 className="font-semibold">{t('admin.dbBackup')}</h3>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">{t('admin.dbBackupDesc')}</p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCreateBackup}
              disabled={isCreatingBackup}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
                'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isCreatingBackup ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isCreatingBackup ? t('admin.dbCreatingBackup') : t('admin.dbCreateBackup')}
            </button>
          </div>

          {/* Backup list */}
          {backups && backups.backups.length > 0 && (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border">
                <p className="text-sm font-medium">{t('admin.dbBackupList')}</p>
              </div>
              <div className="divide-y divide-border">
                {(showAllDb ? backups.backups : backups.backups.slice(0, 5)).map((b) => (
                  <div key={b.filename} className="flex items-center justify-between px-3 py-2 hover:bg-muted/20">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileArchive className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-mono truncate">{b.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.size_pretty} &middot; {new Date(b.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDownloadBackup(b.filename)}
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteBackup(b.filename)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {backups.total > 5 && (
                <div
                  onClick={() => setShowAllDb(!showAllDb)}
                  className="text-xs text-muted-foreground hover:text-foreground text-center py-1.5 cursor-pointer border-t border-border"
                >
                  {showAllDb ? (
                    <span className="flex items-center justify-center gap-1">
                      <ChevronUp className="h-3 w-3" />
                      {t('admin.hideList')}
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1">
                      <ChevronDown className="h-3 w-3" />
                      {t('admin.showAll', { count: backups.total })}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {backups && backups.backups.length === 0 && (
            <p className="text-sm text-muted-foreground italic">{t('admin.dbBackupEmpty')}</p>
          )}

          {/* Restore section */}
          <div className="pt-2 border-t border-border space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              {t('admin.dbRestore')}
            </p>
            <label
              className={cn(
                'flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-input rounded-md cursor-pointer',
                'hover:border-primary/50 hover:bg-muted/30 transition-colors',
                isRestoring && 'opacity-50 cursor-not-allowed',
              )}
            >
              <input
                type="file"
                accept=".sql.gz"
                onChange={(e) => {
                  setRestoreFile(e.target.files?.[0] || null)
                  setShowRestoreConfirm(false)
                  setRestoreConfirmText('')
                }}
                disabled={isRestoring}
                className="sr-only"
              />
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {restoreFile ? restoreFile.name : t('admin.selectSqlGzFile')}
              </span>
            </label>

            {restoreFile && !showRestoreConfirm && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2">
                  <FileArchive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{restoreFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(restoreFile.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
                <button
                  onClick={() => setShowRestoreConfirm(true)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
                    'bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors',
                  )}
                >
                  <RotateCcw className="h-4 w-4" />
                  {t('admin.dbRestore')}
                </button>
              </div>
            )}

            {showRestoreConfirm && (
              <div className="p-4 border-2 border-destructive/50 bg-destructive/5 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <h4 className="font-semibold text-destructive">{t('admin.dbRestoreConfirmTitle')}</h4>
                </div>
                <p className="text-sm text-muted-foreground">{t('admin.dbRestoreConfirmDesc')}</p>
                <input
                  type="text"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder={t('admin.dbRestoreConfirmPlaceholder')}
                  className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowRestoreConfirm(false)
                      setRestoreConfirmText('')
                    }}
                    className="px-4 py-2 rounded-md text-sm border border-input hover:bg-muted transition-colors"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={handleRestore}
                    disabled={restoreConfirmText !== t('admin.dbRestoreConfirmPlaceholder') || isRestoring}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
                      'bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {isRestoring ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    {isRestoring ? t('admin.dbRestoring') : t('admin.dbRestore')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {dbMsg && (
            <div
              className={cn(
                'flex items-center gap-2 p-3 rounded-md',
                dbMsg.ok
                  ? 'bg-green-500/10 border border-green-500/20'
                  : 'bg-destructive/10 border border-destructive/20',
              )}
            >
              {dbMsg.ok ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              <span className={cn('text-sm', dbMsg.ok ? 'text-green-700' : 'text-destructive')}>
                {dbMsg.text}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Settings Backup */}
      <div className="border border-border rounded-lg bg-card">
        <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <h3 className="font-semibold">{t('admin.settingsBackup')}</h3>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">{t('admin.settingsBackupDesc')}</p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSettingsExport}
              disabled={isExportingSettings}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
                'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <Download className="h-4 w-4" />
              {isExportingSettings ? t('common.exporting', 'Exporting...') : t('admin.settingsExport')}
            </button>
          </div>

          {/* Settings backup list */}
          {settingsBackups && settingsBackups.backups.length > 0 && (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border">
                <p className="text-sm font-medium">{t('admin.settingsBackupList')}</p>
              </div>
              <div className="divide-y divide-border">
                {(showAllSettings ? settingsBackups.backups : settingsBackups.backups.slice(0, 5)).map((b) => (
                  <div key={b.filename} className="flex items-center justify-between px-3 py-2 hover:bg-muted/20">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileArchive className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-mono truncate">{b.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.size_pretty} &middot; {t('admin.settingsCount', { count: b.setting_count })} &middot; {new Date(b.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDownloadSettingsBackup(b.filename)}
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSettingsBackup(b.filename)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {settingsBackups.total > 5 && (
                <div
                  onClick={() => setShowAllSettings(!showAllSettings)}
                  className="text-xs text-muted-foreground hover:text-foreground text-center py-1.5 cursor-pointer border-t border-border"
                >
                  {showAllSettings ? (
                    <span className="flex items-center justify-center gap-1">
                      <ChevronUp className="h-3 w-3" />
                      {t('admin.hideList')}
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1">
                      <ChevronDown className="h-3 w-3" />
                      {t('admin.showAll', { count: settingsBackups.total })}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-border space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              {t('admin.settingsImport')}
            </p>
            <label
              className={cn(
                'flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-input rounded-md cursor-pointer',
                'hover:border-primary/50 hover:bg-muted/30 transition-colors',
                isImportingSettings && 'opacity-50 cursor-not-allowed',
              )}
            >
              <input
                type="file"
                accept=".json"
                onChange={(e) => setSettingsFile(e.target.files?.[0] || null)}
                disabled={isImportingSettings}
                className="sr-only"
              />
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {settingsFile ? settingsFile.name : t('admin.selectJsonFile')}
              </span>
            </label>

            {settingsFile && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2">
                  <FileArchive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{settingsFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(settingsFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <button
                  onClick={handleSettingsImport}
                  disabled={isImportingSettings}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
                    'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <Upload className="h-4 w-4" />
                  {isImportingSettings ? t('common.importing', 'Importing...') : t('admin.settingsImport')}
                </button>
              </div>
            )}

            {settingsMsg && (
              <div
                className={cn(
                  'flex items-center gap-2 p-3 rounded-md',
                  settingsMsg.ok
                    ? 'bg-green-500/10 border border-green-500/20'
                    : 'bg-destructive/10 border border-destructive/20',
                )}
              >
                {settingsMsg.ok ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                <span className={cn('text-sm', settingsMsg.ok ? 'text-green-700' : 'text-destructive')}>
                  {settingsMsg.text}
                </span>
              </div>
            )}
          </div>
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

// ---------------------------------------------------------------------------
// Metrics Tab
// ---------------------------------------------------------------------------

function MetricsTab() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<string>('7d')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'metrics', period],
    queryFn: () => apiClient.get<{
      total_searches: number
      avg_result_count: number
      avg_duration_ms: number
      zero_result_rate: number
      daily_volume: Array<{ date: string; count: number }>
      type_distribution: Array<{ type: string; count: number }>
      top_zero_result_queries: Array<{ query: string; count: number }>
      response_time_p50: number
      response_time_p95: number
    }>(`/admin/metrics/search?period=${period}`),
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-2">
        {['7d', '30d', '90d'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              period === p
                ? 'bg-primary text-primary-foreground'
                : 'border border-input hover:bg-muted text-muted-foreground'
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">{t('admin.totalSearches')}</p>
          <p className="text-2xl font-bold">{data?.total_searches?.toLocaleString() ?? 0}</p>
        </div>
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">{t('admin.avgResults')}</p>
          <p className="text-2xl font-bold">{data?.avg_result_count ?? 0}</p>
        </div>
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">{t('admin.zeroResultRate')}</p>
          <p className="text-2xl font-bold">{data?.zero_result_rate ?? 0}%</p>
        </div>
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">{t('admin.responseTime')}</p>
          <p className="text-2xl font-bold">
            P50: {data?.response_time_p50 ?? 0}ms
          </p>
          <p className="text-xs text-muted-foreground">
            P95: {data?.response_time_p95 ?? 0}ms
          </p>
        </div>
      </div>

      {/* Daily Volume Chart (simple bar visualization) */}
      {data?.daily_volume && data.daily_volume.length > 0 && (
        <div className="p-4 border border-border rounded-lg bg-card">
          <h3 className="font-semibold mb-4">{t('admin.dailySearchVolume')}</h3>
          <div className="flex items-end gap-1 h-32">
            {data.daily_volume.map((d) => {
              const maxCount = Math.max(...data.daily_volume.map((v) => v.count), 1)
              const height = (d.count / maxCount) * 100
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{d.count}</span>
                  <div
                    className="w-full bg-primary/70 rounded-t"
                    style={{ height: `${height}%`, minHeight: d.count > 0 ? '4px' : '0' }}
                  />
                  <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                    {d.date.slice(5)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Type Distribution */}
      {data?.type_distribution && data.type_distribution.length > 0 && (
        <div className="p-4 border border-border rounded-lg bg-card">
          <h3 className="font-semibold mb-4">{t('admin.searchTypeDistribution')}</h3>
          <div className="space-y-2">
            {data.type_distribution.map((item) => {
              const total = data.type_distribution.reduce((sum, i) => sum + i.count, 0)
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0
              return (
                <div key={item.type} className="flex items-center gap-3">
                  <span className="text-sm font-mono w-20">{item.type}</span>
                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-16 text-right">
                    {item.count} ({pct}%)
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Zero Result Queries */}
      {data?.top_zero_result_queries && data.top_zero_result_queries.length > 0 && (
        <div className="p-4 border border-border rounded-lg bg-card">
          <h3 className="font-semibold mb-4">{t('admin.zeroResultQueries')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2">{t('search.title')}</th>
                  <th className="text-right px-3 py-2">{t('admin.rowCount')}</th>
                </tr>
              </thead>
              <tbody>
                {data.top_zero_result_queries.map((q) => (
                  <tr key={q.query} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{q.query}</td>
                    <td className="px-3 py-2 text-right">{q.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feedback Tab
// ---------------------------------------------------------------------------

function FeedbackTab() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<string>('30d')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'feedback', period],
    queryFn: () => apiClient.get<{
      search_feedback: {
        total: number
        positive_count: number
        positive_rate: number
        trend: Array<{ date: string; positive: number; total: number; rate: number }>
      }
      ai_feedback: {
        by_feature: Array<{ feature: string; avg_rating: number; count: number }>
        by_model: Array<{ model: string; avg_rating: number; count: number }>
      }
    }>(`/feedback/summary?period=${period}`),
  })

  const { data: optimization } = useQuery({
    queryKey: ['admin', 'feedback', 'optimization'],
    queryFn: () => apiClient.get<{
      recommendations: Array<{ search_type: string; positive_rate: number; sample_size: number }>
      confidence: string
    }>('/feedback/optimization'),
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-2">
        {['7d', '30d', '90d'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              period === p
                ? 'bg-primary text-primary-foreground'
                : 'border border-input hover:bg-muted text-muted-foreground'
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Search Feedback Summary */}
      <div className="p-4 border border-border rounded-lg bg-card">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          {t('admin.searchFeedback')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('admin.totalFeedback')}</p>
            <p className="text-2xl font-bold">{data?.search_feedback.total ?? 0}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('admin.positiveCount')}</p>
            <p className="text-2xl font-bold">{data?.search_feedback.positive_count ?? 0}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('admin.positiveRate')}</p>
            <p className="text-2xl font-bold">{data?.search_feedback.positive_rate ?? 0}%</p>
          </div>
        </div>

        {/* Trend */}
        {data?.search_feedback.trend && data.search_feedback.trend.length > 0 && (
          <div className="mt-4 flex items-end gap-1 h-24">
            {data.search_feedback.trend.map((d) => {
              const maxTotal = Math.max(...data.search_feedback.trend.map((v) => v.total), 1)
              const height = (d.total / maxTotal) * 100
              const positiveHeight = d.total > 0 ? (d.positive / d.total) * height : 0
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.rate}%`}>
                  <div className="w-full flex flex-col-reverse" style={{ height: `${height}%`, minHeight: '2px' }}>
                    <div className="bg-green-500/70 rounded-t" style={{ height: `${positiveHeight}%` }} />
                    <div className="bg-red-300/70" style={{ height: `${height - positiveHeight}%` }} />
                  </div>
                  <span className="text-[9px] text-muted-foreground">{d.date.slice(5)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* AI Feedback by Feature */}
      {data?.ai_feedback.by_feature && data.ai_feedback.by_feature.length > 0 && (
        <div className="p-4 border border-border rounded-lg bg-card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Star className="h-4 w-4" />
            {t('admin.aiFeedbackByFeature')}
          </h3>
          <div className="space-y-3">
            {data.ai_feedback.by_feature.map((item) => (
              <div key={item.feature} className="flex items-center gap-3">
                <span className="text-sm font-medium w-28 truncate">{item.feature}</span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={cn(
                        'h-4 w-4',
                        s <= Math.round(item.avg_rating)
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-gray-200'
                      )}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  {item.avg_rating.toFixed(1)} ({item.count})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Feedback by Model */}
      {data?.ai_feedback.by_model && data.ai_feedback.by_model.length > 0 && (
        <div className="p-4 border border-border rounded-lg bg-card">
          <h3 className="font-semibold mb-4">{t('admin.aiFeedbackByModel')}</h3>
          <div className="space-y-2">
            {data.ai_feedback.by_model.map((item) => (
              <div key={item.model} className="flex items-center gap-3">
                <span className="text-sm font-mono w-40 truncate">{item.model}</span>
                <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded-full"
                    style={{ width: `${(item.avg_rating / 5) * 100}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-20 text-right">
                  {item.avg_rating.toFixed(1)} ({item.count})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optimization Recommendations */}
      {optimization && optimization.recommendations.length > 0 && (
        <div className="p-4 border border-border rounded-lg bg-card">
          <h3 className="font-semibold mb-4">{t('admin.optimizationRecommendations')}</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {t('admin.confidence')}: {optimization.confidence}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2">{t('admin.searchType')}</th>
                  <th className="text-right px-3 py-2">{t('admin.positiveRate')}</th>
                  <th className="text-right px-3 py-2">{t('admin.sampleSize')}</th>
                </tr>
              </thead>
              <tbody>
                {optimization.recommendations.map((r) => (
                  <tr key={r.search_type} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{r.search_type}</td>
                    <td className="px-3 py-2 text-right">{r.positive_rate}%</td>
                    <td className="px-3 py-2 text-right">{r.sample_size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {data?.search_feedback.total === 0 && data?.ai_feedback.by_feature.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{t('admin.noFeedbackData')}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Evaluation Tab
// ---------------------------------------------------------------------------

function EvaluationTab() {
  const { t } = useTranslation()
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [taskType, setTaskType] = useState<string>('qa')
  const [testCount, setTestCount] = useState<number>(10)
  const [selectedModels, setSelectedModels] = useState<string[]>([])

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ['admin', 'evaluation', 'list'],
    queryFn: () => apiClient.get<{ runs: Array<{
      id: number; status: string; task_type: string; models: string[];
      test_count: number; progress: number; triggered_by: string | null;
      created_at: string | null; completed_at: string | null; winner: string | null
    }>; total: number }>('/admin/evaluation/list'),
  })

  const { data: providers } = useQuery({
    queryKey: ['admin', 'providers'],
    queryFn: () => apiClient.get<{ providers: Array<{ name: string; models: Array<{ id: string }> }> }>('/admin/providers'),
  })

  const allModels = providers?.providers.flatMap((p) => p.models.map((m) => m.id)) ?? []

  const { data: selectedRun } = useQuery({
    queryKey: ['admin', 'evaluation', selectedRunId],
    queryFn: () => apiClient.get<{
      id: number; status: string; task_type: string; models: string[];
      test_count: number; progress: number; results: {
        winner: string | null; summary: string;
        models: Record<string, Record<string, number>>; metrics: string[]
      } | null; error: string | null; triggered_by: string | null;
      created_at: string | null; completed_at: string | null
    }>(`/admin/evaluation/${selectedRunId}`),
    enabled: selectedRunId !== null,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data && (data.status === 'running' || data.status === 'pending')) return 3000
      return false
    },
  })

  const startMutation = useMutation({
    mutationFn: (payload: { task_type: string; models: string[]; test_count: number }) =>
      apiClient.post<{ run_id: number }>('/admin/evaluation/run', payload),
    onSuccess: (data) => {
      setSelectedRunId(data.run_id)
    },
  })

  const handleStart = () => {
    if (selectedModels.length < 1) return
    startMutation.mutate({ task_type: taskType, models: selectedModels, test_count: testCount })
  }

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId) ? prev.filter((m) => m !== modelId) : [...prev, modelId]
    )
  }

  return (
    <div className="space-y-6">
      {/* Run Configuration */}
      <div className="p-4 border border-border rounded-lg bg-card">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          {t('admin.runEvaluation')}
        </h3>

        <div className="space-y-4">
          {/* Task Type */}
          <div>
            <label className="text-sm font-medium block mb-1">{t('admin.taskType')}</label>
            <div className="flex gap-2">
              {['qa', 'search'].map((tt) => (
                <button
                  key={tt}
                  onClick={() => setTaskType(tt)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md transition-colors',
                    taskType === tt
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-input hover:bg-muted'
                  )}
                >
                  {tt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Test Count */}
          <div>
            <label className="text-sm font-medium block mb-1">{t('admin.testCount')}</label>
            <input
              type="number"
              min={1}
              max={50}
              value={testCount}
              onChange={(e) => setTestCount(Number(e.target.value))}
              className="w-24 px-3 py-1.5 text-sm border border-input rounded-md bg-background"
            />
          </div>

          {/* Model Selection */}
          <div>
            <label className="text-sm font-medium block mb-1">{t('admin.selectModels')}</label>
            <div className="flex flex-wrap gap-2">
              {allModels.map((model) => (
                <button
                  key={model}
                  onClick={() => toggleModel(model)}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-md transition-colors border',
                    selectedModels.includes(model)
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-input hover:bg-muted text-muted-foreground'
                  )}
                >
                  {model}
                </button>
              ))}
              {allModels.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('admin.noProviders')}</p>
              )}
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={handleStart}
            disabled={selectedModels.length < 1 || startMutation.isPending}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium',
              'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {startMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            {t('admin.startEvaluation')}
          </button>
        </div>
      </div>

      {/* Selected Run Progress/Results */}
      {selectedRun && (
        <div className="p-4 border border-border rounded-lg bg-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">
              {t('admin.evaluationRun')} #{selectedRun.id}
            </h3>
            <span className={cn(
              'text-xs px-2 py-1 rounded-full',
              selectedRun.status === 'completed' && 'bg-green-100 text-green-700',
              selectedRun.status === 'running' && 'bg-blue-100 text-blue-700',
              selectedRun.status === 'pending' && 'bg-yellow-100 text-yellow-700',
              selectedRun.status === 'failed' && 'bg-red-100 text-red-700',
            )}>
              {selectedRun.status}
            </span>
          </div>

          {/* Progress Bar */}
          {(selectedRun.status === 'running' || selectedRun.status === 'pending') && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-muted-foreground">{t('admin.progress')}</span>
                <span>{selectedRun.progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${selectedRun.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {selectedRun.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 mb-4">
              {selectedRun.error}
            </div>
          )}

          {/* Results */}
          {selectedRun.results && (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm font-medium text-green-700">{selectedRun.results.summary}</p>
              </div>

              {/* Model Comparison Bar Charts */}
              {selectedRun.results.models && selectedRun.results.metrics && (
                <div className="space-y-3">
                  {selectedRun.results.metrics.map((metric) => (
                    <div key={metric}>
                      <p className="text-sm font-medium mb-1">{metric}</p>
                      <div className="space-y-1">
                        {Object.entries(selectedRun.results!.models).map(([model, scores]) => (
                          <div key={model} className="flex items-center gap-2">
                            <span className="text-xs font-mono w-40 truncate">{model}</span>
                            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  model === selectedRun.results?.winner
                                    ? 'bg-green-500'
                                    : 'bg-primary/60'
                                )}
                                style={{ width: `${((scores as Record<string, number>)[metric] ?? 0) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs w-12 text-right">
                              {((scores as Record<string, number>)[metric] ?? 0).toFixed(3)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div className="border border-border rounded-lg bg-card">
        <div className="px-4 py-3 bg-muted/50 border-b border-border">
          <h3 className="font-semibold">{t('admin.evaluationHistory')}</h3>
        </div>
        {runsLoading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !runs?.runs.length ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-30" />
            {t('admin.noEvaluationRuns')}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {runs.runs.map((run) => (
              <div
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
                className={cn(
                  'flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/20',
                  selectedRunId === run.id && 'bg-primary/5'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FlaskConical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      #{run.id} &middot; {run.task_type.toUpperCase()} &middot; {run.models.length} {t('admin.availableModels').toLowerCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {run.created_at ? new Date(run.created_at).toLocaleString() : ''}
                      {run.winner && ` · Winner: ${run.winner}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {run.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    run.status === 'completed' && 'bg-green-100 text-green-700',
                    run.status === 'running' && 'bg-blue-100 text-blue-700',
                    run.status === 'pending' && 'bg-yellow-100 text-yellow-700',
                    run.status === 'failed' && 'bg-red-100 text-red-700',
                  )}>
                    {run.progress}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
