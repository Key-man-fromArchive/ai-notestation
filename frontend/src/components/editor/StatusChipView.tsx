// Inline status chip — click to cycle through statuses

import { useCallback, useMemo } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

const STATUSES = ['planned', 'running', 'completed', 'failed', 'paused', 'review'] as const
type Status = (typeof STATUSES)[number]

const STATUS_STYLES: Record<Status, { dot: string; bg: string }> = {
  planned: { dot: 'bg-blue-500', bg: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  running: { dot: 'bg-amber-500 animate-pulse', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  completed: { dot: 'bg-green-500', bg: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  failed: { dot: 'bg-red-500', bg: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  paused: { dot: 'bg-gray-400', bg: 'bg-gray-50 text-gray-600 dark:bg-gray-800/30 dark:text-gray-300' },
  review: { dot: 'bg-violet-500', bg: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
}

export function StatusChipView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props
  const { t } = useTranslation()

  const status = useMemo(() => (node.attrs.status || 'planned') as Status, [node.attrs.status])
  const label = node.attrs.label as string

  const cycle = useCallback(() => {
    if (!editor.isEditable) return
    const idx = STATUSES.indexOf(status)
    const next = STATUSES[(idx + 1) % STATUSES.length]
    updateAttributes({ status: next })
  }, [status, updateAttributes, editor.isEditable])

  const style = STATUS_STYLES[status] || STATUS_STYLES.planned
  const displayText = label || t(`statusChip.status_${status}`, status)

  return (
    <NodeViewWrapper
      as="span"
      className="status-chip-wrapper"
      contentEditable={false}
    >
      <span
        onClick={cycle}
        title={editor.isEditable ? t('statusChip.clickToCycle', 'Click to cycle status') : undefined}
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium align-baseline',
          style.bg,
          editor.isEditable && 'cursor-pointer hover:opacity-80 transition-opacity',
        )}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', style.dot)} />
        {displayText}
      </span>
    </NodeViewWrapper>
  )
}
