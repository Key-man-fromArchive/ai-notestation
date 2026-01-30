// @TASK P5-T5.3 - AI 채팅 컴포넌트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#ai-workbench-페이지

import { useAIStream } from '@/hooks/useAIStream'
import { LoadingSpinner } from './LoadingSpinner'
import { cn } from '@/lib/utils'
import { Send, Square } from 'lucide-react'

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
export function AIChat({ feature, model, className }: AIChatProps) {
  const { content, isStreaming, error, startStream, stopStream, reset } =
    useAIStream()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const message = formData.get('message') as string

    if (!message.trim()) return

    await startStream({ message, feature, model })
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* 입력 폼 */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          name="message"
          placeholder="메시지를 입력하세요..."
          disabled={isStreaming}
          className={cn(
            'flex-1 px-4 py-2 border border-input rounded-md',
            'bg-background text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-all duration-200',
            'motion-reduce:transition-none'
          )}
          aria-label="AI 메시지 입력"
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
          'min-h-[200px] p-4 border border-input rounded-md bg-muted/30',
          'whitespace-pre-wrap break-words'
        )}
        aria-live="polite"
        aria-busy={isStreaming}
      >
        {error && (
          <div className="text-destructive" role="alert">
            오류가 발생했습니다: {error}
          </div>
        )}

        {isStreaming && !content && <LoadingSpinner />}

        {content && (
          <div className="text-foreground">
            {content}
            {isStreaming && (
              <span className="inline-block w-1 h-4 ml-1 bg-primary animate-pulse" />
            )}
          </div>
        )}

        {!isStreaming && !content && !error && (
          <div className="text-muted-foreground text-center">
            메시지를 입력하고 전송을 눌러 시작하세요
          </div>
        )}
      </div>

      {/* 리셋 버튼 */}
      {content && !isStreaming && (
        <button
          type="button"
          onClick={reset}
          className="self-end px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
        >
          새 대화
        </button>
      )}
    </div>
  )
}
