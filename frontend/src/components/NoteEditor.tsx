// Rich text editor for note editing (TipTap)

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
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
import { apiClient } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Save,
  X,
  Highlighter,
} from 'lucide-react'

interface NoteEditorProps {
  noteId: string
  initialContent: string
  onSave: (html: string, json: object) => Promise<void>
  onCancel: () => void
}

const toolbarButton =
  'inline-flex items-center gap-1 rounded border border-input px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5'

// Add auth token to NAS image URLs so they display in the editor
function addNasImageTokens(html: string, token: string | null): string {
  if (!token) return html
  return html.replace(
    /src="(\/api\/nas-images\/[^"?]+)"/g,
    `src="$1?token=${token}"`
  )
}

// Strip auth tokens from NAS image URLs before saving
function stripNasImageTokens(html: string): string {
  return html.replace(
    /src="(\/api\/nas-images\/[^"?]+)\?token=[^"]*"/g,
    'src="$1"'
  )
}

export function NoteEditor({ noteId, initialContent, onSave, onCancel }: NoteEditorProps) {
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const token = apiClient.getToken()

  const extensions = useMemo(
    () => [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Image,
      TextStyle,
      Color,
      Highlight,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    []
  )

  const editorContent = useMemo(
    () => addNasImageTokens(initialContent || '', token),
    [initialContent, token]
  )

  const editor = useEditor({
    extensions,
    content: editorContent,
  })

  useEffect(() => {
    if (!editor) return
    editor.commands.setContent(addNasImageTokens(initialContent || '', token))
  }, [editor, initialContent, token])

  const handleSave = async () => {
    if (!editor || isSaving) return
    setIsSaving(true)
    const html = stripNasImageTokens(editor.getHTML())
    await onSave(html, editor.getJSON())
    setIsSaving(false)
  }

  const handleInsertLink = () => {
    if (!editor) return
    const href = window.prompt('링크 URL을 입력하세요')
    if (!href) return
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
      throw new Error('파일 업로드 실패')
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

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex flex-wrap gap-2 px-3 py-2 bg-muted/30 border-b border-border">
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
          굵게
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
          기울임
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
          밑줄
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
          목록
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
          번호
        </button>
        <button type="button" className={toolbarButton} onClick={handleInsertLink}>
          <LinkIcon className="h-3.5 w-3.5" />
          링크
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
        >
          <Highlighter className="h-3.5 w-3.5" />
          하이라이트
        </button>
        <label className={cn(toolbarButton, 'cursor-pointer')}>
          <ImageIcon className="h-3.5 w-3.5" />
          파일/이미지
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleInsertFile}
          />
        </label>
        <button
          type="button"
          className={toolbarButton}
          onClick={() =>
            editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <TableIcon className="h-3.5 w-3.5" />
          표
        </button>
        <label className={cn(toolbarButton, 'cursor-pointer')}>
          글자색
          <input
            type="color"
            className="ml-2 h-5 w-5 cursor-pointer"
            onChange={event => editor?.chain().focus().setColor(event.target.value).run()}
          />
        </label>
      </div>

      <EditorContent editor={editor} className="prose prose-sm max-w-none p-4" />

      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/20">
        <button
          type="button"
          className="px-3 py-1.5 text-xs rounded border border-input text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          <span className="flex items-center gap-1">
            <X className="h-3.5 w-3.5" />
            취소
          </span>
        </button>
        <button
          type="button"
          className={cn(
            'px-3 py-1.5 text-xs rounded border border-primary/30 text-primary hover:bg-primary/10',
            isSaving && 'opacity-50 cursor-not-allowed'
          )}
          onClick={handleSave}
          disabled={isSaving}
        >
          <span className="flex items-center gap-1">
            <Save className="h-3.5 w-3.5" />
            {isSaving ? '저장 중...' : '저장'}
          </span>
        </button>
      </div>
    </div>
  )
}
