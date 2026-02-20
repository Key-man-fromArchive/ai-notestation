// @TASK P5-T5.1 - 네비게이션 사이드바
// @TASK v3.0.0-T1 - Collapsible sidebar
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#레이아웃

import { NavLink } from 'react-router-dom'
import {
  Home,
  FileText,
  BookOpen,
  Search,
  BookOpenCheck,
  Sparkles,
  Settings,
  Users,
  LogOut,
  FlaskConical,
  Network,
  LayoutGrid,
  Activity,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useSidebar } from '@/contexts/SidebarContext'
import { useTranslation } from 'react-i18next'

const baseNavItems = [
  { to: '/', icon: Home, labelKey: 'sidebar.dashboard' },
  { to: '/notes', icon: FileText, labelKey: 'sidebar.notes' },
  { to: '/notebooks', icon: BookOpen, labelKey: 'sidebar.notebooks' },
  { to: '/search', icon: Search, labelKey: 'sidebar.search' },
  { to: '/librarian', icon: BookOpenCheck, labelKey: 'sidebar.librarian' },
  { to: '/ai', icon: Sparkles, labelKey: 'sidebar.aiAnalysis' },
  { to: '/graph', icon: Network, labelKey: 'sidebar.graph' },
  { to: '/members', icon: Users, labelKey: 'sidebar.members' },
  { to: '/settings', icon: Settings, labelKey: 'sidebar.settings' },
  { to: '/operations', icon: Activity, labelKey: 'sidebar.operations' },
]

const demoNavItem = { to: '/demo', icon: LayoutGrid, labelKey: 'sidebar.demo' }

/**
 * 앱 네비게이션 사이드바
 * - NavLink를 사용하여 현재 경로 하이라이팅
 * - 하단에 사용자 아바타 + 로그아웃 버튼
 * - 접근성: nav 태그, 명확한 링크 텍스트
 * - 접기/펼치기 기능 (Ctrl+\)
 * - 모바일: 오버레이 모드
 */
export function Sidebar() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const { isCollapsed, isMobileOpen, toggle, setMobileOpen } = useSidebar()
  const navItems = [...baseNavItems, demoNavItem]

  // Mobile: Close sidebar when clicking a link
  const handleNavClick = () => {
    if (window.innerWidth < 768) {
      setMobileOpen(false)
    }
  }

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border/60 bg-card h-screen sticky top-0 transition-[width] duration-200 ease-in-out',
        isCollapsed ? 'w-16' : 'w-64',
        // Mobile overlay
        'md:flex',
        isMobileOpen ? 'flex fixed inset-y-0 left-0 z-50' : 'hidden md:flex'
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center gap-3 py-5 border-b border-border/60',
          isCollapsed ? 'px-3 justify-center' : 'px-6'
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
          <FlaskConical className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        {!isCollapsed && (
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">LabNote AI</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">
              AI-enhanced NoteStation
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 mt-1 overflow-y-auto" aria-label="Main navigation">
        <ul className="space-y-0.5">
          {navItems.map((item) => (
            <li key={item.to} className={cn(isCollapsed && 'group/item relative')}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg text-sm transition-colors duration-150',
                    'motion-reduce:transition-none',
                    isCollapsed ? 'px-3 py-2.5 justify-center' : 'px-3 py-2.5',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                {!isCollapsed && <span>{t(item.labelKey)}</span>}
              </NavLink>
              {/* Tooltip for collapsed state */}
              {isCollapsed && (
                <span
                  className={cn(
                    'absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded',
                    'shadow-md border border-border',
                    'opacity-0 invisible group-hover/item:opacity-100 group-hover/item:visible',
                    'transition-opacity duration-150 pointer-events-none',
                    'whitespace-nowrap z-50 top-1/2 -translate-y-1/2'
                  )}
                >
                  {t(item.labelKey)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Toggle button (desktop only) */}
      <div className="hidden md:block border-t border-border/60 px-3 py-2">
        <button
          onClick={toggle}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
            'text-muted-foreground hover:bg-accent hover:text-foreground',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isCollapsed && 'justify-center'
          )}
          aria-label={t(isCollapsed ? 'sidebar.expand' : 'sidebar.collapse')}
          title={t(isCollapsed ? 'sidebar.expand' : 'sidebar.collapse')}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs">{t('sidebar.collapse')}</span>
            </>
          )}
        </button>
      </div>

      {/* 사용자 정보 + 로그아웃 */}
      {user && (
        <div className="border-t border-border/60 px-3 py-3">
          <div
            className={cn(
              'flex items-center gap-3',
              isCollapsed ? 'flex-col px-0' : 'px-2'
            )}
          >
            <div
              className={cn(
                'flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0',
                isCollapsed ? 'h-9 w-9' : 'h-8 w-8'
              )}
              title={isCollapsed ? user.name || user.email : undefined}
            >
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
            {!isCollapsed && (
              <span className="text-sm text-foreground font-medium truncate flex-1">
                {user.name || user.email}
              </span>
            )}
            <button
              onClick={logout}
              className={cn(
                'rounded-lg p-1.5 text-muted-foreground transition-colors',
                'hover:bg-accent hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              aria-label={t('common.logout')}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
