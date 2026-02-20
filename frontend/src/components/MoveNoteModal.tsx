import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUpdateNote } from '@/hooks/useNotes'
import { useNotebooks } from '@/hooks/useNotebooks'

interface MoveNoteModalProps {
  isOpen: boolean
  onClose: () => void
  noteId: string
  currentNotebook: string | null
}

export function MoveNoteModal({ isOpen, onClose, noteId, currentNotebook }: MoveNoteModalProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(currentNotebook ?? '')
  const { data: notebooksData } = useNotebooks()
  const { mutateAsync: updateNote, isPending } = useUpdateNote()

  const notebooks = notebooksData?.items ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateNote({ noteId, data: { notebook: selected || null } })
      onClose()
    } catch {
      return
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-card rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('contextMenu.moveNote')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent" aria-label={t('common.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="move-notebook" className="text-sm font-medium">
            {t('contextMenu.selectNotebook')}
          </label>
          <select
            id="move-notebook"
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t('contextMenu.noNotebook')}</option>
            {notebooks.map(nb => (
              <option key={nb.id} value={nb.name}>{nb.name}</option>
            ))}
          </select>
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-accent">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={cn(
                'px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground',
                'hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
