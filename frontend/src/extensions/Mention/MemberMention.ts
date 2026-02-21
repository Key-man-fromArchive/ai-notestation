// @member mention extension — triggers on '@', fetches from /members API

import Mention from '@tiptap/extension-mention'
import { PluginKey } from '@tiptap/pm/state'
import { apiClient } from '@/lib/api'
import { createMentionRenderer } from './mentionRenderer'
import type { MentionItem } from './MentionList'

interface MemberResponse {
  members: Array<{
    id: number
    name: string
    role: string
  }>
}

// Cache members list to avoid repeated API calls during a session
let cachedMembers: MemberResponse['members'] | null = null

export const MemberMention = Mention.extend({
  name: 'memberMention',

  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: 'mention mention-member',
        'data-type': 'memberMention',
      },
      renderText({ node }: { node: { attrs: { label?: string } } }) {
        return `@${node.attrs.label ?? ''}`
      },
      renderHTML({ node }: { node: { attrs: { id?: string; label?: string } } }) {
        return [
          'span',
          {
            class: 'mention mention-member',
            'data-type': 'memberMention',
            'data-id': node.attrs.id,
            'data-label': node.attrs.label,
          },
          `@${node.attrs.label ?? ''}`,
        ]
      },
      suggestion: {
        char: '@',
        pluginKey: new PluginKey('memberMention'),
        items: async ({ query }: { query: string }): Promise<MentionItem[]> => {
          if (!cachedMembers) {
            try {
              const res = await apiClient.get<MemberResponse>('/members')
              cachedMembers = res.members
            } catch {
              return []
            }
          }

          const q = query.toLowerCase()
          return cachedMembers
            .filter((m) => m.name.toLowerCase().includes(q))
            .slice(0, 8)
            .map((m) => ({
              id: String(m.id),
              label: m.name,
              subtitle: m.role,
              type: 'member' as const,
            }))
        },
        render: createMentionRenderer(),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="memberMention"]' }]
  },
})

// Allow cache invalidation (e.g. when member list changes)
export function clearMemberMentionCache() {
  cachedMembers = null
}
