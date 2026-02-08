import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useSync } from '@/hooks/useSync'
import { useSearchIndex } from '@/hooks/useSearchIndex'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import {
  OAuthSection,
  SettingRow,
  NsxImportSection,
  BackupSection,
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SettingsData {
  settings: Record<string, string>
}

export default function Settings() {
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
      <BackupSection />
      <SearchIndexSection />

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
  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3">Synology NAS 연결</h3>

      <div className="flex items-center gap-2 mb-4">
        <div
          className={cn(
            'h-3 w-3 rounded-full',
            syncStatus === 'idle' && 'bg-green-500',
            syncStatus === 'syncing' && 'bg-yellow-500 animate-pulse',
            syncStatus === 'completed' && 'bg-green-500',
            syncStatus === 'error' && 'bg-red-500',
          )}
          aria-hidden="true"
        />
        <span className="text-sm font-medium">
          {syncStatus === 'idle' && '연결됨'}
          {syncStatus === 'syncing' && '동기화 중...'}
          {syncStatus === 'completed' && '동기화 완료'}
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
