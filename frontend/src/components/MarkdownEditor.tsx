// @TASK P5-T5.3 - 마크다운 에디터
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#ai-workbench-페이지

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import { cn } from '@/lib/utils'
import { Eye, Edit3 } from 'lucide-react'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/**
 * 마크다운 에디터
 * - textarea 입력
 * - 미리보기 토글
 * - XSS 방지 (rehype-sanitize)
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder = '메시지를 입력하세요...',
  className,
}: MarkdownEditorProps) {
  const [isPreview, setIsPreview] = useState(false)

  return (
    <div className={cn('flex flex-col', className)}>
      {/* 토글 버튼 */}
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => setIsPreview(false)}
          className={cn(
            'flex items-center gap-1 px-3 py-1 rounded-md text-sm',
            'transition-colors duration-200 motion-reduce:transition-none',
            !isPreview
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
          aria-pressed={!isPreview}
        >
          <Edit3 className="h-4 w-4" aria-hidden="true" />
          편집
        </button>
        <button
          type="button"
          onClick={() => setIsPreview(true)}
          className={cn(
            'flex items-center gap-1 px-3 py-1 rounded-md text-sm',
            'transition-colors duration-200 motion-reduce:transition-none',
            isPreview
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
          aria-pressed={isPreview}
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          미리보기
        </button>
      </div>

      {/* 편집/미리보기 영역 */}
      {isPreview ? (
        <div className="min-h-[200px] p-4 border border-input rounded-md bg-background prose prose-sm max-w-none">
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
            {value || '*미리보기 내용이 없습니다*'}
          </ReactMarkdown>
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={10}
          className={cn(
            'w-full p-4 border border-input rounded-md',
            'bg-background text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'resize-vertical',
            'transition-all duration-200',
            'motion-reduce:transition-none'
          )}
          aria-label="마크다운 입력"
        />
      )}
    </div>
  )
}
