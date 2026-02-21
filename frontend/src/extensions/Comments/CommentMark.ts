import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentMark: {
      setComment: (commentId: string) => ReturnType
      unsetComment: (commentId: string) => ReturnType
    }
  }
}

export const CommentMark = Mark.create({
  name: 'commentMark',

  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs: Record<string, unknown>) => {
          if (!attrs.commentId) return {}
          return { 'data-comment-id': attrs.commentId }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'comment-highlight' }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setComment:
        (commentId: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, { commentId })
        },
      unsetComment:
        (commentId: string) =>
        ({ tr, state, dispatch }) => {
          const { doc } = state
          // Find and remove all marks with this commentId
          doc.descendants((node, pos) => {
            if (!node.isText) return
            const mark = node.marks.find(
              (m) => m.type.name === this.name && m.attrs.commentId === commentId
            )
            if (mark && dispatch) {
              tr.removeMark(pos, pos + node.nodeSize, mark)
            }
          })
          if (dispatch) dispatch(tr)
          return true
        },
    }
  },
})
