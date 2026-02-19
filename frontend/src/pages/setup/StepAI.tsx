import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSetupAI, type AITestResult } from '@/hooks/useSetup'

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'google', name: 'Google AI', placeholder: 'AI...' },
  { id: 'zhipuai', name: 'ZhipuAI', placeholder: '...' },
] as const

interface AIData {
  [key: string]: string
}

interface StepAIProps {
  data: AIData
  onChange: (data: AIData) => void
}

export default function StepAI({ data, onChange }: StepAIProps) {
  const { t } = useTranslation()
  const [testResults, setTestResults] = useState<AITestResult[] | null>(null)
  const setupAI = useSetupAI()

  const inputClass = cn(
    'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
    'text-sm text-foreground placeholder:text-muted-foreground font-mono',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  )

  const hasAnyKey = PROVIDERS.some((p) => data[p.id]?.trim())

  const handleTest = async () => {
    const providers = PROVIDERS
      .filter((p) => data[p.id]?.trim())
      .map((p) => ({ provider: p.id, api_key: data[p.id].trim() }))

    if (!providers.length) return

    const result = await setupAI.mutateAsync({ providers, test: true })
    setTestResults(result.test_results)
  }

  const getTestResult = (providerId: string) =>
    testResults?.find((r) => r.provider.toLowerCase().includes(providerId))

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          {t('setup.aiTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {t('setup.aiSubtitle')}
        </p>
      </div>

      <div className="space-y-4">
        {PROVIDERS.map((provider) => {
          const result = getTestResult(provider.id)
          return (
            <div key={provider.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={`ai-${provider.id}`}
                  className="text-sm font-medium text-foreground"
                >
                  {provider.name}
                </label>
                {result && (
                  <span className={cn('flex items-center gap-1 text-xs',
                    result.success ? 'text-green-600' : 'text-destructive'
                  )}>
                    {result.success
                      ? <><CheckCircle className="h-3.5 w-3.5" /> {t('setup.aiConnected')}</>
                      : <><XCircle className="h-3.5 w-3.5" /> {t('setup.aiFailed')}</>
                    }
                  </span>
                )}
              </div>
              <input
                id={`ai-${provider.id}`}
                type="password"
                value={data[provider.id] || ''}
                onChange={(e) => {
                  onChange({ ...data, [provider.id]: e.target.value })
                  setTestResults(null)
                }}
                className={inputClass}
                placeholder={provider.placeholder}
              />
            </div>
          )
        })}
      </div>

      {hasAnyKey && (
        <button
          type="button"
          onClick={handleTest}
          disabled={setupAI.isPending}
          className={cn(
            'inline-flex h-9 items-center justify-center rounded-lg px-4',
            'border border-input bg-background text-sm font-medium',
            'hover:bg-muted transition-colors',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {setupAI.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('setup.aiTesting')}
            </>
          ) : (
            t('setup.aiTestConnection')
          )}
        </button>
      )}

      <p className="text-xs text-muted-foreground">
        {t('setup.aiNote')}
      </p>
    </div>
  )
}
