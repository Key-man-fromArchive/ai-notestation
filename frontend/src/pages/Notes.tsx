// @TASK P5-T5.2 - Notes 페이지 (노트 목록 + 노트북 필터)
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-목록
// @TEST frontend/src/__tests__/Notes.test.tsx

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, AlertCircle, FolderOpen, Folder, BookOpen, Search, X } from 'lucide-react'
import { useNotes } from '@/hooks/useNotes'
import { useNotebooks } from '@/hooks/useNotebooks'
import { NoteList } from '@/components/NoteList'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

export default function Notes() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedNotebook = searchParams.get('notebook') || undefined
  const [filterText, setFilterText] = useState('')

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
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    return { activeNotebooks: active, emptyNotebooks: empty }
  }, [notebooksData])

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
        title="에러가 발생했습니다"
        description={error instanceof Error ? error.message : '알 수 없는 오류'}
        action={{
          label: '다시 시도',
          onClick: () => window.location.reload(),
        }}
      />
    )
  }

  // 빈 상태
  if (allNotes.length === 0 && !selectedNotebook) {
    return (
      <EmptyState
        icon={FileText}
        title="노트가 없습니다"
        description="새로운 노트를 작성해보세요."
      />
    )
  }

  return (
    <div className="flex h-full">
      {/* 좌측: 노트북 필터 사이드패널 */}
      <aside className="w-64 border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 pb-2 border-b border-border">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            노트북
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
            <span className="flex-1 truncate">전체 노트</span>
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
                      비어있음
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
                {selectedNotebook || '모든 노트'}
              </h1>
              <span className="text-sm text-muted-foreground shrink-0">
                {filterText ? `${filteredNotes.length} / ${totalNotes}개` : `${totalNotes}개`}
              </span>
            </div>
          </div>

          {/* 빠른 필터 */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="노트 필터링..."
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
                aria-label="필터 초기화"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {allNotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="노트가 없습니다"
              description={selectedNotebook ? `"${selectedNotebook}" 노트북이 비어 있습니다.` : '새로운 노트를 작성해보세요.'}
              action={selectedNotebook ? {
                label: '전체 노트 보기',
                onClick: () => handleNotebookChange(null),
              } : undefined}
            />
          ) : filteredNotes.length === 0 ? (
            <EmptyState
              icon={Search}
              title="일치하는 노트가 없습니다"
              description={`"${filterText}"에 해당하는 노트를 찾을 수 없습니다`}
              action={{
                label: '필터 초기화',
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
    </div>
  )
}
