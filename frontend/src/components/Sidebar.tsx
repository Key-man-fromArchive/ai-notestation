// @TASK P5-T5.1 - 네비게이션 사이드바
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#레이아웃

import { NavLink } from 'react-router-dom'
import { Home, FileText, Search, Sparkles, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/notes', icon: FileText, label: 'Notes' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/ai', icon: Sparkles, label: 'AI Workbench' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

/**
 * 앱 네비게이션 사이드바
 * - NavLink를 사용하여 현재 경로 하이라이팅
 * - 하단에 사용자명 + 로그아웃 버튼
 * - 접근성: nav 태그, 명확한 링크 텍스트
 */
export function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="flex flex-col w-64 border-r bg-card h-screen sticky top-0">
      <div className="p-6">
        <h1 className="text-xl font-bold text-foreground">LabNote AI</h1>
        <p className="text-xs text-muted-foreground mt-1">
          AI-enhanced NoteStation
        </p>
      </div>

      <nav className="flex-1 px-3" aria-label="Main navigation">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    isActive
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground'
                  )
                }
              >
                <item.icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* 사용자 정보 + 로그아웃 */}
      {user && (
        <div className="border-t px-3 py-3">
          <div className="flex items-center justify-between px-3">
            <span className="text-sm text-muted-foreground truncate">
              {user.username}
            </span>
            <button
              onClick={logout}
              className={cn(
                'rounded-md p-1.5 text-muted-foreground transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              aria-label="로그아웃"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
