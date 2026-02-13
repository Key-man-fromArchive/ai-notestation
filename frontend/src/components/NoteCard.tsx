// @TASK P5-T5.2 - 노트 카드 컴포넌트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-목록

import { Link, useNavigate } from 'react-router-dom'
import { FileText, Tag, FolderOpen, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NoteListItem } from '@/types/note'

interface NoteCardProps {
  note: NoteListItem
  className?: string
}

/**
 * 노트 카드 컴포넌트
 * - 제목(1줄 truncate), 스니펫(2줄 제한), 노트북명, 수정일, 태그
 * - 클릭 시 /notes/:id 로 이동
 * - hover 효과, focus ring (접근성)
 */
export function NoteCard({ note, className }: NoteCardProps) {
  const navigate = useNavigate()

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation()
    e.preventDefault()
    navigate(`/notes?tag=${encodeURIComponent(tag)}`)
  }

  const formattedDate = note.updated_at ? new Date(note.updated_at).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) : ''

  return (
    <Link
      to={`/notes/${note.note_id}`}
      className={cn(
        'block px-4 py-3 border border-border rounded-lg',
        'hover:border-primary/30 hover:bg-muted/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'transition-all duration-200',
        className
      )}
      role="listitem"
    >
      {/* 제목 - 1줄 강제 truncate */}
      <h3 className="text-sm font-semibold text-foreground truncate mb-1 flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        <span className="truncate">{note.title}</span>
      </h3>

      {/* 스니펫 (2줄 제한) */}
      {note.snippet && (
        <p className="text-xs text-muted-foreground mb-2 line-clamp-2 leading-relaxed pl-5">
          {note.snippet}
        </p>
      )}

      {/* 메타정보 - 한 줄 */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground pl-5">
        {/* 노트북 */}
        {note.notebook && (
          <div className="flex items-center gap-1 min-w-0">
            <FolderOpen className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[120px]">{note.notebook}</span>
          </div>
        )}

        {/* 수정일 */}
        {note.updated_at && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            <time dateTime={note.updated_at}>{formattedDate}</time>
          </div>
        )}

        {/* 태그 (클릭 가능) */}
        {note.tags.length > 0 && (
          <div className="flex items-center gap-1 min-w-0">
            <Tag className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            {note.tags.slice(0, 3).map((tag, i) => (
              <span key={tag}>
                {i > 0 && <span className="text-muted-foreground/50">, </span>}
                <button
                  onClick={(e) => handleTagClick(e, tag)}
                  className="hover:text-primary hover:underline transition-colors"
                >
                  {tag}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
