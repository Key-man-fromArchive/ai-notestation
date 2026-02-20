import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext'
import { ReactNode } from 'react'

describe('SidebarContext', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initializes with collapsed=false when no localStorage value', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <SidebarProvider>{children}</SidebarProvider>
      ),
    })

    expect(result.current.isCollapsed).toBe(false)
  })

  it('initializes with collapsed=true when localStorage has "true"', () => {
    localStorage.setItem('sidebar_collapsed', 'true')

    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <SidebarProvider>{children}</SidebarProvider>
      ),
    })

    expect(result.current.isCollapsed).toBe(true)
  })

  it('toggles collapsed state', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <SidebarProvider>{children}</SidebarProvider>
      ),
    })

    expect(result.current.isCollapsed).toBe(false)

    act(() => {
      result.current.toggle()
    })

    expect(result.current.isCollapsed).toBe(true)
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true')

    act(() => {
      result.current.toggle()
    })

    expect(result.current.isCollapsed).toBe(false)
    expect(localStorage.getItem('sidebar_collapsed')).toBe('false')
  })

  it('sets collapsed state directly', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <SidebarProvider>{children}</SidebarProvider>
      ),
    })

    act(() => {
      result.current.setCollapsed(true)
    })

    expect(result.current.isCollapsed).toBe(true)
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true')
  })

  it('manages mobile open state', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <SidebarProvider>{children}</SidebarProvider>
      ),
    })

    expect(result.current.isMobileOpen).toBe(false)

    act(() => {
      result.current.setMobileOpen(true)
    })

    expect(result.current.isMobileOpen).toBe(true)
  })
})
