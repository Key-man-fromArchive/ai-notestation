// AI SpellCheck panel — slides below the editor toolbar

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/react'
import { X, ChevronUp, ChevronDown, Loader2, CheckCircle2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAIStream } from '@/hooks/useAIStream'
import type { SpellError, SpellCheckStorage } from '@/extensions/SpellCheck'

interface SpellCheckPanelProps {
  editor: Editor
  onClose: () => void
}

const TYPE_COLORS: Record<string, string> = {
  spelling: 'bg-red-500',
  grammar: 'bg-blue-500',
  expression: 'bg-amber-500',
}

function ErrorTypeDot({ type }: { type: string }) {
  return (
    <span
      className={cn('inline-block w-2 h-2 rounded-full shrink-0', TYPE_COLORS[type] || 'bg-gray-400')}
    />
  )
}

export function SpellCheckPanel({ editor, onClose }: SpellCheckPanelProps) {
  const { t } = useTranslation()
  const { content, isStreaming, error, startStream, stopStream, reset } = useAIStream()
  const [hasChecked, setHasChecked] = useState(false)

  const storage = editor.storage.spellCheck as SpellCheckStorage
  const errors = storage.errors
  const activeIndex = storage.activeIndex

  // Parse AI response when streaming completes
  useEffect(() => {
    if (isStreaming || !content || hasChecked) return

    try {
      // Strip markdown code fences if AI wrapped the JSON
      let jsonStr = content.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
      }
      const parsed = JSON.parse(jsonStr)
      if (parsed.errors && Array.isArray(parsed.errors)) {
        editor.commands.setSpellCheckErrors(parsed.errors)
      }
      setHasChecked(true)
    } catch {
      // JSON parse failed — might still be streaming or invalid
      console.warn('SpellCheck: failed to parse AI response')
      setHasChecked(true)
    }
  }, [content, isStreaming, hasChecked, editor])

  const handleStartCheck = useCallback(() => {
    editor.commands.clearSpellCheck()
    setHasChecked(false)
    reset()

    const text = editor.getText({ blockSeparator: '\n' })
    if (!text.trim()) return

    startStream({
      message: text,
      feature: 'spellcheck_inline',
    })
  }, [editor, startStream, reset])

  const handleClose = useCallback(() => {
    stopStream()
    editor.commands.clearSpellCheck()
    onClose()
  }, [editor, stopStream, onClose])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  const handleApplyFix = useCallback(
    (index: number) => {
      editor.commands.applyFix(index)
    },
    [editor]
  )

  const handleDismiss = useCallback(
    (index: number) => {
      editor.commands.dismissError(index)
    },
    [editor]
  )

  const handleApplyAll = useCallback(() => {
    editor.commands.applyAllFixes()
  }, [editor])

  const handleClickError = useCallback(
    (index: number) => {
      const storage = editor.storage.spellCheck as SpellCheckStorage
      storage.activeIndex = index
      const err = storage.errors[index]
      if (err) {
        editor.commands.setTextSelection(err.from)
        const dom = editor.view.domAtPos(err.from)
        const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
      // Trigger decoration rebuild
      editor.view.dispatch(
        editor.state.tr.setMeta('spellCheck', { updated: true })
      )
    },
    [editor]
  )

  const handleNext = useCallback(() => {
    editor.commands.nextSpellError()
  }, [editor])

  const handlePrev = useCallback(() => {
    editor.commands.prevSpellError()
  }, [editor])

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5 bg-muted/50 border-x border-b border-border backdrop-blur-sm max-h-60 overflow-y-auto">
      {/* Header row */}
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground">
          {t('spellCheck.title', 'AI Spell Check')}
        </span>

        <div className="flex-1" />

        {/* Start Check / Stop */}
        {isStreaming ? (
          <button
            type="button"
            onClick={stopStream}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('spellCheck.checking', 'Checking...')}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStartCheck}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-border bg-background text-foreground hover:bg-accent transition-colors"
          >
            {t('spellCheck.startCheck', 'Start Check')}
          </button>
        )}

        {/* Apply all */}
        {errors.length > 0 && (
          <button
            type="button"
            onClick={handleApplyAll}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-border bg-background text-foreground hover:bg-accent transition-colors"
          >
            {t('spellCheck.fixAll', 'Fix All')}
          </button>
        )}

        {/* Navigation */}
        {errors.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {activeIndex + 1} / {errors.length}
            </span>
            <button
              type="button"
              onClick={handlePrev}
              className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </>
        )}

        {/* Close */}
        <button
          type="button"
          onClick={handleClose}
          title={t('spellCheck.close', 'Close')}
          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="text-xs text-red-500 px-1">{error}</div>
      )}

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('spellCheck.checking', 'Checking...')}
        </div>
      )}

      {/* No errors state */}
      {hasChecked && !isStreaming && errors.length === 0 && !error && (
        <div className="flex items-center gap-1.5 px-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t('spellCheck.noErrors', 'No errors found!')}
        </div>
      )}

      {/* Error list */}
      {errors.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {errors.map((err: SpellError, i: number) => (
            <div
              key={`${err.from}-${err.to}-${i}`}
              className={cn(
                'flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer transition-colors',
                i === activeIndex
                  ? 'bg-accent/80'
                  : 'hover:bg-accent/40'
              )}
              onClick={() => handleClickError(i)}
            >
              <ErrorTypeDot type={err.type} />
              <span className="text-red-600 dark:text-red-400 line-through shrink-0 max-w-[8rem] truncate">
                {err.original}
              </span>
              <span className="text-muted-foreground shrink-0">&rarr;</span>
              <span className="text-green-600 dark:text-green-400 font-medium shrink-0 max-w-[8rem] truncate">
                {err.corrected}
              </span>
              <span className="text-muted-foreground truncate flex-1">
                {t(`spellCheck.${err.type}`, err.type)}
                {err.explanation ? ` — ${err.explanation}` : ''}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleApplyFix(i) }}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {t('spellCheck.fix', 'Fix')}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDismiss(i) }}
                  className="px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:bg-accent transition-colors"
                >
                  {t('spellCheck.dismiss', 'Dismiss')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
