import { useState } from 'react'
import {
  X,
  Link as LinkIcon,
  Copy,
  Trash2,
  Clock,
  Mail,
  Globe,
  Check,
} from 'lucide-react'
import { useShareLinks, ShareLink, CreateShareLinkRequest } from '@/hooks/useShareLinks'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { cn } from '@/lib/utils'

interface ShareDialogProps {
  notebookId: number
  isOpen: boolean
  onClose: () => void
}

const LINK_TYPE_OPTIONS = [
  {
    value: 'public',
    label: '공개 링크',
    description: '누구나 접근 가능',
    icon: Globe,
  },
  {
    value: 'email_required',
    label: '이메일 필수',
    description: '특정 이메일만 접근 가능',
    icon: Mail,
  },
  {
    value: 'time_limited',
    label: '기간 제한',
    description: '지정된 기간 동안만 유효',
    icon: Clock,
  },
] as const

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function LinkRow({
  link,
  onRevoke,
  isRevoking,
}: {
  link: ShareLink
  onRevoke: (id: number) => void
  isRevoking: boolean
}) {
  const [copied, setCopied] = useState(false)
  const shareUrl = `${window.location.origin}/shared/${link.token}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement('textarea')
      textArea.value = shareUrl
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const typeOption = LINK_TYPE_OPTIONS.find(opt => opt.value === link.link_type)
  const Icon = typeOption?.icon ?? LinkIcon

  return (
    <div className="flex items-center justify-between py-3 px-3 rounded-lg bg-muted/30 gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="p-2 rounded-full bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" title={shareUrl}>
            {typeOption?.label ?? link.link_type}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>접근 {link.access_count}회</span>
            {link.expires_at && (
              <span>• 만료: {formatDate(link.expires_at)}</span>
            )}
            {link.email_restriction && (
              <span>• {link.email_restriction}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={handleCopy}
          className={cn(
            'p-2 rounded-lg transition-colors',
            copied
              ? 'bg-green-100 text-green-600'
              : 'hover:bg-accent text-muted-foreground hover:text-foreground',
          )}
          title={copied ? '복사됨!' : '링크 복사'}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
        <button
          onClick={() => onRevoke(link.id)}
          disabled={isRevoking}
          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          title="링크 삭제"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function ShareDialog({ notebookId, isOpen, onClose }: ShareDialogProps) {
  const {
    links,
    isLoading,
    createLink,
    isCreating,
    revokeLink,
    isRevoking,
  } = useShareLinks(notebookId)

  const [linkType, setLinkType] = useState<CreateShareLinkRequest['link_type']>('public')
  const [emailRestriction, setEmailRestriction] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('7')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const request: CreateShareLinkRequest = { link_type: linkType }

    if (linkType === 'email_required') {
      if (!emailRestriction.trim()) {
        setError('이메일 주소를 입력해주세요')
        return
      }
      request.email_restriction = emailRestriction.trim()
    }

    if (linkType === 'time_limited') {
      const days = parseInt(expiresInDays, 10)
      if (isNaN(days) || days < 1 || days > 90) {
        setError('유효 기간은 1-90일 사이여야 합니다')
        return
      }
      request.expires_in_days = days
    }

    try {
      await createLink(request)
      setLinkType('public')
      setEmailRestriction('')
      setExpiresInDays('7')
    } catch (err) {
      if (err instanceof Error) {
        try {
          const body = (err as { body?: string }).body
          if (body) {
            const parsed = JSON.parse(body)
            setError(parsed.detail || '링크 생성에 실패했습니다')
          } else {
            setError('링크 생성에 실패했습니다')
          }
        } catch {
          setError('링크 생성에 실패했습니다')
        }
      }
    }
  }

  const handleRevoke = async (linkId: number) => {
    setError(null)
    try {
      await revokeLink(linkId)
    } catch {
      setError('링크 삭제에 실패했습니다')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">공유 링크</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              <form onSubmit={handleCreate} className="mb-6">
                <label className="block text-sm font-medium mb-3">
                  새 링크 생성
                </label>

                <div className="space-y-2 mb-4">
                  {LINK_TYPE_OPTIONS.map(option => (
                    <label
                      key={option.value}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        linkType === option.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent',
                      )}
                    >
                      <input
                        type="radio"
                        name="linkType"
                        value={option.value}
                        checked={linkType === option.value}
                        onChange={e =>
                          setLinkType(e.target.value as CreateShareLinkRequest['link_type'])
                        }
                        className="sr-only"
                      />
                      <option.icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{option.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {option.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                {linkType === 'email_required' && (
                  <div className="mb-4">
                    <label htmlFor="emailRestriction" className="block text-sm font-medium mb-1">
                      허용 이메일
                    </label>
                    <input
                      id="emailRestriction"
                      type="email"
                      value={emailRestriction}
                      onChange={e => setEmailRestriction(e.target.value)}
                      placeholder="allowed@example.com"
                      className="w-full px-3 py-2 border border-input rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                )}

                {linkType === 'time_limited' && (
                  <div className="mb-4">
                    <label htmlFor="expiresInDays" className="block text-sm font-medium mb-1">
                      유효 기간 (일)
                    </label>
                    <input
                      id="expiresInDays"
                      type="number"
                      min={1}
                      max={90}
                      value={expiresInDays}
                      onChange={e => setExpiresInDays(e.target.value)}
                      className="w-full px-3 py-2 border border-input rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      최대 90일까지 설정 가능합니다
                    </p>
                  </div>
                )}

                {error && (
                  <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isCreating}
                  className={cn(
                    'w-full px-4 py-2 rounded-lg text-sm font-medium',
                    'bg-primary text-primary-foreground',
                    'hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {isCreating ? '생성 중...' : '링크 생성'}
                </button>
              </form>

              <div>
                <h3 className="text-sm font-medium mb-3">
                  활성 링크 ({links.length})
                </h3>
                {links.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    생성된 공유 링크가 없습니다
                  </p>
                ) : (
                  <div className="space-y-2">
                    {links.map(link => (
                      <LinkRow
                        key={link.id}
                        link={link}
                        onRevoke={handleRevoke}
                        isRevoking={isRevoking}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
