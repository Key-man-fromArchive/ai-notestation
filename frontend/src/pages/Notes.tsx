// @TASK P5-T5.2 - Notes 페이지 (노트 목록 + 노트북 필터)
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-목록
// @TEST frontend/src/__tests__/Notes.test.tsx

import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, AlertCircle, FolderOpen, Folder, BookOpen, Search, X, Plus, Wand2, Loader2, Tag, Globe, FileX2, Trash2, ArrowUpDown, ArrowDown, ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNotes, useCreateNote, useBatchDeleteNotes, type SortBy, type SortOrder } from '@/hooks/useNotes'
import { useNotebooks } from '@/hooks/useNotebooks'
import { useAutoTag, useLocalTags } from '@/hooks/useAutoTag'
import { NoteList } from '@/components/NoteList'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { CaptureModal } from '@/components/CaptureModal'
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
  const selectedTag = searchParams.get('tag') || undefined
  const emptyOnly = searchParams.get('empty') === 'true'
  const [filterText, setFilterText] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('updated_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCaptureOpen, setIsCaptureOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)

  // 태그 관련 훅
  const { data: localTags } = useLocalTags()
  const autoTag = useAutoTag()
  const batchDelete = useBatchDeleteNotes()

  // 노트 목록 데이터
  const {
    data,
    error,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useNotes({ notebook: selectedNotebook, tag: selectedTag, emptyOnly, sortBy, sortOrder })

  // 노트북 목록 데이터
  const { data: notebooksData, isLoading: isLoadingNotebooks } = useNotebooks()

  // 모든 노트 평탄화
  const allNotes = data?.pages.flatMap((page) => page.items) ?? []

  // 현재 필터의 총 노트 수
  const totalNotes = data?.pages[0]?.total ?? 0

  // 전체 노트 수 (노트북 카운트 합산 — 항상 전체 수 표시)
  const allNotesCount = useMemo(() => {
    if (!notebooksData?.items) return totalNotes
    return notebooksData.items.reduce((sum, nb) => sum + nb.note_count, 0)
  }, [notebooksData, totalNotes])

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
    const params: Record<string, string> = {}
    if (notebook) params.notebook = notebook
    if (selectedTag) params.tag = selectedTag
    setSearchParams(params)
  }

  // 태그 필터 변경
  const handleTagChange = (tag: string | null) => {
    const params: Record<string, string> = {}
    if (selectedNotebook) params.notebook = selectedNotebook
    if (tag) params.tag = tag
    setSearchParams(params)
  }

  // 빈 노트 필터 토글
  const handleEmptyToggle = () => {
    if (emptyOnly) {
      setSearchParams({})
    } else {
      setSearchParams({ empty: 'true' })
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
    <div className="p-6 flex h-full">
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
              !selectedNotebook && !emptyOnly
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-foreground'
            )}
          >
            <BookOpen className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">{t('notes.allNotes')}</span>
            <span className={cn(
              'text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.5rem] text-center',
              !selectedNotebook && !emptyOnly
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground'
            )}>
              {allNotesCount}
            </span>
          </button>

          {/* 빈 노트 필터 */}
          <button
            onClick={handleEmptyToggle}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-md text-sm mb-0.5',
              'hover:bg-muted/80 transition-colors',
              'flex items-center gap-2.5',
              emptyOnly
                ? 'bg-destructive/10 text-destructive font-medium'
                : 'text-muted-foreground'
            )}
          >
            <FileX2 className={cn(
              'h-4 w-4 flex-shrink-0',
              emptyOnly ? 'text-destructive' : 'text-muted-foreground'
            )} aria-hidden="true" />
            <span className="flex-1 truncate">{t('notes.emptyNotes')}</span>
            {emptyOnly && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.5rem] text-center bg-destructive/20 text-destructive">
                {totalNotes}
              </span>
            )}
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
                {emptyOnly ? t('notes.emptyNotes') : selectedNotebook || t('notes.allNotes')}
              </h1>
              <span className="text-sm text-muted-foreground shrink-0">
                {filterText ? `${filteredNotes.length} / ${t('common.count_items', { count: totalNotes })}` : t('common.count_items', { count: totalNotes })}
              </span>
            </div>
            {emptyOnly && totalNotes > 0 && (
              <button
                onClick={() => setIsDeleteConfirmOpen(true)}
                disabled={batchDelete.isPending}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
                  'bg-destructive text-destructive-foreground',
                  'hover:bg-destructive/90 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {batchDelete.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {batchDelete.isPending ? t('common.deleting') : t('notes.deleteAllEmpty')}
              </button>
            )}
            {!emptyOnly && (
              <>
                <button
                  onClick={() => setIsCaptureOpen(true)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
                    'border border-input',
                    'hover:bg-muted transition-colors',
                  )}
                >
                  <Globe className="h-4 w-4" />
                  {t('capture.button')}
                </button>
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
              </>
            )}
          </div>

          {/* 빠른 필터 + 정렬 */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
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

            {/* 정렬 기준 */}
            <button
              onClick={() => setSortBy(sortBy === 'updated_at' ? 'created_at' : 'updated_at')}
              className={cn(
                'flex items-center gap-1.5 h-9 px-3 rounded-lg border border-input text-sm',
                'hover:bg-muted transition-colors whitespace-nowrap',
              )}
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              {sortBy === 'updated_at' ? t('notes.sortByUpdated') : t('notes.sortByCreated')}
            </button>

            {/* 정렬 순서 */}
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className={cn(
                'flex items-center gap-1.5 h-9 px-3 rounded-lg border border-input text-sm',
                'hover:bg-muted transition-colors whitespace-nowrap',
              )}
            >
              {sortOrder === 'desc' ? (
                <><ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />{t('notes.sortDesc')}</>
              ) : (
                <><ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />{t('notes.sortAsc')}</>
              )}
            </button>
          </div>

          {/* 태그 필터 + 배치 태깅 */}
          {((localTags && localTags.length > 0) || autoTag.isTagging) && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Tag className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              {localTags?.slice(0, 10).map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => handleTagChange(selectedTag === tag.name ? null : tag.name)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors',
                    selectedTag === tag.name
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                  )}
                >
                  {tag.name}
                  <span className="text-[10px] opacity-70">({tag.count})</span>
                </button>
              ))}
              {selectedTag && (
                <button
                  onClick={() => handleTagChange(null)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                  {t('notes.clearTagFilter')}
                </button>
              )}
              <div className="ml-auto flex-shrink-0">
                <button
                  onClick={() => autoTag.triggerTag()}
                  disabled={autoTag.isTagging}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                  title={t('notes.batchAutoTagDesc')}
                >
                  {autoTag.isTagging ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('notes.batchTagProgress', { tagged: autoTag.tagged, total: autoTag.total })}</>
                  ) : (
                    <><Wand2 className="h-3.5 w-3.5" />{t('notes.batchAutoTag')}</>
                  )}
                </button>
              </div>
            </div>
          )}

          {allNotes.length === 0 ? (
            <EmptyState
              icon={emptyOnly ? FileX2 : FileText}
              title={emptyOnly ? t('notes.emptyNotes') : t('notes.noNotes')}
              description={emptyOnly ? t('notes.emptyNotesDesc') : selectedNotebook ? t('notes.notebookEmpty', { notebook: selectedNotebook }) : t('notes.noNotesDesc')}
              action={emptyOnly ? {
                label: t('notes.viewAllNotes'),
                onClick: () => handleEmptyToggle(),
              } : selectedNotebook ? {
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
      <CaptureModal
        isOpen={isCaptureOpen}
        onClose={() => setIsCaptureOpen(false)}
        defaultNotebook={selectedNotebook}
      />

      {/* 빈 노트 일괄 삭제 확인 다이얼로그 */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsDeleteConfirmOpen(false)} />
          <div className="relative bg-card rounded-lg border border-border shadow-lg w-full max-w-sm mx-4">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <h2 className="text-lg font-semibold">{t('notes.deleteConfirmTitle')}</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('notes.deleteConfirmDesc', { count: totalNotes })}
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className={cn(
                    'px-4 py-2 text-sm rounded-md border border-input',
                    'hover:bg-muted transition-colors',
                  )}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={async () => {
                    const noteIds = allNotes.map(n => n.note_id)
                    await batchDelete.mutateAsync(noteIds)
                    setIsDeleteConfirmOpen(false)
                  }}
                  disabled={batchDelete.isPending}
                  className={cn(
                    'px-4 py-2 text-sm rounded-md',
                    'bg-destructive text-destructive-foreground',
                    'hover:bg-destructive/90 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {batchDelete.isPending ? t('common.deleting') : t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
