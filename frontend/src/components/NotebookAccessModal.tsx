import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Users, Eye, Edit, Shield, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotebookAccess } from '@/hooks/useNotebookAccess'
import { LoadingSpinner } from '@/components/LoadingSpinner'

interface NotebookAccessModalProps {
  isOpen: boolean
  onClose: () => void
  notebookId: number
}

export function NotebookAccessModal({ isOpen, onClose, notebookId }: NotebookAccessModalProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState('read')
  const {
    accesses,
    isLoading,
    grantAccess,
    isGranting,
    revokeAccess,
    isRevoking,
  } = useNotebookAccess(notebookId)

  const PERMISSION_OPTIONS = [
    { value: 'read', label: t('notebooks.permRead'), icon: Eye },
    { value: 'write', label: t('notebooks.permWrite'), icon: Edit },
    { value: 'admin', label: t('notebooks.permAdmin'), icon: Shield },
  ]

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    try {
      await grantAccess({ email: email.trim(), permission })
      setEmail('')
    } catch {
      return
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-card rounded-lg shadow-lg w-full max-w-md mx-4 p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {t('contextMenu.manageAccess')}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent" aria-label={t('common.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleGrant} className="flex gap-2 mb-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t('sharing.emailPlaceholder')}
            className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <select
            value={permission}
            onChange={e => setPermission(e.target.value)}
            className="px-3 py-2 text-sm rounded-md border border-input bg-background"
          >
            {PERMISSION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isGranting || !email.trim()}
            className={cn(
              'px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground',
              'hover:bg-primary/90 disabled:opacity-50',
            )}
          >
            {isGranting ? '...' : t('common.add')}
          </button>
        </form>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <LoadingSpinner size="sm" />
          </div>
        ) : accesses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('sharing.noSharedUsers')}
          </p>
        ) : (
          <ul className="space-y-2">
            {accesses.map(access => {
              const permOpt = PERMISSION_OPTIONS.find(o => o.value === access.permission)
              const Icon = permOpt?.icon ?? Eye
              return (
                <li key={access.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      {access.user_email?.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{access.user_email ?? t('notebooks.unknown')}</p>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                        <Icon className="h-3 w-3" />
                        {permOpt?.label ?? access.permission}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => revokeAccess(access.id)}
                    disabled={isRevoking}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                    aria-label={t('sharing.revokeAccessTitle')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  )
}
