// Shared dropdown UI for @member and #note mention suggestions

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { User, FileText } from 'lucide-react'

export interface MentionItem {
  id: string
  label: string
  subtitle?: string
  type: 'member' | 'note'
}

interface MentionListProps {
  items: MentionItem[]
  command: (item: MentionItem) => void
}

export const MentionList = forwardRef<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean }, MentionListProps>(
  function MentionList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => {
      setSelectedIndex(0)
    }, [items])

    const selectItem = (index: number) => {
      const item = items[index]
      if (item) {
        command(item)
      }
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length)
          return true
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex)
          return true
        }
        if (event.key === 'Escape') {
          return true
        }
        return false
      },
    }))

    if (!items.length) {
      return (
        <div className="z-50 min-w-[200px] overflow-hidden rounded-lg border border-border bg-popover p-2 shadow-lg">
          <span className="block text-sm text-muted-foreground px-2 py-1">
            No results
          </span>
        </div>
      )
    }

    return (
      <div className="z-50 min-w-[200px] max-h-[280px] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
              index === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'text-popover-foreground hover:bg-accent/50'
            }`}
            onClick={() => selectItem(index)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            {item.type === 'member' ? (
              <User className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-violet-500 dark:text-violet-400" />
            )}
            <div className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.label}</span>
              {item.subtitle && (
                <span className="block truncate text-xs text-muted-foreground">
                  {item.subtitle}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    )
  }
)
