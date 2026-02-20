// @TASK v3.0.0-T1 - Collapsible sidebar context
// @SPEC Foundation UX - Task 1

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'

interface SidebarContextType {
  isCollapsed: boolean
  isMobileOpen: boolean
  toggle: () => void
  setCollapsed: (value: boolean) => void
  setMobileOpen: (value: boolean) => void
}

const SidebarContext = createContext<SidebarContextType | null>(null)

const STORAGE_KEY = 'sidebar_collapsed'

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'true'
  })
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isCollapsed))
  }, [isCollapsed])

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => !prev)
  }, [])

  const setCollapsed = useCallback((value: boolean) => {
    setIsCollapsed(value)
  }, [])

  const setMobileOpen = useCallback((value: boolean) => {
    setIsMobileOpen(value)
  }, [])

  return (
    <SidebarContext.Provider
      value={{
        isCollapsed,
        isMobileOpen,
        toggle,
        setCollapsed,
        setMobileOpen,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar(): SidebarContextType {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}
