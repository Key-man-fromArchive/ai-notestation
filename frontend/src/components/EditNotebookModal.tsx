import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUpdateNotebook } from '@/hooks/useNotebooks'
import { useCategories, getCategoryOptions } from '@/lib/categories'
import type { NotebookCategory } from '@/types/note'

interface EditNotebookModalProps {
  isOpen: boolean
  onClose: () => void
  notebookId: number
  initialName: string
  initialDescription: string | null
  initialCategory: string | null
}

export function EditNotebookModal({
  isOpen,
  onClose,
  notebookId,
  initialName,
  initialDescription,
  initialCategory,
}: EditNotebookModalProps) {
  const { t, i18n } = useTranslation()
  const categories = useCategories()
  const categoryOptions = getCategoryOptions(categories)
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? '')
  const [category, setCategory] = useState<NotebookCategory | ''>(
    (initialCategory as NotebookCategory) ?? ''
  )
  const { mutateAsync: updateNotebook, isPending } = useUpdateNotebook()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    try {
      await updateNotebook({
        id: notebookId,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          category: category || null,
        },
      })
      onClose()
    } catch {
      return
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('contextMenu.editNotebook')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent" aria-label={t('common.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="edit-name" className="text-sm font-medium">{t('notebooks.nameLabel')}</label>
              <input
                id="edit-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="edit-description" className="text-sm font-medium">{t('common.description')}</label>
              <textarea
                id="edit-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                rows={3}
              />
            </div>
            <div>
              <label htmlFor="edit-category" className="text-sm font-medium">{t('notebooks.categoryLabel')}</label>
              <select
                id="edit-category"
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {categoryOptions.map(val => {
                  const preset = categories.find(c => c.value === val)
                  return (
                    <option key={val || '__none'} value={val}>
                      {val ? (preset ? preset[i18n.language === 'ko' ? 'ko' : 'en'] : val) : t('notebooks.categoryNone')}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-accent">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className={cn(
                'px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground',
                'hover:bg-primary/90 disabled:opacity-50',
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
