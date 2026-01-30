// @TASK P5-T5.2 - 마크다운 렌더링 컴포넌트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#마크다운-렌더링
// @TEST frontend/src/__tests__/NoteDetail.test.tsx

import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * 마크다운 렌더링 컴포넌트
 * - react-markdown + rehype-sanitize (XSS 방지)
 * - 코드 블록, 테이블, 리스트 스타일링
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        'prose prose-neutral max-w-none',
        'prose-headings:font-semibold prose-headings:text-foreground',
        'prose-p:text-foreground prose-p:leading-7',
        'prose-a:text-primary hover:prose-a:text-primary/80',
        'prose-strong:text-foreground prose-strong:font-semibold',
        'prose-code:text-foreground prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded',
        'prose-pre:bg-muted prose-pre:border prose-pre:border-border',
        'prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground',
        'prose-ul:text-foreground prose-ol:text-foreground',
        'prose-li:text-foreground prose-li:marker:text-muted-foreground',
        'prose-table:text-foreground prose-th:bg-muted',
        'prose-img:rounded-lg prose-img:border prose-img:border-border',
        className
      )}
    >
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
