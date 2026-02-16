import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useMembers, type Member } from '@/hooks/useMembers'
import { useMemberNotebookAccess, type MemberNotebookAccessItem } from '@/hooks/useMemberNotebookAccess'
import { useNotebooks } from '@/hooks/useNotebooks'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import {
  Users, UserPlus, AlertCircle, CheckCircle, Clock,
  Shield, Crown, Eye, Loader2, X, Trash2, KeyRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ROLES = [
  { value: 'owner', label: 'Owner', icon: Crown, description: 'Full control' },
  { value: 'admin', label: 'Admin', icon: Shield, description: 'Manage members' },
  { value: 'member', label: 'Member', icon: Users, description: 'Read & write' },
  { value: 'viewer', label: 'Viewer', icon: Eye, description: 'Read only' },
]

const ROLE_ORDER = ['owner', 'admin', 'member', 'viewer']

function getRoleInfo(role: string) {
  return ROLES.find(r => r.value === role) ?? ROLES[2]
}

// --- Invite Modal (unchanged) ---
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
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
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
              <label htmlFor="invite-email" className="text-sm font-medium text-foreground">{t('members.inviteEmail')}</label>
              <input
                id="invite-email" type="email" value={email}
                onChange={e => setEmail(e.target.value)} required disabled={isLoading}
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
              <label htmlFor="invite-role" className="text-sm font-medium text-foreground">{t('members.role')}</label>
              <select
                id="invite-role" value={role} onChange={e => setRole(e.target.value)} disabled={isLoading}
                className={cn(
                  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {ROLES.filter(r => r.value !== 'owner').map(r => (
                  <option key={r.value} value={r.value}>{r.label} - {r.description}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} disabled={isLoading}
                className={cn('flex-1 h-10 rounded-lg border border-input bg-background text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50')}>
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={isLoading || !email}
                className={cn('flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center justify-center')}>
                {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('members.inviting')}</>) : t('members.invite')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// --- Remove Confirm Modal ---
function RemoveConfirmModal({
  isOpen, members, onConfirm, onCancel, isLoading,
}: {
  isOpen: boolean
  members: Member[]
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
}) {
  const { t } = useTranslation()
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">{t('members.removeMember')}</h2>
          <button onClick={onCancel} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {members.length === 1
            ? t('members.removeConfirm')
            : t('members.batchRemoveConfirm', { count: members.length })}
        </p>
        <div className="max-h-40 overflow-y-auto space-y-2 mb-4">
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                {m.email.charAt(0).toUpperCase()}
              </div>
              <span className="text-foreground">{m.name || m.email}</span>
              <span className="text-muted-foreground">({getRoleInfo(m.role).label})</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={isLoading}
            className="flex-1 h-10 rounded-lg border border-input bg-background text-sm font-medium hover:bg-accent disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button onClick={onConfirm} disabled={isLoading}
            className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 inline-flex items-center justify-center">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('members.batchRemove')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Notebook Access Panel ---
function NotebookAccessPanel({
  isOpen, member, onClose,
}: {
  isOpen: boolean
  member: Member | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { accesses, isLoading, updateAccess, isUpdating, revokeAccess, isRevoking } =
    useMemberNotebookAccess(member?.id ?? 0)
  const { data: notebooksData } = useNotebooks()
  const notebooks = notebooksData?.notebooks ?? []

  const [addNotebookId, setAddNotebookId] = useState<number>(0)
  const [addPermission, setAddPermission] = useState('read')

  if (!isOpen || !member) return null

  const availableNotebooks = notebooks.filter(
    nb => !accesses.some(a => a.notebook_id === nb.id),
  )

  const handleAdd = async () => {
    if (!addNotebookId) return
    try {
      await updateAccess([{ notebook_id: addNotebookId, permission: addPermission }])
      setAddNotebookId(0)
      setAddPermission('read')
    } catch {
      void 0
    }
  }

  const handleRevoke = async (accessId: number) => {
    try {
      await revokeAccess(accessId)
    } catch {
      void 0
    }
  }

  const handlePermissionChange = async (item: MemberNotebookAccessItem, permission: string) => {
    try {
      await updateAccess([{ notebook_id: item.notebook_id, permission }])
    } catch {
      void 0
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t('members.manageAccess')}</h2>
            <p className="text-sm text-muted-foreground">{member.name || member.email}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <LoadingSpinner className="py-8" />
        ) : (
          <>
            {/* Existing accesses */}
            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {accesses.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">{t('members.noAccess')}</p>
              ) : (
                accesses.map(a => (
                  <div key={a.access_id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-border">
                    <span className="text-sm font-medium text-foreground truncate flex-1">{a.notebook_name}</span>
                    <div className="flex items-center gap-2 ml-2">
                      <select
                        value={a.permission}
                        onChange={e => handlePermissionChange(a, e.target.value)}
                        disabled={isUpdating}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="read">{t('members.permissionRead')}</option>
                        <option value="write">{t('members.permissionWrite')}</option>
                        <option value="admin">{t('members.permissionAdmin')}</option>
                      </select>
                      <button
                        onClick={() => handleRevoke(a.access_id)}
                        disabled={isRevoking}
                        className="h-8 w-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add new access */}
            {availableNotebooks.length > 0 && (
              <div className="flex items-center gap-2 pt-3 border-t border-border">
                <select
                  value={addNotebookId}
                  onChange={e => setAddNotebookId(Number(e.target.value))}
                  className="flex-1 h-9 rounded-lg border border-input bg-background px-2 text-sm"
                >
                  <option value={0}>{t('members.selectNotebook')}</option>
                  {availableNotebooks.map(nb => (
                    <option key={nb.id} value={nb.id}>{nb.name}</option>
                  ))}
                </select>
                <select
                  value={addPermission}
                  onChange={e => setAddPermission(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-sm w-24"
                >
                  <option value="read">{t('members.permissionRead')}</option>
                  <option value="write">{t('members.permissionWrite')}</option>
                  <option value="admin">{t('members.permissionAdmin')}</option>
                </select>
                <button
                  onClick={handleAdd}
                  disabled={!addNotebookId || isUpdating}
                  className={cn(
                    'h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium',
                    'hover:bg-primary/90 disabled:opacity-50',
                  )}
                >
                  {t('members.addAccess')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// --- Member Row ---
interface MemberRowProps {
  member: Member
  isSelected: boolean
  onToggleSelect: (id: number) => void
  onUpdateRole: (request: { memberId: number; role: string }) => Promise<unknown>
  onRemove: (member: Member) => void
  onManageAccess: (member: Member) => void
  isUpdating: boolean
}

function MemberRow({
  member, isSelected, onToggleSelect, onUpdateRole, onRemove, onManageAccess, isUpdating,
}: MemberRowProps) {
  const { t } = useTranslation()
  const [isEditing, setIsEditing] = useState(false)
  const [selectedRole, setSelectedRole] = useState(member.role)
  const roleInfo = getRoleInfo(member.role)
  const RoleIcon = roleInfo.icon
  const isOwner = member.role === 'owner'

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
    <div className="flex items-center justify-between py-3 px-4 hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-3">
        {!isOwner && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(member.id)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
          />
        )}
        {isOwner && <div className="w-4" />}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
          {member.email.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{member.name || member.email}</span>
            {member.is_pending && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                <Clock className="h-3 w-3" />
                Pending
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{member.email}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} disabled={isUpdating}
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm">
              {ROLES.map(r => (<option key={r.value} value={r.value}>{r.label}</option>))}
            </select>
            <button onClick={handleSaveRole} disabled={isUpdating}
              className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50">
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
            </button>
            <button onClick={() => { setSelectedRole(member.role); setIsEditing(false) }} disabled={isUpdating}
              className="h-8 px-3 rounded-lg border border-input text-sm hover:bg-accent">
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <>
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              member.role === 'owner' && 'bg-amber-100 text-amber-700',
              member.role === 'admin' && 'bg-blue-100 text-blue-700',
              member.role === 'member' && 'bg-green-100 text-green-700',
              member.role === 'viewer' && 'bg-gray-100 text-gray-700',
            )}>
              <RoleIcon className="h-3 w-3" />
              {roleInfo.label}
            </span>
            {!isOwner && (
              <div className="flex items-center gap-1">
                <button onClick={() => onManageAccess(member)} title={t('members.manageAccess')}
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center">
                  <KeyRound className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setIsEditing(true)} title={t('common.edit')}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent">
                  {t('common.edit')}
                </button>
                <button onClick={() => onRemove(member)} title={t('members.removeMember')}
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// --- Section Header ---
function SectionHeader({
  role, count, isAllSelected, onToggleSection,
}: {
  role: string
  count: number
  isAllSelected: boolean
  onToggleSection: () => void
}) {
  const { t } = useTranslation()
  const roleInfo = getRoleInfo(role)
  const RoleIcon = roleInfo.icon
  const isOwner = role === 'owner'

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b border-border">
      {!isOwner ? (
        <input
          type="checkbox"
          checked={isAllSelected}
          onChange={onToggleSection}
          className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
        />
      ) : (
        <div className="w-4" />
      )}
      <RoleIcon className={cn(
        'h-4 w-4',
        role === 'owner' && 'text-amber-600',
        role === 'admin' && 'text-blue-600',
        role === 'member' && 'text-green-600',
        role === 'viewer' && 'text-gray-500',
      )} />
      <span className="text-sm font-semibold text-foreground">
        {t(`members.${role}`)}
      </span>
      <span className="text-xs text-muted-foreground">({count})</span>
    </div>
  )
}

// --- Main Members Page ---
export default function Members() {
  const { t } = useTranslation()
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [removeTargets, setRemoveTargets] = useState<Member[]>([])
  const [accessTarget, setAccessTarget] = useState<Member | null>(null)

  const {
    members, total, isLoading, error,
    inviteMember, isInviting, inviteError,
    updateRole, isUpdatingRole,
    removeMember, isRemoving,
    batchRemoveMembers, isBatchRemoving,
  } = useMembers()

  // Group members by role
  const groupedMembers = useMemo(() => {
    const groups: Record<string, Member[]> = { owner: [], admin: [], member: [], viewer: [] }
    for (const m of members) {
      const key = ROLE_ORDER.includes(m.role) ? m.role : 'member'
      groups[key].push(m)
    }
    return groups
  }, [members])

  const nonOwnerIds = useMemo(
    () => members.filter(m => m.role !== 'owner').map(m => m.id),
    [members],
  )

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSection = useCallback((role: string) => {
    const sectionIds = groupedMembers[role]?.map(m => m.id) ?? []
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSelected = sectionIds.every(id => next.has(id))
      if (allSelected) {
        sectionIds.forEach(id => next.delete(id))
      } else {
        sectionIds.forEach(id => next.add(id))
      }
      return next
    })
  }, [groupedMembers])

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      const allSelected = nonOwnerIds.every(id => prev.has(id))
      return allSelected ? new Set() : new Set(nonOwnerIds)
    })
  }, [nonOwnerIds])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleRemoveOne = (member: Member) => setRemoveTargets([member])

  const handleBatchRemove = () => {
    const targets = members.filter(m => selectedIds.has(m.id))
    setRemoveTargets(targets)
  }

  const handleConfirmRemove = async () => {
    try {
      if (removeTargets.length === 1) {
        await removeMember(removeTargets[0].id)
      } else {
        await batchRemoveMembers(removeTargets.map(m => m.id))
      }
      setSelectedIds(prev => {
        const next = new Set(prev)
        removeTargets.forEach(m => next.delete(m.id))
        return next
      })
    } catch {
      void 0
    } finally {
      setRemoveTargets([])
    }
  }

  if (isLoading) return <LoadingSpinner className="py-12" />

  if (error) {
    return <EmptyState icon={AlertCircle} title={t('common.errorOccurred')} description={error.message} />
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('members.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('common.count_items', { count: total })}
          </p>
        </div>
        <button onClick={() => setIsInviteModalOpen(true)}
          className={cn('inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors')}>
          <UserPlus className="h-4 w-4" />
          {t('members.inviteMember')}
        </button>
      </div>

      {/* Batch toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={nonOwnerIds.length > 0 && nonOwnerIds.every(id => selectedIds.has(id))}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
            />
            <span className="text-sm font-medium text-foreground">
              {t('members.selectedCount', { count: selectedIds.size })}
            </span>
            <button onClick={clearSelection}
              className="text-xs text-muted-foreground hover:text-foreground underline">
              {t('members.clearSelection')}
            </button>
          </div>
          <button onClick={handleBatchRemove} disabled={isBatchRemoving}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 rounded-lg',
              'bg-destructive text-destructive-foreground text-sm font-medium',
              'hover:bg-destructive/90 disabled:opacity-50',
            )}>
            <Trash2 className="h-3.5 w-3.5" />
            {t('members.batchRemove')}
          </button>
        </div>
      )}

      {/* Members grouped by role */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {members.length === 0 ? (
          <div className="py-12">
            <EmptyState icon={Users} title={t('members.noMembers')} description="" />
          </div>
        ) : (
          ROLE_ORDER.map(role => {
            const group = groupedMembers[role]
            if (group.length === 0) return null
            const sectionIds = group.map(m => m.id)
            const isAllSelected = role !== 'owner' && sectionIds.every(id => selectedIds.has(id))

            return (
              <div key={role}>
                <SectionHeader
                  role={role}
                  count={group.length}
                  isAllSelected={isAllSelected}
                  onToggleSection={() => toggleSection(role)}
                />
                {group.map(member => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isSelected={selectedIds.has(member.id)}
                    onToggleSelect={toggleSelect}
                    onUpdateRole={updateRole}
                    onRemove={handleRemoveOne}
                    onManageAccess={setAccessTarget}
                    isUpdating={isUpdatingRole}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>

      {/* Modals */}
      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={inviteMember}
        isLoading={isInviting}
        error={inviteError}
      />
      <RemoveConfirmModal
        isOpen={removeTargets.length > 0}
        members={removeTargets}
        onConfirm={handleConfirmRemove}
        onCancel={() => setRemoveTargets([])}
        isLoading={isRemoving || isBatchRemoving}
      />
      <NotebookAccessPanel
        isOpen={accessTarget !== null}
        member={accessTarget}
        onClose={() => setAccessTarget(null)}
      />
    </div>
  )
}
