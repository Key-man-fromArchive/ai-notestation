import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUpdateNote } from '@/hooks/useNotes'

interface RenameNoteModalProps {
  isOpen: boolean
  onClose: () => void
  noteId: string
  initialTitle: string
}

export function RenameNoteModal({ isOpen, onClose, noteId, initialTitle }: RenameNoteModalProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(initialTitle)
  const { mutateAsync: updateNote, isPending } = useUpdateNote()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await updateNote({ noteId, data: { title: title.trim() } })
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
          <h2 className="text-lg font-semibold">{t('contextMenu.renameNote')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent" aria-label={t('common.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            required
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-accent">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim()}
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
