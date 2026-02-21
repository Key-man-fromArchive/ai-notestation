import { BubbleMenu, type Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ExternalLink,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZE_OPTIONS = [
  { value: 'small', label: 'S', hint: '25%' },
  { value: 'medium', label: 'M', hint: '50%' },
  { value: 'large', label: 'L', hint: '75%' },
  { value: 'fit', label: 'Fit', hint: '100%' },
] as const

const ALIGN_OPTIONS = [
  { value: 'left', icon: AlignLeft },
  { value: 'center', icon: AlignCenter },
  { value: 'right', icon: AlignRight },
] as const

interface ImageBubbleMenuProps {
  editor: Editor
  onViewImage: (src: string) => void
}

export function ImageBubbleMenu({ editor, onViewImage }: ImageBubbleMenuProps) {
  const { t } = useTranslation()

  const currentSize = (editor.getAttributes('image')['data-size'] as string) || 'fit'
  const currentAlign = (editor.getAttributes('image')['data-align'] as string) || 'center'
  const src = editor.getAttributes('image').src as string | undefined

  const setSize = (size: string) => {
    editor.chain().focus().updateAttributes('image', { 'data-size': size }).run()
  }

  const setAlign = (align: string) => {
    editor.chain().focus().updateAttributes('image', { 'data-align': align }).run()
  }

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e }) => e.isActive('image')}
      tippyOptions={{ duration: 150, placement: 'top' }}
      className="flex items-center gap-1 rounded-lg border border-border bg-popover px-2 py-1.5 shadow-lg"
    >
      {/* Size toggle */}
      {SIZE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={`${t(`image.${opt.value}`, opt.hint)}`}
          onClick={() => setSize(opt.value)}
          className={cn(
            'px-2 py-1 rounded text-xs font-medium transition-colors',
            currentSize === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}

      <div className="w-px h-5 bg-border mx-1" />

      {/* Alignment toggle */}
      {ALIGN_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={t(`image.align${opt.value.charAt(0).toUpperCase() + opt.value.slice(1)}`, opt.value)}
          onClick={() => setAlign(opt.value)}
          className={cn(
            'p-1 rounded transition-colors',
            currentAlign === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <opt.icon className="h-4 w-4" />
        </button>
      ))}

      <div className="w-px h-5 bg-border mx-1" />

      {/* Open in new tab */}
      {src && (
        <button
          type="button"
          title={t('image.openInNewTab', 'Open in new tab')}
          onClick={() => window.open(src, '_blank')}
          className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      )}

      {/* View in modal */}
      {src && (
        <button
          type="button"
          title={t('image.view', 'View image')}
          onClick={() => onViewImage(src)}
          className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Eye className="h-4 w-4" />
        </button>
      )}
    </BubbleMenu>
  )
}
