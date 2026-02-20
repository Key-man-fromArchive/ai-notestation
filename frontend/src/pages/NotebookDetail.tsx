import { useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  FileText,
  Pencil,
  Share2,
  Users,
  AlertCircle,
  Trash2,
  Shield,
  Eye,
  Edit,
  Network,
  CheckSquare,
  Square,
  Loader2,
  FolderOpen,
} from 'lucide-react'
import { Breadcrumb } from '@/components/Breadcrumb'
import { useNotebook, useDeleteNotebook } from '@/hooks/useNotebooks'
import { useBatchTrashNotes, useBatchMoveNotes } from '@/hooks/useNotes'
import { useNotebooks } from '@/hooks/useNotebooks'
import { useNotebookAccess } from '@/hooks/useNotebookAccess'
import { ShareDialog } from '@/components/ShareDialog'
import { EditNotebookModal } from '@/components/EditNotebookModal'
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
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false)
  const [isMoveOpen, setIsMoveOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState<string>('')
  const { data: notebook, isLoading, error } = useNotebook(notebookId)
  const { mutateAsync: deleteNotebook, isPending: isDeleting } = useDeleteNotebook()
  const batchTrash = useBatchTrashNotes()
  const batchMove = useBatchMoveNotes()
  const { data: notebooksData } = useNotebooks()

  const {
    data: notesData,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useNotes({ notebook: notebook?.name })

  const notes = notesData?.pages.flatMap(page => page.items) ?? []

  const toggleSelectMode = useCallback(() => {
    setSelectMode(prev => {
      if (prev) setSelectedIds(new Set())
      return !prev
    })
  }, [])

  const handleSelect = useCallback((noteId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(notes.map(n => n.note_id)))
  }, [notes])

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

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
      <Breadcrumb items={[
        { label: t('sidebar.dashboard'), to: '/' },
        { label: t('sidebar.notebooks'), to: '/notebooks' },
        { label: notebook.name }
      ]} />
      <div className="flex items-center gap-4 mb-6 mt-6">
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
            {notes.length > 0 && (
              <button
                onClick={toggleSelectMode}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
                  'border border-input',
                  'hover:bg-muted transition-colors',
                  selectMode && 'bg-primary/10 border-primary text-primary',
                )}
              >
                {selectMode ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {selectMode ? t('notes.exitSelectMode') : t('notes.selectMode')}
              </button>
            )}
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
              selectable={selectMode}
              selectedIds={selectedIds}
              onSelect={handleSelect}
            />
          )}
        </div>

        <div className="space-y-6">
          <AccessPanel notebookId={notebookId} />
        </div>
      </div>

      {/* 선택 모드 플로팅 액션바 */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 bg-card border border-border rounded-xl shadow-lg">
          <span className="text-sm font-medium text-foreground">
            {t('notes.selectedCount', { count: selectedIds.size })}
          </span>
          <div className="w-px h-5 bg-border" />
          <button
            onClick={handleSelectAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('notes.selectAllPage')}
          </button>
          <button
            onClick={handleDeselectAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('notes.deselectAll')}
          </button>
          <div className="w-px h-5 bg-border" />
          <button
            onClick={() => {
              setMoveTarget('')
              setIsMoveOpen(true)
            }}
            disabled={batchMove.isPending}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
              'border border-input',
              'hover:bg-muted transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {batchMove.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            {t('notes.batchMoveToNotebook')}
          </button>
          <button
            onClick={() => setIsBatchDeleteOpen(true)}
            disabled={batchTrash.isPending}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
              'bg-destructive text-destructive-foreground',
              'hover:bg-destructive/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {batchTrash.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {batchTrash.isPending ? t('common.deleting') : t('notes.batchDelete')}
          </button>
        </div>
      )}

      {/* 선택 휴지통 이동 확인 다이얼로그 */}
      {isBatchDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsBatchDeleteOpen(false)} />
          <div className="relative bg-card rounded-lg border border-border shadow-lg w-full max-w-sm mx-4">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <h2 className="text-lg font-semibold">{t('notes.batchDeleteConfirmTitle')}</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('notes.batchDeleteConfirmDesc', { count: selectedIds.size })}
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsBatchDeleteOpen(false)}
                  className={cn(
                    'px-4 py-2 text-sm rounded-md border border-input',
                    'hover:bg-muted transition-colors',
                  )}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={async () => {
                    await batchTrash.mutateAsync(Array.from(selectedIds))
                    setIsBatchDeleteOpen(false)
                    setSelectedIds(new Set())
                    setSelectMode(false)
                  }}
                  disabled={batchTrash.isPending}
                  className={cn(
                    'px-4 py-2 text-sm rounded-md',
                    'bg-destructive text-destructive-foreground',
                    'hover:bg-destructive/90 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {batchTrash.isPending ? t('common.deleting') : t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 노트북 이동 다이얼로그 */}
      {isMoveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsMoveOpen(false)} />
          <div className="relative bg-card rounded-lg border border-border shadow-lg w-full max-w-sm mx-4">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">{t('notes.batchMoveToNotebook')}</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('notes.selectedCount', { count: selectedIds.size })}
              </p>
              <select
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2',
                  'text-sm',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <option value="">{t('contextMenu.noNotebook')}</option>
                {notebooksData?.items.map((nb) => (
                  <option key={nb.id} value={nb.name}>
                    {nb.name}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsMoveOpen(false)}
                  className={cn(
                    'px-4 py-2 text-sm rounded-md border border-input',
                    'hover:bg-muted transition-colors',
                  )}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={async () => {
                    await batchMove.mutateAsync({
                      noteIds: Array.from(selectedIds),
                      notebook: moveTarget || null,
                    })
                    setIsMoveOpen(false)
                    setSelectedIds(new Set())
                    setSelectMode(false)
                  }}
                  disabled={batchMove.isPending}
                  className={cn(
                    'px-4 py-2 text-sm rounded-md',
                    'bg-primary text-primary-foreground',
                    'hover:bg-primary/90 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {batchMove.isPending ? t('common.loading') : t('contextMenu.moveToNotebook')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <EditNotebookModal
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
