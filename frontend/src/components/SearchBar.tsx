// @TASK P5-T5.3 - 검색 입력 바
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-페이지

import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/**
 * 검색 입력 바
 * - role="searchbox"
 * - aria-label for 접근성
 * - motion-reduce:transition-none
 */
export function SearchBar({
  value,
  onChange,
  placeholder = '노트 검색...',
  className,
}: SearchBarProps) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        role="searchbox"
        aria-label="노트 검색"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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
    </div>
  )
}
