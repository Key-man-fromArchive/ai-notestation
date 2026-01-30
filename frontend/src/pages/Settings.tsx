// @TASK P5-T5.3 - Settings 페이지
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#settings-페이지
// @TEST src/__tests__/Settings.test.tsx

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useSync } from '@/hooks/useSync'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { Save, AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SettingsData {
  settings: Record<string, string>
}

interface Setting {
  key: string
  label: string
  type: 'password' | 'text'
  placeholder?: string
}

const settingsList: Setting[] = [
  {
    key: 'openai_api_key',
    label: 'OpenAI API Key',
    type: 'password',
    placeholder: 'sk-...',
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
  },
  {
    key: 'zhipuai_api_key',
    label: 'ZhipuAI API Key (GLM)',
    type: 'password',
  },
  {
    key: 'nas_url',
    label: 'Synology NAS URL',
    type: 'text',
    placeholder: 'https://nas.example.com',
  },
]

export default function Settings() {
  const queryClient = useQueryClient()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

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

      {/* NAS 연결 상태 */}
      <div className="p-4 border border-input rounded-md">
        <h3 className="text-lg font-semibold mb-3">NAS 연결 상태</h3>
        <div className="flex items-center gap-2 mb-2">
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
        </div>
        {lastSync && (
          <p className="text-xs text-muted-foreground">
            마지막 동기화: {new Date(lastSync).toLocaleString('ko-KR')}
          </p>
        )}
        {syncError && (
          <div
            className="mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md"
            role="alert"
          >
            <p className="text-sm text-destructive">{syncError}</p>
            <p className="text-xs text-destructive/80 mt-1">
              NAS URL과 인증 정보를 확인하세요
            </p>
          </div>
        )}
      </div>

      {/* API 키 설정 */}
      <div className="p-4 border border-input rounded-md">
        <h3 className="text-lg font-semibold mb-3">API 키 관리</h3>
        <div className="space-y-4">
          {settingsList.map((setting) => {
            const currentValue = data?.settings[setting.key] || ''
            const isEditing = editingKey === setting.key

            return (
              <div key={setting.key} className="flex flex-col gap-2">
                <label
                  htmlFor={setting.key}
                  className="text-sm font-medium text-foreground"
                >
                  {setting.label}
                </label>
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
