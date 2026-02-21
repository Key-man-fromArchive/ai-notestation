import { useEffect, useRef } from 'react'
import { type Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ExternalLink,
  Eye,
  Download,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageContextMenuProps {
  x: number
  y: number
  src: string
  editor: Editor
  onClose: () => void
  onViewImage: (src: string) => void
}

const SIZE_OPTIONS = [
  { value: 'small', labelKey: 'image.small', fallback: 'Small (25%)' },
  { value: 'medium', labelKey: 'image.medium', fallback: 'Medium (50%)' },
  { value: 'large', labelKey: 'image.large', fallback: 'Large (75%)' },
  { value: 'fit', labelKey: 'image.fit', fallback: 'Fit (100%)' },
] as const

const ALIGN_OPTIONS = [
  { value: 'left', labelKey: 'image.alignLeft', fallback: 'Left', icon: AlignLeft },
  { value: 'center', labelKey: 'image.alignCenter', fallback: 'Center', icon: AlignCenter },
  { value: 'right', labelKey: 'image.alignRight', fallback: 'Right', icon: AlignRight },
] as const

export function ImageContextMenu({ x, y, src, editor, onClose, onViewImage }: ImageContextMenuProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  const currentSize = (editor.getAttributes('image')['data-size'] as string) || 'fit'
  const currentAlign = (editor.getAttributes('image')['data-align'] as string) || 'center'

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Position adjustment to stay within viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 50,
  }

  const setSize = (size: string) => {
    editor.chain().focus().updateAttributes('image', { 'data-size': size }).run()
    onClose()
  }

  const setAlign = (align: string) => {
    editor.chain().focus().updateAttributes('image', { 'data-align': align }).run()
    onClose()
  }

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = src
    a.download = src.split('/').pop() || 'image'
    a.click()
    onClose()
  }

  return (
    <div
      ref={menuRef}
      style={style}
      className="min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-xl"
    >
      {/* Size section */}
      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
        {t('image.size', 'Image Size')}
      </div>
      {SIZE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setSize(opt.value)}
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors',
            'hover:bg-accent hover:text-foreground',
            currentSize === opt.value ? 'text-primary font-medium' : 'text-foreground'
          )}
        >
          {currentSize === opt.value && <Check className="h-3.5 w-3.5" />}
          {currentSize !== opt.value && <span className="w-3.5" />}
          {t(opt.labelKey, opt.fallback)}
        </button>
      ))}

      <div className="my-1 h-px bg-border" />

      {/* Alignment section */}
      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
        {t('image.align', 'Alignment')}
      </div>
      {ALIGN_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setAlign(opt.value)}
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors',
            'hover:bg-accent hover:text-foreground',
            currentAlign === opt.value ? 'text-primary font-medium' : 'text-foreground'
          )}
        >
          <opt.icon className="h-3.5 w-3.5" />
          {t(opt.labelKey, opt.fallback)}
        </button>
      ))}

      <div className="my-1 h-px bg-border" />

      {/* Actions */}
      <button
        type="button"
        onClick={() => window.open(src, '_blank')}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {t('image.openOriginal', 'Open original in new tab')}
      </button>
      <button
        type="button"
        onClick={() => onViewImage(src)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
      >
        <Eye className="h-3.5 w-3.5" />
        {t('image.view', 'View image')}
      </button>
      <button
        type="button"
        onClick={handleDownload}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        {t('image.download', 'Download')}
      </button>
    </div>
  )
}
