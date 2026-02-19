import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle, Cpu, HardDrive, MemoryStick } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSystemInfo } from '@/hooks/useSetup'

interface SummaryProps {
  wizardData: {
    language: string
    admin: { email: string; name: string; org_name: string; org_slug: string }
    ai: { [key: string]: string }
    datasource: { skip: boolean; nas_url: string }
  }
  isCompleting: boolean
  onComplete: () => void
}

export default function StepSummary({ wizardData, isCompleting, onComplete }: SummaryProps) {
  const { t } = useTranslation()
  const { data: systemInfo } = useSystemInfo()

  const configuredProviders = Object.entries(wizardData.ai)
    .filter(([, v]) => v?.trim())
    .map(([k]) => k)

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          {t('setup.summaryTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {t('setup.summarySubtitle')}
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="text-sm font-medium text-foreground">{t('setup.summaryLanguage')}</h3>
          <p className="text-sm text-muted-foreground">
            {wizardData.language === 'ko' ? '한국어' : 'English'}
          </p>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="text-sm font-medium text-foreground">{t('setup.summaryAdmin')}</h3>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>{wizardData.admin.email}</p>
            <p>{wizardData.admin.org_name} ({wizardData.admin.org_slug})</p>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="text-sm font-medium text-foreground">{t('setup.summaryAI')}</h3>
          <p className="text-sm text-muted-foreground">
            {configuredProviders.length > 0
              ? configuredProviders.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')
              : t('setup.summaryNoAI')}
          </p>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="text-sm font-medium text-foreground">{t('setup.summaryDataSource')}</h3>
          <p className="text-sm text-muted-foreground">
            {wizardData.datasource.skip
              ? t('setup.summaryDatasourceSkipped')
              : wizardData.datasource.nas_url}
          </p>
        </div>

        {systemInfo && (
          <div className="rounded-lg border border-border p-4 space-y-2">
            <h3 className="text-sm font-medium text-foreground">{t('setup.summarySystem')}</h3>
            <div className="grid grid-cols-3 gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                <span>{systemInfo.cpu_count} cores</span>
              </div>
              <div className="flex items-center gap-2">
                <MemoryStick className="h-4 w-4" />
                <span>{systemInfo.memory_gb} GB</span>
              </div>
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                <span>{systemInfo.disk_free_gb} GB free</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onComplete}
        disabled={isCompleting}
        className={cn(
          'inline-flex h-11 w-full items-center justify-center rounded-lg',
          'bg-primary text-primary-foreground font-medium text-sm',
          'hover:bg-primary/90 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        {isCompleting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('setup.completing')}
          </>
        ) : (
          <>
            <CheckCircle className="mr-2 h-4 w-4" />
            {t('setup.completeSetup')}
          </>
        )}
      </button>
    </div>
  )
}
