// Search & Replace panel that slides below the editor toolbar

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/react'
import { ChevronUp, ChevronDown, X, Replace, ReplaceAll, CaseSensitive } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchReplacePanelProps {
  editor: Editor
  onClose: () => void
}

export function SearchReplacePanel({ editor, onClose }: SearchReplacePanelProps) {
  const { t } = useTranslation()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)

  const storage = editor.storage.searchAndReplace as {
    results: { from: number; to: number }[]
    currentIndex: number
  }
  const resultCount = storage.results.length
  const currentIndex = storage.currentIndex

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus()
    // If there's selected text, use it as initial search term
    const { from, to } = editor.state.selection
    if (from !== to) {
      const selectedText = editor.state.doc.textBetween(from, to)
      if (selectedText.length <= 100) {
        setSearchTerm(selectedText)
        editor.commands.setSearchTerm(selectedText)
      }
    }
  }, [editor])

  const handleClose = useCallback(() => {
    editor.commands.clearSearch()
    onClose()
  }, [editor, onClose])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value)
      editor.commands.setSearchTerm(value)
    },
    [editor]
  )

  const handleReplaceChange = useCallback(
    (value: string) => {
      setReplaceTerm(value)
      editor.commands.setReplaceTerm(value)
    },
    [editor]
  )

  const handleToggleCaseSensitive = useCallback(() => {
    const next = !caseSensitive
    setCaseSensitive(next)
    editor.commands.setCaseSensitive(next)
  }, [editor, caseSensitive])

  const handleNext = useCallback(() => {
    editor.commands.nextMatch()
  }, [editor])

  const handlePrev = useCallback(() => {
    editor.commands.prevMatch()
  }, [editor])

  const handleReplace = useCallback(() => {
    editor.commands.replaceOne()
  }, [editor])

  const handleReplaceAll = useCallback(() => {
    editor.commands.replaceAll()
  }, [editor])

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        handlePrev()
      } else {
        handleNext()
      }
    }
  }

  const handleReplaceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleReplace()
    }
  }

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5 bg-muted/50 border-x border-b border-border backdrop-blur-sm">
      {/* Search row */}
      <div className="flex items-center gap-1.5">
        <input
          ref={searchInputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder={t('notes.shortcuts.searchReplace', 'Search & Replace')}
          className="flex-1 min-w-0 h-7 px-2 text-sm rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[3.5rem] text-center">
          {resultCount > 0 ? `${currentIndex + 1} / ${resultCount}` : '0 / 0'}
        </span>
        <button
          type="button"
          onClick={handleToggleCaseSensitive}
          title="Case sensitive"
          className={cn(
            'inline-flex items-center justify-center rounded p-1 transition-colors',
            caseSensitive
              ? 'bg-accent text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <CaseSensitive className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handlePrev}
          title="Previous (Shift+Enter)"
          disabled={resultCount === 0}
          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleNext}
          title="Next (Enter)"
          disabled={resultCount === 0}
          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          title="Close (Esc)"
          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Replace row */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={replaceTerm}
          onChange={(e) => handleReplaceChange(e.target.value)}
          onKeyDown={handleReplaceKeyDown}
          placeholder={t('common.search', 'Replace')}
          className="flex-1 min-w-0 h-7 px-2 text-sm rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={handleReplace}
          title="Replace"
          disabled={resultCount === 0}
          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <Replace className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleReplaceAll}
          title="Replace All"
          disabled={resultCount === 0}
          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ReplaceAll className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
