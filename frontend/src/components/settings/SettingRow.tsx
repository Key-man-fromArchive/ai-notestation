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
  const isEditing = editingKey === setting.key

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={setting.key} className="text-sm font-medium text-foreground">
        {setting.label}
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
            'focus:outline-none focus:ring-2 focus:ring-ring',
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
              aria-label="저장"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              저장
            </button>
            <button
              onClick={onCancel}
              disabled={isPending}
              className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
            >
              취소
            </button>
          </>
        ) : (
          <button
            onClick={() => onEdit(setting.key, currentValue)}
            className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
          >
            수정
          </button>
        )}
      </div>
    </div>
  )
}
