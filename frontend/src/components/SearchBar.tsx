// @TASK P5-T5.3 - 검색 입력 바 (자동완성 포함)
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-페이지

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSearchSuggestions } from '@/hooks/useSearchSuggestions'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/**
 * 검색 입력 바 (자동완성 드롭다운 포함)
 * - role="searchbox"
 * - aria-label for 접근성
 * - 자동완성 드롭다운 (2자 이상 입력 시)
 */
export function SearchBar({
  value,
  onChange,
  placeholder,
  className,
}: SearchBarProps) {
  const { t } = useTranslation()
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: suggestionsData } = useSearchSuggestions(value)
  const suggestions = suggestionsData?.suggestions ?? []
  const defaultPlaceholder = placeholder || t('search.placeholder')

  // Close suggestions on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      onChange(suggestions[selectedIndex])
      setShowSuggestions(false)
      setSelectedIndex(-1)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setSelectedIndex(-1)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        role="searchbox"
        aria-label={t('search.searchLabel')}
        aria-expanded={showSuggestions && suggestions.length > 0}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setShowSuggestions(true)
          setSelectedIndex(-1)
        }}
        onFocus={() => setShowSuggestions(true)}
        onKeyDown={handleKeyDown}
        placeholder={defaultPlaceholder}
        className={cn(
          'w-full pl-10 pr-4 py-2',
          'border border-input rounded-md',
          'bg-background text-foreground',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus:border-transparent',
          'transition-all duration-200',
          'motion-reduce:transition-none'
        )}
      />

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <ul
          role="listbox"
          className={cn(
            'absolute z-50 w-full mt-1',
            'bg-background border border-border rounded-md shadow-lg',
            'max-h-60 overflow-y-auto'
          )}
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion}
              role="option"
              aria-selected={index === selectedIndex}
              className={cn(
                'px-4 py-2 text-sm cursor-pointer',
                'hover:bg-muted transition-colors',
                index === selectedIndex && 'bg-muted'
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(suggestion)
                setShowSuggestions(false)
                setSelectedIndex(-1)
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
