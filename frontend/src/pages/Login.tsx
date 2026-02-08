import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/lib/api'
import { Loader2, FlaskConical, AlertCircle, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Login() {
  const { isAuthenticated, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [requires2FA, setRequires2FA] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const result = await login(username, password, requires2FA ? otpCode : undefined)
      if (result.requires2FA) {
        setRequires2FA(true)
        setOtpCode('')
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        if (requires2FA) {
          setError('OTP 코드가 올바르지 않습니다.')
        } else {
          setError('아이디 또는 비밀번호가 올바르지 않습니다.')
        }
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
                autoFocus={!requires2FA}
                disabled={isSubmitting || requires2FA}
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
                disabled={isSubmitting || requires2FA}
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

            {requires2FA && (
              <div className="space-y-1.5">
                <label
                  htmlFor="otp"
                  className="text-sm font-medium text-foreground flex items-center gap-1.5"
                >
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  2단계 인증 코드
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  disabled={isSubmitting}
                  className={cn(
                    'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                    'text-sm text-foreground placeholder:text-muted-foreground tracking-widest text-center font-mono',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    'transition-colors'
                  )}
                  placeholder="000000"
                />
                <p className="text-xs text-muted-foreground">
                  인증 앱에서 6자리 코드를 입력하세요
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || (requires2FA && otpCode.length !== 6)}
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
                  {requires2FA ? '인증 중...' : '로그인 중...'}
                </>
              ) : requires2FA ? (
                '인증'
              ) : (
                '로그인'
              )}
            </button>

            {requires2FA && (
              <button
                type="button"
                onClick={() => {
                  setRequires2FA(false)
                  setOtpCode('')
                  setError('')
                }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-center"
              >
                다른 계정으로 로그인
              </button>
            )}
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/member-login"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              멤버 계정으로 로그인 →
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
