import { useState } from 'react'
import { X, Users, UserPlus, Building2, Trash2, Shield, Eye, Edit } from 'lucide-react'
import { useNoteSharing, NoteAccess } from '@/hooks/useNoteSharing'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { cn } from '@/lib/utils'

interface NoteSharingProps {
  noteId: number | string
  isOpen: boolean
  onClose: () => void
}

const PERMISSION_OPTIONS = [
  { value: 'read', label: '읽기', icon: Eye },
  { value: 'write', label: '편집', icon: Edit },
  { value: 'admin', label: '관리', icon: Shield },
]

function PermissionBadge({ permission }: { permission: string }) {
  const option = PERMISSION_OPTIONS.find(o => o.value === permission)
  const Icon = option?.icon ?? Eye

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        permission === 'admin' && 'bg-purple-100 text-purple-700',
        permission === 'write' && 'bg-blue-100 text-blue-700',
        permission === 'read' && 'bg-gray-100 text-gray-700',
      )}
    >
      <Icon className="h-3 w-3" />
      {option?.label ?? permission}
    </span>
  )
}

function AccessRow({
  access,
  canManage,
  onRevoke,
  isRevoking,
}: {
  access: NoteAccess
  canManage: boolean
  onRevoke: (id: number) => void
  isRevoking: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
      <div className="flex items-center gap-3">
        {access.is_org_wide ? (
          <Building2 className="h-5 w-5 text-muted-foreground" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
            {access.user_name?.charAt(0)?.toUpperCase() ??
              access.user_email?.charAt(0)?.toUpperCase() ??
              '?'}
          </div>
        )}
        <div>
          {access.is_org_wide ? (
            <p className="text-sm font-medium">전체 조직</p>
          ) : (
            <>
              <p className="text-sm font-medium">{access.user_name || access.user_email}</p>
              {access.user_name && access.user_email && (
                <p className="text-xs text-muted-foreground">{access.user_email}</p>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <PermissionBadge permission={access.permission} />
        {canManage && (
          <button
            onClick={() => onRevoke(access.id)}
            disabled={isRevoking}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            title="접근 권한 제거"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

export function NoteSharing({ noteId, isOpen, onClose }: NoteSharingProps) {
  const {
    accesses,
    canManage,
    isLoading,
    grantAccess,
    isGranting,
    grantOrgAccess,
    isGrantingOrg,
    revokeAccess,
    isRevoking,
  } = useNoteSharing(noteId)

  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState('read')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleGrantAccess = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError('이메일을 입력해주세요')
      return
    }

    try {
      await grantAccess({ email: email.trim(), permission })
      setEmail('')
    } catch (err) {
      if (err instanceof Error) {
        const body = (err as { body?: string }).body
        if (body) {
          try {
            const parsed = JSON.parse(body)
            setError(parsed.detail || '권한 부여에 실패했습니다')
          } catch {
            setError('권한 부여에 실패했습니다')
          }
        } else {
          setError(err.message)
        }
      }
    }
  }

  const handleGrantOrgAccess = async () => {
    setError(null)
    try {
      await grantOrgAccess(permission)
    } catch (err) {
      if (err instanceof Error) {
        setError('조직 전체 권한 부여에 실패했습니다')
      }
    }
  }

  const handleRevoke = async (accessId: number) => {
    setError(null)
    try {
      await revokeAccess(accessId)
    } catch {
      setError('권한 제거에 실패했습니다')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">노트 공유</h2>
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
              {canManage && (
                <form onSubmit={handleGrantAccess} className="mb-6">
                  <label className="block text-sm font-medium mb-2">
                    사용자 추가
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="이메일 주소"
                      className="flex-1 px-3 py-2 border border-input rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <select
                      value={permission}
                      onChange={e => setPermission(e.target.value)}
                      className="px-3 py-2 border border-input rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {PERMISSION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="submit"
                      disabled={isGranting || !email.trim()}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <UserPlus className="h-4 w-4" />
                      {isGranting ? '추가 중...' : '사용자 추가'}
                    </button>
                    <button
                      type="button"
                      onClick={handleGrantOrgAccess}
                      disabled={isGrantingOrg}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                      title="조직 전체에 권한 부여"
                    >
                      <Building2 className="h-4 w-4" />
                      {isGrantingOrg ? '...' : '조직 전체'}
                    </button>
                  </div>
                </form>
              )}

              {error && (
                <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium mb-3">
                  접근 권한 ({accesses.length})
                </h3>
                {accesses.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    아직 공유된 사용자가 없습니다
                  </p>
                ) : (
                  <div className="space-y-2">
                    {accesses.map(access => (
                      <AccessRow
                        key={access.id}
                        access={access}
                        canManage={canManage}
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
