// @TASK P5-T5.1 - 앱 레이아웃 컴포넌트
// @TASK v3.0.0-T1 - Collapsible sidebar layout
// @TASK v3.0.0-T3 - Command Palette integration
// @TASK v3.0.0-T4 - Global keyboard shortcuts system
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#레이아웃

import { ReactNode, useState } from 'react'
import { Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext'
import { cn } from '@/lib/utils'
import { useShortcuts } from '@/hooks/useShortcuts'
import { ShortcutHelp } from './ShortcutHelp'

interface LayoutProps {
  children: ReactNode
}

function LayoutContent({ children }: LayoutProps) {
  const { toggle, isMobileOpen, setMobileOpen } = useSidebar()
  const [commandOpen, setCommandOpen] = useState(false)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const navigate = useNavigate()

  // Global keyboard shortcuts
  const shortcuts = [
    {
      key: '\\',
      modifiers: { ctrl: true },
      scope: 'global' as const,
      group: 'navigation',
      description: 'Toggle sidebar',
      descriptionKey: 'shortcuts.toggleSidebar',
      action: toggle,
    },
    {
      key: 'P',
      modifiers: { ctrl: true, shift: true },
      scope: 'global' as const,
      group: 'general',
      description: 'Command palette',
      descriptionKey: 'shortcuts.commandPalette',
      action: () => setCommandOpen((prev) => !prev),
    },
    {
      key: '?',
      modifiers: {},
      scope: 'global' as const,
      group: 'general',
      description: 'Show keyboard shortcuts',
      descriptionKey: 'shortcuts.showHelp',
      action: () => setShortcutHelpOpen(true),
    },
    {
      key: 'n',
      modifiers: { ctrl: true },
      scope: 'global' as const,
      group: 'actions',
      description: 'New note',
      descriptionKey: 'shortcuts.newNote',
      action: () => navigate('/notes'),
    },
    {
      key: 'f',
      modifiers: { ctrl: true, shift: true },
      scope: 'global' as const,
      group: 'navigation',
      description: 'Go to search',
      descriptionKey: 'shortcuts.goSearch',
      action: () => navigate('/search'),
    },
    {
      key: ',',
      modifiers: { ctrl: true },
      scope: 'global' as const,
      group: 'navigation',
      description: 'Go to settings',
      descriptionKey: 'shortcuts.goSettings',
      action: () => navigate('/settings'),
    },
  ]

  useShortcuts(shortcuts)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className={cn(
          'fixed top-4 left-4 z-40 md:hidden',
          'p-2 rounded-lg bg-card border border-border/60',
          'text-foreground hover:bg-accent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isMobileOpen && 'hidden'
        )}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar />

      <main className="flex-1 overflow-auto" role="main">
        {children}
      </main>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <ShortcutHelp
        open={shortcutHelpOpen}
        onOpenChange={setShortcutHelpOpen}
        shortcuts={shortcuts}
      />
    </div>
  )
}

/**
 * 앱 메인 레이아웃
 * - 좌측: 사이드바 (고정, 접기/펼치기 가능)
 * - 우측: 메인 콘텐츠 영역
 * - 모바일: 오버레이 사이드바
 * - 단축키: Ctrl+\ (사이드바 토글)
 */
export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  )
}
