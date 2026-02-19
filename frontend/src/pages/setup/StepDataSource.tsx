import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface DataSourceData {
  skip: boolean
  nas_url: string
  nas_port: string
  nas_account: string
  nas_password: string
}

interface StepDataSourceProps {
  data: DataSourceData
  onChange: (data: DataSourceData) => void
}

export default function StepDataSource({ data, onChange }: StepDataSourceProps) {
  const { t } = useTranslation()
  const [showForm, setShowForm] = useState(!data.skip)

  const inputClass = cn(
    'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
    'text-sm text-foreground placeholder:text-muted-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  )

  const handleSkipToggle = (skip: boolean) => {
    setShowForm(!skip)
    onChange({ ...data, skip })
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          {t('setup.datasourceTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {t('setup.datasourceSubtitle')}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handleSkipToggle(true)}
          className={cn(
            'flex-1 p-4 rounded-lg border-2 text-center transition-all',
            data.skip
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/30',
          )}
        >
          <p className="font-medium text-sm">{t('setup.datasourceSkip')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('setup.datasourceSkipDesc')}</p>
        </button>
        <button
          type="button"
          onClick={() => handleSkipToggle(false)}
          className={cn(
            'flex-1 p-4 rounded-lg border-2 text-center transition-all',
            !data.skip
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/30',
          )}
        >
          <p className="font-medium text-sm">{t('setup.datasourceConnect')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('setup.datasourceConnectDesc')}</p>
        </button>
      </div>

      {showForm && (
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label htmlFor="nas-url" className="text-sm font-medium text-foreground">
                {t('setup.nasUrl')}
              </label>
              <input
                id="nas-url"
                type="text"
                value={data.nas_url}
                onChange={(e) => onChange({ ...data, nas_url: e.target.value })}
                className={inputClass}
                placeholder="192.168.1.100"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="nas-port" className="text-sm font-medium text-foreground">
                {t('setup.nasPort')}
              </label>
              <input
                id="nas-port"
                type="number"
                value={data.nas_port}
                onChange={(e) => onChange({ ...data, nas_port: e.target.value })}
                className={inputClass}
                placeholder="5001"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="nas-account" className="text-sm font-medium text-foreground">
              {t('setup.nasAccount')}
            </label>
            <input
              id="nas-account"
              type="text"
              value={data.nas_account}
              onChange={(e) => onChange({ ...data, nas_account: e.target.value })}
              className={inputClass}
              placeholder="admin"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="nas-password" className="text-sm font-medium text-foreground">
              {t('setup.nasPassword')}
            </label>
            <input
              id="nas-password"
              type="password"
              value={data.nas_password}
              onChange={(e) => onChange({ ...data, nas_password: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      )}
    </div>
  )
}
