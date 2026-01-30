// @TASK P5-T5.2 - Note Detail 페이지 (마크다운 렌더링)
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-상세
// @TEST frontend/src/__tests__/NoteDetail.test.tsx

import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Notebook, Tag, Paperclip, AlertCircle } from 'lucide-react'
import { useNote } from '@/hooks/useNote'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: note, error, isLoading } = useNote(id)

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

  const formattedDate = new Date(note.updated_at).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

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
        <h1 className="text-3xl font-bold text-foreground mb-4">{note.title}</h1>

        {/* 메타정보 */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6 pb-6 border-b border-border">
          {/* 노트북 */}
          <div className="flex items-center gap-1.5">
            <Notebook className="h-4 w-4" aria-hidden="true" />
            <span>{note.notebook}</span>
          </div>

          {/* 수정일 */}
          <time dateTime={note.updated_at}>{formattedDate}</time>

          {/* 태그 */}
          {note.tags.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Tag className="h-4 w-4" aria-hidden="true" />
              <span>{note.tags.join(', ')}</span>
            </div>
          )}
        </div>

        {/* 마크다운 콘텐츠 */}
        <article className="mb-8">
          <MarkdownRenderer content={note.content} />
        </article>

        {/* 첨부파일 */}
        {note.attachments.length > 0 && (
          <section className="border-t border-border pt-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Paperclip className="h-5 w-5" aria-hidden="true" />
              첨부파일
            </h2>
            <ul className="space-y-2">
              {note.attachments.map((attachment, index) => (
                <li key={index}>
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:text-primary/80 underline"
                  >
                    {attachment.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
