import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { List, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Editor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/react'

interface HeadingItem {
  id: string
  text: string
  level: number
  pos: number
}

interface OutlinePanelProps {
  editor: Editor | null
  className?: string
}

function extractHeadings(json: JSONContent): HeadingItem[] {
  const headings: HeadingItem[] = []
  let pos = 0

  function walk(node: JSONContent) {
    if (node.type === 'heading' && node.attrs?.level) {
      const level = node.attrs.level as number
      if (level >= 1 && level <= 3) {
        const text = (node.content || [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text || '')
          .join('')
        if (text.trim()) {
          headings.push({
            id: `heading-${headings.length}`,
            text: text.trim(),
            level,
            pos,
          })
        }
      }
    }
    pos++
    if (node.content) {
      for (const child of node.content) {
        walk(child)
      }
    }
  }

  if (json.content) {
    for (const child of json.content) {
      walk(child)
    }
  }

  return headings
}

export function OutlinePanel({ editor, className }: OutlinePanelProps) {
  const { t } = useTranslation()
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [activeHeading, setActiveHeading] = useState<string | null>(null)

  const updateHeadings = useCallback(() => {
    if (!editor) {
      setHeadings([])
      return
    }
    const json = editor.getJSON()
    setHeadings(extractHeadings(json))
  }, [editor])

  useEffect(() => {
    updateHeadings()
    if (!editor) return

    editor.on('update', updateHeadings)
    return () => {
      editor.off('update', updateHeadings)
    }
  }, [editor, updateHeadings])

  // Track which heading is closest to cursor
  useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      const { from } = editor.state.selection
      // Find the closest heading before cursor position
      let closest: HeadingItem | null = null
      for (const h of headings) {
        if (h.pos <= from) {
          closest = h
        }
      }
      setActiveHeading(closest?.id ?? null)
    }

    editor.on('selectionUpdate', handleSelectionUpdate)
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate)
    }
  }, [editor, headings])

  const handleClick = (heading: HeadingItem) => {
    if (!editor) return

    // Find the heading node in the document
    let targetPos: number | null = null
    editor.state.doc.descendants((node, pos) => {
      if (targetPos !== null) return false
      if (node.type.name === 'heading' && node.attrs.level === heading.level) {
        const text = node.textContent.trim()
        if (text === heading.text) {
          targetPos = pos
          return false
        }
      }
    })

    if (targetPos !== null) {
      editor.chain().focus().setTextSelection(targetPos + 1).run()
      // Scroll the heading into view
      const domNode = editor.view.domAtPos(targetPos + 1)
      if (domNode?.node) {
        const el = domNode.node instanceof HTMLElement ? domNode.node : domNode.node.parentElement
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  if (headings.length === 0) {
    return (
      <div className={cn('p-4 text-sm text-muted-foreground', className)}>
        <div className="flex items-center gap-2 mb-2 font-medium text-foreground">
          <List className="h-4 w-4" />
          {t('outline.title', 'Outline')}
        </div>
        <p className="text-xs">{t('outline.empty', 'No headings found')}</p>
      </div>
    )
  }

  return (
    <div className={cn('p-3 overflow-y-auto', className)}>
      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
        <List className="h-4 w-4" />
        {t('outline.title', 'Outline')}
      </div>
      <nav className="space-y-0.5">
        {headings.map((heading) => (
          <button
            key={heading.id}
            onClick={() => handleClick(heading)}
            className={cn(
              'flex items-center gap-1 w-full text-left text-sm py-1 px-2 rounded transition-colors truncate',
              heading.level === 1 && 'pl-2 font-medium',
              heading.level === 2 && 'pl-5',
              heading.level === 3 && 'pl-8 text-xs',
              activeHeading === heading.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
            <span className="truncate">{heading.text}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
