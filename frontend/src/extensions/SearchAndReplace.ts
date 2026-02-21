// Custom TipTap Search & Replace extension using ProseMirror decorations

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface SearchAndReplaceStorage {
  searchTerm: string
  replaceTerm: string
  caseSensitive: boolean
  results: { from: number; to: number }[]
  currentIndex: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchAndReplace: {
      setSearchTerm: (term: string) => ReturnType
      setReplaceTerm: (term: string) => ReturnType
      setCaseSensitive: (value: boolean) => ReturnType
      nextMatch: () => ReturnType
      prevMatch: () => ReturnType
      replaceOne: () => ReturnType
      replaceAll: () => ReturnType
      clearSearch: () => ReturnType
    }
  }
}

const searchPluginKey = new PluginKey('searchAndReplace')

function findMatches(doc: ProseMirrorNode, searchTerm: string, caseSensitive: boolean): { from: number; to: number }[] {
  if (!searchTerm) return []

  const results: { from: number; to: number }[] = []
  const flags = caseSensitive ? 'g' : 'gi'
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, flags)

  doc.descendants((node, pos) => {
    if (!node.isText) return
    const text = node.text || ''
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: pos + match.index,
        to: pos + match.index + match[0].length,
      })
    }
  })

  return results
}

export const SearchAndReplace = Extension.create<Record<string, never>, SearchAndReplaceStorage>({
  name: 'searchAndReplace',

  addStorage() {
    return {
      searchTerm: '',
      replaceTerm: '',
      caseSensitive: false,
      results: [],
      currentIndex: 0,
    }
  },

  addCommands() {
    return {
      setSearchTerm:
        (term: string) =>
        ({ editor, dispatch }) => {
          editor.storage.searchAndReplace.searchTerm = term
          const results = findMatches(
            editor.state.doc,
            term,
            editor.storage.searchAndReplace.caseSensitive
          )
          editor.storage.searchAndReplace.results = results
          editor.storage.searchAndReplace.currentIndex = results.length > 0 ? 0 : -1
          if (dispatch) {
            // Force plugin state update by dispatching a trivial transaction
            dispatch(editor.state.tr.setMeta(searchPluginKey, { updated: true }))
          }
          return true
        },

      setReplaceTerm:
        (term: string) =>
        ({ editor }) => {
          editor.storage.searchAndReplace.replaceTerm = term
          return true
        },

      setCaseSensitive:
        (value: boolean) =>
        ({ editor, dispatch }) => {
          editor.storage.searchAndReplace.caseSensitive = value
          const results = findMatches(
            editor.state.doc,
            editor.storage.searchAndReplace.searchTerm,
            value
          )
          editor.storage.searchAndReplace.results = results
          editor.storage.searchAndReplace.currentIndex = results.length > 0 ? 0 : -1
          if (dispatch) {
            dispatch(editor.state.tr.setMeta(searchPluginKey, { updated: true }))
          }
          return true
        },

      nextMatch:
        () =>
        ({ editor, dispatch }) => {
          const { results, currentIndex } = editor.storage.searchAndReplace
          if (results.length === 0) return false
          const next = (currentIndex + 1) % results.length
          editor.storage.searchAndReplace.currentIndex = next
          // Scroll to match
          const match = results[next]
          if (match) {
            editor.commands.setTextSelection(match.from)
            // Scroll the selection into view
            const dom = editor.view.domAtPos(match.from)
            if (dom.node instanceof HTMLElement) {
              dom.node.scrollIntoView({ block: 'center', behavior: 'smooth' })
            } else if (dom.node.parentElement) {
              dom.node.parentElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
            }
          }
          if (dispatch) {
            dispatch(editor.state.tr.setMeta(searchPluginKey, { updated: true }))
          }
          return true
        },

      prevMatch:
        () =>
        ({ editor, dispatch }) => {
          const { results, currentIndex } = editor.storage.searchAndReplace
          if (results.length === 0) return false
          const prev = (currentIndex - 1 + results.length) % results.length
          editor.storage.searchAndReplace.currentIndex = prev
          const match = results[prev]
          if (match) {
            editor.commands.setTextSelection(match.from)
            const dom = editor.view.domAtPos(match.from)
            if (dom.node instanceof HTMLElement) {
              dom.node.scrollIntoView({ block: 'center', behavior: 'smooth' })
            } else if (dom.node.parentElement) {
              dom.node.parentElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
            }
          }
          if (dispatch) {
            dispatch(editor.state.tr.setMeta(searchPluginKey, { updated: true }))
          }
          return true
        },

      replaceOne:
        () =>
        ({ editor, dispatch }) => {
          const { results, currentIndex, replaceTerm } = editor.storage.searchAndReplace
          if (results.length === 0 || currentIndex < 0) return false
          const match = results[currentIndex]
          if (!match) return false

          if (dispatch) {
            const { tr } = editor.state
            tr.insertText(replaceTerm, match.from, match.to)
            dispatch(tr)
          }

          // Re-search after replacement
          setTimeout(() => {
            editor.commands.setSearchTerm(editor.storage.searchAndReplace.searchTerm)
          }, 0)
          return true
        },

      replaceAll:
        () =>
        ({ editor, dispatch }) => {
          const { results, replaceTerm } = editor.storage.searchAndReplace
          if (results.length === 0) return false

          if (dispatch) {
            const { tr } = editor.state
            // Apply replacements in reverse order to maintain correct positions
            const sorted = [...results].sort((a, b) => b.from - a.from)
            for (const match of sorted) {
              tr.insertText(replaceTerm, match.from, match.to)
            }
            dispatch(tr)
          }

          // Clear results
          setTimeout(() => {
            editor.commands.setSearchTerm(editor.storage.searchAndReplace.searchTerm)
          }, 0)
          return true
        },

      clearSearch:
        () =>
        ({ editor, dispatch }) => {
          editor.storage.searchAndReplace.searchTerm = ''
          editor.storage.searchAndReplace.replaceTerm = ''
          editor.storage.searchAndReplace.results = []
          editor.storage.searchAndReplace.currentIndex = -1
          if (dispatch) {
            dispatch(editor.state.tr.setMeta(searchPluginKey, { updated: true }))
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage as SearchAndReplaceStorage

    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, _oldState, _oldEditorState, newEditorState) {
            // Rebuild decorations on any meta update or doc change
            const meta = tr.getMeta(searchPluginKey)
            if (!meta && !tr.docChanged) return _oldState
            const { results, currentIndex } = storage

            if (results.length === 0) return DecorationSet.empty

            const decorations: Decoration[] = []
            for (let i = 0; i < results.length; i++) {
              const { from, to } = results[i]
              // Validate range is within document bounds
              if (from < 0 || to > newEditorState.doc.content.size) continue
              const className = i === currentIndex
                ? 'search-result search-result-active'
                : 'search-result'
              decorations.push(
                Decoration.inline(from, to, { class: className })
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
