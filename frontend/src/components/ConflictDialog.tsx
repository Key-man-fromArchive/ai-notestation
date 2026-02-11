import { useState } from 'react'
import { X, AlertTriangle, Clock } from 'lucide-react'
import { useConflicts } from '@/hooks/useConflicts'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import type { ConflictItem } from '@/types/note'
import { cn } from '@/lib/utils'

interface ConflictDialogProps {
  conflict: ConflictItem
  isOpen: boolean
  onClose: () => void
}

type TabType = 'local' | 'remote'

export function ConflictDialog({ conflict, isOpen, onClose }: ConflictDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>('local')
  const { resolveConflict, isResolving } = useConflicts()

  if (!isOpen) return null

  const formatDate = (iso: string | null) => {
    if (!iso) return '알 수 없음'
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleResolve = async (resolution: 'keep_local' | 'keep_remote') => {
    await resolveConflict({ noteId: conflict.note_id, resolution })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-lg font-semibold">동기화 충돌 — {conflict.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('local')}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'local'
                ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50/50'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            내 수정 (로컬)
            <div className="flex items-center justify-center gap-1 mt-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDate(conflict.local_updated_at)}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('remote')}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'remote'
                ? 'border-b-2 border-orange-500 text-orange-600 bg-orange-50/50'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            NoteStation (원격)
            <div className="flex items-center justify-center gap-1 mt-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDate(conflict.remote_updated_at)}
            </div>
          </button>
        </div>

        {/* Content preview */}
        <div className="p-4 overflow-y-auto flex-1 min-h-[200px] max-h-[400px]">
          {activeTab === 'local' && (
            <div className="prose prose-sm max-w-none">
              <MarkdownRenderer content={conflict.local_content} />
            </div>
          )}
          {activeTab === 'remote' && (
            <div className="prose prose-sm max-w-none">
              {conflict.remote_title !== conflict.title && (
                <div className="mb-3 p-2 rounded bg-orange-50 text-sm text-orange-700">
                  원격 제목: <strong>{conflict.remote_title}</strong>
                </div>
              )}
              <MarkdownRenderer content={conflict.remote_content} />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 p-4 border-t">
          {isResolving && <LoadingSpinner size="sm" />}
          <button
            onClick={() => handleResolve('keep_local')}
            disabled={isResolving}
            className="px-4 py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            내 수정 유지
          </button>
          <button
            onClick={() => handleResolve('keep_remote')}
            disabled={isResolving}
            className="px-4 py-2 text-sm font-medium rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
          >
            NoteStation 유지
          </button>
        </div>
      </div>
    </div>
  )
}
