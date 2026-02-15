import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, Plus, FileText, Globe, AlertCircle, X, Tag } from 'lucide-react'
import { useNotebooks, useCreateNotebook } from '@/hooks/useNotebooks'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import type { Notebook, NotebookCategory } from '@/types/note'

const CATEGORY_COLORS: Record<string, string> = {
  labnote: 'bg-blue-100 text-blue-700',
  daily_log: 'bg-green-100 text-green-700',
  meeting: 'bg-purple-100 text-purple-700',
  sop: 'bg-orange-100 text-orange-700',
  protocol: 'bg-red-100 text-red-700',
  reference: 'bg-gray-100 text-gray-700',
}

const CATEGORY_OPTIONS: (NotebookCategory | '')[] = ['', 'labnote', 'daily_log', 'meeting', 'sop', 'protocol', 'reference']

function NotebookCard({ notebook, onClick }: { notebook: Notebook; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full p-4 bg-card rounded-lg border border-border text-left',
        'hover:border-primary/50 transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-start justify-between">
        <BookOpen className="h-5 w-5 text-primary" />
        {notebook.is_public && (
          <Globe className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <h3 className="mt-3 font-medium text-foreground truncate">
        {notebook.name}
      </h3>
      {notebook.description && (
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
          {notebook.description}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        <span>{t('common.count_notes', { count: notebook.note_count })}</span>
        {notebook.category && (
          <span className={cn('ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium', CATEGORY_COLORS[notebook.category] ?? 'bg-gray-100 text-gray-700')}>
            <Tag className="h-2.5 w-2.5" />
            {t(`notebooks.category_${notebook.category}`)}
          </span>
        )}
      </div>
    </button>
  )
}

function CreateNotebookModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<NotebookCategory | ''>('')
  const { mutateAsync: createNotebook, isPending } = useCreateNotebook()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    try {
      await createNotebook({
        name: name.trim(),
        description: description.trim() || undefined,
        category: category || null,
      })
      setName('')
      setDescription('')
      setCategory('')
      onClose()
    } catch {
      return
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-card rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('notebooks.createModalTitle')}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="notebook-name" className="text-sm font-medium">
                {t('notebooks.nameLabel')}
              </label>
              <input
                id="notebook-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('notebooks.namePlaceholder')}
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="notebook-description" className="text-sm font-medium">
                {t('notebooks.descLabel')}
              </label>
              <textarea
                id="notebook-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('notebooks.descPlaceholder')}
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                rows={3}
              />
            </div>
            <div>
              <label htmlFor="notebook-category" className="text-sm font-medium">
                {t('notebooks.categoryLabel')}
              </label>
              <select
                id="notebook-category"
                value={category}
                onChange={e => setCategory(e.target.value as NotebookCategory | '')}
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CATEGORY_OPTIONS.map(cat => (
                  <option key={cat || '__none'} value={cat}>
                    {cat ? t(`notebooks.category_${cat}`) : t('notebooks.categoryNone')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md hover:bg-accent"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className={cn(
                'px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground',
                'hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isPending ? t('common.creating') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Notebooks() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const { data, isLoading, error } = useNotebooks()

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={t('common.errorOccurred')}
        description={error instanceof Error ? error.message : t('common.unknownError')}
        action={{
          label: t('common.retry'),
          onClick: () => window.location.reload(),
        }}
      />
    )
  }

  const notebooks = data?.items ?? []

  if (notebooks.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{t('notebooks.title')}</h1>
          <button
            onClick={() => setIsCreateOpen(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg',
              'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            <Plus className="h-4 w-4" />
            <span>{t('notebooks.newNotebook')}</span>
          </button>
        </div>

        <EmptyState
          icon={BookOpen}
          title={t('notebooks.noNotebooks')}
          description={t('notebooks.noNotebooksDesc')}
          action={{
            label: t('notebooks.createNotebook'),
            onClick: () => setIsCreateOpen(true),
          }}
        />

        <CreateNotebookModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('notebooks.title')}</h1>
        <button
          onClick={() => setIsCreateOpen(true)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          <Plus className="h-4 w-4" />
          <span>{t('notebooks.newNotebook')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {notebooks.map(notebook => (
          <NotebookCard
            key={notebook.id}
            notebook={notebook}
            onClick={() => navigate(`/notebooks/${notebook.id}`)}
          />
        ))}
      </div>

      <CreateNotebookModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  )
}
