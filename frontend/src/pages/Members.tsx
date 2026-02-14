import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMembers, type Member } from '@/hooks/useMembers'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import {
  Users,
  UserPlus,
  AlertCircle,
  CheckCircle,
  Clock,
  Shield,
  Crown,
  Eye,
  Loader2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ROLES = [
  { value: 'owner', label: 'Owner', icon: Crown, description: 'Full control' },
  { value: 'admin', label: 'Admin', icon: Shield, description: 'Manage members' },
  { value: 'member', label: 'Member', icon: Users, description: 'Read & write' },
  { value: 'viewer', label: 'Viewer', icon: Eye, description: 'Read only' },
]

function getRoleInfo(role: string) {
  return ROLES.find(r => r.value === role) ?? ROLES[2]
}

interface InviteModalProps {
  isOpen: boolean
  onClose: () => void
  onInvite: (request: { email: string; role: string }) => Promise<unknown>
  isLoading: boolean
  error: Error | null
}

function InviteModal({ isOpen, onClose, onInvite, isLoading, error }: InviteModalProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [success, setSuccess] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await onInvite({ email, role })
      setSuccess(true)
      setEmail('')
      setTimeout(() => {
        setSuccess(false)
        onClose()
      }, 2000)
    } catch {
      void 0
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">{t('members.inviteMember')}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
            <p className="text-sm text-foreground">{t('members.invited')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error.message}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="invite-email" className="text-sm font-medium text-foreground">
                {t('members.inviteEmail')}
              </label>
              <input
                id="invite-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className={cn(
                  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
                placeholder="colleague@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-role" className="text-sm font-medium text-foreground">
                {t('members.role')}
              </label>
              <select
                id="invite-role"
                value={role}
                onChange={e => setRole(e.target.value)}
                disabled={isLoading}
                className={cn(
                  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {ROLES.filter(r => r.value !== 'owner').map(r => (
                  <option key={r.value} value={r.value}>
                    {r.label} - {r.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className={cn(
                  'flex-1 h-10 rounded-lg border border-input bg-background',
                  'text-sm font-medium text-foreground',
                  'hover:bg-accent transition-colors',
                  'disabled:opacity-50',
                )}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isLoading || !email}
                className={cn(
                  'flex-1 h-10 rounded-lg bg-primary text-primary-foreground',
                  'text-sm font-medium',
                  'hover:bg-primary/90 transition-colors',
                  'disabled:opacity-50',
                  'inline-flex items-center justify-center',
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('members.inviting')}
                  </>
                ) : (
                  t('members.invite')
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

interface MemberRowProps {
  member: Member
  onUpdateRole: (request: { memberId: number; role: string }) => Promise<unknown>
  isUpdating: boolean
}

function MemberRow({ member, onUpdateRole, isUpdating }: MemberRowProps) {
  const { t } = useTranslation()
  const [isEditing, setIsEditing] = useState(false)
  const [selectedRole, setSelectedRole] = useState(member.role)
  const roleInfo = getRoleInfo(member.role)
  const RoleIcon = roleInfo.icon

  const handleSaveRole = async () => {
    if (selectedRole !== member.role) {
      try {
        await onUpdateRole({ memberId: member.id, role: selectedRole })
      } catch {
        setSelectedRole(member.role)
      }
    }
    setIsEditing(false)
  }

  return (
    <div className="flex items-center justify-between py-4 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
          {member.email.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {member.name || member.email}
            </span>
            {member.is_pending && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                <Clock className="h-3 w-3" />
                {t('settings.pendingIndex')}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{member.email}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              disabled={isUpdating}
              className={cn(
                'h-8 rounded-lg border border-input bg-background px-2',
                'text-sm text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleSaveRole}
              disabled={isUpdating}
              className={cn(
                'h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm',
                'hover:bg-primary/90 disabled:opacity-50',
              )}
            >
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
            </button>
            <button
              onClick={() => {
                setSelectedRole(member.role)
                setIsEditing(false)
              }}
              disabled={isUpdating}
              className="h-8 px-3 rounded-lg border border-input text-sm hover:bg-accent"
            >
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                member.role === 'owner' && 'bg-amber-100 text-amber-700',
                member.role === 'admin' && 'bg-blue-100 text-blue-700',
                member.role === 'member' && 'bg-green-100 text-green-700',
                member.role === 'viewer' && 'bg-gray-100 text-gray-700',
              )}
            >
              <RoleIcon className="h-3 w-3" />
              {roleInfo.label}
            </span>
            {member.role !== 'owner' && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t('common.edit')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function Members() {
  const { t } = useTranslation()
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const {
    members,
    total,
    isLoading,
    error,
    inviteMember,
    isInviting,
    inviteError,
    updateRole,
    isUpdatingRole,
  } = useMembers()

  if (isLoading) {
    return <LoadingSpinner className="py-12" />
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={t('common.errorOccurred')}
        description={error.message}
      />
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('members.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('common.count_items', { count: total })}
          </p>
        </div>
        <button
          onClick={() => setIsInviteModalOpen(true)}
          className={cn(
            'inline-flex items-center gap-2 h-10 px-4 rounded-lg',
            'bg-primary text-primary-foreground text-sm font-medium',
            'hover:bg-primary/90 transition-colors',
          )}
        >
          <UserPlus className="h-4 w-4" />
          {t('members.inviteMember')}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {members.length === 0 ? (
          <div className="py-12">
            <EmptyState
              icon={Users}
              title={t('members.noMembers')}
              description=""
            />
          </div>
        ) : (
          <div className="divide-y divide-border px-6">
            {members.map(member => (
              <MemberRow
                key={member.id}
                member={member}
                onUpdateRole={updateRole}
                isUpdating={isUpdatingRole}
              />
            ))}
          </div>
        )}
      </div>

      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={inviteMember}
        isLoading={isInviting}
        error={inviteError}
      />
    </div>
  )
}
