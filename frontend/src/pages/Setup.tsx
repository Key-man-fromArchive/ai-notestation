import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FlaskConical, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient, ApiError } from '@/lib/api'
import {
  useSetupLanguage,
  useSetupAdmin,
  useSetupAI,
  useSetupDataSource,
  useSetupComplete,
  useSetupStatus,
} from '@/hooks/useSetup'
import StepLanguage from './setup/StepLanguage'
import StepAdmin from './setup/StepAdmin'
import StepAI from './setup/StepAI'
import StepDataSource from './setup/StepDataSource'
import StepSummary from './setup/StepSummary'
import i18n from '@/lib/i18n'

const TOTAL_STEPS = 5

export default function Setup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)

  // Wizard data
  const [language, setLanguage] = useState('ko')
  const [admin, setAdmin] = useState({
    email: '',
    password: '',
    name: '',
    org_name: '',
    org_slug: '',
  })
  const [ai, setAI] = useState<Record<string, string>>({})
  const [datasource, setDataSource] = useState({
    skip: true,
    nas_url: '',
    nas_port: '',
    nas_account: '',
    nas_password: '',
  })

  // Check if already initialized
  const { data: status } = useSetupStatus()
  const setupLanguage = useSetupLanguage()
  const setupAdmin = useSetupAdmin()
  const setupAI = useSetupAI()
  const setupDataSource = useSetupDataSource()
  const setupComplete = useSetupComplete()

  if (status?.initialized) {
    navigate('/', { replace: true })
    return null
  }

  const handleNext = async () => {
    setError(null)
    try {
      switch (step) {
        case 1:
          await setupLanguage.mutateAsync({ language })
          i18n.changeLanguage(language)
          localStorage.setItem('language', language)
          break
        case 2: {
          const isValidSlug = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/.test(admin.org_slug)
          if (!admin.email || admin.password.length < 8 || !admin.org_name || !isValidSlug) {
            setError(t('setup.fillAllFields'))
            return
          }
          await setupAdmin.mutateAsync(admin)
          break
        }
        case 3: {
          const providers = Object.entries(ai)
            .filter(([, v]) => v?.trim())
            .map(([k, v]) => ({ provider: k, api_key: v.trim() }))
          await setupAI.mutateAsync({ providers, test: false })
          break
        }
        case 4: {
          const dsData = datasource.skip
            ? { skip: true }
            : {
                skip: false,
                nas_url: datasource.nas_url,
                nas_port: datasource.nas_port ? parseInt(datasource.nas_port) : undefined,
                nas_account: datasource.nas_account || undefined,
                nas_password: datasource.nas_password || undefined,
              }
          await setupDataSource.mutateAsync(dsData)
          break
        }
      }
      setStep((s) => Math.min(s + 1, TOTAL_STEPS))
    } catch (err) {
      if (err instanceof ApiError) {
        try {
          const body = JSON.parse(err.body)
          setError(body.detail || t('common.unknownError'))
        } catch {
          setError(err.body || t('common.unknownError'))
        }
      } else {
        setError(t('common.networkError'))
      }
    }
  }

  const handleComplete = async () => {
    setError(null)
    try {
      const result = await setupComplete.mutateAsync()
      apiClient.setToken(result.access_token)
      apiClient.setRefreshToken(result.refresh_token)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        try {
          const body = JSON.parse(err.body)
          setError(body.detail || t('common.unknownError'))
        } catch {
          setError(err.body || t('common.unknownError'))
        }
      } else {
        setError(t('common.networkError'))
      }
    }
  }

  const canProceed = () => {
    switch (step) {
      case 1:
        return !!language
      case 2: {
        const isValidSlug = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/.test(admin.org_slug)
        return !!admin.email && admin.password.length >= 8 && !!admin.org_name && isValidSlug
      }
      case 3:
        return true // AI keys are optional
      case 4:
        return true // Can skip
      default:
        return true
    }
  }

  const stepLabels = [
    t('setup.stepLanguage'),
    t('setup.stepAdmin'),
    t('setup.stepAI'),
    t('setup.stepDataSource'),
    t('setup.stepSummary'),
  ]

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-[520px]">
        <div className="rounded-xl border border-border bg-card shadow-sm p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 mb-3">
              <FlaskConical className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">LabNote AI</h1>
            <p className="text-sm text-muted-foreground mt-1">{t('setup.title')}</p>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between mb-2">
              {stepLabels.map((label, i) => (
                <span
                  key={i}
                  className={cn(
                    'text-xs',
                    i + 1 <= step ? 'text-primary font-medium' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Step content */}
          {step === 1 && <StepLanguage language={language} onSelect={setLanguage} />}
          {step === 2 && <StepAdmin data={admin} onChange={setAdmin} />}
          {step === 3 && <StepAI data={ai} onChange={setAI} />}
          {step === 4 && <StepDataSource data={datasource} onChange={setDataSource} />}
          {step === 5 && (
            <StepSummary
              wizardData={{ language, admin, ai, datasource }}
              isCompleting={setupComplete.isPending}
              onComplete={handleComplete}
            />
          )}

          {/* Navigation */}
          {step < TOTAL_STEPS && (
            <div className="flex justify-between mt-8">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(s - 1, 1))}
                disabled={step === 1}
                className={cn(
                  'inline-flex h-10 items-center justify-center rounded-lg px-6',
                  'border border-input bg-background text-sm font-medium',
                  'hover:bg-muted transition-colors',
                  'disabled:pointer-events-none disabled:opacity-50',
                )}
              >
                {t('common.back')}
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed()}
                className={cn(
                  'inline-flex h-10 items-center justify-center rounded-lg px-6',
                  'bg-primary text-primary-foreground text-sm font-medium',
                  'hover:bg-primary/90 transition-colors',
                  'disabled:pointer-events-none disabled:opacity-50',
                )}
              >
                {t('setup.next')}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          LabNote AI — Research Management Platform
        </p>
      </div>
    </div>
  )
}
