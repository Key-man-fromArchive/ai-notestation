import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
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
  Languages,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SettingsData {
  settings: Record<string, string>
}

export default function Settings() {
  const { t } = useTranslation()
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
        title={t('settings.loadError')}
        description={error instanceof Error ? error.message : t('common.unknownError')}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold mb-1">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>
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
      <LanguageSection />

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
          <span className="text-sm text-green-600">{t('settings.settingsSaved')}</span>
        </div>
      )}

      {updateMutation.isError && (
        <div
          className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
          <span className="text-sm text-destructive">{t('settings.settingsSaveFailed')}</span>
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
  const { t, i18n } = useTranslation()
  const nasUrl = (data?.settings['nas_url'] || '').replace(/^"|"$/g, '').trim()
  const nasUser = (data?.settings['nas_user'] || '').trim()
  const isConfigured = Boolean(nasUrl && nasUser)

  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3">{t('settings.nasConnection')}</h3>

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
          {!isConfigured && syncStatus !== 'error' && t('settings.nasNotConfigured')}
          {isConfigured && syncStatus === 'idle' && t('settings.nasConnected')}
          {isConfigured && syncStatus === 'syncing' && t('settings.nasSyncing')}
          {isConfigured && syncStatus === 'completed' && t('settings.nasSyncCompleted')}
          {syncStatus === 'error' && t('settings.nasConnectionFailed')}
        </span>
        {lastSync && (
          <span className="text-xs text-muted-foreground ml-2">
            ({t('settings.lastSync')}: {new Date(lastSync).toLocaleString(i18n.language === 'ko' ? 'ko-KR' : 'en-US')})
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
            {t('settings.checkNasSettings')}
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
          {nasTestMutation.isPending ? t('settings.connectionTesting') : t('settings.connectionTest')}
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
            <span className="text-sm">{t('settings.connectionTestFailed')}</span>
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
  const { t } = useTranslation()
  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3">{t('settings.apiKeyManagement')}</h3>
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
                    {t('settings.enterApiKey')}
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
                            aria-label={t('common.save')}
                          >
                            <Save className="h-4 w-4" aria-hidden="true" />
                            {t('common.save')}
                          </button>
                          <button
                            onClick={onCancel}
                            disabled={isPending}
                            className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                          >
                            {t('common.cancel')}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => onEdit(setting.key, currentValue)}
                          className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                        >
                          {t('common.edit')}
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
                        aria-label={t('common.save')}
                      >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        {t('common.save')}
                      </button>
                      <button
                        onClick={onCancel}
                        disabled={isPending}
                        className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => onEdit(setting.key, currentValue)}
                      className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                    >
                      {t('common.edit')}
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
  const { t, i18n } = useTranslation()
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
        {t('settings.imageSync')}
      </h3>

      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.imageSyncDesc')}
      </p>

      {lastSyncAt && (
        <p className="text-xs text-muted-foreground mb-3">
          {t('settings.lastImageSync')}: {new Date(lastSyncAt).toLocaleString(i18n.language === 'ko' ? 'ko-KR' : 'en-US')}
        </p>
      )}

      {status === 'syncing' && (
        <div className="space-y-3 mb-4">
          <div className="flex justify-between text-sm">
            <span>{t('settings.inProgress')}</span>
            <span className="font-medium">
              {processedNotes.toLocaleString()} / {totalNotes.toLocaleString()} {t('common.count_notes', { count: totalNotes })}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>{t('settings.extractedImages')}</span>
            <span className="font-medium text-green-600">
              {imagesExtracted.toLocaleString()} {t('common.count_items', { count: imagesExtracted })}
            </span>
          </div>
          {failedNotes > 0 && (
            <div className="flex justify-between text-sm">
              <span>{t('settings.failedCount')}</span>
              <span className="font-medium text-destructive">
                {failedNotes.toLocaleString()} {t('common.count_items', { count: failedNotes })}
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
              {t('settings.imageSyncing', { progress })}
            </p>
          </div>
        </div>
      )}

      {status === 'completed' && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <p className="text-sm text-green-600">
            {t('settings.imageSyncComplete', { count: imagesExtracted })}
          </p>
        </div>
      )}

      {status === 'partial' && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-sm text-amber-600">
            {t('settings.imageSyncPartial', { completed: imagesExtracted, remaining: remainingNotes })}
          </p>
          <p className="text-xs text-amber-500 mt-1">
            {t('settings.imageSyncPartialHint')}
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
        {isSyncing ? t('settings.imageSyncingButton') : t('settings.imageSyncButton')}
      </button>
    </div>
  )
}

function SearchIndexSection() {
  const { t } = useTranslation()
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
        {t('settings.searchIndexing')}
      </h3>

      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.searchIndexDesc')}
      </p>

      <div className="space-y-3 mb-4">
        <div className="flex justify-between text-sm">
          <span>{t('settings.totalNotes')}</span>
          <span className="font-medium">{totalNotes.toLocaleString()} {t('common.count_items', { count: totalNotes })}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>{t('settings.indexed')}</span>
          <span className="font-medium text-green-600">
            {indexedNotes.toLocaleString()} {t('common.count_items', { count: indexedNotes })} ({indexPercentage}%)
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span>{t('settings.pendingIndex')}</span>
          <span className="font-medium text-amber-600">
            {pendingNotes.toLocaleString()} {t('common.count_items', { count: pendingNotes })}
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
              {t('settings.batchProgress', { progress })}
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
          {isIndexing ? t('settings.indexing') : t('settings.startIndex')}
        </button>

        {status === 'completed' && pendingNotes === 0 && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">{t('settings.allIndexed')}</span>
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
  const { t } = useTranslation()
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
        {t('settings.aiModelSettings')}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.aiModelDesc')}
      </p>

      {!allModels.length ? (
        <p className="text-sm text-muted-foreground">{t('settings.noModels')}</p>
      ) : (
        <>
          <div className="mb-4">
            <label className="text-sm font-medium mb-1 block">{t('settings.defaultModel')}</label>
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
              <label className="text-sm font-medium">{t('settings.visibleModels')}</label>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs px-2 py-1 rounded border border-input hover:bg-muted transition-colors"
                >
                  {t('common.selectAll')}
                </button>
                <button
                  onClick={selectNone}
                  className="text-xs px-2 py-1 rounded border border-input hover:bg-muted transition-colors"
                >
                  {t('common.deselectAll')}
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
                    <span className="text-xs text-muted-foreground ml-auto">{t('common.default')}</span>
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
              {saving ? t('common.saving') : t('common.save')}
            </button>
            {saved && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">{t('common.saved')}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function TimezoneSection({
  data,
  isPending,
  onSave,
}: {
  data: SettingsData | undefined
  isPending: boolean
  onSave: (tz: string) => void
}) {
  const { t, i18n } = useTranslation()

  const TIMEZONE_OPTIONS = [
    { value: 'Asia/Seoul', labelKey: 'settings.timezone.seoul' },
    { value: 'Asia/Tokyo', labelKey: 'settings.timezone.tokyo' },
    { value: 'Asia/Shanghai', labelKey: 'settings.timezone.shanghai' },
    { value: 'Asia/Singapore', labelKey: 'settings.timezone.singapore' },
    { value: 'Asia/Kolkata', labelKey: 'settings.timezone.kolkata' },
    { value: 'Europe/London', labelKey: 'settings.timezone.london' },
    { value: 'Europe/Paris', labelKey: 'settings.timezone.paris' },
    { value: 'Europe/Berlin', labelKey: 'settings.timezone.berlin' },
    { value: 'America/New_York', labelKey: 'settings.timezone.newYork' },
    { value: 'America/Chicago', labelKey: 'settings.timezone.chicago' },
    { value: 'America/Denver', labelKey: 'settings.timezone.denver' },
    { value: 'America/Los_Angeles', labelKey: 'settings.timezone.la' },
    { value: 'Pacific/Auckland', labelKey: 'settings.timezone.auckland' },
    { value: 'Australia/Sydney', labelKey: 'settings.timezone.sydney' },
    { value: 'UTC', labelKey: 'UTC' },
  ]

  const currentTz = data?.settings?.timezone || 'Asia/Seoul'
  const now = new Date()
  let preview = ''
  try {
    preview = now.toLocaleString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', {
      timeZone: currentTz,
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch {
    preview = now.toLocaleString(i18n.language === 'ko' ? 'ko-KR' : 'en-US')
  }

  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Globe className="h-5 w-5" aria-hidden="true" />
        {t('settings.timezoneSettings')}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.timezoneDesc')}
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
            <option key={tz.value} value={tz.value}>
              {tz.labelKey === 'UTC' ? 'UTC' : t(tz.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {t('settings.currentTime')}: {preview}
      </p>
    </div>
  )
}

function LanguageSection() {
  const { t, i18n } = useTranslation()

  const handleChange = (lang: string) => {
    i18n.changeLanguage(lang)
    localStorage.setItem('language', lang)
  }

  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Languages className="h-5 w-5" aria-hidden="true" />
        {t('settings.languageSettings')}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.languageDesc')}
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => handleChange('ko')}
          className={cn(
            'flex-1 px-4 py-2.5 rounded-md border text-sm font-medium transition-colors',
            i18n.language === 'ko'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-input hover:bg-accent',
          )}
        >
          🇰🇷 {t('settings.korean')}
        </button>
        <button
          onClick={() => handleChange('en')}
          className={cn(
            'flex-1 px-4 py-2.5 rounded-md border text-sm font-medium transition-colors',
            i18n.language === 'en'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-input hover:bg-accent',
          )}
        >
          🇺🇸 {t('settings.english')}
        </button>
      </div>
    </div>
  )
}
