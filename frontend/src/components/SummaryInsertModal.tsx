import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Loader2, FileText } from 'lucide-react'
import { useAIStream } from '@/hooks/useAIStream'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { apiClient } from '@/lib/api'
import { markdownToHtml } from '@/lib/markdown'

interface SummaryInsertModalProps {
  isOpen: boolean
  onClose: () => void
  fileId: string
  fileName: string
  noteId: string
  noteContent: string
}

export function SummaryInsertModal({ isOpen, onClose, fileId, fileName, noteId, noteContent }: SummaryInsertModalProps) {
  const { t } = useTranslation()
  const { content, isStreaming, error, startStream, stopStream, reset } = useAIStream()
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isInserting, setIsInserting] = useState(false)
  const [started, setStarted] = useState(false)

  // Fetch PDF text and start streaming on mount
  useEffect(() => {
    if (!isOpen || started) return
    setStarted(true)

    const fetchAndStream = async () => {
      try {
        const result = await apiClient.get<{ text: string; extraction_status: string }>(`/files/${fileId}/text`)
        if (!result.text) {
          setFetchError(t('summary.empty'))
          return
        }
        const truncated = result.text.slice(0, 8000)
        await startStream({
          message: truncated,
          feature: 'insight',
        })
      } catch {
        setFetchError(t('summary.error'))
      }
    }
    fetchAndStream()
  }, [isOpen, started, fileId, startStream, t])

  const handleClose = () => {
    stopStream()
    reset()
    onClose()
  }

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleInsert = async () => {
    if (!content || isInserting) return
    setIsInserting(true)
    try {
      const contentHtml = markdownToHtml(content)
      const merged = `${noteContent}<hr><h2>${t('summary.heading')}</h2>${contentHtml}`
      await apiClient.put(`/notes/${noteId}`, { content: merged })
      window.location.reload()
    } catch {
      setIsInserting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <h2 className="text-lg font-semibold text-foreground truncate">{fileName}</h2>
            <span className="shrink-0 text-sm text-muted-foreground">— {t('summary.title')}</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-muted shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1">
          {fetchError && (
            <p className="text-sm text-destructive">{fetchError}</p>
          )}

          {error && (
            <p className="text-sm text-destructive">{t('summary.error')}: {error}</p>
          )}

          {isStreaming && !content && !fetchError && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{t('summary.generating')}</span>
            </div>
          )}

          {content && (
            <div className="prose prose-sm max-w-none">
              <MarkdownRenderer content={content} />
              {isStreaming && (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary animate-pulse rounded-sm" />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm rounded border border-input text-muted-foreground hover:text-foreground"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleInsert}
            disabled={!content || isStreaming || isInserting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isInserting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isInserting ? t('summary.insertingNote') : t('summary.insert')}
          </button>
        </div>
      </div>
    </div>
  )
}
