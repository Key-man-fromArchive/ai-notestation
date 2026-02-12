// @TASK P5-T5.3 - AI Workbench 페이지
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#ai-workbench-페이지
// @TEST src/__tests__/AIWorkbench.test.tsx

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { AIChat } from '@/components/AIChat'
import { ModelSelector } from '@/components/ModelSelector'
import { cn } from '@/lib/utils'
import {
  Lightbulb,
  MessageSquare,
  FileEdit,
  CheckCircle,
  FileType,
  AlertCircle,
} from 'lucide-react'

type AIFeature = 'insight' | 'search_qa' | 'writing' | 'spellcheck' | 'template'

export default function AIWorkbench() {
  const { t } = useTranslation()

  const features: {
    id: AIFeature
    name: string
    icon: React.ComponentType<{ className?: string }>
    description: string
  }[] = [
    {
      id: 'insight',
      name: t('ai.insightFeatures.insight'),
      icon: Lightbulb,
      description: t('ai.generateInsight'),
    },
    {
      id: 'search_qa',
      name: t('search.askAI'),
      icon: MessageSquare,
      description: t('search.aiAnswer'),
    },
    {
      id: 'writing',
      name: t('ai.insightFeatures.writing'),
      icon: FileEdit,
      description: t('ai.writing'),
    },
    {
      id: 'spellcheck',
      name: t('ai.insightFeatures.spellcheck'),
      icon: CheckCircle,
      description: t('ai.spellcheck'),
    },
    {
      id: 'template',
      name: t('ai.insightFeatures.template'),
      icon: FileType,
      description: t('ai.template'),
    },
  ]
  const [selectedFeature, setSelectedFeature] = useState<AIFeature>('insight')
  const [selectedModel, setSelectedModel] = useState('')

  // AI 키 설정 확인
  const { isError: isKeyMissing } = useQuery({
    queryKey: ['ai', 'models'],
    queryFn: () => apiClient.get('/ai/models'),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">{t('ai.workbench')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.aiAnalysisDesc')}
        </p>
      </div>

      {/* AI 키 미설정 배너 */}
      {isKeyMissing && (
        <div
          className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg"
          role="alert"
        >
          <AlertCircle
            className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1">
            <h3 className="font-semibold text-destructive mb-1">
              {t('ai.noModel')}
            </h3>
            <p className="text-sm text-destructive/80 mb-2">
              {t('ai.noModelDesc')}
            </p>
            <Link
              to="/settings"
              className="inline-block px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm hover:bg-destructive/90 transition-colors"
            >
              {t('dashboard.goToSettings')}
            </Link>
          </div>
        </div>
      )}

      {/* 기능 선택 탭 */}
      <div>
        <h3 className="text-sm font-semibold mb-2">{t('ai.feature')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2" role="tablist">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <button
                key={feature.id}
                onClick={() => setSelectedFeature(feature.id)}
                role="tab"
                aria-selected={selectedFeature === feature.id}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-md',
                  'transition-all duration-200 motion-reduce:transition-none',
                  'border-2',
                  selectedFeature === feature.id
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent bg-muted hover:bg-muted/80'
                )}
              >
                <Icon
                  className={cn(
                    'h-6 w-6',
                    selectedFeature === feature.id
                      ? 'text-primary'
                      : 'text-muted-foreground'
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'text-sm font-medium',
                    selectedFeature === feature.id
                      ? 'text-primary'
                      : 'text-foreground'
                  )}
                >
                  {feature.name}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {features.find((f) => f.id === selectedFeature)?.description}
        </p>
      </div>

      {/* 모델 선택 */}
      <div>
        <label htmlFor="model-selector" className="text-sm font-semibold mb-2 block">
          {t('ai.model')}
        </label>
        <ModelSelector
          value={selectedModel}
          onChange={setSelectedModel}
          className="w-full md:w-64"
        />
      </div>

      {/* AI 채팅 */}
      <div role="tabpanel">
        <AIChat feature={selectedFeature} model={selectedModel} />
      </div>
    </div>
  )
}
