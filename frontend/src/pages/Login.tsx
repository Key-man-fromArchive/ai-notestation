import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/lib/api'
import { Loader2, FlaskConical, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 로그인 페이지
 * - 전체화면 중앙 정렬 (사이드바 없음)
 * - Synology NAS 계정으로 인증
 * - 카드 레이아웃 + 브랜딩
 */
export default function Login() {
  const { isAuthenticated, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 이미 로그인 상태면 메인으로 리다이렉트
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(username, password)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.')
      } else {
        setError('서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-[400px]">
        {/* Card */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-8">
          {/* Logo + Header */}
          <div className="text-center mb-8">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 mb-4">
              <FlaskConical className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">LabNote AI</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Synology NAS 계정으로 로그인
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="text-sm font-medium text-foreground"
              >
                사용자 이름
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                disabled={isSubmitting}
                className={cn(
                  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'transition-colors'
                )}
                placeholder="NAS 사용자 이름"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-foreground"
              >
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isSubmitting}
                className={cn(
                  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'transition-colors'
                )}
                placeholder="비밀번호"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'inline-flex h-10 w-full items-center justify-center rounded-lg',
                'bg-primary text-primary-foreground font-medium text-sm',
                'hover:bg-primary/90 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
                'mt-2'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  로그인 중...
                </>
              ) : (
                '로그인'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          AI-enhanced NoteStation
        </p>
      </div>
    </div>
  )
}
