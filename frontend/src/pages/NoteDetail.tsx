// @TASK P5-T5.2 - Note Detail 페이지 (마크다운 렌더링)
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-상세
// @TEST frontend/src/__tests__/NoteDetail.test.tsx

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Notebook, Tag, Paperclip, Image, File, AlertCircle, Calendar, Pencil, Share2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useNote } from '@/hooks/useNote'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { NoteAIPanel } from '@/components/NoteAIPanel'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { NoteEditor } from '@/components/NoteEditor'
import { NoteSharing } from '@/components/NoteSharing'

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: note, error, isLoading } = useNote(id)
  const [isEditing, setIsEditing] = useState(false)
  const [isSharingOpen, setIsSharingOpen] = useState(false)

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
        title="노트를 찾을 수 없습니다"
        description="요청하신 노트가 존재하지 않거나 삭제되었습니다."
        action={{
          label: '노트 목록으로',
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
        title="에러가 발생했습니다"
        description={error instanceof Error ? error.message : '알 수 없는 오류'}
        action={{
          label: '다시 시도',
          onClick: () => window.location.reload(),
        }}
      />
    )
  }

  // 노트 없음 (예상치 못한 경우)
  if (!note) {
    return null
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* 뒤로가기 버튼 */}
        <button
          onClick={() => navigate('/notes')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          노트 목록으로
        </button>

        {/* 노트 제목 */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-2xl font-bold text-foreground">{note.title}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSharingOpen(true)}
              className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border border-input text-muted-foreground hover:text-foreground hover:border-primary/30"
            >
              <Share2 className="h-3.5 w-3.5" />
              공유
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border border-input text-muted-foreground hover:text-foreground hover:border-primary/30"
            >
              <Pencil className="h-3.5 w-3.5" />
              편집
            </button>
          </div>
        </div>

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
                (작성: {formatDate(note.created_at)})
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
                window.location.reload()
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
              첨부파일
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
                      삭제
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
    </div>
  )
}
