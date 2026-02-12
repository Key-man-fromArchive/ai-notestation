import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAIStream } from '@/hooks/useAIStream'
import { MarkdownRenderer } from './MarkdownRenderer'
import { LoadingSpinner } from './LoadingSpinner'
import { ModelSelector } from './ModelSelector'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api'
import {
  Sparkles,
  Lightbulb,
  CheckCircle,
  FileEdit,
  MessageSquare,
  FileType,
  Copy,
  Check,
  X,
  Send,
  Square,
  FileText,
} from 'lucide-react'

type AIFeature = 'insight' | 'spellcheck' | 'writing' | 'search_qa' | 'template'

interface NoteAIPanelProps {
  noteId: string
  noteContent: string
  noteTitle: string
}

export function NoteAIPanel({ noteId, noteContent, noteTitle }: NoteAIPanelProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  const [activePanel, setActivePanel] = useState<'search_qa' | 'template' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { content, isStreaming, error, matchedNotes, startStream, stopStream, reset } = useAIStream()

  /** Quick actions: send note content immediately */
  const quickActions: { id: AIFeature; icon: typeof Lightbulb }[] = [
    { id: 'insight', icon: Lightbulb },
    { id: 'spellcheck', icon: CheckCircle },
    { id: 'writing', icon: FileEdit },
  ]

  /** Template types (synced with backend VALID_TEMPLATE_TYPES) */
  const templateTypes = [
    'experiment_log',
    'paper_review',
    'meeting_notes',
    'lab_report',
    'research_proposal',
  ]

  const plainText = noteContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const truncated = plainText.slice(0, 8000)

  const handleQuickAction = async (action: AIFeature) => {
    setActivePanel(null)
    reset()
    await startStream({
      message: truncated,
      feature: action,
      model: selectedModel || undefined,
      noteId,
    })
  }

  const handleOpenPanel = (panel: 'search_qa' | 'template') => {
    setActivePanel(panel)
    reset()
    if (panel === 'search_qa') {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleSearchSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const message = (formData.get('ai_input') as string)?.trim()
    if (!message) return

    reset()
    await startStream({
      message,
      feature: 'search_qa',
      model: selectedModel || undefined,
      options: { mode: 'search' },
    })
  }

  const handleTemplateAction = async (templateType: string) => {
    setActivePanel(null)
    reset()
    await startStream({
      message: templateType,
      feature: 'template',
      model: selectedModel || undefined,
    })
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleInsert = async () => {
    if (!content || isSaving) return
    setIsSaving(true)
    const merged = `${noteContent}\n\n---\n\n## ${t('ai.aiSummary')}\n\n${content}`
    await apiClient.put(`/notes/${noteId}`, { content: merged })
    window.location.reload()
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
        {t('ai.analyze')}
      </button>
    )
  }

  return (
    <div className="border border-primary/20 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-primary/10">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" />
          {t('ai.title')} — {noteTitle}
        </div>
        <button
          onClick={() => { setIsOpen(false); reset(); setActivePanel(null) }}
          className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Model selector + Action buttons */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
        <ModelSelector
          value={selectedModel}
          onChange={setSelectedModel}
          className="text-xs py-1.5 px-2 min-w-[140px]"
        />
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action.id)}
                disabled={isStreaming}
                title={t(`ai.insightFeatures.${action.id}`)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md',
                  'border border-input hover:border-primary/30 hover:bg-primary/5',
                  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`ai.insightFeatures.${action.id}`)}
              </button>
            )
          })}
          <span className="w-px h-6 bg-border self-center" />
          <button
            onClick={() => handleOpenPanel('search_qa')}
            disabled={isStreaming}
            title={t('ai.searchQaDesc')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md',
              'border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              activePanel === 'search_qa'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input hover:border-primary/30 hover:bg-primary/5'
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t('ai.searchQa')}
          </button>
          <button
            onClick={() => handleOpenPanel('template')}
            disabled={isStreaming}
            title={t('ai.templateDesc')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md',
              'border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              activePanel === 'template'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input hover:border-primary/30 hover:bg-primary/5'
            )}
          >
            <FileType className="h-3.5 w-3.5" />
            {t('ai.template')}
          </button>
        </div>
      </div>

      {/* Search QA input */}
      {activePanel === 'search_qa' && (
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
          <input
            ref={inputRef}
            type="text"
            name="ai_input"
            placeholder={t('ai.searchQaPlaceholder')}
            disabled={isStreaming}
            className={cn(
              'flex-1 px-3 py-1.5 text-sm border border-input rounded-md',
              'bg-background text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stopStream}
              className="px-3 py-1.5 text-xs bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 flex items-center gap-1"
            >
              <Square className="h-3 w-3" />
              {t('ai.stop')}
            </button>
          ) : (
            <button
              type="submit"
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-1"
            >
              <Send className="h-3 w-3" />
              {t('ai.send')}
            </button>
          )}
        </form>
      )}

      {/* Template type selection */}
      {activePanel === 'template' && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
          <span className="text-xs text-muted-foreground mr-1">{t('ai.selectTemplateType')}:</span>
          {templateTypes.map((templateId) => (
            <button
              key={templateId}
              onClick={() => handleTemplateAction(templateId)}
              disabled={isStreaming}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md',
                'border border-input hover:border-primary/30 hover:bg-primary/5',
                'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {t(`ai.templateTypes.${templateId}`)}
            </button>
          ))}
        </div>
      )}

      {/* Result area */}
      <div className="px-4 py-3 max-h-[400px] overflow-y-auto">
        {error && (
          <div className="text-sm text-destructive" role="alert">
            {t('ai.error')}: {error}
          </div>
        )}

        {isStreaming && !content && (
          <div className="flex items-center gap-3 text-muted-foreground">
            <LoadingSpinner />
            <span className="text-sm">
              {activePanel === 'search_qa' ? t('ai.searchingNotes') : t('ai.analyzingNote')}
            </span>
          </div>
        )}

        {/* Matched notes display (search QA mode) */}
        {matchedNotes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-input">
            <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
              <FileText className="h-3 w-3" />
              {t('ai.referencedNotes')}:
            </span>
            {matchedNotes.map((note) => (
              <span
                key={note.note_id}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary"
                title={`${note.title} (${t('ai.relevance')}: ${(note.score * 100).toFixed(0)}%)`}
              >
                {note.title.length > 25 ? note.title.slice(0, 25) + '...' : note.title}
              </span>
            ))}
          </div>
        )}

        {content && (
          <div className="relative">
            {!isStreaming && (
              <div className="absolute top-0 right-0 flex items-center gap-1.5">
                <button
                  onClick={handleInsert}
                  disabled={isSaving}
                  className={cn(
                    'px-2 py-1 text-[11px] rounded border border-input text-muted-foreground',
                    'hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isSaving ? t('ai.inserting') : t('ai.insertToNote')}
                </button>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label={copied ? t('ai.copied') : t('ai.copyResult')}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}
            <MarkdownRenderer content={content} className="text-sm" />
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary animate-pulse rounded-sm" />
            )}
          </div>
        )}

        {!isStreaming && !content && !error && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {activePanel === 'search_qa'
              ? t('ai.enterQuestionPrompt')
              : activePanel === 'template'
                ? t('ai.selectTemplatePrompt')
                : t('ai.clickToAnalyze')}
          </p>
        )}
      </div>
    </div>
  )
}
