import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Pencil,
  Share2,
  Users,
  AlertCircle,
  X,
  Trash2,
  Shield,
  Eye,
  Edit,
  Network,
} from 'lucide-react'
import { useNotebook, useUpdateNotebook, useDeleteNotebook } from '@/hooks/useNotebooks'
import type { NotebookCategory } from '@/types/note'
import { useCategories, getCategoryOptions } from '@/lib/categories'
import { useNotebookAccess } from '@/hooks/useNotebookAccess'
import { ShareDialog } from '@/components/ShareDialog'
import { useNotes } from '@/hooks/useNotes'
import { NoteList } from '@/components/NoteList'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

function PermissionBadge({ permission }: { permission: string }) {
  const { t } = useTranslation()
  const PERMISSION_OPTIONS = [
    { value: 'read', label: t('notebooks.permRead'), icon: Eye },
    { value: 'write', label: t('notebooks.permWrite'), icon: Edit },
    { value: 'admin', label: t('notebooks.permAdmin'), icon: Shield },
  ]
  const option = PERMISSION_OPTIONS.find(o => o.value === permission)
  const Icon = option?.icon ?? Eye
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
      <Icon className="h-3 w-3" />
      {option?.label ?? permission}
    </span>
  )
}

function EditModal({
  isOpen,
  onClose,
  notebookId,
  initialName,
  initialDescription,
  initialCategory,
}: {
  isOpen: boolean
  onClose: () => void
  notebookId: number
  initialName: string
  initialDescription: string | null
  initialCategory: string | null
}) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('notebooks.editModalTitle')}</h2>
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
    </div>
  )
}

function AccessPanel({ notebookId }: { notebookId: number }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState('read')
  const {
    accesses,
    isLoading,
    grantAccess,
    isGranting,
    revokeAccess,
    isRevoking,
  } = useNotebookAccess(notebookId)

  const PERMISSION_OPTIONS = [
    { value: 'read', label: t('notebooks.permRead'), icon: Eye },
    { value: 'write', label: t('notebooks.permWrite'), icon: Edit },
    { value: 'admin', label: t('notebooks.permAdmin'), icon: Shield },
  ]

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    try {
      await grantAccess({ email: email.trim(), permission })
      setEmail('')
    } catch {
      return
    }
  }

  return (
    <div className="bg-card rounded-lg border border-border p-4" data-testid="access-panel">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-5 w-5 text-primary" />
        <h3 className="font-medium">{t('notebooks.accessPermissions')}</h3>
      </div>

      <form onSubmit={handleGrant} className="flex gap-2 mb-4">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={t('notebooks.emailPlaceholder')}
          className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <select
          value={permission}
          onChange={e => setPermission(e.target.value)}
          className="px-3 py-2 text-sm rounded-md border border-input bg-background"
        >
          {PERMISSION_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isGranting || !email.trim()}
          className={cn(
            'px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground',
            'hover:bg-primary/90 disabled:opacity-50',
          )}
        >
          {isGranting ? '...' : t('common.add')}
        </button>
      </form>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <LoadingSpinner size="sm" />
        </div>
      ) : accesses.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t('notebooks.noSharedUsers')}
        </p>
      ) : (
        <ul className="space-y-2">
          {accesses.map(access => (
            <li key={access.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                  {access.user_email?.charAt(0).toUpperCase() ?? '?'}
                </div>
                <div>
                  <p className="text-sm font-medium">{access.user_email ?? t('notebooks.unknown')}</p>
                  <PermissionBadge permission={access.permission} />
                </div>
              </div>
              <button
                onClick={() => revokeAccess(access.id)}
                disabled={isRevoking}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                aria-label={t('notebooks.revokeAccess')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function NotebookDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const notebookId = parseInt(id ?? '0', 10)

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const { data: notebook, isLoading, error } = useNotebook(notebookId)
  const { mutateAsync: deleteNotebook, isPending: isDeleting } = useDeleteNotebook()

  const {
    data: notesData,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useNotes({ notebook: notebook?.name })

  const notes = notesData?.pages.flatMap(page => page.items) ?? []

  const handleDelete = async () => {
    if (!confirm(t('notebooks.deleteConfirm'))) return
    try {
      await deleteNotebook(notebookId)
      navigate('/notebooks')
    } catch {
      return
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    const is404 = error instanceof Error && 'status' in error && (error as { status: number }).status === 404
    return (
      <EmptyState
        icon={AlertCircle}
        title={is404 ? t('notebooks.notFound') : t('common.errorOccurred')}
        description={is404 ? t('notebooks.notFoundDesc') : t('common.unknownError')}
        action={{
          label: t('notebooks.backToList'),
          onClick: () => navigate('/notebooks'),
        }}
      />
    )
  }

  if (!notebook) return null

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/notebooks')}
          className="p-2 rounded-lg hover:bg-accent"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">{notebook.name}</h1>
          </div>
          {notebook.description && (
            <p className="mt-1 text-muted-foreground">{notebook.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/notebooks/${notebookId}/discover`}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent bg-primary/10 text-primary"
          >
            <Network className="h-4 w-4" />
            <span>{t('notebooks.discover')}</span>
          </Link>
          <button
            onClick={() => setIsShareOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent"
          >
            <Share2 className="h-4 w-4" />
            <span>{t('notebooks.share')}</span>
          </button>
          <button
            onClick={() => setIsEditOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent"
          >
            <Pencil className="h-4 w-4" />
            <span>{t('common.edit')}</span>
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting || notebook.note_count > 0}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg',
              'text-destructive hover:bg-destructive/10',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            title={notebook.note_count > 0 ? t('notebooks.cannotDelete') : undefined}
          >
            <Trash2 className="h-4 w-4" />
            <span>{t('common.delete')}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t('notebooks.notes', { count: notebook.note_count })}
            </h2>
          </div>

          {notes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={t('notes.noNotes')}
              description={t('notes.addNotes')}
            />
          ) : (
            <NoteList
              notes={notes}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={fetchNextPage}
            />
          )}
        </div>

        <div className="space-y-6">
          <AccessPanel notebookId={notebookId} />
        </div>
      </div>

      <EditModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        notebookId={notebookId}
        initialName={notebook.name}
        initialDescription={notebook.description}
        initialCategory={notebook.category}
      />

      <ShareDialog
        notebookId={notebookId}
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />
    </div>
  )
}
