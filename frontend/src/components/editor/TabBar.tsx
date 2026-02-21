import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X, FileText, Columns2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/stores/useTabStore'

export function TabBar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { tabs, activeTabId, closeTab, activateTab, reorderTabs, moveToPaneRight } = useTabStore()
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragSrcIdx = useRef<number | null>(null)
  const [contextMenuTabId, setContextMenuTabId] = useState<string | null>(null)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)

  // Keyboard shortcuts: Ctrl+W close, Ctrl+Tab / Ctrl+Shift+Tab switch
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) {
          const tab = tabs.find(t => t.id === activeTabId)
          if (tab?.isDirty) {
            if (!confirm(t('tabs.unsavedChanges', 'This tab has unsaved changes. Close anyway?'))) return
          }
          closeTab(activeTabId)
          const state = useTabStore.getState()
          if (state.activeTabId) {
            navigate(`/notes/${state.activeTabId}`)
          } else {
            navigate('/notes')
          }
        }
      }

      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        if (tabs.length < 2) return
        const currentIdx = tabs.findIndex(t => t.id === activeTabId)
        const nextIdx = e.shiftKey
          ? (currentIdx - 1 + tabs.length) % tabs.length
          : (currentIdx + 1) % tabs.length
        const nextTab = tabs[nextIdx]
        activateTab(nextTab.id)
        navigate(`/notes/${nextTab.id}`)
      }

      // Ctrl+Alt+D: split toggle
      if (e.ctrlKey && e.altKey && e.key === 'd') {
        e.preventDefault()
        const state = useTabStore.getState()
        if (state.splitMode === 'horizontal') {
          state.closeSplit()
        } else if (state.tabs.length >= 2 && state.activeTabId) {
          const other = state.tabs.find(t => t.id !== state.activeTabId)
          if (other) state.splitView(state.activeTabId, other.id)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [tabs, activeTabId, closeTab, activateTab, navigate, t])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenuTabId) return
    const handler = () => { setContextMenuTabId(null); setContextMenuPos(null) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenuTabId])

  if (tabs.length === 0) return null

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    const tab = tabs.find(t => t.id === tabId)
    if (tab?.isDirty) {
      if (!confirm(t('tabs.unsavedChanges', 'This tab has unsaved changes. Close anyway?'))) return
    }
    closeTab(tabId)
    const state = useTabStore.getState()
    if (state.activeTabId) {
      navigate(`/notes/${state.activeTabId}`)
    } else {
      navigate('/notes')
    }
  }

  const handleMiddleClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      handleClose(e, tabId)
    }
  }

  const handleTabClick = (tabId: string) => {
    activateTab(tabId)
    navigate(`/notes/${tabId}`)
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    dragSrcIdx.current = idx
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }

  const handleDragLeave = () => {
    setDragOverIdx(null)
  }

  const handleDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    setDragOverIdx(null)
    if (dragSrcIdx.current !== null && dragSrcIdx.current !== toIdx) {
      reorderTabs(dragSrcIdx.current, toIdx)
    }
    dragSrcIdx.current = null
  }

  const handleDragEnd = () => {
    setDragOverIdx(null)
    dragSrcIdx.current = null
  }

  // Context menu
  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    setContextMenuTabId(tabId)
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }

  return (
    <div className="flex items-center border-b border-border bg-muted/30 overflow-x-auto scrollbar-none">
      {tabs.map((tab, idx) => (
        <button
          key={tab.id}
          draggable
          onDragStart={(e) => handleDragStart(e, idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, idx)}
          onDragEnd={handleDragEnd}
          onClick={() => handleTabClick(tab.id)}
          onMouseDown={(e) => handleMiddleClick(e, tab.id)}
          onContextMenu={(e) => handleContextMenu(e, tab.id)}
          className={cn(
            'group relative flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors min-w-0 max-w-[200px]',
            tab.id === activeTabId
              ? 'border-primary text-foreground bg-background'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            dragOverIdx === idx && 'border-l-2 border-l-primary'
          )}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{tab.title || t('notes.untitled', 'Untitled')}</span>
          {tab.isDirty && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" title={t('tabs.unsaved', 'Unsaved changes')} />
          )}
          <span
            onClick={(e) => handleClose(e, tab.id)}
            className={cn(
              'ml-1 p-0.5 rounded hover:bg-accent shrink-0',
              tab.id === activeTabId ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70 hover:!opacity-100'
            )}
          >
            <X className="h-3 w-3" />
          </span>
        </button>
      ))}

      {/* Tab context menu */}
      {contextMenuTabId && contextMenuPos && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleClose(e, contextMenuTabId)
              setContextMenuTabId(null)
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          >
            <X className="h-4 w-4" />
            {t('tabs.close', 'Close')}
          </button>
          {tabs.length >= 2 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                moveToPaneRight(contextMenuTabId)
                setContextMenuTabId(null)
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Columns2 className="h-4 w-4" />
              {t('tabs.openRight', 'Open in split view')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
