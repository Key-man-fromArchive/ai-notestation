// @TASK P5-T5.3 - AI Chat Component
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#ai-workbench-페이지

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAIStream } from '@/hooks/useAIStream'
import { MarkdownRenderer } from './MarkdownRenderer'
import { LoadingSpinner } from './LoadingSpinner'
import { cn } from '@/lib/utils'
import { Send, Square, Copy, Check, FileText, ShieldCheck, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

interface AIChatProps {
  feature: 'insight' | 'search_qa' | 'writing' | 'spellcheck' | 'template'
  model: string
  className?: string
}

/**
 * AI Chat Component
 * - SSE streaming response
 * - aria-live="polite" for streaming response
 * - AbortController for stream cleanup
 */
const TEMPLATE_TYPES = [
  'experiment_log',
  'lab_report',
  'meeting_notes',
  'paper_review',
  'research_proposal',
] as const

export function AIChat({ feature, model, className }: AIChatProps) {
  const { t } = useTranslation()
  const { content, isStreaming, error, matchedNotes, qualityResult, startStream, stopStream, reset } =
    useAIStream()
  const [copied, setCopied] = useState(false)
  const [qualityExpanded, setQualityExpanded] = useState(false)
  const [templateType, setTemplateType] = useState<(typeof TEMPLATE_TYPES)[number]>(TEMPLATE_TYPES[0])

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
      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        {isTemplateMode && (
          <select
            value={templateType}
            onChange={(e) => setTemplateType(e.target.value as typeof TEMPLATE_TYPES[number])}
            disabled={isStreaming}
            className={cn(
              'px-3 py-2 border border-input rounded-md',
              'bg-background text-foreground text-sm',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            aria-label={t('ai.selectTemplateType')}
          >
            {TEMPLATE_TYPES.map((templateId) => (
              <option key={templateId} value={templateId}>
                {t(`ai.templateTypes.${templateId}`)}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          name="message"
          placeholder={
            isTemplateMode
              ? t('ai.additionalInstructions')
              : isSearchMode
                ? t('ai.searchPlaceholder')
                : t('ai.chatPlaceholder')
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
          aria-label={isTemplateMode ? t('ai.additionalInstructions') : t('ai.messageInput')}
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
            aria-label={t('ai.stopStreaming')}
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            {t('ai.stop')}
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
            aria-label={t('ai.send')}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {t('ai.send')}
          </button>
        )}
      </form>

      {/* Response area */}
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
            aria-label={copied ? t('ai.copied') : t('ai.copyResult')}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        )}

        <div className="p-4">
          {/* Matched notes display (search mode) */}
          {matchedNotes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-input">
              <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
                <FileText className="h-3 w-3" aria-hidden="true" />
                {t('ai.referencedNotes')}:
              </span>
              {matchedNotes.map((note) => (
                <span
                  key={note.note_id}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary"
                  title={`${note.title} (${t('ai.relevance')}: ${(note.score * 100).toFixed(0)}%)`}
                >
                  {note.title.length > 30 ? note.title.slice(0, 30) + '...' : note.title}
                </span>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm" role="alert">
              <span className="font-medium">{t('ai.error')}:</span> {error}
            </div>
          )}

          {isStreaming && !content && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <LoadingSpinner />
              <span className="text-sm">{t('ai.aiGenerating')}</span>
            </div>
          )}

          {content && (
            <div>
              <MarkdownRenderer content={content} className="text-sm" />
              {isStreaming && (
                <span className="inline-block w-1.5 h-5 ml-1 bg-primary animate-pulse rounded-sm" />
              )}

              {/* Quality badge */}
              {qualityResult && !isStreaming && (
                <div className="mt-3 border-t border-border pt-3">
                  <button
                    onClick={() => setQualityExpanded(!qualityExpanded)}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-colors',
                      qualityResult.passed
                        ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
                    )}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {t('ai.qualityScore', { score: (qualityResult.score * 100).toFixed(0) })}
                  </button>

                  {qualityExpanded && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-xs text-muted-foreground">{qualityResult.summary}</p>
                      <ul className="space-y-1">
                        {qualityResult.details.map((item, idx) => (
                          <li key={idx} className="text-xs flex items-start gap-1.5">
                            {item.passed === true && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />}
                            {item.passed === false && <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />}
                            {item.passed === null && <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />}
                            <span>
                              <span className="font-medium">{item.question}</span>
                              {item.note && <span className="text-muted-foreground"> — {item.note}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isStreaming && !content && !error && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Send className="h-8 w-8 mb-3 opacity-30" />
              <p className="text-sm">
                {isTemplateMode
                  ? t('ai.templateModePrompt')
                  : isSearchMode
                    ? t('ai.searchModePrompt')
                    : t('ai.chatModePrompt')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Reset button */}
      {content && !isStreaming && (
        <button
          type="button"
          onClick={reset}
          className="self-end px-3 py-1.5 text-sm bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
        >
          {t('ai.newConversation')}
        </button>
      )}
    </div>
  )
}
