import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Save } from 'lucide-react'
import type { Setting } from './types'

interface SettingRowProps {
  setting: Setting
  currentValue: string
  editingKey: string | null
  editValue: string
  isPending: boolean
  onEdit: (key: string, value: string) => void
  onSave: (key: string) => void
  onCancel: () => void
  onEditValueChange: (value: string) => void
}

export function SettingRow({
  setting,
  currentValue,
  editingKey,
  editValue,
  isPending,
  onEdit,
  onSave,
  onCancel,
  onEditValueChange,
}: SettingRowProps) {
  const { t } = useTranslation()
  const isEditing = editingKey === setting.key

  // Check if label is a translation key (starts with 'settings.')
  const displayLabel = setting.label.startsWith('settings.')
    ? t(setting.label)
    : setting.label

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={setting.key} className="text-sm font-medium text-foreground">
        {displayLabel}
      </label>
      <div className="flex gap-2">
        <input
          id={setting.key}
          type={isEditing ? 'text' : setting.type}
          value={isEditing ? editValue : currentValue}
          onChange={e => onEditValueChange(e.target.value)}
          readOnly={!isEditing}
          placeholder={setting.placeholder}
          className={cn(
            'flex-1 px-3 py-2 border border-input rounded-md',
            'bg-background text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'transition-all duration-200',
            'motion-reduce:transition-none',
            !isEditing && 'bg-muted/50 cursor-default',
          )}
        />
        {isEditing ? (
          <>
            <button
              onClick={() => onSave(setting.key)}
              disabled={isPending}
              className={cn(
                'px-4 py-2 bg-primary text-primary-foreground rounded-md',
                'hover:bg-primary/90',
                'flex items-center gap-2',
                'transition-colors duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              aria-label={t('common.save')}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {t('common.save')}
            </button>
            <button
              onClick={onCancel}
              disabled={isPending}
              className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <button
            onClick={() => onEdit(setting.key, currentValue)}
            className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
          >
            {t('common.edit')}
          </button>
        )}
      </div>
    </div>
  )
}
