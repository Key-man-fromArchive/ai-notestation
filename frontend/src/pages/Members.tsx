import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useMembers, type Member } from '@/hooks/useMembers'
import { useMemberNotebookAccess, type MemberNotebookAccessItem } from '@/hooks/useMemberNotebookAccess'
import { useNotebooks } from '@/hooks/useNotebooks'
import { useGroups, type Group } from '@/hooks/useGroups'
import { useGroupMembers } from '@/hooks/useGroupMembers'
import { useGroupNotebookAccess } from '@/hooks/useGroupNotebookAccess'
import { apiClient } from '@/lib/api'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import { Breadcrumb } from '@/components/Breadcrumb'
import {
  Users, UserPlus, AlertCircle, CheckCircle, Clock,
  Shield, Crown, Eye, Loader2, X, Trash2, KeyRound,
  FolderOpen, Plus, Pencil,
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

// --- Batch Role Modal ---
function BatchRoleModal({
  isOpen, selectedCount, onConfirm, onCancel, isLoading,
}: {
  isOpen: boolean
  selectedCount: number
  onConfirm: (role: string) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const { t } = useTranslation()
  const [role, setRole] = useState('member')
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">{t('members.batchRoleChange')}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t('members.selectedCount', { count: selectedCount })}
        </p>
        <select value={role} onChange={e => setRole(e.target.value)}
          className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm mb-4">
          {ROLES.filter(r => r.value !== 'owner').map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={isLoading}
            className="flex-1 h-10 rounded-lg border border-input bg-background text-sm font-medium hover:bg-accent disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button onClick={() => onConfirm(role)} disabled={isLoading}
            className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Assign Group Modal ---
function AssignGroupModal({
  isOpen, selectedMemberIds, groups, onConfirm, onCancel, isLoading,
}: {
  isOpen: boolean
  selectedMemberIds: number[]
  groups: Group[]
  onConfirm: (groupId: number) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const { t } = useTranslation()
  const [selectedGroupId, setSelectedGroupId] = useState(0)
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">{t('groups.assignToGroup')}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t('members.selectedCount', { count: selectedMemberIds.length })}
        </p>
        <select value={selectedGroupId} onChange={e => setSelectedGroupId(Number(e.target.value))}
          className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm mb-4">
          <option value={0}>{t('groups.selectMembers')}</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={isLoading}
            className="flex-1 h-10 rounded-lg border border-input bg-background text-sm font-medium hover:bg-accent disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button onClick={() => onConfirm(selectedGroupId)} disabled={isLoading || !selectedGroupId}
            className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('groups.assign')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Group Form Modal ---
function GroupFormModal({
  isOpen, group, onSubmit, onCancel, isLoading,
}: {
  isOpen: boolean
  group: Group | null  // null = create mode
  onSubmit: (data: { name: string; description: string; color: string }) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  const [color, setColor] = useState(group?.color ?? '#6B7280')

  if (!isOpen) return null

  const COLORS = ['#6B7280', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">{group ? t('groups.editGroup') : t('groups.createGroup')}</h2>
          <button onClick={onCancel} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('groups.name')}</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder={t('groups.namePlaceholder')}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('groups.description')}</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder={t('groups.descriptionPlaceholder')}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('groups.color')}</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} type="button"
                  className={cn('h-8 w-8 rounded-full border-2 transition-all',
                    color === c ? 'border-foreground scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onCancel} disabled={isLoading} type="button"
              className="flex-1 h-10 rounded-lg border border-input bg-background text-sm font-medium hover:bg-accent disabled:opacity-50">
              {t('common.cancel')}
            </button>
            <button onClick={() => onSubmit({ name, description, color })} disabled={isLoading || !name.trim()} type="button"
              className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Group Detail Modal ---
function GroupDetailModal({
  isOpen, group, onClose, allMembers,
}: {
  isOpen: boolean
  group: Group | null
  onClose: () => void
  allMembers: Member[]
}) {
  const { t } = useTranslation()
  const { members: groupMembers, isLoading, addMembers, isAdding, removeMembers, isRemoving } = useGroupMembers(group?.id ?? 0)
  const { accesses, isLoading: accessLoading, updateAccess, isUpdating, revokeAccess, isRevoking } = useGroupNotebookAccess(group?.id ?? 0)
  const { data: notebooksData } = useNotebooks()
  const notebooks = notebooksData?.items ?? []
  const [activeSection, setActiveSection] = useState<'members' | 'access'>('members')
  const [addMemberIds, setAddMemberIds] = useState<number[]>([])
  const [addNotebookId, setAddNotebookId] = useState(0)
  const [addPermission, setAddPermission] = useState('read')

  if (!isOpen || !group) return null

  const existingMembershipIds = new Set(groupMembers.map(gm => gm.membership_id))
  const availableMembers = allMembers.filter(m => !existingMembershipIds.has(m.id) && m.role !== 'owner')
  const availableNotebooks = notebooks.filter(nb => !accesses.some(a => a.notebook_id === nb.id))

  const handleAddMembers = async () => {
    if (addMemberIds.length === 0) return
    try {
      await addMembers(addMemberIds)
      setAddMemberIds([])
    } catch { void 0 }
  }

  const handleAddAccess = async () => {
    if (!addNotebookId) return
    try {
      await updateAccess([{ notebook_id: addNotebookId, permission: addPermission }])
      setAddNotebookId(0)
      setAddPermission('read')
    } catch { void 0 }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: group.color }}>
              {group.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{group.name}</h2>
              {group.description && <p className="text-sm text-muted-foreground">{group.description}</p>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 mb-4 border-b border-border">
          <button onClick={() => setActiveSection('members')}
            className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeSection === 'members' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t('groups.manageMembers')} ({groupMembers.length})
          </button>
          <button onClick={() => setActiveSection('access')}
            className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeSection === 'access' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t('groups.manageAccess')} ({accesses.length})
          </button>
        </div>

        {activeSection === 'members' ? (
          <div>
            {isLoading ? <LoadingSpinner className="py-4" /> : (
              <>
                <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                  {groupMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('groups.noGroupMembers')}</p>
                  ) : groupMembers.map(gm => (
                    <div key={gm.membership_id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-border">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                          {gm.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-medium">{gm.name || gm.email}</span>
                          <span className="text-xs text-muted-foreground ml-2">{gm.role}</span>
                        </div>
                      </div>
                      <button onClick={() => removeMembers([gm.membership_id])} disabled={isRemoving}
                        className="h-7 w-7 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                {availableMembers.length > 0 && (
                  <div className="flex items-center gap-2 pt-3 border-t border-border">
                    <select
                      value="" onChange={e => {
                        const id = Number(e.target.value)
                        if (id && !addMemberIds.includes(id)) setAddMemberIds(prev => [...prev, id])
                      }}
                      className="flex-1 h-9 rounded-lg border border-input bg-background px-2 text-sm">
                      <option value="">{t('groups.selectMembers')}</option>
                      {availableMembers.filter(m => !addMemberIds.includes(m.id)).map(m => (
                        <option key={m.id} value={m.id}>{m.name || m.email}</option>
                      ))}
                    </select>
                    <button onClick={handleAddMembers} disabled={addMemberIds.length === 0 || isAdding}
                      className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                      {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : t('groups.addMembers')}
                    </button>
                  </div>
                )}
                {addMemberIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {addMemberIds.map(id => {
                      const m = allMembers.find(m => m.id === id)
                      return m ? (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                          {m.name || m.email}
                          <button onClick={() => setAddMemberIds(prev => prev.filter(x => x !== id))} className="hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ) : null
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div>
            {accessLoading ? <LoadingSpinner className="py-4" /> : (
              <>
                <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                  {accesses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('groups.noAccess')}</p>
                  ) : accesses.map(a => (
                    <div key={a.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-border">
                      <span className="text-sm font-medium truncate flex-1">{a.notebook_name}</span>
                      <div className="flex items-center gap-2 ml-2">
                        <select value={a.permission}
                          onChange={e => updateAccess([{ notebook_id: a.notebook_id, permission: e.target.value }])}
                          disabled={isUpdating}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                          <option value="read">{t('members.permissionRead')}</option>
                          <option value="write">{t('members.permissionWrite')}</option>
                          <option value="admin">{t('members.permissionAdmin')}</option>
                        </select>
                        <button onClick={() => revokeAccess(a.notebook_id)} disabled={isRevoking}
                          className="h-8 w-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {availableNotebooks.length > 0 && (
                  <div className="flex items-center gap-2 pt-3 border-t border-border">
                    <select value={addNotebookId} onChange={e => setAddNotebookId(Number(e.target.value))}
                      className="flex-1 h-9 rounded-lg border border-input bg-background px-2 text-sm">
                      <option value={0}>{t('members.selectNotebook')}</option>
                      {availableNotebooks.map(nb => (
                        <option key={nb.id} value={nb.id}>{nb.name}</option>
                      ))}
                    </select>
                    <select value={addPermission} onChange={e => setAddPermission(e.target.value)}
                      className="h-9 rounded-lg border border-input bg-background px-2 text-sm w-24">
                      <option value="read">{t('members.permissionRead')}</option>
                      <option value="write">{t('members.permissionWrite')}</option>
                      <option value="admin">{t('members.permissionAdmin')}</option>
                    </select>
                    <button onClick={handleAddAccess} disabled={!addNotebookId || isUpdating}
                      className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                      {t('members.addAccess')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Groups Panel ---
function GroupsPanel({ allMembers }: { allMembers: Member[] }) {
  const { t } = useTranslation()
  const { groups, isLoading, createGroup, isCreating, updateGroup, isUpdating, deleteGroup, isDeleting } = useGroups()
  const [formGroup, setFormGroup] = useState<Group | null | undefined>(undefined) // undefined=closed, null=create, Group=edit
  const [detailGroup, setDetailGroup] = useState<Group | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null)

  if (isLoading) return <LoadingSpinner className="py-12" />

  const handleSubmit = async (data: { name: string; description: string; color: string }) => {
    try {
      if (formGroup === null) {
        await createGroup(data)
      } else if (formGroup) {
        await updateGroup({ groupId: formGroup.id, ...data })
      }
      setFormGroup(undefined)
    } catch { void 0 }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteGroup(deleteTarget.id)
      setDeleteTarget(null)
    } catch { void 0 }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{t('common.count_items', { count: groups.length })}</p>
        <button onClick={() => setFormGroup(null)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          {t('groups.createGroup')}
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="py-12">
          <EmptyState icon={FolderOpen} title={t('groups.noGroups')} description="" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(group => (
            <div key={group.id}
              className="rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setDetailGroup(group)}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: group.color }}>
                    {group.name.charAt(0).toUpperCase()}
                  </div>
                  <h3 className="text-sm font-semibold">{group.name}</h3>
                </div>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setFormGroup(group)}
                    className="h-7 w-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget(group)}
                    className="h-7 w-7 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {group.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{group.description}</p>}
              <span className="text-xs text-muted-foreground">
                {t('groups.memberCount', { count: group.member_count })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Group Modal */}
      <GroupFormModal
        isOpen={formGroup !== undefined}
        group={formGroup ?? null}
        onSubmit={handleSubmit}
        onCancel={() => setFormGroup(undefined)}
        isLoading={isCreating || isUpdating}
      />

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{t('groups.deleteGroup')}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t('groups.deleteConfirm')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={isDeleting}
                className="flex-1 h-10 rounded-lg border border-input bg-background text-sm font-medium hover:bg-accent disabled:opacity-50">
                {t('common.cancel')}
              </button>
              <button onClick={handleDelete} disabled={isDeleting}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 inline-flex items-center justify-center">
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('groups.deleteGroup')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Detail */}
      <GroupDetailModal
        isOpen={detailGroup !== null}
        group={detailGroup}
        onClose={() => setDetailGroup(null)}
        allMembers={allMembers}
      />
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
  const notebooks = notebooksData?.items ?? []

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
  const [activeTab, setActiveTab] = useState<'members' | 'groups'>('members')
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [removeTargets, setRemoveTargets] = useState<Member[]>([])
  const [accessTarget, setAccessTarget] = useState<Member | null>(null)
  const [showBatchRole, setShowBatchRole] = useState(false)
  const [showAssignGroup, setShowAssignGroup] = useState(false)
  const [isAssigningGroup, setIsAssigningGroup] = useState(false)

  const {
    members, total, isLoading, error,
    inviteMember, isInviting, inviteError,
    updateRole, isUpdatingRole,
    removeMember, isRemoving,
    batchRemoveMembers, isBatchRemoving,
    batchUpdateRole, isBatchUpdatingRole,
  } = useMembers()

  const { groups } = useGroups()

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

  const handleBatchRoleChange = async (role: string) => {
    try {
      await batchUpdateRole({ memberIds: Array.from(selectedIds), role })
      setShowBatchRole(false)
      setSelectedIds(new Set())
    } catch { void 0 }
  }

  const handleAssignToGroup = async (groupId: number) => {
    if (!groupId) return
    setIsAssigningGroup(true)
    try {
      const memberIds = Array.from(selectedIds)
      await apiClient.post(`/groups/${groupId}/members`, { membership_ids: memberIds })
      setShowAssignGroup(false)
      setSelectedIds(new Set())
    } catch { void 0 } finally {
      setIsAssigningGroup(false)
    }
  }

  if (isLoading) return <LoadingSpinner className="py-12" />

  if (error) {
    return <EmptyState icon={AlertCircle} title={t('common.errorOccurred')} description={error.message} />
  }

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb items={[
        { label: t('sidebar.dashboard'), to: '/' },
        { label: t('members.title') }
      ]} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('members.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('common.count_items', { count: total })}
          </p>
        </div>
        {activeTab === 'members' && (
          <button onClick={() => setIsInviteModalOpen(true)}
            className={cn('inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors')}>
            <UserPlus className="h-4 w-4" />
            {t('members.inviteMember')}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setActiveTab('members')}
          className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'members' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          <Users className="h-4 w-4 inline mr-1.5" />
          {t('members.title')} ({total})
        </button>
        <button onClick={() => setActiveTab('groups')}
          className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'groups' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          <FolderOpen className="h-4 w-4 inline mr-1.5" />
          {t('groups.title')}
        </button>
      </div>

      {activeTab === 'members' ? (
        <>
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
              <div className="flex items-center gap-2">
                <button onClick={() => setShowBatchRole(true)}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80">
                  <Shield className="h-3.5 w-3.5" />
                  {t('members.batchRoleChange')}
                </button>
                {groups.length > 0 && (
                  <button onClick={() => setShowAssignGroup(true)}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80">
                    <FolderOpen className="h-3.5 w-3.5" />
                    {t('groups.assignToGroup')}
                  </button>
                )}
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
        </>
      ) : (
        <GroupsPanel allMembers={members} />
      )}

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
      <BatchRoleModal
        isOpen={showBatchRole}
        selectedCount={selectedIds.size}
        onConfirm={handleBatchRoleChange}
        onCancel={() => setShowBatchRole(false)}
        isLoading={isBatchUpdatingRole}
      />
      <AssignGroupModal
        isOpen={showAssignGroup}
        selectedMemberIds={Array.from(selectedIds)}
        groups={groups}
        onConfirm={handleAssignToGroup}
        onCancel={() => setShowAssignGroup(false)}
        isLoading={isAssigningGroup}
      />
    </div>
  )
}
