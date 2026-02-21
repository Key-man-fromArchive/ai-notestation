import { useEffect } from 'react'
import { type Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import {
  X,
  ExternalLink,
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZE_OPTIONS = [
  { value: 'small', label: 'S', hint: '25%' },
  { value: 'medium', label: 'M', hint: '50%' },
  { value: 'large', label: 'L', hint: '75%' },
  { value: 'fit', label: 'Fit', hint: '100%' },
] as const

interface ImageViewerModalProps {
  src: string
  editor: Editor
  onClose: () => void
}

export function ImageViewerModal({ src, editor, onClose }: ImageViewerModalProps) {
  const { t } = useTranslation()

  const currentSize = (editor.getAttributes('image')['data-size'] as string) || 'fit'

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const setSize = (size: string) => {
    editor.chain().focus().updateAttributes('image', { 'data-size': size }).run()
  }

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = src
    a.download = src.split('/').pop() || 'image'
    a.click()
  }

  const filename = decodeURIComponent(src.split('/').pop()?.split('?')[0] || 'Image')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex flex-col max-w-[90vw] max-h-[90vh] rounded-xl border border-border bg-popover shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-foreground truncate max-w-[60vw]">
            {filename}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Image container — scrollable */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[200px]">
          <img
            src={src}
            alt={filename}
            className="max-w-full max-h-[70vh] rounded-lg object-contain"
          />
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <div className="flex items-center gap-1">
            {SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={`${t(`image.${opt.value}`, opt.hint)}`}
                onClick={() => setSize(opt.value)}
                className={cn(
                  'px-3 py-1.5 rounded text-xs font-medium transition-colors',
                  currentSize === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title={t('image.openInNewTab', 'Open in new tab')}
              onClick={() => window.open(src, '_blank')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('image.openInNewTab', 'Open in new tab')}
            </button>
            <button
              type="button"
              title={t('image.download', 'Download')}
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              {t('image.download', 'Download')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
