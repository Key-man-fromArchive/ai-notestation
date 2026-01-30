// @TASK P5-T5.2 - 노트 카드 컴포넌트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-목록

import { Link } from 'react-router-dom'
import { FileText, Tag, Notebook } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NoteListItem } from '@/types/note'

interface NoteCardProps {
  note: NoteListItem
  className?: string
}

/**
 * 노트 카드 컴포넌트
 * - 제목, 스니펫(2줄 제한), 노트북명, 수정일, 태그
 * - 클릭 시 /notes/:id 로 이동
 * - hover 효과, focus ring (접근성)
 */
export function NoteCard({ note, className }: NoteCardProps) {
  const formattedDate = new Date(note.updated_at).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <Link
      to={`/notes/${note.id}`}
      className={cn(
        'block p-4 border border-border rounded-lg',
        'hover:border-primary/50 hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'transition-all duration-200',
        className
      )}
      role="listitem"
    >
      {/* 제목 */}
      <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {note.title}
      </h3>

      {/* 스니펫 (2줄 제한) */}
      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
        {note.snippet}
      </p>

      {/* 메타정보 */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {/* 노트북 */}
        <div className="flex items-center gap-1">
          <Notebook className="h-3 w-3" aria-hidden="true" />
          <span>{note.notebook}</span>
        </div>

        {/* 수정일 */}
        <time dateTime={note.updated_at}>{formattedDate}</time>

        {/* 태그 */}
        {note.tags.length > 0 && (
          <div className="flex items-center gap-1">
            <Tag className="h-3 w-3" aria-hidden="true" />
            <span>{note.tags.join(', ')}</span>
          </div>
        )}
      </div>
    </Link>
  )
}
