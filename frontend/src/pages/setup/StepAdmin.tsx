import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

interface AdminData {
  email: string
  password: string
  name: string
  org_name: string
  org_slug: string
}

interface StepAdminProps {
  data: AdminData
  onChange: (data: AdminData) => void
}

export default function StepAdmin({ data, onChange }: StepAdminProps) {
  const { t } = useTranslation()
  const [autoSlug, setAutoSlug] = useState(true)

  const inputClass = cn(
    'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
    'text-sm text-foreground placeholder:text-muted-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  )

  const handleOrgNameChange = (value: string) => {
    onChange({
      ...data,
      org_name: value,
      ...(autoSlug ? { org_slug: slugify(value) } : {}),
    })
  }

  const handleSlugChange = (value: string) => {
    setAutoSlug(false)
    onChange({ ...data, org_slug: value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
  }

  const isValidSlug = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/.test(data.org_slug)

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          {t('setup.adminTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {t('setup.adminSubtitle')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="setup-email" className="text-sm font-medium text-foreground">
            {t('common.email')}
          </label>
          <input
            id="setup-email"
            type="email"
            value={data.email}
            onChange={(e) => onChange({ ...data, email: e.target.value })}
            required
            autoComplete="email"
            className={inputClass}
            placeholder="admin@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="setup-password" className="text-sm font-medium text-foreground">
            {t('common.password')}
          </label>
          <input
            id="setup-password"
            type="password"
            value={data.password}
            onChange={(e) => onChange({ ...data, password: e.target.value })}
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
            placeholder={t('setup.passwordPlaceholder')}
          />
          {data.password && data.password.length < 8 && (
            <p className="text-xs text-destructive">{t('setup.passwordMinLength')}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="setup-name" className="text-sm font-medium text-foreground">
            {t('setup.yourName')}
          </label>
          <input
            id="setup-name"
            type="text"
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            autoComplete="name"
            className={inputClass}
            placeholder={t('setup.namePlaceholder')}
          />
        </div>

        <div className="pt-3 border-t border-border space-y-4">
          <p className="text-xs text-muted-foreground">{t('setup.orgDetails')}</p>

          <div className="space-y-1.5">
            <label htmlFor="setup-org-name" className="text-sm font-medium text-foreground">
              {t('setup.orgName')}
            </label>
            <input
              id="setup-org-name"
              type="text"
              value={data.org_name}
              onChange={(e) => handleOrgNameChange(e.target.value)}
              required
              className={inputClass}
              placeholder={t('setup.orgNamePlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="setup-org-slug" className="text-sm font-medium text-foreground">
              {t('setup.orgSlug')}
            </label>
            <input
              id="setup-org-slug"
              type="text"
              value={data.org_slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              required
              className={cn(
                inputClass,
                data.org_slug && !isValidSlug && 'border-destructive',
              )}
              placeholder="my-lab"
            />
            {data.org_slug && !isValidSlug && (
              <p className="text-xs text-destructive">{t('setup.slugValidation')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
