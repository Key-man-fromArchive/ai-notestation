// @TASK P5-T5.1 - 네비게이션 사이드바
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#레이아웃

import { NavLink } from 'react-router-dom'
import {
  Home,
  FileText,
  BookOpen,
  Search,
  Sparkles,
  Settings,
  Users,
  LogOut,
  FlaskConical,
  Network,
  LayoutGrid,
  ShieldCheck,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

const baseNavItems = [
  { to: '/', icon: Home, label: '대시보드' },
  { to: '/notes', icon: FileText, label: '노트' },
  { to: '/notebooks', icon: BookOpen, label: '노트북' },
  { to: '/search', icon: Search, label: '검색' },
  { to: '/ai', icon: Sparkles, label: 'AI 분석' },
  { to: '/graph', icon: Network, label: '그래프' },
  { to: '/members', icon: Users, label: '멤버' },
  { to: '/settings', icon: Settings, label: '설정' },
  { to: '/operations', icon: Activity, label: '운영 현황' },
]

const adminNavItem = { to: '/admin', icon: ShieldCheck, label: '관리자' }
const demoNavItem = { to: '/demo', icon: LayoutGrid, label: '데모' }

/**
 * 앱 네비게이션 사이드바
 * - NavLink를 사용하여 현재 경로 하이라이팅
 * - 하단에 사용자 아바타 + 로그아웃 버튼
 * - 접근성: nav 태그, 명확한 링크 텍스트
 */
export function Sidebar() {
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  const navItems = [...baseNavItems, ...(isAdmin ? [adminNavItem] : []), demoNavItem]

  return (
    <aside className="flex flex-col w-64 border-r border-border/60 bg-card h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <FlaskConical className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground leading-tight">LabNote AI</h1>
          <p className="text-[11px] text-muted-foreground leading-tight">
            AI-enhanced NoteStation
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 mt-1" aria-label="Main navigation">
        <ul className="space-y-0.5">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150',
                    'motion-reduce:transition-none',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* 사용자 정보 + 로그아웃 */}
      {user && (
        <div className="border-t border-border/60 px-3 py-3">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-foreground font-medium truncate flex-1">
              {user.name || user.email}
            </span>
            <button
              onClick={logout}
              className={cn(
                'rounded-lg p-1.5 text-muted-foreground transition-colors',
                'hover:bg-accent hover:text-foreground',
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
