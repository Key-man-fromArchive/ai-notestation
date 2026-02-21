// Signature block — sign & lock functionality for research notes

import { useCallback, useMemo, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { PenLine, ShieldCheck, Lock, Unlock, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SignatureAttrs {
  signedBy: string
  memberId: string
  role: string
  signedAt: string | null
  comment: string
  locked: boolean
}

function parseAttrs(raw: string | null): SignatureAttrs {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return { signedBy: '', memberId: '', role: '', signedAt: null, comment: '', locked: false }
  }
}

export function SignatureView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, editor } = props
  const { t } = useTranslation()
  const attrs = useMemo(() => parseAttrs(node.attrs.attrs), [node.attrs.attrs])
  const [unlockConfirm, setUnlockConfirm] = useState(false)

  const update = useCallback(
    (patch: Partial<SignatureAttrs>) => {
      updateAttributes({ attrs: JSON.stringify({ ...attrs, ...patch }) })
    },
    [attrs, updateAttributes],
  )

  const handleSign = useCallback(() => {
    update({
      signedAt: new Date().toISOString(),
      locked: true,
    })
  }, [update])

  const handleUnlock = useCallback(() => {
    if (!unlockConfirm) {
      setUnlockConfirm(true)
      return
    }
    update({ signedAt: null, locked: false })
    setUnlockConfirm(false)
  }, [unlockConfirm, update])

  const isEditable = editor.isEditable
  const isLocked = attrs.locked
  const canEdit = isEditable && !isLocked

  return (
    <NodeViewWrapper data-type="signature" className="my-4">
      <div className={cn(
        'border rounded-lg overflow-hidden',
        isLocked
          ? 'border-green-500/50 dark:border-green-400/30'
          : 'border-border',
        'bg-card',
      )}>
        {/* Header */}
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 border-b',
          isLocked
            ? 'bg-green-50/50 border-green-500/20 dark:bg-green-900/10 dark:border-green-400/20'
            : 'bg-muted/50 border-border',
        )}>
          {isLocked ? (
            <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
          ) : (
            <PenLine className="h-4 w-4 text-primary" />
          )}
          <span className="text-sm font-semibold text-foreground">
            {t('signature.title', 'Signature')}
          </span>

          {isLocked && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
              {t('signature.locked', 'Signed & Locked')}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            {isEditable && isLocked && (
              <button
                type="button"
                onClick={handleUnlock}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                  unlockConfirm
                    ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
                title={t('signature.unlock', 'Unlock')}
              >
                <Unlock className="h-3 w-3" />
                {unlockConfirm
                  ? t('signature.confirmUnlock', 'Confirm Unlock')
                  : t('signature.unlock', 'Unlock')}
              </button>
            )}

            {isEditable && !isLocked && (
              <button
                type="button"
                onClick={deleteNode}
                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title={t('common.delete', 'Delete')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <SigField
              label={t('signature.signedBy', 'Signed By')}
              value={attrs.signedBy}
              editable={canEdit}
              onChange={(v) => update({ signedBy: v })}
            />
            <SigField
              label={t('signature.role', 'Role')}
              value={attrs.role}
              editable={canEdit}
              onChange={(v) => update({ role: v })}
            />
            <SigField
              label={t('signature.memberId', 'Member ID')}
              value={attrs.memberId}
              editable={canEdit}
              onChange={(v) => update({ memberId: v })}
            />
            {attrs.signedAt && (
              <div className="space-y-0.5">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  {t('signature.signedAt', 'Signed At')}
                </span>
                <div className="text-sm text-foreground py-0.5">
                  {new Date(attrs.signedAt).toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {/* Comment */}
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {t('signature.comment', 'Comment')}
            </span>
            {canEdit ? (
              <textarea
                value={attrs.comment}
                onChange={(e) => update({ comment: e.target.value })}
                placeholder={t('signature.commentPlaceholder', 'Optional comment...')}
                rows={2}
                className="w-full text-sm bg-transparent border border-border/30 rounded focus:border-primary outline-none px-2 py-1 text-foreground placeholder:text-muted-foreground/50 resize-none"
              />
            ) : (
              <div className="text-sm text-foreground py-0.5">
                {attrs.comment || '—'}
              </div>
            )}
          </div>

          {/* Sign button */}
          {isEditable && !isLocked && (
            <button
              type="button"
              onClick={handleSign}
              disabled={!attrs.signedBy}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <Lock className="h-3.5 w-3.5" />
              {t('signature.signAndLock', 'Sign & Lock')}
            </button>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

function SigField({
  label,
  value,
  editable,
  onChange,
}: {
  label: string
  value: string
  editable: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-0.5">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      {editable ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm bg-transparent border-0 border-b border-border/30 focus:border-primary outline-none px-0 py-0.5 text-foreground"
        />
      ) : (
        <div className="text-sm text-foreground py-0.5">{value || '—'}</div>
      )}
    </div>
  )
}
