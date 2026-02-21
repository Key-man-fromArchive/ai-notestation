// TipTap custom inline node for status chips (click to cycle)

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { StatusChipView } from '@/components/editor/StatusChipView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    statusChip: {
      insertStatusChip: () => ReturnType
    }
  }
}

export const StatusChip = Node.create({
  name: 'statusChip',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      status: {
        default: 'planned',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-status') || 'planned',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-status': attributes.status,
        }),
      },
      label: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-label') || '',
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.label ? { 'data-label': attributes.label } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="status-chip"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'status-chip' }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(StatusChipView, { as: 'span' })
  },

  addCommands() {
    return {
      insertStatusChip:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
          })
        },
    }
  },
})
