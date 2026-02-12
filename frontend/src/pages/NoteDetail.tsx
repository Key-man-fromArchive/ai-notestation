// @TASK P5-T5.2 - Note Detail 페이지 (마크다운 렌더링)
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-상세
// @TEST frontend/src/__tests__/NoteDetail.test.tsx

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Notebook, Tag, Paperclip, Image, File, AlertCircle, Calendar, Pencil, Share2, AlertTriangle, CloudOff, CloudUpload, CloudDownload, Loader2, Check, Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '@/lib/api'
import { useNote } from '@/hooks/useNote'
import { useQueryClient } from '@tanstack/react-query'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { NoteAIPanel } from '@/components/NoteAIPanel'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { NoteEditor } from '@/components/NoteEditor'
import { NoteSharing } from '@/components/NoteSharing'
import { ConflictDialog } from '@/components/ConflictDialog'
import { useConflicts } from '@/hooks/useConflicts'
import { useTimezone, formatDateWithTz } from '@/hooks/useTimezone'

export default function NoteDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: note, error, isLoading } = useNote(id)
  const [isEditing, setIsEditing] = useState(false)
  const [isSharingOpen, setIsSharingOpen] = useState(false)
  const [isConflictOpen, setIsConflictOpen] = useState(false)
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'success' | 'error' | 'skipped' | 'conflict'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
  const [pullState, setPullState] = useState<'idle' | 'syncing' | 'success' | 'error' | 'skipped' | 'conflict'>('idle')
  const [pullMessage, setPullMessage] = useState('')
  const { conflicts } = useConflicts()
  const timezone = useTimezone()
  const [summarizeState, setSummarizeState] = useState<'idle' | 'loading' | 'preview'>('idle')
  const [suggestedTitle, setSuggestedTitle] = useState('')
  const [suggestedTags, setSuggestedTags] = useState<string[]>([])
  const [isApplying, setIsApplying] = useState(false)

  const handlePushSync = async (force = false) => {
    if (!id || syncState === 'syncing') return
    setSyncState('syncing')
    setSyncMessage('')
    try {
      const url = force ? `/sync/push/${id}?force=true` : `/sync/push/${id}`
      const res = await apiClient.post(url, {}) as { status: string; message: string }
      if (res.status === 'success') {
        setSyncState('success')
        setSyncMessage(res.message)
        queryClient.invalidateQueries({ queryKey: ['note', id] })
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
    if (!id || pullState === 'syncing') return
    setPullState('syncing')
    setPullMessage('')
    try {
      const url = force ? `/sync/pull/${id}?force=true` : `/sync/pull/${id}`
      const res = await apiClient.post(url, {}) as { status: string; message: string }
      if (res.status === 'success') {
        setPullState('success')
        setPullMessage(res.message)
        queryClient.invalidateQueries({ queryKey: ['note', id] })
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
    if (!note || summarizeState === 'loading') return
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
    if (!note || isApplying) return
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

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // 404 에러
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

  // 기타 에러
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

  // 노트 없음 (예상치 못한 경우)
  if (!note) {
    return null
  }

  const formatDate = (iso: string) => formatDateWithTz(iso, timezone)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* 뒤로가기 버튼 */}
        <button
          onClick={() => navigate('/notes')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('notes.backToList')}
        </button>

        {/* 노트 제목 */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-2xl font-bold text-foreground">{note.title}</h1>
          <div className="flex items-center gap-2">
            {/* Sync status badges */}
            {note.sync_status === 'local_modified' && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                <CloudOff className="h-3.5 w-3.5" />
                {t('notes.unsynced')}
              </span>
            )}
            {note.sync_status === 'conflict' && (
              <button
                onClick={() => setIsConflictOpen(true)}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-red-100 text-red-700 border border-red-200 hover:bg-red-200"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('notes.conflictResolve')}
              </button>
            )}
            {note.sync_status === 'local_only' && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                <CloudOff className="h-3.5 w-3.5" />
                {t('notes.localOnly')}
              </span>
            )}
            {/* Pull button (NAS → local) */}
            {pullState === 'conflict' ? (
              <div className="inline-flex items-center gap-1">
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-amber-300 bg-amber-50 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {pullMessage || t('notes.localModified')}
                </span>
                <button
                  onClick={() => handlePullSync(true)}
                  className="text-xs px-2 py-1.5 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
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
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : pullState === 'error'
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : pullState === 'skipped'
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
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
            {/* Push button (local → NAS) */}
            {syncState === 'conflict' ? (
              <div className="inline-flex items-center gap-1">
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-amber-300 bg-amber-50 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {syncMessage || t('notes.nasNewer')}
                </span>
                <button
                  onClick={() => handlePushSync(true)}
                  className="text-xs px-2 py-1.5 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
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
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : syncState === 'error'
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : syncState === 'skipped'
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
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
              onClick={() => setIsSharingOpen(true)}
              className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border border-input text-muted-foreground hover:text-foreground hover:border-primary/30"
            >
              <Share2 className="h-3.5 w-3.5" />
              {t('notes.share')}
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border border-input text-muted-foreground hover:text-foreground hover:border-primary/30"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('notes.editNote')}
            </button>
          </div>
        </div>

        {/* AI 제목/태그 제안 미리보기 */}
        {summarizeState === 'preview' && (
          <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50/50 p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-violet-700">
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
                  className="w-full px-3 py-1.5 text-sm rounded border border-violet-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('notes.suggestedTags')}</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {suggestedTags.map((tag, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700"
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
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {isApplying && <Loader2 className="h-3 w-3 animate-spin" />}
                  {t('common.apply')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 메타정보 */}
        <div className="flex flex-col gap-3 mb-6 pb-6 border-b border-border">
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            {/* 노트북 */}
            {note.notebook && (
              <div className="flex items-center gap-1.5">
                <Notebook className="h-4 w-4" aria-hidden="true" />
                <span>{note.notebook}</span>
              </div>
            )}

            {/* 수정일 */}
            {note.updated_at && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                <time dateTime={note.updated_at}>{formatDate(note.updated_at)}</time>
              </div>
            )}

            {/* 생성일 (수정일과 다른 경우만 표시) */}
            {note.created_at && note.updated_at && note.created_at !== note.updated_at && (
              <span className="text-xs text-muted-foreground/70">
                ({t('notes.created')}: {formatDate(note.created_at)})
              </span>
            )}
          </div>

          {/* 태그 - pill 스타일 */}
          {note.tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {note.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* AI 분석 패널 */}
        <div className="mb-6">
          <NoteAIPanel noteId={note.note_id} noteContent={note.content} noteTitle={note.title} />
        </div>

        {/* 마크다운 콘텐츠 */}
        <article className="mb-8">
          {isEditing ? (
            <NoteEditor
              noteId={note.note_id}
              initialContent={note.content}
              onCancel={() => setIsEditing(false)}
              onSave={async (html, json) => {
                await apiClient.put(`/notes/${note.note_id}`, { content: html, content_json: json })
                setIsEditing(false)
                queryClient.invalidateQueries({ queryKey: ['note', note.note_id] })
                queryClient.invalidateQueries({ queryKey: ['notes'] })
              }}
            />
          ) : (
            <MarkdownRenderer content={note.content} />
          )}
        </article>

        {/* 첨부파일 */}
        {(note.attachments?.length ?? 0) > 0 && (
          <section className="border-t border-border pt-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Paperclip className="h-5 w-5" aria-hidden="true" />
              {t('notes.attachments')}
              <span className="text-sm font-normal text-muted-foreground">
                ({note.attachments?.length})
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {note.attachments?.map((attachment, index) => {
                const ext = attachment.name.split('.').pop()?.toLowerCase() ?? ''
                const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)
                const Icon = isImage ? Image : File
                return (
                  <div
                    key={index}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm text-foreground truncate">{attachment.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground uppercase shrink-0">{ext}</span>
                    <button
                      onClick={async () => {
                        const fileId = attachment.file_id ?? attachment.url.split('/').pop()
                        if (!fileId) return
                        await apiClient.delete(`/notes/${note.note_id}/attachments/${fileId}`)
                        window.location.reload()
                      }}
                      className="text-xs text-muted-foreground hover:text-destructive ml-2"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      <NoteSharing
        noteId={note.note_id}
        isOpen={isSharingOpen}
        onClose={() => setIsSharingOpen(false)}
      />

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
  )
}
