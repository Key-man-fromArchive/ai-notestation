import { Link } from 'react-router-dom'
import { FlaskConical, Users, Server } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function LoginSelect() {
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
              로그인 방식을 선택하세요
            </p>
          </div>

          <div className="space-y-3">
            <Link
              to="/nas-login"
              className={cn(
                'flex items-center gap-3 w-full rounded-lg border border-border p-4',
                'hover:bg-muted/50 hover:border-primary/50 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Server className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-left">
                <div className="font-medium text-foreground">Synology NAS</div>
                <div className="text-sm text-muted-foreground">NAS 계정으로 로그인</div>
              </div>
            </Link>

            <Link
              to="/member-login"
              className={cn(
                'flex items-center gap-3 w-full rounded-lg border border-border p-4',
                'hover:bg-muted/50 hover:border-primary/50 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div className="text-left">
                <div className="font-medium text-foreground">멤버 로그인</div>
                <div className="text-sm text-muted-foreground">이메일로 로그인</div>
              </div>
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
