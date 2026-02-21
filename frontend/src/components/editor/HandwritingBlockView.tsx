// Handwriting block view — tldraw canvas with recognition toolbar

import { useCallback, useEffect, useRef, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { Tldraw, getSnapshot, loadSnapshot, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/hooks/useTheme'
import { useHandwritingRecognition } from '@/hooks/useHandwritingRecognition'
import { Type, Pen, Sigma, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function HandwritingBlockView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, editor: tipTapEditor } = props
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { recognize, isLoading } = useHandwritingRecognition()
  const tldrawRef = useRef<Editor | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hasContent, setHasContent] = useState(false)

  // Save drawing data to TipTap attributes (debounced)
  const saveDrawing = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      const ed = tldrawRef.current
      if (!ed) return
      const { document } = getSnapshot(ed.store)
      updateAttributes({ drawingData: JSON.stringify(document) })
    }, 500)
  }, [updateAttributes])

  // Check if canvas has any shapes
  const updateHasContent = useCallback(() => {
    const ed = tldrawRef.current
    if (!ed) return
    setHasContent(ed.getCurrentPageShapes().length > 0)
  }, [])

  // Export canvas to PNG blob
  const exportToPng = useCallback(async (): Promise<Blob | null> => {
    const ed = tldrawRef.current
    if (!ed) return null
    const shapes = ed.getCurrentPageShapes()
    if (shapes.length === 0) return null
    const result = await ed.toImage(shapes, { format: 'png', pixelRatio: 2, background: true })
    return result.blob
  }, [])

  // Convert to text — replaces block with paragraph
  const handleConvertText = useCallback(async () => {
    const blob = await exportToPng()
    if (!blob) return
    const result = await recognize(blob, 'text')
    if (!result) return
    deleteNode()
    tipTapEditor.isEditable &&
      (tipTapEditor as unknown as { commands: { insertContent: (c: string) => void } })
        .commands.insertContent(`<p>${result.text.replace(/\n/g, '<br>')}</p>`)
  }, [exportToPng, recognize, deleteNode, tipTapEditor])

  // Keep as ink — saves OCR text for search indexing
  const handleKeepInk = useCallback(async () => {
    const blob = await exportToPng()
    if (!blob) return
    const result = await recognize(blob, 'ink')
    if (!result) return
    updateAttributes({ ocrText: result.text })
  }, [exportToPng, recognize, updateAttributes])

  // Math to LaTeX — replaces block with LaTeX content
  const handleMathLatex = useCallback(async () => {
    const blob = await exportToPng()
    if (!blob) return
    const result = await recognize(blob, 'math')
    if (!result) return
    const latex = result.latex || result.text
    deleteNode()
    tipTapEditor.isEditable &&
      (tipTapEditor as unknown as { commands: { insertContent: (c: string) => void } })
        .commands.insertContent(`<p>${latex}</p>`)
  }, [exportToPng, recognize, deleteNode, tipTapEditor])

  // Handle tldraw mount — restore snapshot & listen for changes
  const handleMount = useCallback(
    (editor: Editor) => {
      tldrawRef.current = editor

      // Restore saved drawing
      if (node.attrs.drawingData) {
        try {
          const document = JSON.parse(node.attrs.drawingData)
          loadSnapshot(editor.store, { document })
        } catch {
          // Ignore corrupt data
        }
      }

      updateHasContent()

      // Listen for changes
      const unsub = editor.store.listen(() => {
        saveDrawing()
        updateHasContent()
      }, { source: 'user', scope: 'document' })

      return () => {
        unsub()
      }
    },
    [node.attrs.drawingData, saveDrawing, updateHasContent],
  )

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  // Sync dark mode to tldraw
  useEffect(() => {
    const ed = tldrawRef.current
    if (!ed) return
    ed.user.updateUserPreferences({
      colorScheme: resolvedTheme === 'dark' ? 'dark' : 'light',
    })
  }, [resolvedTheme])

  const isEditable = tipTapEditor.isEditable

  return (
    <NodeViewWrapper data-type="handwriting-block" className="my-4">
      {/* Toolbar */}
      {isEditable && (
        <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/50 border border-border rounded-t-lg">
          <ActionBtn
            onClick={handleConvertText}
            disabled={isLoading || !hasContent}
            title={t('handwriting.convertText', 'Convert to Text')}
          >
            <Type className="h-3.5 w-3.5" />
            <span className="text-xs">{t('handwriting.convertText', 'Text')}</span>
          </ActionBtn>

          <ActionBtn
            onClick={handleKeepInk}
            disabled={isLoading || !hasContent}
            title={t('handwriting.keepInk', 'Keep as Ink')}
          >
            <Pen className="h-3.5 w-3.5" />
            <span className="text-xs">{t('handwriting.keepInk', 'Ink')}</span>
          </ActionBtn>

          <ActionBtn
            onClick={handleMathLatex}
            disabled={isLoading || !hasContent}
            title={t('handwriting.mathLatex', 'Math to LaTeX')}
          >
            <Sigma className="h-3.5 w-3.5" />
            <span className="text-xs">{t('handwriting.mathLatex', 'Math')}</span>
          </ActionBtn>

          {isLoading && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('handwriting.recognizing', 'Recognizing...')}
            </span>
          )}

          {node.attrs.ocrText && (
            <span className="text-xs text-green-600 dark:text-green-400 ml-auto truncate max-w-[200px]">
              OCR: {node.attrs.ocrText.slice(0, 50)}…
            </span>
          )}

          <button
            type="button"
            onClick={deleteNode}
            className="ml-auto p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title={t('common.delete', 'Delete')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* tldraw canvas */}
      <div
        className={cn(
          'border border-border rounded-b-lg overflow-hidden',
          !isEditable && 'rounded-t-lg pointer-events-none',
        )}
        style={{ height: 400 }}
      >
        <Tldraw
          inferDarkMode
          autoFocus={false}
          onMount={handleMount}
          forceMobile={false}
        />
      </div>
    </NodeViewWrapper>
  )
}

function ActionBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-1 text-muted-foreground transition-colors',
        'hover:text-foreground hover:bg-accent',
        'disabled:opacity-50 disabled:cursor-not-allowed',
      )}
    >
      {children}
    </button>
  )
}
