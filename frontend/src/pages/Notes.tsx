// @TASK P5-T5.2 - Notes 페이지 (노트 목록 + 노트북 필터)
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-목록
// @TEST frontend/src/__tests__/Notes.test.tsx

import { useSearchParams } from 'react-router-dom'
import { FileText, AlertCircle } from 'lucide-react'
import { useNotes } from '@/hooks/useNotes'
import { useNotebooks } from '@/hooks/useNotebooks'
import { NoteList } from '@/components/NoteList'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

export default function Notes() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedNotebook = searchParams.get('notebook') || undefined

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
  if (allNotes.length === 0) {
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
      <aside className="w-64 border-r border-border p-4 overflow-y-auto">
        <h2 className="text-sm font-semibold text-foreground mb-4">노트북</h2>

        {/* 전체 노트 */}
        <button
          onClick={() => handleNotebookChange(null)}
          className={cn(
            'w-full text-left px-3 py-2 rounded-md text-sm mb-1',
            'hover:bg-muted transition-colors',
            !selectedNotebook && 'bg-muted font-medium'
          )}
        >
          전체 노트
        </button>

        {/* 노트북 목록 */}
        {isLoadingNotebooks ? (
          <div className="py-4">
            <LoadingSpinner size="sm" />
          </div>
        ) : (
          notebooksData?.items.map((notebook) => (
            <button
              key={notebook.name}
              onClick={() => handleNotebookChange(notebook.name)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-sm mb-1',
                'hover:bg-muted transition-colors',
                'flex items-center justify-between',
                selectedNotebook === notebook.name && 'bg-muted font-medium'
              )}
            >
              <span>{notebook.name}</span>
              <span className="text-xs text-muted-foreground">
                {notebook.note_count}
              </span>
            </button>
          ))
        )}
      </aside>

      {/* 우측: 노트 목록 */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full p-6">
          <h1 className="text-2xl font-bold text-foreground mb-6">
            {selectedNotebook ? `${selectedNotebook} 노트` : '모든 노트'}
          </h1>

          <NoteList
            notes={allNotes}
            hasNextPage={hasNextPage ?? false}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
          />
        </div>
      </main>
    </div>
  )
}
