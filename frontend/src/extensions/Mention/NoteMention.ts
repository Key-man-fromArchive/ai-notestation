// #note mention extension — triggers on '#', server-side search via /notes/quick-search

import Mention from '@tiptap/extension-mention'
import { PluginKey } from '@tiptap/pm/state'
import { apiClient } from '@/lib/api'
import { createMentionRenderer } from './mentionRenderer'
import type { MentionItem } from './MentionList'

interface QuickSearchResponse {
  items: Array<{
    note_id: string
    title: string
    notebook: string | null
  }>
}

export const NoteMention = Mention.extend({
  name: 'noteMention',

  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: 'mention mention-note',
        'data-type': 'noteMention',
      },
      renderText({ node }: { node: { attrs: { label?: string } } }) {
        return `#${node.attrs.label ?? ''}`
      },
      renderHTML({ node }: { node: { attrs: { id?: string; label?: string } } }) {
        return [
          'span',
          {
            class: 'mention mention-note',
            'data-type': 'noteMention',
            'data-id': node.attrs.id,
            'data-label': node.attrs.label,
          },
          `#${node.attrs.label ?? ''}`,
        ]
      },
      suggestion: {
        char: '#',
        pluginKey: new PluginKey('noteMention'),
        items: async ({ query }: { query: string }): Promise<MentionItem[]> => {
          if (query.length < 1) return []

          try {
            const res = await apiClient.get<QuickSearchResponse>(
              `/notes/quick-search?q=${encodeURIComponent(query)}&limit=8`
            )
            return res.items.map((item) => ({
              id: item.note_id,
              label: item.title,
              subtitle: item.notebook ?? undefined,
              type: 'note' as const,
            }))
          } catch {
            return []
          }
        },
        render: createMentionRenderer(),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="noteMention"]' }]
  },
})
