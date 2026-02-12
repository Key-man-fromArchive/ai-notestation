// @TASK P5-T5.3 - AI 모델 선택기
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#ai-workbench-페이지

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Model {
  id: string
  name: string
  provider: string
}

interface ModelsResponse {
  models: Model[]
}

interface SettingResponse {
  key: string
  value: unknown
  description: string
}

interface ModelSelectorProps {
  value: string
  onChange: (modelId: string) => void
  className?: string
}

/**
 * AI 모델 선택기
 * - API에서 사용 가능한 모델 목록 가져오기
 * - enabled_models 설정으로 표시할 모델 필터링
 * - default_ai_model 설정값을 기본 선택
 */
export function ModelSelector({ value, onChange, className }: ModelSelectorProps) {
  const { data, isLoading, isError } = useQuery<ModelsResponse>({
    queryKey: ['ai', 'models'],
    queryFn: () => apiClient.get('/ai/models'),
  })

  const { data: enabledModelsSetting } = useQuery<SettingResponse>({
    queryKey: ['settings', 'enabled_models'],
    queryFn: () => apiClient.get('/settings/enabled_models'),
  })

  const { data: defaultModelSetting } = useQuery<SettingResponse>({
    queryKey: ['settings', 'default_ai_model'],
    queryFn: () => apiClient.get('/settings/default_ai_model'),
  })

  const filteredModels = useMemo(() => {
    if (!data?.models.length) return []
    const enabledList = enabledModelsSetting?.value
    if (Array.isArray(enabledList) && enabledList.length > 0) {
      return data.models.filter((m) => enabledList.includes(m.id))
    }
    return data.models
  }, [data, enabledModelsSetting])

  // Auto-select default model from settings, or first available model
  useEffect(() => {
    if (filteredModels.length) {
      const ids = filteredModels.map((m) => m.id)
      if (!value || !ids.includes(value)) {
        const defaultModel = typeof defaultModelSetting?.value === 'string'
          ? defaultModelSetting.value
          : ''
        if (defaultModel && ids.includes(defaultModel)) {
          onChange(defaultModel)
        } else {
          onChange(filteredModels[0].id)
        }
      }
    }
  }, [filteredModels, value, onChange, defaultModelSetting])

  if (isLoading) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        모델 로딩 중...
      </div>
    )
  }

  if (isError || !filteredModels.length) {
    return (
      <div className={cn('text-sm text-destructive', className)}>
        사용 가능한 모델이 없습니다
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'px-3 py-2 border border-input rounded-md',
        'bg-background text-foreground',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'transition-all duration-200',
        'motion-reduce:transition-none',
        className
      )}
      aria-label="AI 모델 선택"
    >
      {filteredModels.map((model) => (
        <option key={model.id} value={model.id}>
          {model.name} ({model.provider})
        </option>
      ))}
    </select>
  )
}
