// Rich text editor for note editing (TipTap)

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Placeholder from '@tiptap/extension-placeholder'
// CharacterCount extension removed — word/char counts computed manually for reliability
import { useTranslation } from 'react-i18next'
import { apiClient } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Save,
  X,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  Minus,
  Undo2,
  Redo2,
  Loader2,
  Palette,
} from 'lucide-react'

interface NoteEditorProps {
  noteId: string
  initialContent: string
  onSave: (html: string, json: object) => Promise<void>
  onCancel: () => void
}

// Custom Image extension that accepts <img> tags without src (NAS placeholders)
// and preserves width/height attributes for NoteStation images
const NoteStationImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.width ? { width: attributes.width } : {},
      },
      height: {
        default: null,
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.height ? { height: attributes.height } : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: 'img' }] // Accept img WITHOUT src requirement (placeholders)
  },
})

// Add auth token to NAS image URLs so they display in the editor
function addNasImageTokens(html: string, token: string | null): string {
  if (!token) return html
  return html.replace(
    /src="(\/api\/(?:nas-images|images)\/[^"?]+)"/g,
    `src="$1?token=${token}"`
  )
}

// Strip auth tokens from NAS image URLs before saving
function stripNasImageTokens(html: string): string {
  return html.replace(
    /src="(\/api\/(?:nas-images|images)\/[^"?]+)\?token=[^"]*"/g,
    'src="$1"'
  )
}

// Toolbar button component with active state and tooltip
function ToolbarBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors',
        'hover:text-foreground hover:bg-accent',
        active && 'bg-accent text-foreground shadow-sm'
      )}
    >
      {children}
    </button>
  )
}

function ToolbarSep() {
  return <div className="w-px h-5 bg-border mx-0.5" />
}

export function NoteEditor({ noteId, initialContent, onSave, onCancel }: NoteEditorProps) {
  const { t } = useTranslation()
  const [isSaving, setIsSaving] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [, setRenderKey] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const token = apiClient.getToken()

  const extensions = useMemo(
    () => [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      NoteStationImage,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder: t('notes.editorPlaceholder', 'Start writing...'),
      }),
    ],
    [t]
  )

  const editorContent = useMemo(
    () => addNasImageTokens(initialContent || '', token),
    [initialContent, token]
  )

  const editor = useEditor({
    extensions,
    content: editorContent,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[50vh] px-6 py-4',
      },
    },
  })

  // Sync content when initialContent changes
  useEffect(() => {
    if (!editor) return
    editor.commands.setContent(addNasImageTokens(initialContent || '', token))
  }, [editor, initialContent, token])

  // Update word/char count and force re-render for toolbar active states
  useEffect(() => {
    if (!editor) return

    const updateCounts = () => {
      const text = editor.getText({ blockSeparator: '\n' })
      setCharCount(text.length)
      const trimmed = text.trim()
      setWordCount(trimmed ? trimmed.split(/\s+/).length : 0)
    }

    updateCounts()
    const forceRender = () => setRenderKey(k => k + 1)

    editor.on('update', updateCounts)
    editor.on('selectionUpdate', forceRender)

    return () => {
      editor.off('update', updateCounts)
      editor.off('selectionUpdate', forceRender)
    }
  }, [editor])

  const handleSave = useCallback(async () => {
    if (!editor || isSaving) return
    setIsSaving(true)
    try {
      const html = stripNasImageTokens(editor.getHTML())
      await onSave(html, editor.getJSON())
    } finally {
      setIsSaving(false)
    }
  }, [editor, isSaving, onSave])

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleSave])

  const handleInsertLink = () => {
    if (!editor) return
    const existing = editor.getAttributes('link').href
    const href = window.prompt('URL', existing || 'https://')
    if (href === null) return
    if (href === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }

  const handleUpload = async (file: File) => {
    const token = apiClient.getToken()
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`/api/notes/${noteId}/attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    })

    if (!response.ok) {
      throw new Error(t('common.errorOccurred'))
    }

    return response.json() as Promise<{ url: string; name: string }>
  }

  const handleInsertFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !editor) return

    const uploaded = await handleUpload(file)
    if (file.type.startsWith('image/')) {
      editor.chain().focus().setImage({ src: uploaded.url, alt: uploaded.name }).run()
    } else {
      editor.chain().focus().insertContent(`<a href="${uploaded.url}">${uploaded.name}</a>`).run()
    }

    event.target.value = ''
  }

  const iconSize = 'h-4 w-4'

  return (
    <div className="border border-border rounded-lg overflow-hidden flex flex-col">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-muted/50 border-b border-border backdrop-blur-sm">
        {/* Undo / Redo */}
        <ToolbarBtn
          onClick={() => editor?.chain().focus().undo().run()}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().redo().run()}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className={iconSize} />
        </ToolbarBtn>

        <ToolbarSep />

        {/* Headings */}
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor?.isActive('heading', { level: 1 })}
          title="Heading 1 (Ctrl+Alt+1)"
        >
          <Heading1 className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor?.isActive('heading', { level: 2 })}
          title="Heading 2 (Ctrl+Alt+2)"
        >
          <Heading2 className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor?.isActive('heading', { level: 3 })}
          title="Heading 3 (Ctrl+Alt+3)"
        >
          <Heading3 className={iconSize} />
        </ToolbarBtn>

        <ToolbarSep />

        {/* Inline formatting */}
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive('bold')}
          title="Bold (Ctrl+B)"
        >
          <Bold className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive('italic')}
          title="Italic (Ctrl+I)"
        >
          <Italic className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          active={editor?.isActive('underline')}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          active={editor?.isActive('strike')}
          title="Strikethrough (Ctrl+Shift+S)"
        >
          <Strikethrough className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
          active={editor?.isActive('highlight')}
          title="Highlight"
        >
          <Highlighter className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleCode().run()}
          active={editor?.isActive('code')}
          title="Inline Code (Ctrl+E)"
        >
          <Code className={iconSize} />
        </ToolbarBtn>

        <ToolbarSep />

        {/* Block elements */}
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive('bulletList')}
          title="Bullet List"
        >
          <List className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive('orderedList')}
          title="Ordered List"
        >
          <ListOrdered className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          active={editor?.isActive('blockquote')}
          title="Blockquote"
        >
          <Quote className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          <Minus className={iconSize} />
        </ToolbarBtn>

        <ToolbarSep />

        {/* Insert items */}
        <ToolbarBtn
          onClick={handleInsertLink}
          active={editor?.isActive('link')}
          title="Insert Link (Ctrl+K)"
        >
          <LinkIcon className={iconSize} />
        </ToolbarBtn>
        <label
          title="Upload Image/File"
          className={cn(
            'inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors cursor-pointer',
            'hover:text-foreground hover:bg-accent'
          )}
        >
          <ImageIcon className={iconSize} />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleInsertFile}
          />
        </label>
        <ToolbarBtn
          onClick={() =>
            editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          title="Insert Table"
        >
          <TableIcon className={iconSize} />
        </ToolbarBtn>

        <ToolbarSep />

        {/* Color picker */}
        <label
          title="Text Color"
          className={cn(
            'inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors cursor-pointer',
            'hover:text-foreground hover:bg-accent'
          )}
        >
          <Palette className={iconSize} />
          <input
            type="color"
            className="sr-only"
            onChange={event => editor?.chain().focus().setColor(event.target.value).run()}
          />
        </label>
      </div>

      {/* Editor content area */}
      <EditorContent
        editor={editor}
        className={cn(
          'prose max-w-none flex-1',
          'prose-headings:font-semibold prose-headings:text-foreground',
          'prose-p:text-foreground prose-p:leading-7',
          'prose-a:text-primary hover:prose-a:text-primary/80',
          'prose-strong:text-foreground',
          'prose-code:text-foreground prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm',
          'prose-pre:bg-muted prose-pre:border prose-pre:border-border',
          'prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground',
          'prose-ul:text-foreground prose-ol:text-foreground',
          'prose-li:text-foreground prose-li:marker:text-muted-foreground',
          'prose-img:rounded-lg prose-img:border prose-img:border-border',
          '[&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground/50',
          '[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.tiptap_p.is-editor-empty:first-child::before]:float-left',
          '[&_.tiptap_p.is-editor-empty:first-child::before]:h-0',
          '[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none',
        )}
      />

      {/* Footer with word count and actions */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20">
        <span className="text-xs text-muted-foreground">
          {wordCount} {t('notes.words', 'words')} · {charCount} {t('notes.chars', 'chars')}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-input text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={onCancel}
          >
            <X className="h-3.5 w-3.5" />
            {t('notes.cancelEdit')}
          </button>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
              isSaving && 'opacity-50 cursor-not-allowed'
            )}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isSaving ? t('common.saving') : t('notes.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  )
}
