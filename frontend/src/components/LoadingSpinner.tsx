// @TASK P5-T5.1 - 로딩 스피너 컴포넌트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#공통-컴포넌트

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * 접근성을 고려한 로딩 스피너
 * - role="status": 스크린 리더에 상태 변경 알림
 * - aria-label: 명확한 로딩 메시지
 */
export function LoadingSpinner({ className, size = 'md' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  }

  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('flex items-center justify-center', className)}
    >
      <Loader2
        className={cn('animate-spin text-primary', sizeClasses[size])}
        aria-hidden="true"
      />
      <span className="sr-only">Loading...</span>
    </div>
  )
}
