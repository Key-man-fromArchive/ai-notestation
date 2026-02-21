// TipTap custom node for handwriting blocks (tldraw canvas)

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { HandwritingBlockView } from '@/components/editor/HandwritingBlockView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    handwritingBlock: {
      insertHandwritingBlock: () => ReturnType
    }
  }
}

export const HandwritingBlock = Node.create({
  name: 'handwritingBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      drawingData: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-drawing'),
        renderHTML: (attributes) =>
          attributes.drawingData
            ? { 'data-drawing': attributes.drawingData }
            : {},
      },
      ocrText: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-ocr-text'),
        renderHTML: (attributes) =>
          attributes.ocrText
            ? { 'data-ocr-text': attributes.ocrText }
            : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="handwriting-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'handwriting-block' }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(HandwritingBlockView)
  },

  addCommands() {
    return {
      insertHandwritingBlock:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
          })
        },
    }
  },
})
