// @TASK v3.0.0-T4 - Keyboard shortcuts help modal
// @SPEC docs/roadmap/UI_UX_INNOVATION_ROADMAP.md#Foundation-T4

import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { ShortcutEntry, formatShortcut } from '@/hooks/useShortcuts'

interface ShortcutHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shortcuts: ShortcutEntry[]
}

export function ShortcutHelp({ open, onOpenChange, shortcuts }: ShortcutHelpProps) {
  const { t } = useTranslation()

  if (!open) return null

  // Group shortcuts by group
  const groupedShortcuts = shortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.group]) {
        acc[shortcut.group] = []
      }
      acc[shortcut.group].push(shortcut)
      return acc
    },
    {} as Record<string, ShortcutEntry[]>
  )

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 max-w-md w-full bg-card border border-border rounded-xl shadow-2xl p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 id="shortcut-help-title" className="text-xl font-semibold text-foreground">
            {t('shortcuts.title')}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Shortcuts grouped */}
        <div className="space-y-6 max-h-[60vh] overflow-y-auto">
          {Object.entries(groupedShortcuts).map(([group, entries]) => (
            <div key={group}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t(`shortcuts.${group}`)}
              </h3>
              <div className="space-y-2">
                {entries.map((entry, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{t(entry.descriptionKey)}</span>
                    <div className="flex items-center gap-1">
                      {formatShortcut(entry)
                        .split(/([+⌘⇧⌥])/)
                        .filter(Boolean)
                        .map((part, i) => {
                          if (['+', '⌘', '⇧', '⌥'].includes(part)) {
                            return (
                              <span key={i} className="text-muted-foreground">
                                {part === '+' ? '' : part}
                              </span>
                            )
                          }
                          return (
                            <kbd
                              key={i}
                              className="px-1.5 py-0.5 bg-muted border border-border rounded text-xs font-mono"
                            >
                              {part}
                            </kbd>
                          )
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
