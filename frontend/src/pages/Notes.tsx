// @TASK P5-T5.2 - Notes 페이지 (노트 목록 + 노트북 필터)
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-목록
// @TEST frontend/src/__tests__/Notes.test.tsx

import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, AlertCircle, FolderOpen, Folder, BookOpen, Search, X, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNotes, useCreateNote } from '@/hooks/useNotes'
import { useNotebooks } from '@/hooks/useNotebooks'
import { NoteList } from '@/components/NoteList'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

function CreateNoteModal({
  isOpen,
  onClose,
  defaultNotebook,
}: {
  isOpen: boolean
  onClose: () => void
  defaultNotebook?: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createNote = useCreateNote()
  const { data: notebooksData } = useNotebooks()
  const [title, setTitle] = useState('')
  const [notebook, setNotebook] = useState(defaultNotebook || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    try {
      const result = await createNote.mutateAsync({
        title: title.trim(),
        content: '',
        notebook: notebook || undefined,
      })
      setTitle('')
      setNotebook('')
      onClose()
      navigate(`/notes/${result.note_id}`)
    } catch {
      // mutation error handled by TanStack Query
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-lg border border-border shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">{t('notes.createModalTitle')}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label htmlFor="note-title" className="block text-sm font-medium mb-1">
              {t('notes.titleLabel')}
            </label>
            <input
              id="note-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('notes.titlePlaceholder')}
              className={cn(
                'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              autoFocus
              required
            />
          </div>
          <div>
            <label htmlFor="note-notebook" className="block text-sm font-medium mb-1">
              {t('notes.notebookLabel')}
            </label>
            <select
              id="note-notebook"
              value={notebook}
              onChange={(e) => setNotebook(e.target.value)}
              className={cn(
                'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <option value="">{t('notes.noNotebookOption')}</option>
              {notebooksData?.items.map((nb) => (
                <option key={nb.id} value={nb.name}>
                  {nb.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'px-4 py-2 text-sm rounded-md border border-input',
                'hover:bg-muted transition-colors',
              )}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!title.trim() || createNote.isPending}
              className={cn(
                'px-4 py-2 text-sm rounded-md',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {createNote.isPending ? t('common.creating') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Notes() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedNotebook = searchParams.get('notebook') || undefined
  const [filterText, setFilterText] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // 노트 목록 데이터
  const {
    data,
    error,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useNotes({ notebook: selectedNotebook })

  // 노트북 목록 데이터
  const { data: notebooksData, isLoading: isLoadingNotebooks } = useNotebooks()

  // 모든 노트 평탄화
  const allNotes = data?.pages.flatMap((page) => page.items) ?? []

  // 총 노트 수 (첫 페이지의 total)
  const totalNotes = data?.pages[0]?.total ?? 0

  // 클라이언트 사이드 필터링
  const filteredNotes = useMemo(() => {
    if (!filterText.trim()) return allNotes
    const lower = filterText.toLowerCase()
    return allNotes.filter(
      (note) =>
        note.title.toLowerCase().includes(lower) ||
        (note.snippet && note.snippet.toLowerCase().includes(lower))
    )
  }, [allNotes, filterText])

  // 노트북을 활성(count > 0) / 비활성(count === 0)으로 분리 후 정렬
  const { activeNotebooks, emptyNotebooks } = useMemo(() => {
    const items = notebooksData?.items ?? []
    const active = items
      .filter((nb) => nb.note_count > 0)
      .sort((a, b) => b.note_count - a.note_count)
    const empty = items
      .filter((nb) => nb.note_count === 0)
      .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
    return { activeNotebooks: active, emptyNotebooks: empty }
  }, [notebooksData, i18n.language])

  // 노트북 필터 변경
  const handleNotebookChange = (notebook: string | null) => {
    if (notebook) {
      setSearchParams({ notebook })
    } else {
      setSearchParams({})
    }
  }

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // 에러 상태
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

  // 빈 상태
  if (allNotes.length === 0 && !selectedNotebook) {
    return (
      <>
        <EmptyState
          icon={FileText}
          title={t('notes.noNotes')}
          description={t('notes.noNotesDesc')}
          action={{
            label: t('notes.newNote'),
            onClick: () => setIsCreateOpen(true),
          }}
        />
        <CreateNoteModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
        />
      </>
    )
  }

  return (
    <div className="flex h-full">
      {/* 좌측: 노트북 필터 사이드패널 */}
      <aside className="w-64 border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 pb-2 border-b border-border">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('notes.notebooks')}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {/* 전체 노트 */}
          <button
            onClick={() => handleNotebookChange(null)}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-md text-sm mb-0.5',
              'hover:bg-muted/80 transition-colors',
              'flex items-center gap-2.5',
              !selectedNotebook
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-foreground'
            )}
          >
            <BookOpen className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">{t('notes.allNotes')}</span>
            <span className={cn(
              'text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.5rem] text-center',
              !selectedNotebook
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground'
            )}>
              {totalNotes}
            </span>
          </button>

          {/* 노트북 목록 */}
          {isLoadingNotebooks ? (
            <div className="py-4">
              <LoadingSpinner size="sm" />
            </div>
          ) : (
            <>
              {/* 활성 노트북 (노트 있음) */}
              {activeNotebooks.map((notebook) => (
                <button
                  key={notebook.name}
                  onClick={() => handleNotebookChange(notebook.name)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md text-sm mb-0.5',
                    'hover:bg-muted/80 transition-colors',
                    'flex items-center gap-2.5',
                    selectedNotebook === notebook.name
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground'
                  )}
                >
                  <FolderOpen
                    className={cn(
                      'h-4 w-4 flex-shrink-0',
                      selectedNotebook === notebook.name
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{notebook.name}</span>
                  <span className={cn(
                    'text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.5rem] text-center',
                    selectedNotebook === notebook.name
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {notebook.note_count}
                  </span>
                </button>
              ))}

              {/* 비활성 노트북 (노트 없음) */}
              {emptyNotebooks.length > 0 && (
                <>
                  <div className="my-2 border-t border-border" />
                  <div className="px-3 py-1">
                    <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                      {t('common.empty')}
                    </span>
                  </div>
                  {emptyNotebooks.map((notebook) => (
                    <button
                      key={notebook.name}
                      onClick={() => handleNotebookChange(notebook.name)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 rounded-md text-xs mb-0.5',
                        'hover:bg-muted/50 transition-colors',
                        'flex items-center gap-2.5',
                        'text-muted-foreground/70',
                        selectedNotebook === notebook.name && 'bg-muted font-medium text-foreground'
                      )}
                    >
                      <Folder className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate">{notebook.name}</span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </aside>

      {/* 우측: 노트 목록 */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-baseline gap-3 flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-foreground truncate">
                {selectedNotebook || t('notes.allNotes')}
              </h1>
              <span className="text-sm text-muted-foreground shrink-0">
                {filterText ? `${filteredNotes.length} / ${t('common.count_items', { count: totalNotes })}` : t('common.count_items', { count: totalNotes })}
              </span>
            </div>
            <button
              onClick={() => setIsCreateOpen(true)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
              )}
            >
              <Plus className="h-4 w-4" />
              {t('notes.newNote')}
            </button>
          </div>

          {/* 빠른 필터 */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={t('notes.filterPlaceholder')}
              className={cn(
                'flex h-9 w-full rounded-lg border border-input bg-background pl-9 pr-8 py-2',
                'text-sm text-foreground placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'transition-colors'
              )}
            />
            {filterText && (
              <button
                onClick={() => setFilterText('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t('common.clearFilter')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {allNotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={t('notes.noNotes')}
              description={selectedNotebook ? t('notes.notebookEmpty', { notebook: selectedNotebook }) : t('notes.noNotesDesc')}
              action={selectedNotebook ? {
                label: t('notes.viewAllNotes'),
                onClick: () => handleNotebookChange(null),
              } : undefined}
            />
          ) : filteredNotes.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t('notes.noMatchingNotes')}
              description={t('notes.noMatchingNotesDesc', { query: filterText })}
              action={{
                label: t('notes.clearFilter'),
                onClick: () => setFilterText(''),
              }}
            />
          ) : (
            <NoteList
              notes={filteredNotes}
              hasNextPage={filterText ? false : (hasNextPage ?? false)}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={fetchNextPage}
            />
          )}
        </div>
      </main>

      <CreateNoteModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        defaultNotebook={selectedNotebook}
      />
    </div>
  )
}
