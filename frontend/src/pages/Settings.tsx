import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useSync } from '@/hooks/useSync'
import { useSearchIndex } from '@/hooks/useSearchIndex'
import { useImageSync } from '@/hooks/useImageSync'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import {
  OAuthSection,
  SettingRow,
  NsxImportSection,
  BackupSection,
  SearchParamsSection,
  nasSettingsList,
  apiKeySettingsList,
} from '@/components/settings'
import {
  Save,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Wifi,
  WifiOff,
  Search,
  Database,
  Image,
  Globe,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SettingsData {
  settings: Record<string, string>
}

export default function Settings() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  const queryClient = useQueryClient()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [expandedApiKeys, setExpandedApiKeys] = useState<Set<string>>(new Set())

  const { status: syncStatus, lastSync, error: syncError } = useSync()

  const { data, isLoading, isError, error } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await apiClient.get<{
        settings: Array<{ key: string; value: string }>
      }>('/settings')
      const settingsMap: Record<string, string> = {}
      for (const s of response.settings) {
        settingsMap[s.key] = s.value
      }
      return { settings: settingsMap }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiClient.put(`/settings/${key}`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setEditingKey(null)
      setEditValue('')
    },
  })

  const nasTestMutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ success: boolean; message: string }>('/settings/nas/test', {}),
  })

  const handleEdit = (key: string, currentValue: string) => {
    setEditingKey(key)
    const isApiKey = key.endsWith('_api_key') || key === 'nas_password'
    setEditValue(isApiKey ? '' : currentValue)
  }

  const handleSave = async (key: string) => {
    await updateMutation.mutateAsync({ key, value: editValue })
  }

  const handleCancel = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const toggleApiKeyExpand = (key: string) => {
    setExpandedApiKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  if (isLoading) {
    return <LoadingSpinner className="py-12" />
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="설정을 불러올 수 없습니다"
        description={error instanceof Error ? error.message : '알 수 없는 오류'}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold mb-1">설정</h1>
        <p className="text-sm text-muted-foreground">LabNote AI의 기본 설정을 관리합니다</p>
      </div>

      {isAdmin && (
        <>
          <NasConnectionSection
            data={data}
            syncStatus={syncStatus}
            lastSync={lastSync}
            syncError={syncError}
            editingKey={editingKey}
            editValue={editValue}
            isPending={updateMutation.isPending}
            nasTestMutation={nasTestMutation}
            onEdit={handleEdit}
            onSave={handleSave}
            onCancel={handleCancel}
            onEditValueChange={setEditValue}
          />

          <NsxImportSection />
          <ImageSyncSection />
          <BackupSection />
        </>
      )}
      <TimezoneSection
        data={data}
        isPending={updateMutation.isPending}
        onSave={(tz) => updateMutation.mutate({ key: 'timezone', value: tz })}
      />

      <AiModelSection />

      <SearchIndexSection />

      {isAdmin && <SearchParamsSection />}

      <ApiKeysSection
        data={data}
        editingKey={editingKey}
        editValue={editValue}
        expandedApiKeys={expandedApiKeys}
        isPending={updateMutation.isPending}
        onEdit={handleEdit}
        onSave={handleSave}
        onCancel={handleCancel}
        onEditValueChange={setEditValue}
        onToggleExpand={toggleApiKeyExpand}
      />

      {updateMutation.isSuccess && (
        <div
          className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg"
          role="status"
        >
          <CheckCircle className="h-5 w-5 text-green-600" aria-hidden="true" />
          <span className="text-sm text-green-600">설정이 저장되었습니다</span>
        </div>
      )}

      {updateMutation.isError && (
        <div
          className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
          <span className="text-sm text-destructive">설정 저장에 실패했습니다</span>
        </div>
      )}
    </div>
  )
}

interface NasConnectionSectionProps {
  data: SettingsData | undefined
  syncStatus: string
  lastSync: string | null | undefined
  syncError: string | null | undefined
  editingKey: string | null
  editValue: string
  isPending: boolean
  nasTestMutation: ReturnType<
    typeof useMutation<{ success: boolean; message: string }, Error, void>
  >
  onEdit: (key: string, value: string) => void
  onSave: (key: string) => void
  onCancel: () => void
  onEditValueChange: (value: string) => void
}

function NasConnectionSection({
  data,
  syncStatus,
  lastSync,
  syncError,
  editingKey,
  editValue,
  isPending,
  nasTestMutation,
  onEdit,
  onSave,
  onCancel,
  onEditValueChange,
}: NasConnectionSectionProps) {
  const nasUrl = (data?.settings['nas_url'] || '').replace(/^"|"$/g, '').trim()
  const nasUser = (data?.settings['nas_user'] || '').trim()
  const isConfigured = Boolean(nasUrl && nasUser)

  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3">Synology NAS 연결</h3>

      <div className="flex items-center gap-2 mb-4">
        <div
          className={cn(
            'h-3 w-3 rounded-full',
            !isConfigured && 'bg-gray-400',
            isConfigured && syncStatus === 'idle' && 'bg-green-500',
            isConfigured && syncStatus === 'syncing' && 'bg-yellow-500 animate-pulse',
            isConfigured && syncStatus === 'completed' && 'bg-green-500',
            syncStatus === 'error' && 'bg-red-500',
          )}
          aria-hidden="true"
        />
        <span className="text-sm font-medium">
          {!isConfigured && syncStatus !== 'error' && '미설정'}
          {isConfigured && syncStatus === 'idle' && '연결됨'}
          {isConfigured && syncStatus === 'syncing' && '동기화 중...'}
          {isConfigured && syncStatus === 'completed' && '동기화 완료'}
          {syncStatus === 'error' && 'NAS 연결에 실패했습니다'}
        </span>
        {lastSync && (
          <span className="text-xs text-muted-foreground ml-2">
            (마지막 동기화: {new Date(lastSync).toLocaleString('ko-KR')})
          </span>
        )}
      </div>

      {syncError && (
        <div
          className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
          role="alert"
        >
          <p className="text-sm text-destructive">{syncError}</p>
          <p className="text-xs text-destructive/80 mt-1">
            아래에서 NAS URL과 인증 정보를 확인하세요
          </p>
        </div>
      )}

      <div className="space-y-4">
        {nasSettingsList.map(setting => (
          <SettingRow
            key={setting.key}
            setting={setting}
            currentValue={data?.settings[setting.key] || ''}
            editingKey={editingKey}
            editValue={editValue}
            isPending={isPending}
            onEdit={onEdit}
            onSave={onSave}
            onCancel={onCancel}
            onEditValueChange={onEditValueChange}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => nasTestMutation.mutate()}
          disabled={nasTestMutation.isPending}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md',
            'border border-primary/30 text-primary',
            'hover:bg-primary/5 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Wifi className="h-4 w-4" aria-hidden="true" />
          {nasTestMutation.isPending ? '연결 테스트 중...' : '연결 테스트'}
        </button>

        {nasTestMutation.isSuccess && nasTestMutation.data?.success && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">{nasTestMutation.data.message}</span>
          </div>
        )}
        {nasTestMutation.isSuccess && !nasTestMutation.data?.success && (
          <div className="flex items-center gap-2 text-destructive">
            <WifiOff className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">{nasTestMutation.data?.message}</span>
          </div>
        )}
        {nasTestMutation.isError && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">연결 테스트에 실패했습니다</span>
          </div>
        )}
      </div>
    </div>
  )
}

interface ApiKeysSectionProps {
  data: SettingsData | undefined
  editingKey: string | null
  editValue: string
  expandedApiKeys: Set<string>
  isPending: boolean
  onEdit: (key: string, value: string) => void
  onSave: (key: string) => void
  onCancel: () => void
  onEditValueChange: (value: string) => void
  onToggleExpand: (key: string) => void
}

function ApiKeysSection({
  data,
  editingKey,
  editValue,
  expandedApiKeys,
  isPending,
  onEdit,
  onSave,
  onCancel,
  onEditValueChange,
  onToggleExpand,
}: ApiKeysSectionProps) {
  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3">API 키 관리</h3>
      <div className="space-y-4">
        {apiKeySettingsList.map(setting => {
          const currentValue = data?.settings[setting.key] || ''
          const isEditing = editingKey === setting.key
          const hasOAuth = !!setting.oauthProvider
          const isApiKeyExpanded = expandedApiKeys.has(setting.key)

          return (
            <div key={setting.key} className="flex flex-col gap-2">
              <label htmlFor={setting.key} className="text-sm font-medium text-foreground">
                {setting.label}
              </label>

              {hasOAuth && (
                <OAuthSection
                  provider={setting.oauthProvider!}
                  label={
                    setting.oauthProvider === 'google'
                      ? 'Google'
                      : setting.oauthProvider === 'anthropic'
                        ? 'Claude (Pro/Max)'
                        : 'ChatGPT (Plus/Pro)'
                  }
                />
              )}

              {hasOAuth ? (
                <div>
                  <button
                    onClick={() => onToggleExpand(setting.key)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isApiKeyExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    API 키로 직접 입력
                  </button>
                  {isApiKeyExpanded && (
                    <div className="flex gap-2 mt-2">
                      <input
                        id={setting.key}
                        type={isEditing ? 'text' : setting.type}
                        value={isEditing ? editValue : currentValue}
                        onChange={e => onEditValueChange(e.target.value)}
                        readOnly={!isEditing}
                        placeholder={setting.placeholder}
                        className={cn(
                          'flex-1 px-3 py-2 border border-input rounded-md',
                          'bg-background text-foreground',
                          'placeholder:text-muted-foreground',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'transition-all duration-200',
                          'motion-reduce:transition-none',
                          !isEditing && 'bg-muted/50 cursor-default',
                        )}
                      />
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => onSave(setting.key)}
                            disabled={isPending}
                            className={cn(
                              'px-4 py-2 bg-primary text-primary-foreground rounded-md',
                              'hover:bg-primary/90',
                              'flex items-center gap-2',
                              'transition-colors duration-200',
                              'disabled:opacity-50 disabled:cursor-not-allowed',
                            )}
                            aria-label="저장"
                          >
                            <Save className="h-4 w-4" aria-hidden="true" />
                            저장
                          </button>
                          <button
                            onClick={onCancel}
                            disabled={isPending}
                            className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => onEdit(setting.key, currentValue)}
                          className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                        >
                          수정
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    id={setting.key}
                    type={isEditing ? 'text' : setting.type}
                    value={isEditing ? editValue : currentValue}
                    onChange={e => onEditValueChange(e.target.value)}
                    readOnly={!isEditing}
                    placeholder={setting.placeholder}
                    className={cn(
                      'flex-1 px-3 py-2 border border-input rounded-md',
                      'bg-background text-foreground',
                      'placeholder:text-muted-foreground',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      'transition-all duration-200',
                      'motion-reduce:transition-none',
                      !isEditing && 'bg-muted/50 cursor-default',
                    )}
                  />
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => onSave(setting.key)}
                        disabled={isPending}
                        className={cn(
                          'px-4 py-2 bg-primary text-primary-foreground rounded-md',
                          'hover:bg-primary/90',
                          'flex items-center gap-2',
                          'transition-colors duration-200',
                          'disabled:opacity-50 disabled:cursor-not-allowed',
                        )}
                        aria-label="저장"
                      >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        저장
                      </button>
                      <button
                        onClick={onCancel}
                        disabled={isPending}
                        className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => onEdit(setting.key, currentValue)}
                      className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                    >
                      수정
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ImageSyncSection() {
  const {
    status,
    totalNotes,
    processedNotes,
    imagesExtracted,
    failedNotes,
    lastSyncAt,
    error,
    remainingNotes,
    progress,
    isSyncing,
    triggerSync,
  } = useImageSync()

  const handleTriggerSync = async () => {
    try {
      await triggerSync()
    } catch {
      // Error handled by hook
    }
  }

  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Image className="h-5 w-5" aria-hidden="true" />
        이미지 동기화
      </h3>

      <p className="text-sm text-muted-foreground mb-4">
        NAS에서 노트에 포함된 이미지를 가져옵니다. 이미지가 누락된 노트가 있을 때 실행하세요.
      </p>

      {lastSyncAt && (
        <p className="text-xs text-muted-foreground mb-3">
          마지막 동기화: {new Date(lastSyncAt).toLocaleString('ko-KR')}
        </p>
      )}

      {status === 'syncing' && (
        <div className="space-y-3 mb-4">
          <div className="flex justify-between text-sm">
            <span>진행 중</span>
            <span className="font-medium">
              {processedNotes.toLocaleString()} / {totalNotes.toLocaleString()}개 노트
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>추출된 이미지</span>
            <span className="font-medium text-green-600">
              {imagesExtracted.toLocaleString()}개
            </span>
          </div>
          {failedNotes > 0 && (
            <div className="flex justify-between text-sm">
              <span>실패</span>
              <span className="font-medium text-destructive">
                {failedNotes.toLocaleString()}개
              </span>
            </div>
          )}
          <div className="mt-2">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              이미지 동기화 중... {progress}%
            </p>
          </div>
        </div>
      )}

      {status === 'completed' && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <p className="text-sm text-green-600">
            {imagesExtracted.toLocaleString()}개 이미지 동기화 완료
          </p>
        </div>
      )}

      {status === 'partial' && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-sm text-amber-600">
            {imagesExtracted.toLocaleString()}개 이미지 동기화 완료 &mdash;{' '}
            {remainingNotes.toLocaleString()}개 노트 추가 동기화 필요
          </p>
          <p className="text-xs text-amber-500 mt-1">
            버튼을 다시 눌러 나머지 노트를 동기화하세요.
          </p>
        </div>
      )}

      {error && (
        <div
          className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
          role="alert"
        >
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <button
        onClick={handleTriggerSync}
        disabled={isSyncing}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-md',
          'bg-primary text-primary-foreground',
          'hover:bg-primary/90 transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        <Image className="h-4 w-4" aria-hidden="true" />
        {isSyncing ? '동기화 중...' : '이미지 동기화'}
      </button>
    </div>
  )
}

function SearchIndexSection() {
  const {
    status,
    totalNotes,
    indexedNotes,
    pendingNotes,
    progress,
    error,
    triggerIndex,
    isIndexing,
  } = useSearchIndex()

  const handleTriggerIndex = () => {
    triggerIndex()
  }

  const indexPercentage =
    totalNotes > 0 ? Math.round((indexedNotes / totalNotes) * 100) : 0

  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Database className="h-5 w-5" aria-hidden="true" />
        검색 인덱싱
      </h3>

      <p className="text-sm text-muted-foreground mb-4">
        Semantic Search를 위한 노트 임베딩을 생성합니다. OPENAI_API_KEY가
        설정되어 있어야 합니다.
      </p>

      <div className="space-y-3 mb-4">
        <div className="flex justify-between text-sm">
          <span>전체 노트</span>
          <span className="font-medium">{totalNotes.toLocaleString()}개</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>인덱싱 완료</span>
          <span className="font-medium text-green-600">
            {indexedNotes.toLocaleString()}개 ({indexPercentage}%)
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span>인덱싱 대기</span>
          <span className="font-medium text-amber-600">
            {pendingNotes.toLocaleString()}개
          </span>
        </div>

        {status === 'indexing' && (
          <div className="mt-2">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              배치 진행 중... {progress}%
            </p>
          </div>
        )}
      </div>

      {error && (
        <div
          className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
          role="alert"
        >
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleTriggerIndex}
          disabled={isIndexing || pendingNotes === 0}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          {isIndexing ? '인덱싱 중...' : '인덱싱 시작'}
        </button>

        {status === 'completed' && pendingNotes === 0 && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">모든 노트가 인덱싱되었습니다</span>
          </div>
        )}
      </div>
    </div>
  )
}


interface AiModel {
  id: string
  name: string
  provider: string
}

interface AiModelsResponse {
  models: AiModel[]
}

interface SettingResponse {
  key: string
  value: unknown
  description: string
}

function AiModelSection() {
  const queryClient = useQueryClient()
  const [localEnabled, setLocalEnabled] = useState<string[]>([])
  const [localDefault, setLocalDefault] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data: modelsData } = useQuery<AiModelsResponse>({
    queryKey: ['ai', 'models'],
    queryFn: () => apiClient.get('/ai/models'),
  })

  const { data: enabledSetting } = useQuery<SettingResponse>({
    queryKey: ['settings', 'enabled_models'],
    queryFn: () => apiClient.get('/settings/enabled_models'),
  })

  const { data: defaultSetting } = useQuery<SettingResponse>({
    queryKey: ['settings', 'default_ai_model'],
    queryFn: () => apiClient.get('/settings/default_ai_model'),
  })

  // Initialize local state from fetched settings
  useEffect(() => {
    if (!modelsData?.models.length || initialized) return

    const enabledList = enabledSetting?.value
    if (Array.isArray(enabledList) && enabledList.length > 0) {
      setLocalEnabled(enabledList)
    } else {
      setLocalEnabled(modelsData.models.map((m) => m.id))
    }

    const defaultModel = typeof defaultSetting?.value === 'string'
      ? defaultSetting.value
      : ''
    setLocalDefault(defaultModel || modelsData.models[0]?.id || '')
    setInitialized(true)
  }, [modelsData, enabledSetting, defaultSetting, initialized])

  const allModels = modelsData?.models || []

  const toggleModel = (modelId: string) => {
    setLocalEnabled((prev) => {
      if (prev.includes(modelId)) {
        // Don't allow disabling all models
        if (prev.length <= 1) return prev
        const next = prev.filter((id) => id !== modelId)
        // If we're disabling the current default, change default to first remaining
        if (modelId === localDefault) {
          setLocalDefault(next[0])
        }
        return next
      }
      return [...prev, modelId]
    })
  }

  const selectAll = () => setLocalEnabled(allModels.map((m) => m.id))
  const selectNone = () => {
    // Keep at least the default model
    if (localDefault) {
      setLocalEnabled([localDefault])
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      // If all models are enabled, save empty array (= show all)
      const enabledValue = localEnabled.length === allModels.length ? [] : localEnabled
      await Promise.all([
        apiClient.put('/settings/enabled_models', { value: enabledValue }),
        apiClient.put('/settings/default_ai_model', { value: localDefault }),
      ])
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['settings', 'enabled_models'] })
      queryClient.invalidateQueries({ queryKey: ['settings', 'default_ai_model'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  // Models available for default selection (only enabled ones)
  const enabledModels = allModels.filter((m) => localEnabled.includes(m.id))

  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5" aria-hidden="true" />
        AI 모델 설정
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        기본 모델과 선택기에 표시할 모델을 설정합니다.
      </p>

      {!allModels.length ? (
        <p className="text-sm text-muted-foreground">사용 가능한 모델이 없습니다. API 키를 먼저 설정하세요.</p>
      ) : (
        <>
          <div className="mb-4">
            <label className="text-sm font-medium mb-1 block">기본 모델</label>
            <select
              value={localDefault}
              onChange={(e) => setLocalDefault(e.target.value)}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-md',
                'border border-input bg-background',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              {enabledModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">표시할 모델</label>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs px-2 py-1 rounded border border-input hover:bg-muted transition-colors"
                >
                  모두 선택
                </button>
                <button
                  onClick={selectNone}
                  className="text-xs px-2 py-1 rounded border border-input hover:bg-muted transition-colors"
                >
                  모두 해제
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {allModels.map((model) => (
                <label
                  key={model.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer',
                    'hover:bg-muted/50 transition-colors',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={localEnabled.includes(model.id)}
                    onChange={() => toggleModel(model.id)}
                    className="rounded border-input"
                  />
                  <span className="text-sm">
                    {model.name} ({model.provider})
                  </span>
                  {model.id === localDefault && (
                    <span className="text-xs text-muted-foreground ml-auto">기본</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
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
              {saving ? '저장 중...' : '저장'}
            </button>
            {saved && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">저장되었습니다</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Seoul', label: '한국 (KST, UTC+9)' },
  { value: 'Asia/Tokyo', label: '일본 (JST, UTC+9)' },
  { value: 'Asia/Shanghai', label: '중국 (CST, UTC+8)' },
  { value: 'Asia/Singapore', label: '싱가포르 (SGT, UTC+8)' },
  { value: 'Asia/Kolkata', label: '인도 (IST, UTC+5:30)' },
  { value: 'Europe/London', label: '런던 (GMT/BST)' },
  { value: 'Europe/Paris', label: '파리 (CET/CEST)' },
  { value: 'Europe/Berlin', label: '베를린 (CET/CEST)' },
  { value: 'America/New_York', label: '뉴욕 (EST/EDT)' },
  { value: 'America/Chicago', label: '시카고 (CST/CDT)' },
  { value: 'America/Denver', label: '덴버 (MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'LA (PST/PDT)' },
  { value: 'Pacific/Auckland', label: '오클랜드 (NZST, UTC+12)' },
  { value: 'Australia/Sydney', label: '시드니 (AEST, UTC+10)' },
  { value: 'UTC', label: 'UTC' },
]

function TimezoneSection({
  data,
  isPending,
  onSave,
}: {
  data: SettingsData | undefined
  isPending: boolean
  onSave: (tz: string) => void
}) {
  const currentTz = data?.settings?.timezone || 'Asia/Seoul'
  const now = new Date()
  let preview = ''
  try {
    preview = now.toLocaleString('ko-KR', {
      timeZone: currentTz,
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch {
    preview = now.toLocaleString('ko-KR')
  }

  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Globe className="h-5 w-5" aria-hidden="true" />
        시간대 설정
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        노트 수정일, 동기화 시간 등에 사용할 시간대를 선택합니다.
      </p>
      <div className="flex items-center gap-3">
        <select
          value={currentTz}
          onChange={(e) => onSave(e.target.value)}
          disabled={isPending}
          className={cn(
            'flex-1 px-3 py-2 text-sm rounded-md',
            'border border-input bg-background',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:opacity-50',
          )}
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        현재 시간: {preview}
      </p>
    </div>
  )
}
