import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { Save, RotateCcw, CheckCircle, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchParams {
  rrf_k: number
  fts_weight: number
  semantic_weight: number
  fts_weight_korean: number
  semantic_weight_korean: number
  title_weight: number
  content_weight: number
  trigram_threshold_ko: number
  trigram_threshold_en: number
  trigram_title_weight: number
  unified_fts_weight: number
  unified_trigram_weight: number
}

interface SearchParamsResponse {
  key: string
  value: SearchParams
  description: string
}

const DEFAULT_PARAMS: SearchParams = {
  rrf_k: 60,
  fts_weight: 0.6,
  semantic_weight: 0.4,
  fts_weight_korean: 0.7,
  semantic_weight_korean: 0.3,
  title_weight: 3.0,
  content_weight: 1.0,
  trigram_threshold_ko: 0.15,
  trigram_threshold_en: 0.1,
  trigram_title_weight: 3.0,
  unified_fts_weight: 0.65,
  unified_trigram_weight: 0.35,
}

export function SearchParamsSection() {
  const queryClient = useQueryClient()
  const [localParams, setLocalParams] = useState<SearchParams>(DEFAULT_PARAMS)
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [resetting, setResetting] = useState(false)

  const { data: paramsData } = useQuery<SearchParamsResponse>({
    queryKey: ['settings', 'search_params'],
    queryFn: () => apiClient.get('/settings/search_params'),
  })

  const saveMutation = useMutation({
    mutationFn: (params: SearchParams) =>
      apiClient.put('/settings/search_params', { value: params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'search_params'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => apiClient.put('/settings/search_params/reset', { value: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'search_params'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  // Initialize local state from fetched settings
  useEffect(() => {
    if (!paramsData?.value || initialized) return
    setLocalParams(paramsData.value)
    setInitialized(true)
  }, [paramsData, initialized])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await saveMutation.mutateAsync(localParams)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    setSaved(false)
    try {
      await resetMutation.mutateAsync()
      setLocalParams(DEFAULT_PARAMS)
    } finally {
      setResetting(false)
    }
  }

  const updateParam = (key: keyof SearchParams, value: number) => {
    setLocalParams((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
        검색 알고리즘 파라미터
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        하이브리드 검색, 전문 검색, 트라이그램, 통합 검색의 가중치와 임계값을 조정합니다.
      </p>

      <div className="space-y-6">
        {/* Group 1: Hybrid RRF */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            하이브리드 검색 (Hybrid RRF)
          </h4>
          <div className="space-y-4">
            <SliderParam
              label="RRF K"
              value={localParams.rrf_k}
              min={10}
              max={200}
              step={5}
              description="RRF 스무딩 상수 (값이 작을수록 상위 결과 강조)"
              onChange={(v) => updateParam('rrf_k', v)}
            />
            <SliderParam
              label="FTS 가중치"
              value={localParams.fts_weight}
              min={0}
              max={1.0}
              step={0.05}
              description="전문 검색 가중치 (영어/기본)"
              onChange={(v) => updateParam('fts_weight', v)}
            />
            <SliderParam
              label="시맨틱 가중치"
              value={localParams.semantic_weight}
              min={0}
              max={1.0}
              step={0.05}
              description="의미 검색 가중치 (영어/기본)"
              onChange={(v) => updateParam('semantic_weight', v)}
            />
            <SliderParam
              label="FTS 가중치 (한국어)"
              value={localParams.fts_weight_korean}
              min={0}
              max={1.0}
              step={0.05}
              description="전문 검색 가중치 (한국어)"
              onChange={(v) => updateParam('fts_weight_korean', v)}
            />
            <SliderParam
              label="시맨틱 가중치 (한국어)"
              value={localParams.semantic_weight_korean}
              min={0}
              max={1.0}
              step={0.05}
              description="의미 검색 가중치 (한국어)"
              onChange={(v) => updateParam('semantic_weight_korean', v)}
            />
          </div>
        </div>

        {/* Group 2: FTS */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            전문 검색 (FTS)
          </h4>
          <div className="space-y-4">
            <SliderParam
              label="제목 가중치"
              value={localParams.title_weight}
              min={1}
              max={10}
              step={0.5}
              description="제목 부스트 배수"
              onChange={(v) => updateParam('title_weight', v)}
            />
            <SliderParam
              label="본문 가중치"
              value={localParams.content_weight}
              min={0.5}
              max={5}
              step={0.5}
              description="본문 가중치"
              onChange={(v) => updateParam('content_weight', v)}
            />
          </div>
        </div>

        {/* Group 3: Trigram */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            트라이그램 퍼지 검색 (Trigram)
          </h4>
          <div className="space-y-4">
            <SliderParam
              label="한국어 유사도 임계값"
              value={localParams.trigram_threshold_ko}
              min={0.01}
              max={0.5}
              step={0.01}
              description="한국어 최소 유사도 (낮을수록 결과 많음)"
              onChange={(v) => updateParam('trigram_threshold_ko', v)}
            />
            <SliderParam
              label="영어 유사도 임계값"
              value={localParams.trigram_threshold_en}
              min={0.01}
              max={0.5}
              step={0.01}
              description="영어 최소 유사도 (낮을수록 결과 많음)"
              onChange={(v) => updateParam('trigram_threshold_en', v)}
            />
            <SliderParam
              label="제목 부스트"
              value={localParams.trigram_title_weight}
              min={1}
              max={10}
              step={0.5}
              description="트라이그램 제목 가중치"
              onChange={(v) => updateParam('trigram_title_weight', v)}
            />
          </div>
        </div>

        {/* Group 4: Unified */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            통합 검색 (Unified)
          </h4>
          <div className="space-y-4">
            <SliderParam
              label="FTS 가중치"
              value={localParams.unified_fts_weight}
              min={0}
              max={1.0}
              step={0.05}
              description="통합 검색에서 FTS 가중치"
              onChange={(v) => updateParam('unified_fts_weight', v)}
            />
            <SliderParam
              label="트라이그램 가중치"
              value={localParams.unified_trigram_weight}
              min={0}
              max={1.0}
              step={0.05}
              description="통합 검색에서 트라이그램 가중치"
              onChange={(v) => updateParam('unified_trigram_weight', v)}
            />
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || resetting}
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
        <button
          onClick={handleReset}
          disabled={saving || resetting}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md',
            'bg-muted text-muted-foreground',
            'hover:bg-muted/80 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {resetting ? '초기화 중...' : '초기화'}
        </button>
        {saved && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">저장되었습니다</span>
          </div>
        )}
      </div>

      {saveMutation.isError && (
        <div
          className="mt-4 flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
          role="alert"
        >
          <span className="text-sm text-destructive">저장에 실패했습니다</span>
        </div>
      )}

      {resetMutation.isError && (
        <div
          className="mt-4 flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
          role="alert"
        >
          <span className="text-sm text-destructive">초기화에 실패했습니다</span>
        </div>
      )}
    </div>
  )
}

interface SliderParamProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  description: string
  onChange: (value: number) => void
}

function SliderParam({ label, value, min, max, step, description, onChange }: SliderParamProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-sm font-mono tabular-nums">{value.toFixed(step >= 1 ? 0 : 2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
      />
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
  )
}
