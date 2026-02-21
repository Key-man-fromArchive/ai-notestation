// TipTap custom node for experiment headers in research notes

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ExperimentHeaderView } from '@/components/editor/ExperimentHeaderView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    experimentHeader: {
      insertExperimentHeader: () => ReturnType
    }
  }
}

export const ExperimentHeader = Node.create({
  name: 'experimentHeader',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      attrs: {
        default: JSON.stringify({
          title: '',
          date: new Date().toISOString().slice(0, 10),
          experimenter: '',
          project: '',
          sampleId: '',
          protocolVersion: '',
          status: 'planned',
          tags: [],
        }),
        parseHTML: (element: HTMLElement) => element.getAttribute('data-attrs'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.attrs ? { 'data-attrs': attributes.attrs } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="experiment-header"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'experiment-header' }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExperimentHeaderView)
  },

  addCommands() {
    return {
      insertExperimentHeader:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
          })
        },
    }
  },
})
