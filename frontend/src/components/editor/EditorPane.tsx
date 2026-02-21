import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Link2, Notebook, Loader2, AlertCircle, List } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useNote } from '@/hooks/useNote'
import { useConflicts } from '@/hooks/useConflicts'
import { useRelatedNotes } from '@/hooks/useRelatedNotes'
import { useInsertCapture } from '@/hooks/useCapture'
import { cn } from '@/lib/utils'
import { Breadcrumb } from '@/components/Breadcrumb'
import { NoteAIPanel } from '@/components/NoteAIPanel'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { NoteEditor, type NoteEditorHandle } from '@/components/NoteEditor'
import { NoteSharing } from '@/components/NoteSharing'
import { ConflictDialog } from '@/components/ConflictDialog'
import { NoteToolbar } from './NoteToolbar'
import { AttachmentPanel } from './AttachmentPanel'
import { CaptureInsertModal } from './CaptureInsertModal'
import { OutlinePanel } from './OutlinePanel'
import type { Editor } from '@tiptap/react'

interface EditorPaneProps {
  noteId: string | undefined
}

export function EditorPane({ noteId }: EditorPaneProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: note, error, isLoading } = useNote(noteId)
  const { conflicts } = useConflicts()
  const { data: relatedData, isLoading: relatedLoading } = useRelatedNotes(noteId)
  const insertCapture = useInsertCapture(noteId || '')
  const editorRef = useRef<NoteEditorHandle>(null)
  const [editorSaveStatus, setEditorSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [isSharingOpen, setIsSharingOpen] = useState(false)
  const [isConflictOpen, setIsConflictOpen] = useState(false)
  const [isCaptureInsertOpen, setIsCaptureInsertOpen] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const [tiptapEditor, setTiptapEditor] = useState<Editor | null>(null)

  // Poll editor save status and editor instance from ref
  useEffect(() => {
    const interval = setInterval(() => {
      if (editorRef.current) {
        setEditorSaveStatus(editorRef.current.saveStatus)
        const ed = editorRef.current.getEditor()
        if (ed && ed !== tiptapEditor) {
          setTiptapEditor(ed)
        }
      }
    }, 200)
    return () => clearInterval(interval)
  }, [tiptapEditor])

  // Reset "saved" indicator back to idle after 3 seconds
  useEffect(() => {
    if (editorSaveStatus === 'saved') {
      const timer = setTimeout(() => setEditorSaveStatus('idle'), 3000)
      return () => clearTimeout(timer)
    }
  }, [editorSaveStatus])

  // Ctrl+Shift+O: toggle outline
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
        e.preventDefault()
        setShowOutline((v) => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const { data: editorWidthSetting } = useQuery<{ value: string }>({
    queryKey: ['settings', 'editor_width'],
    queryFn: () => apiClient.get('/settings/editor_width'),
  })
  const editorWidthClass = useMemo(() => {
    const w = editorWidthSetting?.value ?? 'comfortable'
    const map: Record<string, string> = {
      compact: 'max-w-3xl',
      comfortable: 'max-w-5xl',
      wide: 'max-w-7xl',
      full: 'max-w-full',
    }
    return map[w] || 'max-w-5xl'
  }, [editorWidthSetting])

  const handleAutoSave = useCallback(async (html: string, json: object) => {
    if (!note) return
    await apiClient.put(`/notes/${note.note_id}`, { content: html, content_json: json })
    queryClient.invalidateQueries({ queryKey: ['notes'] })
  }, [note, queryClient])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error && 'status' in error && error.status === 404) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={t('notes.notFound')}
        description={t('notes.notFoundDesc')}
        action={{
          label: t('notes.backToList'),
          onClick: () => navigate('/notes'),
        }}
      />
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={t('common.errorOccurred')}
        description={error instanceof Error ? error.message : t('common.unknownError')}
        action={{
          label: t('common.retry'),
          onClick: () => window.location.reload(),
        }}
      />
    )
  }

  if (!note) return null

  return (
    <div className="flex h-full">
      {/* Main editor area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className={`${editorWidthClass} mx-auto p-6`}>
          {/* Breadcrumb */}
          <div className="mb-6">
            <Breadcrumb items={[
              { label: t('sidebar.notes'), to: '/notes' },
              ...(note.notebook ? [{ label: note.notebook, to: '/notebooks' }] : []),
              { label: note.title }
            ]} />
          </div>

          {/* Toolbar: title, sync, tags, meta */}
          <NoteToolbar
            note={note}
            editorRef={editorRef}
            editorSaveStatus={editorSaveStatus}
            onOpenSharing={() => setIsSharingOpen(true)}
            onOpenCaptureInsert={() => setIsCaptureInsertOpen(true)}
          />

          {/* AI panel */}
          <div className="mb-6">
            <NoteAIPanel noteId={note.note_id} noteContent={note.content} noteTitle={note.title} />
          </div>

          {/* Editor with outline toggle */}
          <div className="mb-8">
            <div className="flex items-center justify-end mb-2">
              <button
                onClick={() => setShowOutline((v) => !v)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors',
                  showOutline
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
                title={`${t('outline.title', 'Outline')} (Ctrl+Shift+O)`}
              >
                <List className="h-3.5 w-3.5" />
                {t('outline.title', 'Outline')}
              </button>
            </div>
            <article>
              <NoteEditor
                ref={editorRef}
                noteId={note.note_id}
                initialContent={note.content}
                onAutoSave={handleAutoSave}
              />
            </article>
          </div>

          {/* Related notes */}
          {(relatedData?.items?.length ?? 0) > 0 && (
            <section className="border-t border-border pt-6 mb-8">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Link2 className="h-5 w-5" aria-hidden="true" />
                {t('relatedNotes.title')}
                <span className="text-sm font-normal text-muted-foreground">
                  ({relatedData!.items.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {relatedData!.items.map((item) => (
                  <button
                    key={item.note_id}
                    onClick={() => navigate(`/notes/${item.note_id}`)}
                    className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 px-4 py-3 text-left hover:bg-muted/60 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {item.title || t('notes.unknown')}
                      </span>
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {t('relatedNotes.similarity', { percent: Math.round(item.similarity * 100) })}
                      </span>
                    </div>
                    {item.snippet && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.snippet}</p>
                    )}
                    {item.notebook && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                        <Notebook className="h-3 w-3" />
                        <span>{item.notebook}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}
          {relatedLoading && (
            <section className="border-t border-border pt-6 mb-8">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('relatedNotes.loading')}
              </div>
            </section>
          )}

          {/* Attachments */}
          <AttachmentPanel note={note} />
        </div>

        {/* Modals */}
        <NoteSharing
          noteId={note.note_id}
          isOpen={isSharingOpen}
          onClose={() => setIsSharingOpen(false)}
        />

        {isCaptureInsertOpen && (
          <CaptureInsertModal
            noteId={noteId!}
            onClose={() => setIsCaptureInsertOpen(false)}
            insertCapture={insertCapture}
          />
        )}

        {/* Conflict resolution dialog */}
        {note.sync_status === 'conflict' && (() => {
          const conflict = conflicts.find(c => c.note_id === note.note_id)
          if (!conflict) return null
          return (
            <ConflictDialog
              conflict={conflict}
              isOpen={isConflictOpen}
              onClose={() => {
                setIsConflictOpen(false)
                queryClient.invalidateQueries({ queryKey: ['note', note.note_id] })
              }}
            />
          )
        })()}
      </div>

      {/* Outline panel */}
      {showOutline && (
        <OutlinePanel
          editor={tiptapEditor}
          className="w-56 border-l border-border bg-muted/20 shrink-0"
        />
      )}
    </div>
  )
}
