import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMemberAuth } from '@/hooks/useMemberAuth'
import { Loader2, FlaskConical, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MemberLogin() {
  const navigate = useNavigate()
  const { isAuthenticated, login, isLoading, error } = useMemberAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password)
      navigate('/')
    } catch {
      void 0
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-[400px]">
        <div className="rounded-xl border border-border bg-card shadow-sm p-8">
          <div className="text-center mb-8">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 mb-4">
              <FlaskConical className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">LabNote AI</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              계정으로 로그인
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                <AlertCircle
                  className="h-4 w-4 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-foreground"
              >
                아이디
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                disabled={isLoading}
                className={cn(
                  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'transition-colors',
                )}
                placeholder="아이디"
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
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isLoading}
                className={cn(
                  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'transition-colors',
                )}
                placeholder="비밀번호"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'inline-flex h-10 w-full items-center justify-center rounded-lg',
                'bg-primary text-primary-foreground font-medium text-sm',
                'hover:bg-primary/90 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
                'mt-2',
              )}
            >
              {isLoading ? (
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

          <div className="mt-6 text-center text-sm text-muted-foreground">
            계정이 없으신가요?{' '}
            <Link
              to="/signup"
              className="font-medium text-primary hover:underline"
            >
              회원가입
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          AI-enhanced NoteStation
        </p>
      </div>
    </div>
  )
}
