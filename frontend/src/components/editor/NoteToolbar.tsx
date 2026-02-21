import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  Notebook, Tag, Calendar, Share2, AlertTriangle, CloudOff, CloudUpload,
  CloudDownload, Loader2, Check, Sparkles, X, Plus, Wand2, Save,
  AlertCircle, Globe,
} from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useAutoTagNote } from '@/hooks/useAutoTag'
import { useTimezone, formatDateWithTz } from '@/hooks/useTimezone'
import type { Note } from '@/types/note'
import type { NoteEditorHandle } from '@/components/NoteEditor'

interface NoteToolbarProps {
  note: Note
  editorRef: React.RefObject<NoteEditorHandle | null>
  editorSaveStatus: 'idle' | 'saving' | 'saved' | 'error'
  onOpenSharing: () => void
  onOpenCaptureInsert: () => void
}

export function NoteToolbar({ note, editorRef, editorSaveStatus, onOpenSharing, onOpenCaptureInsert }: NoteToolbarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const timezone = useTimezone()
  const autoTagNote = useAutoTagNote()

  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'success' | 'error' | 'skipped' | 'conflict'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
  const [pullState, setPullState] = useState<'idle' | 'syncing' | 'success' | 'error' | 'skipped' | 'conflict'>('idle')
  const [pullMessage, setPullMessage] = useState('')
  const [summarizeState, setSummarizeState] = useState<'idle' | 'loading' | 'preview'>('idle')
  const [suggestedTitle, setSuggestedTitle] = useState('')
  const [suggestedTags, setSuggestedTags] = useState<string[]>([])
  const [isApplying, setIsApplying] = useState(false)

  const formatDate = (iso: string) => formatDateWithTz(iso, timezone)

  const handlePushSync = async (force = false) => {
    if (syncState === 'syncing') return
    setSyncState('syncing')
    setSyncMessage('')
    try {
      const url = force ? `/sync/push/${note.note_id}?force=true` : `/sync/push/${note.note_id}`
      const res = await apiClient.post(url, {}) as { status: string; message: string; new_note_id?: string }
      if (res.status === 'success') {
        setSyncState('success')
        setSyncMessage(res.message)
        if (res.new_note_id) {
          queryClient.invalidateQueries({ queryKey: ['notes'] })
          navigate(`/notes/${res.new_note_id}`, { replace: true })
          return
        }
        queryClient.invalidateQueries({ queryKey: ['note', note.note_id] })
        queryClient.invalidateQueries({ queryKey: ['notes'] })
        setTimeout(() => setSyncState('idle'), 3000)
      } else if (res.status === 'skipped') {
        setSyncState('skipped')
        setSyncMessage(res.message)
        setTimeout(() => setSyncState('idle'), 3000)
      } else if (res.status === 'conflict') {
        setSyncState('conflict')
        setSyncMessage(res.message)
      } else {
        setSyncState('error')
        setSyncMessage(res.message || t('notes.syncFailed'))
        setTimeout(() => setSyncState('idle'), 3000)
      }
    } catch {
      setSyncState('error')
      setSyncMessage(t('notes.syncFailed'))
      setTimeout(() => setSyncState('idle'), 3000)
    }
  }

  const handlePullSync = async (force = false) => {
    if (pullState === 'syncing') return
    setPullState('syncing')
    setPullMessage('')
    try {
      const url = force ? `/sync/pull/${note.note_id}?force=true` : `/sync/pull/${note.note_id}`
      const res = await apiClient.post(url, {}) as { status: string; message: string }
      if (res.status === 'success') {
        setPullState('success')
        setPullMessage(res.message)
        queryClient.invalidateQueries({ queryKey: ['note', note.note_id] })
        queryClient.invalidateQueries({ queryKey: ['notes'] })
        setTimeout(() => setPullState('idle'), 3000)
      } else if (res.status === 'skipped') {
        setPullState('skipped')
        setPullMessage(res.message)
        setTimeout(() => setPullState('idle'), 3000)
      } else if (res.status === 'conflict') {
        setPullState('conflict')
        setPullMessage(res.message)
      } else {
        setPullState('error')
        setPullMessage(res.message || t('notes.pullFailed'))
        setTimeout(() => setPullState('idle'), 3000)
      }
    } catch {
      setPullState('error')
      setPullMessage(t('notes.pullFailed'))
      setTimeout(() => setPullState('idle'), 3000)
    }
  }

  const handleSummarize = async () => {
    if (summarizeState === 'loading') return
    setSummarizeState('loading')
    try {
      const res = await apiClient.post<{ content: string }>('/ai/chat', {
        feature: 'summarize',
        content: note.content || note.title,
        note_id: note.note_id,
      })
      const parsed = JSON.parse(res.content)
      setSuggestedTitle(parsed.title || '')
      setSuggestedTags(parsed.tags || [])
      setSummarizeState('preview')
    } catch {
      setSummarizeState('idle')
    }
  }

  const handleApplySummary = async () => {
    if (isApplying) return
    setIsApplying(true)
    try {
      await apiClient.put(`/notes/${note.note_id}`, {
        title: suggestedTitle,
        tags: suggestedTags,
      })
      queryClient.invalidateQueries({ queryKey: ['note', note.note_id] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      setSummarizeState('idle')
    } catch {
      // keep preview open on error
    } finally {
      setIsApplying(false)
    }
  }

  const handleCancelSummary = () => {
    setSummarizeState('idle')
    setSuggestedTitle('')
    setSuggestedTags([])
  }

  return (
    <>
      {/* Title + action buttons */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-2xl font-bold text-foreground">{note.title}</h1>
        <div className="flex items-center gap-2">
          {/* Sync status badges */}
          {note.sync_status === 'local_modified' && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
              <CloudOff className="h-3.5 w-3.5" />
              {t('notes.unsynced')}
            </span>
          )}
          {note.sync_status === 'conflict' && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('notes.conflictResolve')}
            </span>
          )}
          {note.sync_status === 'local_only' && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-700">
              <CloudOff className="h-3.5 w-3.5" />
              {t('notes.localOnly')}
            </span>
          )}
          {/* Save button */}
          <button
            onClick={() => editorRef.current?.save()}
            disabled={editorSaveStatus === 'saving'}
            className={`inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border transition-colors ${
              editorSaveStatus === 'saved'
                ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : editorSaveStatus === 'error'
                  ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                  : 'border-input text-muted-foreground hover:text-foreground hover:border-primary/30'
            }`}
          >
            {editorSaveStatus === 'saving' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : editorSaveStatus === 'saved' ? (
              <Check className="h-3.5 w-3.5" />
            ) : editorSaveStatus === 'error' ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {editorSaveStatus === 'saving'
              ? t('notes.manualSaving', 'Saving...')
              : editorSaveStatus === 'saved'
                ? t('notes.manualSaved', 'Saved')
                : editorSaveStatus === 'error'
                  ? t('notes.saveFailed')
                  : t('notes.manualSave', 'Save')}
          </button>
          {/* Pull button (NAS -> local) */}
          {pullState === 'conflict' ? (
            <div className="inline-flex items-center gap-1">
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {pullMessage || t('notes.localModified')}
              </span>
              <button
                onClick={() => handlePullSync(true)}
                className="text-xs px-2 py-1.5 rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
              >
                {t('notes.forcePull')}
              </button>
              <button
                onClick={() => setPullState('idle')}
                className="text-xs px-2 py-1.5 rounded border border-input text-muted-foreground hover:text-foreground"
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => handlePullSync()}
              disabled={pullState === 'syncing'}
              title={pullMessage || undefined}
              className={`inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border transition-colors ${
                pullState === 'success'
                  ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : pullState === 'error'
                    ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                    : pullState === 'skipped'
                      ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                      : 'border-input text-muted-foreground hover:text-foreground hover:border-primary/30'
              }`}
            >
              {pullState === 'syncing' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : pullState === 'success' ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <CloudDownload className="h-3.5 w-3.5" />
              )}
              {pullState === 'syncing' ? t('notes.pulling') : pullState === 'success' ? t('notes.done') : pullState === 'error' ? t('notes.failed') : pullState === 'skipped' ? t('notes.noChanges') : t('notes.pull')}
            </button>
          )}
          {/* Push button (local -> NAS) */}
          {syncState === 'conflict' ? (
            <div className="inline-flex items-center gap-1">
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {syncMessage || t('notes.nasNewer')}
              </span>
              <button
                onClick={() => handlePushSync(true)}
                className="text-xs px-2 py-1.5 rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
              >
                {t('notes.forcePush')}
              </button>
              <button
                onClick={() => setSyncState('idle')}
                className="text-xs px-2 py-1.5 rounded border border-input text-muted-foreground hover:text-foreground"
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => handlePushSync()}
              disabled={syncState === 'syncing'}
              title={syncMessage || undefined}
              className={`inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border transition-colors ${
                syncState === 'success'
                  ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : syncState === 'error'
                    ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                    : syncState === 'skipped'
                      ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                      : 'border-input text-muted-foreground hover:text-foreground hover:border-primary/30'
              }`}
            >
              {syncState === 'syncing' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : syncState === 'success' ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <CloudUpload className="h-3.5 w-3.5" />
              )}
              {syncState === 'syncing' ? t('notes.pushing') : syncState === 'success' ? t('notes.done') : syncState === 'error' ? t('notes.failed') : syncState === 'skipped' ? t('notes.noModification') : t('notes.push')}
            </button>
          )}
          <button
            onClick={handleSummarize}
            disabled={summarizeState === 'loading'}
            className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border border-input text-muted-foreground hover:text-foreground hover:border-violet-400/50 hover:text-violet-600"
          >
            {summarizeState === 'loading' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {summarizeState === 'loading' ? t('notes.generating') : t('notes.generateTitle')}
          </button>
          <button
            onClick={onOpenCaptureInsert}
            className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border border-input text-muted-foreground hover:text-foreground hover:border-primary/30"
          >
            <Globe className="h-3.5 w-3.5" />
            {t('capture.insertButton')}
          </button>
          <button
            onClick={onOpenSharing}
            className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border border-input text-muted-foreground hover:text-foreground hover:border-primary/30"
          >
            <Share2 className="h-3.5 w-3.5" />
            {t('notes.share')}
          </button>
        </div>
      </div>

      {/* AI title/tag suggestion preview */}
      {summarizeState === 'preview' && (
        <div className="mb-4 rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-900/20 p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-violet-700 dark:text-violet-400">
            <Sparkles className="h-4 w-4" />
            {t('notes.aiSuggestion')}
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('notes.suggestedTitle')}</label>
              <input
                type="text"
                value={suggestedTitle}
                onChange={(e) => setSuggestedTitle(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded border border-violet-200 dark:border-violet-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-600"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('notes.suggestedTags')}</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {suggestedTags.map((tag, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400"
                  >
                    {tag}
                    <button
                      onClick={() => setSuggestedTags(suggestedTags.filter((_, j) => j !== i))}
                      className="hover:text-violet-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={handleCancelSummary}
                className="text-xs px-3 py-1.5 rounded border border-input text-muted-foreground hover:text-foreground"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleApplySummary}
                disabled={isApplying}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-violet-600 dark:bg-violet-700 text-white hover:bg-violet-700 dark:hover:bg-violet-600 disabled:opacity-50"
              >
                {isApplying && <Loader2 className="h-3 w-3 animate-spin" />}
                {t('common.apply')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="flex flex-col gap-3 mb-6 pb-6 border-b border-border">
        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
          {note.notebook && (
            <div className="flex items-center gap-1.5">
              <Notebook className="h-4 w-4" aria-hidden="true" />
              <span>{note.notebook}</span>
            </div>
          )}
          {note.updated_at && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              <time dateTime={note.updated_at}>{formatDate(note.updated_at)}</time>
            </div>
          )}
          {note.created_at && note.updated_at && note.created_at !== note.updated_at && (
            <span className="text-xs text-muted-foreground/70">
              ({t('notes.created')}: {formatDate(note.created_at)})
            </span>
          )}
        </div>
        {/* Tags */}
        <div className="flex items-center gap-2 flex-wrap">
          {note.tags.length > 0 && (
            <>
              <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {note.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
                >
                  {tag}
                </span>
              ))}
              <button
                onClick={() => autoTagNote.mutate(note.note_id)}
                disabled={autoTagNote.isPending}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                title={t('notes.autoTag')}
              >
                {autoTagNote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </button>
            </>
          )}
          {note.tags.length === 0 && (
            <button
              onClick={() => autoTagNote.mutate(note.note_id)}
              disabled={autoTagNote.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {autoTagNote.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('notes.autoTagging')}</>
              ) : (
                <><Wand2 className="h-3.5 w-3.5" />{t('notes.autoTag')}</>
              )}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
