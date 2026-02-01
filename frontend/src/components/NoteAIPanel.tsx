// AI analysis panel for NoteDetail page
// Provides quick AI actions (insight, spellcheck, writing) on the current note

import { useState } from 'react'
import { useAIStream } from '@/hooks/useAIStream'
import { MarkdownRenderer } from './MarkdownRenderer'
import { LoadingSpinner } from './LoadingSpinner'
import { cn } from '@/lib/utils'
import {
  Sparkles,
  Lightbulb,
  CheckCircle,
  FileEdit,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react'

type QuickAction = 'insight' | 'spellcheck' | 'writing'

const actions: { id: QuickAction; label: string; icon: typeof Lightbulb; description: string }[] = [
  { id: 'insight', label: '인사이트', icon: Lightbulb, description: '핵심 발견 도출' },
  { id: 'spellcheck', label: '교정', icon: CheckCircle, description: '맞춤법/문법 검사' },
  { id: 'writing', label: '보완 제안', icon: FileEdit, description: '내용 보완 제안' },
]

interface NoteAIPanelProps {
  noteContent: string
  noteTitle: string
}

export function NoteAIPanel({ noteContent, noteTitle }: NoteAIPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { content, isStreaming, error, startStream, reset } = useAIStream()

  const handleAction = async (action: QuickAction) => {
    reset()
    // Strip HTML tags for AI input
    const plainText = noteContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const truncated = plainText.slice(0, 8000) // Limit to avoid token overflow

    await startStream({
      message: truncated,
      feature: action,
      model: undefined as unknown as string, // Let backend auto-select
    })
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg',
          'border border-primary/20 text-primary',
          'hover:bg-primary/5 transition-colors'
        )}
      >
        <Sparkles className="h-4 w-4" />
        AI 분석
      </button>
    )
  }

  return (
    <div className="border border-primary/20 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-primary/10">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" />
          AI 분석 — {noteTitle}
        </div>
        <button
          onClick={() => { setIsOpen(false); reset() }}
          className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-4 py-3 border-b border-border">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              disabled={isStreaming}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md',
                'border border-input hover:border-primary/30 hover:bg-primary/5',
                'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {action.label}
            </button>
          )
        })}
      </div>

      {/* Result area */}
      <div className="px-4 py-3 max-h-[400px] overflow-y-auto">
        {error && (
          <div className="text-sm text-destructive" role="alert">
            오류: {error}
          </div>
        )}

        {isStreaming && !content && (
          <div className="flex items-center gap-3 text-muted-foreground">
            <LoadingSpinner />
            <span className="text-sm">노트를 분석하고 있습니다...</span>
          </div>
        )}

        {content && (
          <div className="relative">
            {!isStreaming && (
              <button
                onClick={handleCopy}
                className="absolute top-0 right-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label={copied ? '복사됨' : '결과 복사'}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <MarkdownRenderer content={content} className="text-sm" />
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary animate-pulse rounded-sm" />
            )}
          </div>
        )}

        {!isStreaming && !content && !error && (
          <p className="text-sm text-muted-foreground text-center py-4">
            위 버튼을 클릭하여 이 노트를 AI로 분석하세요
          </p>
        )}
      </div>
    </div>
  )
}
