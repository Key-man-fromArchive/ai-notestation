// AI Inline SpellCheck extension using ProseMirror decorations
// Follows the SearchAndReplace.ts pattern: PluginKey, DecorationSet, storage, commands

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface SpellError {
  original: string
  corrected: string
  type: 'spelling' | 'grammar' | 'expression'
  explanation: string
  from: number
  to: number
}

export interface RawSpellError {
  original: string
  corrected: string
  type: 'spelling' | 'grammar' | 'expression'
  explanation: string
}

export interface SpellCheckStorage {
  errors: SpellError[]
  activeIndex: number
  isChecking: boolean
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spellCheck: {
      setSpellCheckErrors: (errors: RawSpellError[]) => ReturnType
      nextSpellError: () => ReturnType
      prevSpellError: () => ReturnType
      applyFix: (index: number) => ReturnType
      applyAllFixes: () => ReturnType
      dismissError: (index: number) => ReturnType
      clearSpellCheck: () => ReturnType
    }
  }
}

const spellCheckPluginKey = new PluginKey('spellCheck')

/**
 * Search through the ProseMirror document to find positions for each error's
 * original text. Returns SpellError[] with from/to positions computed.
 */
function findErrorPositions(
  doc: ProseMirrorNode,
  rawErrors: RawSpellError[]
): SpellError[] {
  if (!rawErrors.length) return []

  // Build full text map with positions
  const textRanges: { text: string; pos: number }[] = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      textRanges.push({ text: node.text, pos })
    }
  })

  const results: SpellError[] = []
  const usedPositions = new Set<string>()

  for (const raw of rawErrors) {
    if (!raw.original) continue

    // Search through text nodes for the original string
    for (const { text, pos } of textRanges) {
      let searchFrom = 0
      while (searchFrom < text.length) {
        const idx = text.indexOf(raw.original, searchFrom)
        if (idx === -1) break

        const from = pos + idx
        const to = from + raw.original.length
        const key = `${from}-${to}`

        if (!usedPositions.has(key)) {
          usedPositions.add(key)
          results.push({
            original: raw.original,
            corrected: raw.corrected,
            type: raw.type,
            explanation: raw.explanation,
            from,
            to,
          })
          break // Only match first occurrence per error
        }
        searchFrom = idx + 1
      }

      // Break if we found a match for this error
      if (results.length > 0 && results[results.length - 1].original === raw.original &&
          results[results.length - 1].explanation === raw.explanation) {
        break
      }
    }
  }

  return results
}

export const SpellCheck = Extension.create<Record<string, never>, SpellCheckStorage>({
  name: 'spellCheck',

  addStorage() {
    return {
      errors: [],
      activeIndex: -1,
      isChecking: false,
    }
  },

  addCommands() {
    return {
      setSpellCheckErrors:
        (rawErrors: RawSpellError[]) =>
        ({ editor, dispatch }) => {
          const errors = findErrorPositions(editor.state.doc, rawErrors)
          editor.storage.spellCheck.errors = errors
          editor.storage.spellCheck.activeIndex = errors.length > 0 ? 0 : -1
          if (dispatch) {
            dispatch(editor.state.tr.setMeta(spellCheckPluginKey, { updated: true }))
          }
          return true
        },

      nextSpellError:
        () =>
        ({ editor, dispatch }) => {
          const { errors, activeIndex } = editor.storage.spellCheck
          if (errors.length === 0) return false
          const next = (activeIndex + 1) % errors.length
          editor.storage.spellCheck.activeIndex = next
          const match = errors[next]
          if (match) {
            editor.commands.setTextSelection(match.from)
            const dom = editor.view.domAtPos(match.from)
            const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement
            el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }
          if (dispatch) {
            dispatch(editor.state.tr.setMeta(spellCheckPluginKey, { updated: true }))
          }
          return true
        },

      prevSpellError:
        () =>
        ({ editor, dispatch }) => {
          const { errors, activeIndex } = editor.storage.spellCheck
          if (errors.length === 0) return false
          const prev = (activeIndex - 1 + errors.length) % errors.length
          editor.storage.spellCheck.activeIndex = prev
          const match = errors[prev]
          if (match) {
            editor.commands.setTextSelection(match.from)
            const dom = editor.view.domAtPos(match.from)
            const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement
            el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }
          if (dispatch) {
            dispatch(editor.state.tr.setMeta(spellCheckPluginKey, { updated: true }))
          }
          return true
        },

      applyFix:
        (index: number) =>
        ({ editor, dispatch }) => {
          const { errors } = editor.storage.spellCheck
          if (index < 0 || index >= errors.length) return false
          const error = errors[index]

          if (dispatch) {
            const { tr } = editor.state
            tr.insertText(error.corrected, error.from, error.to)
            dispatch(tr)
          }

          // Recompute positions for remaining errors after edit
          setTimeout(() => {
            const remaining = editor.storage.spellCheck.errors.filter(
              (_: SpellError, i: number) => i !== index
            )
            const rawRemaining: RawSpellError[] = remaining.map((e: SpellError) => ({
              original: e.original,
              corrected: e.corrected,
              type: e.type,
              explanation: e.explanation,
            }))
            editor.commands.setSpellCheckErrors(rawRemaining)
          }, 0)
          return true
        },

      applyAllFixes:
        () =>
        ({ editor, dispatch }) => {
          const { errors } = editor.storage.spellCheck
          if (errors.length === 0) return false

          if (dispatch) {
            const { tr } = editor.state
            // Apply in reverse order to maintain correct positions
            const sorted = [...errors].sort((a, b) => b.from - a.from)
            for (const error of sorted) {
              tr.insertText(error.corrected, error.from, error.to)
            }
            dispatch(tr)
          }

          // Clear all errors
          setTimeout(() => {
            editor.commands.clearSpellCheck()
          }, 0)
          return true
        },

      dismissError:
        (index: number) =>
        ({ editor, dispatch }) => {
          const { errors, activeIndex } = editor.storage.spellCheck
          if (index < 0 || index >= errors.length) return false

          const newErrors = errors.filter((_: SpellError, i: number) => i !== index)
          editor.storage.spellCheck.errors = newErrors

          // Adjust active index
          if (newErrors.length === 0) {
            editor.storage.spellCheck.activeIndex = -1
          } else if (activeIndex >= newErrors.length) {
            editor.storage.spellCheck.activeIndex = newErrors.length - 1
          } else if (index < activeIndex) {
            editor.storage.spellCheck.activeIndex = activeIndex - 1
          }

          if (dispatch) {
            dispatch(editor.state.tr.setMeta(spellCheckPluginKey, { updated: true }))
          }
          return true
        },

      clearSpellCheck:
        () =>
        ({ editor, dispatch }) => {
          editor.storage.spellCheck.errors = []
          editor.storage.spellCheck.activeIndex = -1
          editor.storage.spellCheck.isChecking = false
          if (dispatch) {
            dispatch(editor.state.tr.setMeta(spellCheckPluginKey, { updated: true }))
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage as SpellCheckStorage

    return [
      new Plugin({
        key: spellCheckPluginKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, _oldState, _oldEditorState, newEditorState) {
            const meta = tr.getMeta(spellCheckPluginKey)
            if (!meta && !tr.docChanged) return _oldState
            const { errors, activeIndex } = storage

            if (errors.length === 0) return DecorationSet.empty

            const decorations: Decoration[] = []
            for (let i = 0; i < errors.length; i++) {
              const { from, to, type } = errors[i]
              if (from < 0 || to > newEditorState.doc.content.size) continue
              const classes = [
                'spell-error',
                `spell-error-${type}`,
                ...(i === activeIndex ? ['spell-error-active'] : []),
              ]
              decorations.push(
                Decoration.inline(from, to, { class: classes.join(' ') })
              )
            }

            return DecorationSet.create(newEditorState.doc, decorations)
          },
        },
        props: {
          decorations(state) {
            return this.getState(state) || DecorationSet.empty
          },
        },
      }),
    ]
  },
})
