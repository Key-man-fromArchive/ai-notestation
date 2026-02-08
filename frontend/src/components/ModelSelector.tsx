// @TASK P5-T5.3 - AI 모델 선택기
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#ai-workbench-페이지

import { useEffect } from 'react'
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

interface ModelSelectorProps {
  value: string
  onChange: (modelId: string) => void
  className?: string
}

/**
 * AI 모델 선택기
 * - API에서 사용 가능한 모델 목록 가져오기
 * - 접근성: select 요소 사용
 */
export function ModelSelector({ value, onChange, className }: ModelSelectorProps) {
  const { data, isLoading, isError } = useQuery<ModelsResponse>({
    queryKey: ['ai', 'models'],
    queryFn: () => apiClient.get('/ai/models'),
  })

  // Auto-select first model if current value doesn't match any available model
  useEffect(() => {
    if (data?.models.length) {
      const ids = data.models.map((m) => m.id)
      if (!value || !ids.includes(value)) {
        onChange(data.models[0].id)
      }
    }
  }, [data, value, onChange])

  if (isLoading) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        모델 로딩 중...
      </div>
    )
  }

  if (isError || !data?.models.length) {
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
      {data.models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.name} ({model.provider})
        </option>
      ))}
    </select>
  )
}
