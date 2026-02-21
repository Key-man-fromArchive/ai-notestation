import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/react'
import { X, MessageSquarePlus, Check, Trash2, CornerDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useComments } from '@/hooks/useComments'

interface CommentPanelProps {
  editor: Editor
  noteId: string
  onClose: () => void
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function CommentPanel({ editor, noteId, onClose }: CommentPanelProps) {
  const { t } = useTranslation()
  const { comments, createComment, resolveComment, deleteComment } = useComments(noteId)
  const [newContent, setNewContent] = useState('')
  const [hasSelection, setHasSelection] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Track whether the editor has a text selection
  useEffect(() => {
    const update = () => {
      const { from, to } = editor.state.selection
      setHasSelection(from !== to)
    }
    update()
    editor.on('selectionUpdate', update)
    return () => { editor.off('selectionUpdate', update) }
  }, [editor])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = useCallback(() => {
    if (!newContent.trim() || !hasSelection) return
    const commentId = crypto.randomUUID()
    // Apply mark to selected text
    editor.chain().focus().setComment(commentId).run()
    // Save to backend
    createComment.mutate({ comment_id: commentId, content: newContent.trim() })
    setNewContent('')
  }, [editor, newContent, hasSelection, createComment])

  const handleResolve = useCallback((commentId: string) => {
    resolveComment.mutate(commentId)
  }, [resolveComment])

  const handleDelete = useCallback((commentId: string) => {
    // Remove mark from editor
    editor.commands.unsetComment(commentId)
    // Delete from backend
    deleteComment.mutate(commentId)
  }, [editor, deleteComment])

  const handleClickComment = useCallback((commentId: string) => {
    // Find the mark in the document and scroll to it
    let foundPos: number | null = null
    editor.state.doc.descendants((node, pos) => {
      if (foundPos !== null) return false
      if (!node.isText) return
      const mark = node.marks.find(
        (m) => m.type.name === 'commentMark' && m.attrs.commentId === commentId
      )
      if (mark) {
        foundPos = pos
        return false
      }
    })
    if (foundPos !== null) {
      editor.commands.setTextSelection(foundPos)
      const dom = editor.view.domAtPos(foundPos)
      const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [editor])

  // Check if a comment's mark still exists in the document
  const hasMarkInDoc = useCallback((commentId: string): boolean => {
    let found = false
    editor.state.doc.descendants((node) => {
      if (found) return false
      if (!node.isText) return
      if (node.marks.some((m) => m.type.name === 'commentMark' && m.attrs.commentId === commentId)) {
        found = true
        return false
      }
    })
    return found
  }, [editor])

  const resolved = comments.filter(c => c.is_resolved)
  const active = comments.filter(c => !c.is_resolved)

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5 bg-muted/50 border-x border-b border-border backdrop-blur-sm max-h-72 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <MessageSquarePlus className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground">
          {t('comments.title', 'Comments')}
          {comments.length > 0 && (
            <span className="ml-1 text-muted-foreground">({comments.length})</span>
          )}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Add comment form — only when text is selected */}
      {hasSelection && (
        <div className="flex items-start gap-1.5">
          <textarea
            ref={textareaRef}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder={t('comments.placeholder', 'Add a comment...')}
            rows={2}
            className="flex-1 text-xs px-2 py-1.5 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!newContent.trim() || createComment.isPending}
            className="px-2 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {t('comments.add', 'Add')}
          </button>
        </div>
      )}

      {!hasSelection && comments.length === 0 && (
        <div className="text-xs text-muted-foreground px-1">
          {t('comments.selectText', 'Select text to add a comment')}
        </div>
      )}

      {/* Active comments */}
      {active.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {active.map((c) => {
            const orphan = !hasMarkInDoc(c.comment_id)
            return (
              <div
                key={c.comment_id}
                className="flex items-start gap-2 px-2 py-1 rounded text-xs cursor-pointer hover:bg-accent/40 transition-colors"
                onClick={() => !orphan && handleClickComment(c.comment_id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground truncate">{c.user_name}</span>
                    <span className="text-muted-foreground shrink-0">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className={cn('text-foreground/80 mt-0.5', orphan && 'italic text-muted-foreground')}>
                    {c.content}
                    {orphan && <span className="ml-1 text-muted-foreground">({t('comments.textRemoved', 'text removed')})</span>}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleResolve(c.comment_id) }}
                    title={t('comments.resolve', 'Resolve')}
                    className="p-0.5 rounded text-muted-foreground hover:text-green-600 hover:bg-accent transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.comment_id) }}
                    title={t('comments.delete', 'Delete')}
                    className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Resolved comments */}
      {resolved.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mt-1">
            {t('comments.resolved', 'Resolved')} ({resolved.length})
          </div>
          <div className="flex flex-col gap-0.5 opacity-60">
            {resolved.map((c) => (
              <div
                key={c.comment_id}
                className="flex items-start gap-2 px-2 py-1 rounded text-xs cursor-pointer hover:bg-accent/40 transition-colors"
                onClick={() => handleClickComment(c.comment_id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground truncate line-through">{c.user_name}</span>
                    <span className="text-muted-foreground shrink-0">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-foreground/60 mt-0.5 line-through">{c.content}</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleResolve(c.comment_id) }}
                    title={t('comments.unresolve', 'Unresolve')}
                    className="p-0.5 rounded text-muted-foreground hover:text-amber-600 hover:bg-accent transition-colors"
                  >
                    <CornerDownRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.comment_id) }}
                    title={t('comments.delete', 'Delete')}
                    className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
