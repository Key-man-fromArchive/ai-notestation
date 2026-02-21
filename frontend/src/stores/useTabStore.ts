import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { JSONContent } from '@tiptap/react'

const MAX_TABS = 20

export interface Tab {
  id: string
  title: string
  isDirty: boolean
  scrollPos: number
  contentCache: JSONContent | null
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null
  splitMode: 'single' | 'horizontal'
  leftPaneTabId: string | null
  rightPaneTabId: string | null
  zenMode: boolean
}

interface TabActions {
  openTab: (id: string, title: string) => void
  closeTab: (id: string) => void
  activateTab: (id: string) => void
  reorderTabs: (from: number, to: number) => void
  updateTabTitle: (id: string, title: string) => void
  markDirty: (id: string, dirty: boolean) => void
  cacheContent: (id: string, content: JSONContent, scrollPos: number) => void
  splitView: (leftId: string, rightId: string) => void
  closeSplit: () => void
  moveToPaneRight: (tabId: string) => void
  toggleZen: () => void
}

export type TabStore = TabState & TabActions

export const useTabStore = create<TabStore>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      splitMode: 'single',
      leftPaneTabId: null,
      rightPaneTabId: null,
      zenMode: false,

      openTab: (id, title) => {
        const { tabs, activeTabId } = get()
        const existing = tabs.find((t) => t.id === id)
        if (existing) {
          if (activeTabId !== id) {
            set({ activeTabId: id })
          }
          return
        }

        const newTabs = [...tabs]
        // Enforce max tabs: close oldest clean tab if at limit
        if (newTabs.length >= MAX_TABS) {
          const cleanIdx = newTabs.findIndex((t) => !t.isDirty && t.id !== activeTabId)
          if (cleanIdx !== -1) {
            newTabs.splice(cleanIdx, 1)
          }
        }

        const newTab: Tab = {
          id,
          title,
          isDirty: false,
          scrollPos: 0,
          contentCache: null,
        }
        newTabs.push(newTab)
        set({ tabs: newTabs, activeTabId: id })
      },

      closeTab: (id) => {
        const { tabs, activeTabId, splitMode, leftPaneTabId, rightPaneTabId } = get()
        const idx = tabs.findIndex((t) => t.id === id)
        if (idx === -1) return

        const newTabs = tabs.filter((t) => t.id !== id)
        const updates: Partial<TabState> = { tabs: newTabs }

        // Handle split mode cleanup
        if (splitMode === 'horizontal') {
          if (leftPaneTabId === id || rightPaneTabId === id) {
            updates.splitMode = 'single'
            updates.leftPaneTabId = null
            updates.rightPaneTabId = null
          }
        }

        // If closing active tab, activate a neighbor
        if (activeTabId === id) {
          if (newTabs.length === 0) {
            updates.activeTabId = null
          } else {
            const nextIdx = Math.min(idx, newTabs.length - 1)
            updates.activeTabId = newTabs[nextIdx].id
          }
        }

        set(updates)
      },

      activateTab: (id) => {
        set({ activeTabId: id })
      },

      reorderTabs: (from, to) => {
        const { tabs } = get()
        if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) return
        const newTabs = [...tabs]
        const [moved] = newTabs.splice(from, 1)
        newTabs.splice(to, 0, moved)
        set({ tabs: newTabs })
      },

      updateTabTitle: (id, title) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
        }))
      },

      markDirty: (id, dirty) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, isDirty: dirty } : t)),
        }))
      },

      cacheContent: (id, content, scrollPos) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id ? { ...t, contentCache: content, scrollPos } : t
          ),
        }))
      },

      splitView: (leftId, rightId) => {
        set({
          splitMode: 'horizontal',
          leftPaneTabId: leftId,
          rightPaneTabId: rightId,
        })
      },

      closeSplit: () => {
        const { activeTabId } = get()
        set({
          splitMode: 'single',
          leftPaneTabId: null,
          rightPaneTabId: null,
          activeTabId,
        })
      },

      moveToPaneRight: (tabId) => {
        const { activeTabId } = get()
        if (!activeTabId || activeTabId === tabId) return
        set({
          splitMode: 'horizontal',
          leftPaneTabId: activeTabId,
          rightPaneTabId: tabId,
        })
      },

      toggleZen: () => {
        set((state) => ({ zenMode: !state.zenMode }))
      },
    }),
    {
      name: 'labnote-tabs',
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({
          id: t.id,
          title: t.title,
          isDirty: false,
          scrollPos: 0,
          contentCache: null,
        })),
        activeTabId: state.activeTabId,
        splitMode: state.splitMode,
        leftPaneTabId: state.leftPaneTabId,
        rightPaneTabId: state.rightPaneTabId,
      }),
    }
  )
)
