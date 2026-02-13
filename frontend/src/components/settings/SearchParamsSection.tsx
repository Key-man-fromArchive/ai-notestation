import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiClient } from '@/lib/api'
import { Save, RotateCcw, CheckCircle, SlidersHorizontal, HelpCircle, X } from 'lucide-react'
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
  adaptive_enabled: number
  adaptive_semantic_min_words: number
  adaptive_short_query_max_words: number
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
  adaptive_enabled: 1,
  adaptive_semantic_min_words: 3,
  adaptive_short_query_max_words: 2,
}

export function SearchParamsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [localParams, setLocalParams] = useState<SearchParams>(DEFAULT_PARAMS)
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          검색 알고리즘 파라미터
        </h3>
        <button
          onClick={() => setShowHelp(true)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm',
            'border border-input text-muted-foreground',
            'hover:bg-muted hover:text-foreground transition-colors',
          )}
        >
          <HelpCircle className="h-4 w-4" aria-hidden="true" />
          {t('common.help', 'Help')}
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.searchParamsDesc')}
      </p>

      {showHelp && <SearchParamsHelpModal onClose={() => setShowHelp(false)} />}

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

        {/* Group 5: Adaptive Search Strategy */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            적응형 검색 전략 (Adaptive)
          </h4>
          <div className="space-y-4">
            <ToggleParam
              label="적응형 검색 활성화"
              checked={localParams.adaptive_enabled === 1}
              description="쿼리 특성에 따라 검색 엔진을 자동 선택하여 비용 절감 및 속도 향상"
              onChange={(checked) => updateParam('adaptive_enabled', checked ? 1 : 0)}
            />
            <SliderParam
              label="시맨틱 검색 최소 단어 수"
              value={localParams.adaptive_semantic_min_words}
              min={1}
              max={10}
              step={1}
              description="이 단어 수 이상이어야 시맨틱 검색을 실행"
              onChange={(v) => updateParam('adaptive_semantic_min_words', v)}
            />
            <SliderParam
              label="짧은 쿼리 기준 단어 수"
              value={localParams.adaptive_short_query_max_words}
              min={1}
              max={5}
              step={1}
              description="이 단어 수 이하면 FTS 전용 (시맨틱 스킵)"
              onChange={(v) => updateParam('adaptive_short_query_max_words', v)}
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
          {saving ? t('common.saving') : t('common.save')}
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
          {resetting ? t('common.resetting', 'Resetting...') : t('common.reset', 'Reset')}
        </button>
        {saved && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">{t('common.saved')}</span>
          </div>
        )}
      </div>

      {saveMutation.isError && (
        <div
          className="mt-4 flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
          role="alert"
        >
          <span className="text-sm text-destructive">{t('settings.settingsSaveFailed')}</span>
        </div>
      )}

      {resetMutation.isError && (
        <div
          className="mt-4 flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
          role="alert"
        >
          <span className="text-sm text-destructive">{t('common.resetFailed', 'Reset failed')}</span>
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

// ---------------------------------------------------------------------------
// Help Modal
// ---------------------------------------------------------------------------

function SearchParamsHelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-background border border-input rounded-lg shadow-lg w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-input px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('settings.searchParams')} {t('common.help', 'Help')}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-6 text-sm">
          {/* Overview */}
          <section>
            <h3 className="font-semibold text-base mb-2">검색 시스템 구조</h3>
            <p className="text-muted-foreground leading-relaxed">
              LabNote AI는 3가지 검색 엔진을 조합하여 결과를 제공합니다.
            </p>
            <ul className="mt-2 space-y-1 text-muted-foreground list-disc list-inside">
              <li><strong className="text-foreground">FTS (전문 검색)</strong> — PostgreSQL tsvector 기반, 형태소 분석으로 정확한 키워드 매칭</li>
              <li><strong className="text-foreground">시맨틱 검색</strong> — AI 임베딩 기반, 의미적으로 유사한 노트를 찾음</li>
              <li><strong className="text-foreground">트라이그램 (Trigram)</strong> — 글자 단위 유사도, 오타나 부분 일치에 강함</li>
            </ul>
            <div className="mt-3 p-3 bg-muted/50 rounded-md text-xs text-muted-foreground">
              <strong className="text-foreground">검색 파이프라인:</strong>{' '}
              일반 검색 = FTS + Trigram (통합 검색) | AI 검색 = FTS + 시맨틱 (하이브리드 검색)
            </div>
          </section>

          <hr className="border-input" />

          {/* Group 1 */}
          <section>
            <h3 className="font-semibold text-base mb-2">하이브리드 검색 (Hybrid RRF)</h3>
            <p className="text-muted-foreground mb-3 leading-relaxed">
              FTS와 시맨틱 검색 결과를 RRF(Reciprocal Rank Fusion) 알고리즘으로 병합합니다.
              AI 검색 활성화 시 사용됩니다.
            </p>
            <dl className="space-y-3">
              <HelpItem
                term="RRF K"
                desc="RRF 공식의 스무딩 상수입니다. 값이 작으면 상위 순위 결과에 큰 점수 차이를 부여하고, 값이 크면 순위 간 점수 차이가 줄어듭니다."
                tip="기본값 60 권장. 상위 3~5개 결과의 정확도가 중요하면 30~40으로 낮추세요."
              />
              <HelpItem
                term="FTS 가중치 / 시맨틱 가중치"
                desc="영어 및 기본 언어 검색 시 각 엔진의 비중입니다. FTS가 높으면 키워드 일치를 우선하고, 시맨틱이 높으면 의미적 유사성을 우선합니다."
                tip="정확한 용어 검색이 중요하면 FTS를 높이세요 (예: 0.7/0.3). 개념적 검색이 중요하면 시맨틱을 높이세요."
              />
              <HelpItem
                term="FTS 가중치 (한국어) / 시맨틱 가중치 (한국어)"
                desc="한국어 검색에 별도 적용되는 가중치입니다. 한국어는 형태소 분석 품질에 따라 FTS 정확도가 달라지므로 별도 튜닝이 필요합니다."
                tip="기본값(0.7/0.3)은 한국어 FTS를 더 신뢰하는 설정입니다. 임베딩 모델이 한국어에 강하면 시맨틱을 올려보세요."
              />
            </dl>
          </section>

          <hr className="border-input" />

          {/* Group 2 */}
          <section>
            <h3 className="font-semibold text-base mb-2">전문 검색 (FTS)</h3>
            <p className="text-muted-foreground mb-3 leading-relaxed">
              PostgreSQL tsvector를 사용한 키워드 기반 검색입니다. 제목과 본문에 각각 다른 가중치를 적용합니다.
            </p>
            <dl className="space-y-3">
              <HelpItem
                term="제목 가중치"
                desc="제목에서 키워드가 발견되었을 때의 점수 배수입니다. 기본값 3.0이면 제목 매칭이 본문 매칭보다 3배 높은 점수를 받습니다."
                tip="제목 매칭을 더 강조하려면 5.0 이상으로 올리세요. 본문 내용이 더 중요하면 2.0 이하로 낮추세요."
              />
              <HelpItem
                term="본문 가중치"
                desc="본문에서 키워드가 발견되었을 때의 기본 점수 배수입니다. 문서 길이로 정규화된 후 이 가중치가 적용됩니다."
                tip="대부분의 경우 1.0이 적절합니다. 긴 노트의 본문 매칭을 더 높이려면 1.5~2.0으로 올려보세요."
              />
            </dl>
          </section>

          <hr className="border-input" />

          {/* Group 3 */}
          <section>
            <h3 className="font-semibold text-base mb-2">트라이그램 퍼지 검색 (Trigram)</h3>
            <p className="text-muted-foreground mb-3 leading-relaxed">
              pg_trgm 확장을 사용한 글자 단위 유사도 검색입니다. 오타, 부분 일치, 유사한 철자를 찾는 데 유용합니다.
            </p>
            <dl className="space-y-3">
              <HelpItem
                term="한국어 / 영어 유사도 임계값"
                desc="이 값 이상의 유사도를 가진 노트만 결과에 포함됩니다. 낮추면 더 많은 결과가 나오지만 관련성이 떨어질 수 있습니다."
                tip="검색 결과가 너무 적으면 임계값을 낮추세요 (한국어: 0.08~0.12, 영어: 0.05~0.08). 노이즈가 많으면 올리세요."
              />
              <HelpItem
                term="제목 부스트"
                desc="트라이그램 검색에서 제목 유사도에 적용되는 배수입니다. FTS의 제목 가중치와 동일한 역할을 합니다."
                tip="FTS 제목 가중치와 비슷한 값으로 맞추면 일관된 결과를 얻을 수 있습니다."
              />
            </dl>
          </section>

          <hr className="border-input" />

          {/* Group 4 */}
          <section>
            <h3 className="font-semibold text-base mb-2">통합 검색 (Unified)</h3>
            <p className="text-muted-foreground mb-3 leading-relaxed">
              일반 검색 모드에서 FTS와 Trigram 결과를 RRF로 병합할 때의 가중치입니다.
              시맨틱 검색 없이 빠르게 결과를 제공합니다.
            </p>
            <dl className="space-y-3">
              <HelpItem
                term="FTS 가중치 / 트라이그램 가중치"
                desc="통합 검색에서 각 엔진의 비중입니다. FTS가 높으면 정확한 키워드 매칭을 우선하고, 트라이그램이 높으면 퍼지 매칭을 우선합니다."
                tip="기본값(0.65/0.35)은 정확한 매칭을 우선하면서 오타도 보완합니다. 오타 허용을 높이려면 트라이그램을 0.4~0.5로 올리세요."
              />
            </dl>
          </section>

          <hr className="border-input" />

          {/* Quick recipes */}
          <section>
            <h3 className="font-semibold text-base mb-2">추천 프리셋</h3>
            <div className="space-y-2">
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="font-medium text-foreground">정확도 우선 (Precision)</p>
                <p className="text-xs text-muted-foreground mt-1">
                  제목 가중치 5.0 | FTS 가중치(한국어) 0.80 | 트라이그램 임계값 0.20 이상
                </p>
              </div>
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="font-medium text-foreground">재현율 우선 (Recall)</p>
                <p className="text-xs text-muted-foreground mt-1">
                  제목 가중치 2.0 | 시맨틱 가중치 0.50 | 트라이그램 임계값 0.05~0.08
                </p>
              </div>
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="font-medium text-foreground">균형 (기본값)</p>
                <p className="text-xs text-muted-foreground mt-1">
                  모든 값을 기본값으로 유지. 초기화 버튼으로 복원 가능.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-background border-t border-input px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className={cn(
              'px-4 py-2 rounded-md text-sm',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
            )}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ToggleParamProps {
  label: string
  checked: boolean
  description: string
  onChange: (checked: boolean) => void
}

function ToggleParam({ label, checked, description, onChange }: ToggleParamProps) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
      <div className="min-w-0">
        <span className="text-sm font-medium">{label}</span>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  )
}

function HelpItem({ term, desc, tip }: { term: string; desc: string; tip: string }) {
  return (
    <div>
      <dt className="font-medium text-foreground">{term}</dt>
      <dd className="text-muted-foreground mt-0.5 leading-relaxed">{desc}</dd>
      <dd className="text-xs mt-1 text-primary/80 flex gap-1">
        <span className="shrink-0">Tip:</span> {tip}
      </dd>
    </div>
  )
}
