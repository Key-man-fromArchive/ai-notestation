// TipTap custom node for digital signatures with lock functionality

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { SignatureView } from '@/components/editor/SignatureView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    signature: {
      insertSignature: () => ReturnType
    }
  }
}

export const Signature = Node.create({
  name: 'signature',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      attrs: {
        default: JSON.stringify({
          signedBy: '',
          memberId: '',
          role: '',
          signedAt: null,
          comment: '',
          locked: false,
        }),
        parseHTML: (element: HTMLElement) => element.getAttribute('data-attrs'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.attrs ? { 'data-attrs': attributes.attrs } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="signature"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'signature' }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SignatureView)
  },

  addCommands() {
    return {
      insertSignature:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
          })
        },
    }
  },
})
