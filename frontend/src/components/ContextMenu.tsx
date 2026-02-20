import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ContextMenuItem {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  danger?: boolean
}

export interface ContextMenuSeparator {
  type: 'separator'
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose: () => void
}

function isSeparator(entry: ContextMenuEntry): entry is ContextMenuSeparator {
  return 'type' in entry && entry.type === 'separator'
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  const getPosition = useCallback(() => {
    if (!menuRef.current) return { top: y, left: x }
    const rect = menuRef.current.getBoundingClientRect()
    let top = y
    let left = x
    if (x + rect.width > window.innerWidth - 8) {
      left = window.innerWidth - rect.width - 8
    }
    if (y + rect.height > window.innerHeight - 8) {
      top = window.innerHeight - rect.height - 8
    }
    return { top, left }
  }, [x, y])

  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const { top, left } = getPosition()
    el.style.top = `${top}px`
    el.style.left = `${left}px`
  }, [getPosition])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  return createPortal(
    <>
      <div className="fixed inset-0 z-[59]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        ref={menuRef}
        className="fixed z-[60] min-w-[180px] bg-popover rounded-lg border border-border shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100"
        style={{ top: y, left: x }}
      >
        {items.map((entry, i) => {
          if (isSeparator(entry)) {
            return <div key={i} className="my-1 border-t border-border" />
          }
          return (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                if (!entry.disabled && !entry.loading) {
                  entry.onClick()
                  onClose()
                }
              }}
              disabled={entry.disabled || entry.loading}
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                entry.danger
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              {entry.loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : entry.icon}
              <span>{entry.label}</span>
            </button>
          )
        })}
      </div>
    </>,
    document.body,
  )
}
