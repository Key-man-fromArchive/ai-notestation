import { useEffect } from 'react'
import { X } from 'lucide-react'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'

interface ExtractedTextModalProps {
  title: string
  text: string
  pageCount?: number
  onClose: () => void
}

export function ExtractedTextModal({ title, text, pageCount, onClose }: ExtractedTextModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">{title}</h2>
            {pageCount != null && pageCount > 0 && (
              <span className="shrink-0 text-sm text-muted-foreground">
                ({pageCount}p)
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1">
          <div className="prose prose-sm max-w-none">
            <MarkdownRenderer content={text} />
          </div>
        </div>
      </div>
    </div>
  )
}
