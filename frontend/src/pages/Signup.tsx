import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMemberAuth } from '@/hooks/useMemberAuth'
import { Loader2, FlaskConical, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export default function Signup() {
  const navigate = useNavigate()
  const { isAuthenticated, signup, isLoading, error } = useMemberAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [autoSlug, setAutoSlug] = useState(true)

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const handleOrgNameChange = (value: string) => {
    setOrgName(value)
    if (autoSlug) {
      setOrgSlug(slugify(value))
    }
  }

  const handleSlugChange = (value: string) => {
    setAutoSlug(false)
    setOrgSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await signup({
        email,
        password,
        name,
        org_name: orgName,
        org_slug: orgSlug,
      })
      navigate('/')
    } catch {
      void 0
    }
  }

  const isValidSlug = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(orgSlug)
  const isFormValid =
    email && password.length >= 8 && orgName && isValidSlug

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-[440px]">
        <div className="rounded-xl border border-border bg-card shadow-sm p-8">
          <div className="text-center mb-8">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 mb-4">
              <FlaskConical className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Create your account
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Start with a free organization
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
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                disabled={isLoading}
                className={cn(
                  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-foreground"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={isLoading}
                className={cn(
                  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
                placeholder="At least 8 characters"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="name"
                className="text-sm font-medium text-foreground"
              >
                Your name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
                disabled={isLoading}
                className={cn(
                  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
                placeholder="John Doe (optional)"
              />
            </div>

            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground mb-3">
                Organization details
              </p>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="org-name"
                    className="text-sm font-medium text-foreground"
                  >
                    Organization name
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    value={orgName}
                    onChange={e => handleOrgNameChange(e.target.value)}
                    required
                    disabled={isLoading}
                    className={cn(
                      'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                      'text-sm text-foreground placeholder:text-muted-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                    placeholder="My Research Lab"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="org-slug"
                    className="text-sm font-medium text-foreground"
                  >
                    Organization URL
                  </label>
                  <div className="flex items-center">
                    <span className="text-sm text-muted-foreground mr-1">
                      labnote.ai/
                    </span>
                    <input
                      id="org-slug"
                      type="text"
                      value={orgSlug}
                      onChange={e => handleSlugChange(e.target.value)}
                      required
                      disabled={isLoading}
                      className={cn(
                        'flex h-10 flex-1 rounded-lg border border-input bg-background px-3 py-2',
                        'text-sm text-foreground placeholder:text-muted-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        !isValidSlug && orgSlug && 'border-destructive',
                      )}
                      placeholder="my-lab"
                    />
                  </div>
                  {orgSlug && !isValidSlug && (
                    <p className="text-xs text-destructive">
                      3-50 characters, lowercase letters, numbers, and hyphens
                      only
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !isFormValid}
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
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              to="/member-login"
              className="font-medium text-primary hover:underline"
            >
              Sign in
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
