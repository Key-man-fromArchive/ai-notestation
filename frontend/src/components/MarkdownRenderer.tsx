// @TASK P5-T5.2 - 마크다운 렌더링 컴포넌트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#마크다운-렌더링
// @TEST frontend/src/__tests__/NoteDetail.test.tsx

import * as React from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api'

// Custom sanitize schema that allows our API image URLs, table styles, etc.
const sanitizeSchema = {
  ...defaultSchema,
  // Allow data: URIs for images (NAS sometimes stores inline base64 images)
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src || []), 'data'],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'colgroup',
    'col',
  ],
  attributes: {
    ...defaultSchema.attributes,
    img: [
      ...(defaultSchema.attributes?.img || []),
      'src',
      'alt',
      'width',
      'height',
      'loading',
      ['className', 'notestation-image'],
    ],
    // Allow style on table elements for NoteStation HTML tables
    table: [...(defaultSchema.attributes?.table || []), 'style'],
    thead: [...(defaultSchema.attributes?.thead || []), 'style'],
    tbody: [...(defaultSchema.attributes?.tbody || []), 'style'],
    tr: [...(defaultSchema.attributes?.tr || []), 'style'],
    td: [...(defaultSchema.attributes?.td || []), 'style', 'rowSpan', 'colSpan'],
    th: [...(defaultSchema.attributes?.th || []), 'style', 'rowSpan', 'colSpan'],
    col: ['style', 'width', 'span'],
    colgroup: ['style', 'span'],
    span: [...(defaultSchema.attributes?.span || []), 'style'],
    mark: [...(defaultSchema.attributes?.mark || []), 'style'],
  },
}

interface MarkdownRendererProps {
  content: string
  className?: string
}

const NOTESTATION_IMAGE_PREFIX = 'notestation-image:'

/**
 * Placeholder component for NoteStation embedded images.
 *
 * Synology NoteStation does NOT expose a public API for downloading
 * embedded note images, so we display a styled placeholder card showing
 * the filename and dimensions instead.
 */
function ImagePlaceholder({
  filename,
  width,
  height,
}: {
  filename: string
  width?: string | number
  height?: string | number
}) {
  const dims = width && height ? `${width} × ${height}` : ''

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
          <span className="block text-xs text-muted-foreground">{dims}</span>
        )}
        <span className="block text-xs text-muted-foreground mt-0.5">
          NoteStation embedded image
        </span>
      </span>
    </span>
  )
}

/**
 * Image component with loading/error states for NoteStation images.
 */
function NoteStationImage({
  src,
  alt,
  width,
  height,
}: {
  src: string
  alt?: string
  width?: string | number
  height?: string | number
}) {
  const [status, setStatus] = React.useState<'loading' | 'loaded' | 'error'>('loading')

  return (
    <span className="relative inline-block my-3">
      {status === 'loading' && (
        <span className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-lg">
          <span className="animate-pulse text-muted-foreground text-sm">Loading...</span>
        </span>
      )}
      {status === 'error' ? (
        <ImagePlaceholder
          filename={alt || 'Image'}
          width={width}
          height={height}
        />
      ) : (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={cn(
            'rounded-lg border border-border max-w-full h-auto',
            status === 'loading' && 'opacity-0'
          )}
        />
      )}
    </span>
  )
}

/**
 * Custom img component that renders NoteStation image placeholders
 * as styled cards with filename and dimensions.
 */
const markdownComponents: Components = {
  // Wrap tables in a scrollable container to handle wide NoteStation tables
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-4 not-prose">
      <table
        className="min-w-full border-collapse border border-border text-sm"
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  td: ({ children, style, ...props }) => (
    <td
      className="border border-border px-2 py-1.5 text-foreground align-top"
      style={style}
      {...props}
    >
      {children}
    </td>
  ),
  th: ({ children, style, ...props }) => (
    <th
      className="border border-border px-2 py-1.5 bg-muted font-semibold text-foreground align-top"
      style={style}
      {...props}
    >
      {children}
    </th>
  ),
  img: ({ alt, width, height, src, ...props }) => {
    // Check if this is a NoteStation embedded image placeholder
    if (alt?.startsWith(NOTESTATION_IMAGE_PREFIX)) {
      const filename = alt.slice(NOTESTATION_IMAGE_PREFIX.length)
      return <ImagePlaceholder filename={filename} width={width} height={height} />
    }

    // Check if this is an API-served NoteStation image (local or NAS proxy)
    if (src?.startsWith('/api/images/') || src?.startsWith('/api/nas-images/')) {
      // Append auth token for <img> tags (browser can't send Authorization header)
      const token = apiClient.getToken()
      const authedSrc = token ? `${src}${src.includes('?') ? '&' : '?'}token=${token}` : src
      return (
        <NoteStationImage
          src={authedSrc}
          alt={alt}
          width={width}
          height={height}
        />
      )
    }

    // Regular image
    return <img alt={alt} width={width} height={height} src={src} {...props} />
  },
}

/**
 * 마크다운 렌더링 컴포넌트
 * - react-markdown + rehype-sanitize (XSS 방지)
 * - NoteStation 이미지 플레이스홀더 카드 렌더링
 * - 코드 블록, 테이블, 리스트 스타일링
 */
/**
 * Strip outer code fence when the entire content is wrapped in a single
 * ```markdown or ``` block. AI models sometimes wrap their markdown output
 * this way, causing ReactMarkdown to render it as a code block.
 */
function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/)
  return match ? match[1] : text
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const processed = React.useMemo(() => stripOuterCodeFence(content), [content])

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
        'prose-table:text-foreground',
        'prose-img:rounded-lg prose-img:border prose-img:border-border',
        className
      )}
    >
      <ReactMarkdown
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={markdownComponents}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}
