// tippy.js based popup renderer shared by MemberMention and NoteMention

import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import { MentionList, type MentionItem } from './MentionList'

export function createMentionRenderer() {
  return () => {
    let component: ReactRenderer | null = null
    let popup: TippyInstance[] | null = null

    return {
      onStart: (props: {
        editor: { view: { dom: HTMLElement } }
        clientRect?: (() => DOMRect | null) | null
        items: MentionItem[]
        command: (item: MentionItem) => void
      }) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor as never,
        })

        if (!props.clientRect) return

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        })
      },

      onUpdate: (props: {
        clientRect?: (() => DOMRect | null) | null
        items: MentionItem[]
        command: (item: MentionItem) => void
      }) => {
        component?.updateProps(props)

        if (popup?.[0] && props.clientRect) {
          popup[0].setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          })
        }
      },

      onKeyDown: (props: { event: KeyboardEvent }) => {
        if (props.event.key === 'Escape') {
          popup?.[0]?.hide()
          return true
        }

        return (component?.ref as { onKeyDown?: (p: { event: KeyboardEvent }) => boolean } | null)
          ?.onKeyDown?.(props) ?? false
      },

      onExit: () => {
        popup?.[0]?.destroy()
        component?.destroy()
      },
    }
  }
}
