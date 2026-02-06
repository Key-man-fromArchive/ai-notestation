import { useState } from 'react'
import { useOAuth } from '@/hooks/useOAuth'
import { cn } from '@/lib/utils'
import {
  Info,
  CheckCircle,
  Unlink,
  Link2,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
} from 'lucide-react'

interface OAuthSectionProps {
  provider: string
  label: string
}

export function OAuthSection({ provider, label }: OAuthSectionProps) {
  const {
    configured,
    connected,
    email,
    isConnecting,
    isDisconnecting,
    connectError,
    connect,
    authUrl,
    disconnect,
  } = useOAuth(provider)
  const [copied, setCopied] = useState(false)

  const handleConnect = async () => {
    setCopied(false)
    await connect()
  }

  const handleCopy = async () => {
    if (!authUrl) return
    await navigator.clipboard.writeText(authUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!configured) {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted/50 border border-input rounded-md">
        <Info className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">
          {label} OAuth가 설정되지 않았습니다. 서버 환경변수를 확인하세요.
        </span>
      </div>
    )
  }

  if (connected) {
    return (
      <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-md">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
          <span className="text-sm font-medium text-green-700">{label} 연결됨</span>
          {email && <span className="text-xs text-muted-foreground">({email})</span>}
        </div>
        <button
          onClick={() => disconnect()}
          disabled={isDisconnecting}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
            'border border-destructive/30 text-destructive',
            'hover:bg-destructive/10 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
          연결 해제
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className={cn(
          'flex items-center gap-2 w-full px-4 py-2.5 rounded-md',
          'border border-primary/30 text-primary',
          'hover:bg-primary/5 transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        <Link2 className="h-4 w-4" aria-hidden="true" />
        {isConnecting ? '링크 생성 중...' : `${label}로 연결`}
      </button>

      {authUrl && (
        <div className="p-3 bg-muted/50 border border-input rounded-md space-y-2">
          <p className="text-xs text-muted-foreground">
            아래 링크를 복사하여 브라우저에서 열어주세요:
          </p>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={authUrl}
              readOnly
              className="flex-1 px-2 py-1.5 text-xs font-mono bg-background border border-input rounded-md truncate"
              onClick={e => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md shrink-0',
                'border border-input hover:bg-muted transition-colors',
                copied && 'text-green-600 border-green-500/30',
              )}
              title="복사"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? '복사됨' : '복사'}
            </button>
            <a
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md shrink-0 border border-input hover:bg-muted transition-colors"
              title="새 탭에서 열기"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              열기
            </a>
          </div>
        </div>
      )}

      {connectError && (
        <div
          className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md"
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" aria-hidden="true" />
          <span className="text-xs text-destructive">
            연결에 실패했습니다. 서버 설정을 확인하세요.
          </span>
        </div>
      )}
    </div>
  )
}
