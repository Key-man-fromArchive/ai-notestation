import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Plus, FileText, Globe, AlertCircle, X } from 'lucide-react'
import { useNotebooks, useCreateNotebook } from '@/hooks/useNotebooks'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import type { Notebook } from '@/types/note'

function NotebookCard({ notebook, onClick }: { notebook: Notebook; onClick: () => void }) {
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
        <span>{notebook.note_count}개 노트</span>
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
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const { mutateAsync: createNotebook, isPending } = useCreateNotebook()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    try {
      await createNotebook({ name: name.trim(), description: description.trim() || undefined })
      setName('')
      setDescription('')
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
          <h2 className="text-lg font-semibold">새 노트북 만들기</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="notebook-name" className="text-sm font-medium">
                이름
              </label>
              <input
                id="notebook-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="노트북 이름"
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                required
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="notebook-description" className="text-sm font-medium">
                설명 (선택)
              </label>
              <textarea
                id="notebook-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="노트북 설명"
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                rows={3}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md hover:bg-accent"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className={cn(
                'px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground',
                'hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isPending ? '생성 중...' : '만들기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Notebooks() {
  const navigate = useNavigate()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const { data, isLoading, error } = useNotebooks()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

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

  const notebooks = data?.items ?? []

  if (notebooks.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">노트북</h1>
          <button
            onClick={() => setIsCreateOpen(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg',
              'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            <Plus className="h-4 w-4" />
            <span>새 노트북</span>
          </button>
        </div>

        <EmptyState
          icon={BookOpen}
          title="노트북이 없습니다"
          description="새 노트북을 만들어 노트를 정리해보세요."
          action={{
            label: '노트북 만들기',
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">노트북</h1>
        <button
          onClick={() => setIsCreateOpen(true)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          <Plus className="h-4 w-4" />
          <span>새 노트북</span>
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
