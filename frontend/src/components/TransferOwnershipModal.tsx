import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTransferNotebookOwnership } from '@/hooks/useNotebooks'
import { useMembers } from '@/hooks/useMembers'

interface TransferOwnershipModalProps {
  isOpen: boolean
  onClose: () => void
  notebookId: number
  currentOwnerId: number | null
}

export function TransferOwnershipModal({ isOpen, onClose, notebookId, currentOwnerId }: TransferOwnershipModalProps) {
  const { t } = useTranslation()
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('')
  const [confirmed, setConfirmed] = useState(false)
  const { members } = useMembers()
  const { mutateAsync: transferOwnership, isPending } = useTransferNotebookOwnership()

  const eligibleMembers = members.filter(m => !m.is_pending && m.user_id !== currentOwnerId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId || !confirmed) return
    try {
      await transferOwnership({ notebookId, newOwnerId: selectedUserId as number })
      onClose()
    } catch {
      return
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-card rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('contextMenu.transferOwnership')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent" aria-label={t('common.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-start gap-2 p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{t('contextMenu.transferConfirm')}</span>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="transfer-owner" className="text-sm font-medium">
            {t('contextMenu.selectNewOwner')}
          </label>
          <select
            id="transfer-owner"
            value={selectedUserId}
            onChange={e => {
              setSelectedUserId(e.target.value ? Number(e.target.value) : '')
              setConfirmed(false)
            }}
            className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">--</option>
            {eligibleMembers.map(m => (
              <option key={m.user_id} value={m.user_id}>
                {m.name || m.email} ({m.email})
              </option>
            ))}
          </select>

          {selectedUserId && (
            <label className="flex items-center gap-2 mt-3 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="rounded border-input"
              />
              {t('contextMenu.transferConfirmCheckbox')}
            </label>
          )}

          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-accent">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending || !selectedUserId || !confirmed}
              className={cn(
                'px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground',
                'hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isPending ? t('common.saving') : t('contextMenu.transferOwnership')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
