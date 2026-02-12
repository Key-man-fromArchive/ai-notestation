// @TASK P5-T5.3 - AI 채팅 컴포넌트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#ai-workbench-페이지

import { useState } from 'react'
import { useAIStream } from '@/hooks/useAIStream'
import { MarkdownRenderer } from './MarkdownRenderer'
import { LoadingSpinner } from './LoadingSpinner'
import { cn } from '@/lib/utils'
import { Send, Square, Copy, Check, FileText } from 'lucide-react'

interface AIChatProps {
  feature: 'insight' | 'search_qa' | 'writing' | 'spellcheck' | 'template'
  model: string
  className?: string
}

/**
 * AI 채팅 컴포넌트
 * - SSE 스트리밍 응답
 * - aria-live="polite" for streaming response
 * - AbortController로 스트림 정리
 */
const TEMPLATE_TYPES = [
  { id: 'experiment_log', label: '실험 기록' },
  { id: 'lab_report', label: '실험 보고서' },
  { id: 'meeting_notes', label: '회의록' },
  { id: 'paper_review', label: '논문 리뷰' },
  { id: 'research_proposal', label: '연구 제안서' },
] as const

export function AIChat({ feature, model, className }: AIChatProps) {
  const { content, isStreaming, error, matchedNotes, startStream, stopStream, reset } =
    useAIStream()
  const [copied, setCopied] = useState(false)
  const [templateType, setTemplateType] = useState(TEMPLATE_TYPES[0].id)

  const isSearchMode = feature === 'insight'
  const isTemplateMode = feature === 'template'

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const message = (formData.get('message') as string) ?? ''

    if (isTemplateMode) {
      await startStream({
        message: templateType,
        feature,
        model,
        options: message.trim() ? { custom_instructions: message.trim() } : {},
      })
      return
    }

    if (!message.trim()) return

    await startStream({
      message,
      feature,
      model,
      ...(isSearchMode ? { options: { mode: 'search' } } : {}),
    })
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* 입력 폼 */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        {isTemplateMode && (
          <select
            value={templateType}
            onChange={(e) => setTemplateType(e.target.value)}
            disabled={isStreaming}
            className={cn(
              'px-3 py-2 border border-input rounded-md',
              'bg-background text-foreground text-sm',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            aria-label="템플릿 유형 선택"
          >
            {TEMPLATE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          name="message"
          placeholder={
            isTemplateMode
              ? '추가 요청사항 (선택)...'
              : isSearchMode
                ? '검색어를 입력하세요 (예: asg pcr)...'
                : '메시지를 입력하세요...'
          }
          disabled={isStreaming}
          className={cn(
            'flex-1 px-4 py-2 border border-input rounded-md',
            'bg-background text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-all duration-200',
            'motion-reduce:transition-none'
          )}
          aria-label={isTemplateMode ? '추가 요청사항 입력' : 'AI 메시지 입력'}
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={stopStream}
            className={cn(
              'px-4 py-2 bg-destructive text-destructive-foreground rounded-md',
              'hover:bg-destructive/90',
              'flex items-center gap-2',
              'transition-colors duration-200',
              'motion-reduce:transition-none'
            )}
            aria-label="스트리밍 중단"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            중단
          </button>
        ) : (
          <button
            type="submit"
            className={cn(
              'px-4 py-2 bg-primary text-primary-foreground rounded-md',
              'hover:bg-primary/90',
              'flex items-center gap-2',
              'transition-colors duration-200',
              'motion-reduce:transition-none'
            )}
            aria-label="전송"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            전송
          </button>
        )}
      </form>

      {/* 응답 영역 */}
      <div
        className={cn(
          'min-h-[200px] border border-input rounded-lg bg-muted/20 overflow-hidden',
          'relative'
        )}
        aria-live="polite"
        aria-busy={isStreaming}
      >
        {/* Copy button */}
        {content && !isStreaming && (
          <button
            type="button"
            onClick={handleCopy}
            className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors z-10"
            aria-label={copied ? '복사됨' : '결과 복사'}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        )}

        <div className="p-4">
          {/* 매칭된 노트 표시 (검색 모드) */}
          {matchedNotes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-input">
              <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
                <FileText className="h-3 w-3" aria-hidden="true" />
                참조 노트:
              </span>
              {matchedNotes.map((note) => (
                <span
                  key={note.note_id}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary"
                  title={`${note.title} (관련도: ${(note.score * 100).toFixed(0)}%)`}
                >
                  {note.title.length > 30 ? note.title.slice(0, 30) + '...' : note.title}
                </span>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm" role="alert">
              <span className="font-medium">오류:</span> {error}
            </div>
          )}

          {isStreaming && !content && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <LoadingSpinner />
              <span className="text-sm">AI가 응답을 생성하고 있습니다...</span>
            </div>
          )}

          {content && (
            <div>
              <MarkdownRenderer content={content} className="text-sm" />
              {isStreaming && (
                <span className="inline-block w-1.5 h-5 ml-1 bg-primary animate-pulse rounded-sm" />
              )}
            </div>
          )}

          {!isStreaming && !content && !error && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Send className="h-8 w-8 mb-3 opacity-30" />
              <p className="text-sm">
                {isTemplateMode
                  ? '템플릿 유형을 선택하고 전송을 눌러 생성하세요'
                  : isSearchMode
                    ? '검색어를 입력하면 관련 노트를 찾아 인사이트를 도출합니다'
                    : '메시지를 입력하고 전송을 눌러 시작하세요'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 리셋 버튼 */}
      {content && !isStreaming && (
        <button
          type="button"
          onClick={reset}
          className="self-end px-3 py-1.5 text-sm bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
        >
          새 대화
        </button>
      )}
    </div>
  )
}
