import { useEffect, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'

export interface ContextMenuItem {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

interface AttachmentContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function AttachmentContextMenu({ x, y, items, onClose }: AttachmentContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Adjust position to stay within viewport
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

  // Close on Escape
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

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[59]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-[60] min-w-[180px] bg-background rounded-lg border border-border shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100"
        style={{ top: y, left: x }}
      >
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => {
              if (!item.disabled && !item.loading) {
                item.onClick()
                onClose()
              }
            }}
            disabled={item.disabled || item.loading}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {item.loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}
