// @TASK P5-T5.1 - 앱 레이아웃 컴포넌트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#레이아웃

import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

interface LayoutProps {
  children: ReactNode
}

/**
 * 앱 메인 레이아웃
 * - 좌측: 사이드바 (고정)
 * - 우측: 메인 콘텐츠 영역
 */
export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto" role="main">
        {children}
      </main>
    </div>
  )
}
