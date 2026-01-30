// @TASK P5-T5.3 - AI Workbench 페이지
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#ai-workbench-페이지
// @TEST src/__tests__/AIWorkbench.test.tsx

import { useState } from 'react'
import { Link } from 'react-router-dom'
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

const features: {
  id: AIFeature
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}[] = [
  {
    id: 'insight',
    name: '인사이트',
    icon: Lightbulb,
    description: '노트에서 핵심 인사이트 도출',
  },
  {
    id: 'search_qa',
    name: '검색 QA',
    icon: MessageSquare,
    description: '검색 결과 기반 질의응답',
  },
  {
    id: 'writing',
    name: '작성',
    icon: FileEdit,
    description: '연구노트 작성 지원',
  },
  {
    id: 'spellcheck',
    name: '교정',
    icon: CheckCircle,
    description: '맞춤법 및 문법 교정',
  },
  {
    id: 'template',
    name: '템플릿',
    icon: FileType,
    description: '노트 템플릿 생성',
  },
]

export default function AIWorkbench() {
  const [selectedFeature, setSelectedFeature] = useState<AIFeature>('insight')
  const [selectedModel, setSelectedModel] = useState('gpt-4')

  // AI 키 설정 확인
  const { isError: isKeyMissing } = useQuery({
    queryKey: ['ai', 'models'],
    queryFn: () => apiClient.get('/ai/models'),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">AI Workbench</h2>
        <p className="text-muted-foreground">
          AI를 활용하여 노트를 분석하고 작성하세요
        </p>
      </div>

      {/* AI 키 미설정 배너 */}
      {isKeyMissing && (
        <div
          className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-md"
          role="alert"
        >
          <AlertCircle
            className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1">
            <h3 className="font-semibold text-destructive mb-1">
              AI API 키가 설정되지 않았습니다
            </h3>
            <p className="text-sm text-destructive/80 mb-2">
              AI 기능을 사용하려면 API 키를 설정해야 합니다.
            </p>
            <Link
              to="/settings"
              className="inline-block px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm hover:bg-destructive/90 transition-colors"
            >
              설정으로 이동
            </Link>
          </div>
        </div>
      )}

      {/* 기능 선택 탭 */}
      <div>
        <h3 className="text-sm font-semibold mb-2">기능 선택</h3>
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
          AI 모델
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
