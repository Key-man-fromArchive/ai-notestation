// @TASK P5-T5.2 - 마크다운 렌더링 컴포넌트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#마크다운-렌더링
// @TEST frontend/src/__tests__/NoteDetail.test.tsx

import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

const NOTESTATION_IMAGE_PREFIX = 'notestation-image:'

/**
 * Custom img component that renders NoteStation image placeholders
 * as styled cards with filename and dimensions.
 */
const markdownComponents: Components = {
  img: ({ alt, width, height, ...props }) => {
    if (alt?.startsWith(NOTESTATION_IMAGE_PREFIX)) {
      const filename = alt.slice(NOTESTATION_IMAGE_PREFIX.length)
      const dims =
        width && height ? `${width} \u00d7 ${height}` : ''

      return (
        <span className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 my-3 not-prose">
          <svg
            className="h-8 w-8 shrink-0 text-muted-foreground"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
            />
          </svg>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground truncate">
              {filename}
            </span>
            {dims && (
              <span className="block text-xs text-muted-foreground">
                {dims}
              </span>
            )}
            <span className="block text-xs text-muted-foreground mt-0.5">
              NoteStation embedded image
            </span>
          </span>
        </span>
      )
    }

    // Regular image
    return <img alt={alt} width={width} height={height} {...props} />
  },
}

/**
 * 마크다운 렌더링 컴포넌트
 * - react-markdown + rehype-sanitize (XSS 방지)
 * - NoteStation 이미지 플레이스홀더 카드 렌더링
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
      <ReactMarkdown
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
