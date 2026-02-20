// @TASK v3.0.0-T4 - Global keyboard shortcuts system
// @SPEC docs/roadmap/UI_UX_INNOVATION_ROADMAP.md#Foundation-T4

import { useEffect } from 'react'

export interface ShortcutEntry {
  key: string
  modifiers: {
    ctrl?: boolean
    shift?: boolean
    alt?: boolean
  }
  action: () => void
  description: string
  descriptionKey: string
  scope: 'global' | 'editor' | 'modal'
  group: string
}

/**
 * Detects if the current platform is macOS
 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform || '')
}

/**
 * Formats a shortcut entry for display
 * Mac: ⌘ for Ctrl, ⇧ for Shift, ⌥ for Alt
 * Others: Ctrl, Shift, Alt
 */
export function formatShortcut(entry: ShortcutEntry): string {
  const parts: string[] = []
  const mac = isMac()

  if (entry.modifiers.ctrl) {
    parts.push(mac ? '⌘' : 'Ctrl')
  }
  if (entry.modifiers.shift) {
    parts.push(mac ? '⇧' : 'Shift')
  }
  if (entry.modifiers.alt) {
    parts.push(mac ? '⌥' : 'Alt')
  }

  // Format key
  const key = entry.key === '\\' ? '\\' : entry.key.toUpperCase()
  parts.push(key)

  return mac ? parts.join('') : parts.join('+')
}

/**
 * Global keyboard shortcut hook
 * Registers keyboard listeners and handles context detection
 */
export function useShortcuts(shortcuts: ShortcutEntry[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Context detection
      const activeElement = document.activeElement
      const isInputFocused =
        activeElement &&
        (activeElement.matches('input, textarea, select, [contenteditable]') ||
          activeElement.getAttribute('contenteditable') === 'true')
      const isEditorFocused =
        activeElement &&
        (activeElement.closest('.tiptap') !== null ||
          activeElement.closest('.ProseMirror') !== null)
      const isModalOpen = document.querySelector('[data-state="open"]') !== null

      // Find matching shortcut
      for (const shortcut of shortcuts) {
        const ctrlKey = isMac() ? e.metaKey : e.ctrlKey
        const modifiersMatch =
          (shortcut.modifiers.ctrl ? ctrlKey : !ctrlKey) &&
          (shortcut.modifiers.shift ? e.shiftKey : !e.shiftKey) &&
          (shortcut.modifiers.alt ? e.altKey : !e.altKey)

        const keyMatch = e.key === shortcut.key

        if (!modifiersMatch || !keyMatch) {
          continue
        }

        // Scope-based filtering
        const hasModifiers =
          shortcut.modifiers.ctrl || shortcut.modifiers.shift || shortcut.modifiers.alt

        if (shortcut.scope === 'global') {
          // Global shortcuts with modifiers always fire
          if (hasModifiers) {
            e.preventDefault()
            shortcut.action()
            return
          }
          // Global shortcuts without modifiers only fire when NOT in input/editor
          if (!isInputFocused && !isEditorFocused) {
            e.preventDefault()
            shortcut.action()
            return
          }
        } else if (shortcut.scope === 'editor' && isEditorFocused) {
          e.preventDefault()
          shortcut.action()
          return
        } else if (shortcut.scope === 'modal' && isModalOpen) {
          e.preventDefault()
          shortcut.action()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}
