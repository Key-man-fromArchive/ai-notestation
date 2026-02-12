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
    exports: { human: string }
    uploads: { human: string }
  }
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

// ---------------------------------------------------------------------------
// Tab Config
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'overview', labelKey: 'admin.overview', icon: LayoutDashboard },
  { id: 'database', labelKey: 'admin.database', icon: Database },
  { id: 'users', labelKey: 'admin.users', icon: Users },
  { id: 'nas', labelKey: 'admin.nas', icon: Server },
  { id: 'providers', labelKey: 'admin.providers', icon: Brain },
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
            데이터 요약
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">노트 텍스트</p>
              <p className="font-medium">{usage.notes.text_size}</p>
            </div>
            <div>
              <p className="text-muted-foreground">노트북</p>
              <p className="font-medium">{usage.notebooks.count}개</p>
            </div>
            <div>
              <p className="text-muted-foreground">인덱싱된 노트</p>
              <p className="font-medium">
                {usage.embeddings.indexed_notes} / {usage.notes.count}개
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
          <p className="text-sm text-muted-foreground">데이터베이스 크기</p>
          <p className="text-2xl font-bold">{data?.database_size}</p>
        </div>
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">활성 연결</p>
          <p className="text-2xl font-bold">{data?.active_connections}</p>
        </div>
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">전체 연결</p>
          <p className="text-2xl font-bold">{data?.total_connections}</p>
        </div>
      </div>

      {/* Table Stats */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-muted/50 border-b border-border">
          <h3 className="font-semibold">테이블별 통계</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-medium">테이블</th>
                <th className="text-right px-4 py-2 font-medium">행 수</th>
                <th className="text-right px-4 py-2 font-medium">전체 크기</th>
                <th className="text-right px-4 py-2 font-medium">데이터</th>
                <th className="text-right px-4 py-2 font-medium">인덱스</th>
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
      <p className="text-sm text-muted-foreground">전체 {data?.total ?? 0}명의 사용자</p>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-medium">사용자</th>
                <th className="text-left px-4 py-2 font-medium">역할</th>
                <th className="text-left px-4 py-2 font-medium">조직</th>
                <th className="text-left px-4 py-2 font-medium">상태</th>
                <th className="text-left px-4 py-2 font-medium">가입일</th>
                <th className="text-right px-4 py-2 font-medium">작업</th>
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
                        <p className="font-medium">{u.name || '(이름 없음)'}</p>
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
                          <UserCheck className="h-3 w-3" /> 활성
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <UserX className="h-3 w-3" /> 비활성
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
                            '비활성화'
                          ) : (
                            '활성화'
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
            <h3 className="text-lg font-semibold">{data?.configured ? 'NAS 연결됨' : 'NAS 미설정'}</h3>
            <p className="text-sm text-muted-foreground">
              {data?.nas_url || '설정 페이지에서 NAS를 설정하세요'}
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
              <p className="text-sm text-muted-foreground">동기화된 노트</p>
              <p className="font-medium">{data.synced_notes.toLocaleString()}개</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">마지막 동기화</p>
              <p className="font-medium">
                {data.last_sync ? new Date(data.last_sync).toLocaleString('ko-KR') : '없음'}
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
          <p className="text-sm text-muted-foreground">활성 프로바이더</p>
          <p className="text-2xl font-bold">{data?.providers.length ?? 0}</p>
        </div>
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground">사용 가능 모델</p>
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
                    <CheckCircle2 className="h-3 w-3" /> 활성
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-red-600">
                    <XCircle className="h-3 w-3" /> 오류
                  </span>
                )}
              </div>
              <span className="text-sm text-muted-foreground">{provider.model_count}개 모델</span>
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
            <p>등록된 LLM 프로바이더가 없습니다.</p>
            <p className="text-sm">설정 페이지에서 API 키를 추가하세요.</p>
          </div>
        )}
      </div>
    </div>
  )
}
