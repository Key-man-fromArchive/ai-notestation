// @TASK P5-T5.3 + P6C-T6C.4 - Settings 페이지 with OAuth
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#settings-페이지

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useSync } from '@/hooks/useSync'
import { useOAuth } from '@/hooks/useOAuth'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { Save, AlertCircle, CheckCircle, ChevronDown, ChevronRight, Link2, Unlink, Info, Wifi, WifiOff, Copy, ExternalLink, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SettingsData {
  settings: Record<string, string>
}

interface Setting {
  key: string
  label: string
  type: 'password' | 'text'
  placeholder?: string
  oauthProvider?: string
}

const nasSettingsList: Setting[] = [
  {
    key: 'nas_url',
    label: 'Synology NAS URL',
    type: 'text',
    placeholder: 'http://192.168.1.100:5000',
  },
  {
    key: 'nas_user',
    label: 'NAS 사용자 이름',
    type: 'text',
    placeholder: 'admin',
  },
  {
    key: 'nas_password',
    label: 'NAS 비밀번호',
    type: 'password',
    placeholder: '••••••••',
  },
]

const apiKeySettingsList: Setting[] = [
  {
    key: 'openai_api_key',
    label: 'OpenAI API Key',
    type: 'password',
    placeholder: 'sk-...',
    oauthProvider: 'openai',
  },
  {
    key: 'anthropic_api_key',
    label: 'Anthropic API Key',
    type: 'password',
    placeholder: 'ant-...',
  },
  {
    key: 'google_api_key',
    label: 'Google API Key (Gemini)',
    type: 'password',
    placeholder: 'AIza...',
    oauthProvider: 'google',
  },
  {
    key: 'zhipuai_api_key',
    label: 'ZhipuAI API Key (GLM)',
    type: 'password',
  },
]

const settingsList: Setting[] = [...nasSettingsList, ...apiKeySettingsList]

/**
 * OAuth connection section for a provider
 */
function OAuthSection({ provider, label }: { provider: string; label: string }) {
  const { configured, connected, email, isConnecting, isDisconnecting, connectError, connect, authUrl, disconnect } =
    useOAuth(provider)
  const [copied, setCopied] = useState(false)

  const handleConnect = async () => {
    setCopied(false)
    await connect()
  }

  const handleCopy = async () => {
    if (!authUrl) return
    await navigator.clipboard.writeText(authUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!configured) {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted/50 border border-input rounded-md">
        <Info className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">
          {label} OAuth가 설정되지 않았습니다. 서버 환경변수를 확인하세요.
        </span>
      </div>
    )
  }

  if (connected) {
    return (
      <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-md">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
          <span className="text-sm font-medium text-green-700">
            {label} 연결됨
          </span>
          {email && (
            <span className="text-xs text-muted-foreground">({email})</span>
          )}
        </div>
        <button
          onClick={() => disconnect()}
          disabled={isDisconnecting}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
            'border border-destructive/30 text-destructive',
            'hover:bg-destructive/10 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
          연결 해제
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className={cn(
          'flex items-center gap-2 w-full px-4 py-2.5 rounded-md',
          'border border-primary/30 text-primary',
          'hover:bg-primary/5 transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <Link2 className="h-4 w-4" aria-hidden="true" />
        {isConnecting ? '링크 생성 중...' : `${label}로 연결`}
      </button>

      {/* OAuth URL display */}
      {authUrl && (
        <div className="p-3 bg-muted/50 border border-input rounded-md space-y-2">
          <p className="text-xs text-muted-foreground">
            아래 링크를 복사하여 브라우저에서 열어주세요:
          </p>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={authUrl}
              readOnly
              className="flex-1 px-2 py-1.5 text-xs font-mono bg-background border border-input rounded-md truncate"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md shrink-0',
                'border border-input hover:bg-muted transition-colors',
                copied && 'text-green-600 border-green-500/30'
              )}
              title="복사"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? '복사됨' : '복사'}
            </button>
            <a
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md shrink-0 border border-input hover:bg-muted transition-colors"
              title="새 탭에서 열기"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              열기
            </a>
          </div>
        </div>
      )}

      {connectError && (
        <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md" role="alert">
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" aria-hidden="true" />
          <span className="text-xs text-destructive">
            연결에 실패했습니다. 서버 설정을 확인하세요.
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Inline setting editor row (label + input + edit/save/cancel buttons)
 */
function SettingRow({
  setting,
  currentValue,
  editingKey,
  editValue,
  isPending,
  onEdit,
  onSave,
  onCancel,
  onEditValueChange,
}: {
  setting: Setting
  currentValue: string
  editingKey: string | null
  editValue: string
  isPending: boolean
  onEdit: (key: string, value: string) => void
  onSave: (key: string) => void
  onCancel: () => void
  onEditValueChange: (value: string) => void
}) {
  const isEditing = editingKey === setting.key

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={setting.key} className="text-sm font-medium text-foreground">
        {setting.label}
      </label>
      <div className="flex gap-2">
        <input
          id={setting.key}
          type={isEditing ? 'text' : setting.type}
          value={isEditing ? editValue : currentValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          readOnly={!isEditing}
          placeholder={setting.placeholder}
          className={cn(
            'flex-1 px-3 py-2 border border-input rounded-md',
            'bg-background text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            'transition-all duration-200',
            'motion-reduce:transition-none',
            !isEditing && 'bg-muted/50 cursor-default'
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
                'disabled:opacity-50 disabled:cursor-not-allowed'
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
    </div>
  )
}

export default function Settings() {
  const queryClient = useQueryClient()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [expandedApiKeys, setExpandedApiKeys] = useState<Set<string>>(new Set())

  const { status: syncStatus, lastSync, error: syncError } = useSync()

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: () => apiClient.get('/settings'),
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
    setEditValue(currentValue)
  }

  const handleSave = async (key: string) => {
    await updateMutation.mutateAsync({ key, value: editValue })
  }

  const handleCancel = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const toggleApiKeyExpand = (key: string) => {
    setExpandedApiKeys((prev) => {
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
        <h2 className="text-2xl font-bold mb-2">설정</h2>
        <p className="text-muted-foreground">
          LabNote AI의 기본 설정을 관리합니다
        </p>
      </div>

      {/* NAS 설정 */}
      <div className="p-4 border border-input rounded-md">
        <h3 className="text-lg font-semibold mb-3">Synology NAS 연결</h3>

        {/* NAS 연결 상태 표시 */}
        <div className="flex items-center gap-2 mb-4">
          <div
            className={cn(
              'h-3 w-3 rounded-full',
              syncStatus === 'idle' && 'bg-green-500',
              syncStatus === 'syncing' && 'bg-yellow-500 animate-pulse',
              syncStatus === 'completed' && 'bg-green-500',
              syncStatus === 'error' && 'bg-red-500'
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
            className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md"
            role="alert"
          >
            <p className="text-sm text-destructive">{syncError}</p>
            <p className="text-xs text-destructive/80 mt-1">
              아래에서 NAS URL과 인증 정보를 확인하세요
            </p>
          </div>
        )}

        {/* NAS 설정 필드 */}
        <div className="space-y-4">
          {nasSettingsList.map((setting) => (
            <SettingRow
              key={setting.key}
              setting={setting}
              currentValue={data?.settings[setting.key] || ''}
              editingKey={editingKey}
              editValue={editValue}
              isPending={updateMutation.isPending}
              onEdit={handleEdit}
              onSave={handleSave}
              onCancel={handleCancel}
              onEditValueChange={setEditValue}
            />
          ))}
        </div>

        {/* NAS 연결 테스트 버튼 */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => nasTestMutation.mutate()}
            disabled={nasTestMutation.isPending}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md',
              'border border-primary/30 text-primary',
              'hover:bg-primary/5 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
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

      {/* API 키 설정 */}
      <div className="p-4 border border-input rounded-md">
        <h3 className="text-lg font-semibold mb-3">API 키 관리</h3>
        <div className="space-y-4">
          {apiKeySettingsList.map((setting) => {
            const currentValue = data?.settings[setting.key] || ''
            const isEditing = editingKey === setting.key
            const hasOAuth = !!setting.oauthProvider
            const isApiKeyExpanded = expandedApiKeys.has(setting.key)

            return (
              <div key={setting.key} className="flex flex-col gap-2">
                <label
                  htmlFor={setting.key}
                  className="text-sm font-medium text-foreground"
                >
                  {setting.label}
                </label>

                {/* OAuth section for supported providers */}
                {hasOAuth && (
                  <OAuthSection
                    provider={setting.oauthProvider!}
                    label={setting.oauthProvider === 'google' ? 'Google' : 'ChatGPT (Plus/Pro)'}
                  />
                )}

                {/* API key input — always visible for non-OAuth, collapsible for OAuth */}
                {hasOAuth ? (
                  <div>
                    <button
                      onClick={() => toggleApiKeyExpand(setting.key)}
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
                          onChange={(e) => setEditValue(e.target.value)}
                          readOnly={!isEditing}
                          placeholder={setting.placeholder}
                          className={cn(
                            'flex-1 px-3 py-2 border border-input rounded-md',
                            'bg-background text-foreground',
                            'placeholder:text-muted-foreground',
                            'focus:outline-none focus:ring-2 focus:ring-ring',
                            'transition-all duration-200',
                            'motion-reduce:transition-none',
                            !isEditing && 'bg-muted/50 cursor-default'
                          )}
                        />
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSave(setting.key)}
                              disabled={updateMutation.isPending}
                              className={cn(
                                'px-4 py-2 bg-primary text-primary-foreground rounded-md',
                                'hover:bg-primary/90',
                                'flex items-center gap-2',
                                'transition-colors duration-200',
                                'disabled:opacity-50 disabled:cursor-not-allowed'
                              )}
                              aria-label="저장"
                            >
                              <Save className="h-4 w-4" aria-hidden="true" />
                              저장
                            </button>
                            <button
                              onClick={handleCancel}
                              disabled={updateMutation.isPending}
                              className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleEdit(setting.key, currentValue)}
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
                      onChange={(e) => setEditValue(e.target.value)}
                      readOnly={!isEditing}
                      placeholder={setting.placeholder}
                      className={cn(
                        'flex-1 px-3 py-2 border border-input rounded-md',
                        'bg-background text-foreground',
                        'placeholder:text-muted-foreground',
                        'focus:outline-none focus:ring-2 focus:ring-ring',
                        'transition-all duration-200',
                        'motion-reduce:transition-none',
                        !isEditing && 'bg-muted/50 cursor-default'
                      )}
                    />
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleSave(setting.key)}
                          disabled={updateMutation.isPending}
                          className={cn(
                            'px-4 py-2 bg-primary text-primary-foreground rounded-md',
                            'hover:bg-primary/90',
                            'flex items-center gap-2',
                            'transition-colors duration-200',
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                          aria-label="저장"
                        >
                          <Save className="h-4 w-4" aria-hidden="true" />
                          저장
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={updateMutation.isPending}
                          className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleEdit(setting.key, currentValue)}
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

      {/* 저장 성공 메시지 */}
      {updateMutation.isSuccess && (
        <div
          className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-md"
          role="status"
        >
          <CheckCircle className="h-5 w-5 text-green-600" aria-hidden="true" />
          <span className="text-sm text-green-600">설정이 저장되었습니다</span>
        </div>
      )}

      {/* 저장 실패 메시지 */}
      {updateMutation.isError && (
        <div
          className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
          <span className="text-sm text-destructive">
            설정 저장에 실패했습니다
          </span>
        </div>
      )}
    </div>
  )
}
