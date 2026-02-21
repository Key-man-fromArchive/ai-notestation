// Experiment header card — structured metadata for research experiments

import { useCallback, useMemo, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { FlaskConical, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUSES = ['planned', 'running', 'completed', 'failed', 'paused', 'review'] as const
type Status = (typeof STATUSES)[number]

const STATUS_COLORS: Record<Status, string> = {
  planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  running: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  paused: 'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300',
  review: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
}

interface ExperimentAttrs {
  title: string
  date: string
  experimenter: string
  project: string
  sampleId: string
  protocolVersion: string
  status: Status
  tags: string[]
}

function parseAttrs(raw: string | null): ExperimentAttrs {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {
      title: '', date: '', experimenter: '', project: '',
      sampleId: '', protocolVersion: '', status: 'planned', tags: [],
    }
  }
}

export function ExperimentHeaderView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, editor } = props
  const { t } = useTranslation()
  const attrs = useMemo(() => parseAttrs(node.attrs.attrs), [node.attrs.attrs])
  const [tagInput, setTagInput] = useState('')

  const update = useCallback(
    (patch: Partial<ExperimentAttrs>) => {
      updateAttributes({ attrs: JSON.stringify({ ...attrs, ...patch }) })
    },
    [attrs, updateAttributes],
  )

  const addTag = useCallback(() => {
    const tag = tagInput.trim()
    if (!tag || attrs.tags.includes(tag)) return
    update({ tags: [...attrs.tags, tag] })
    setTagInput('')
  }, [tagInput, attrs.tags, update])

  const removeTag = useCallback(
    (tag: string) => update({ tags: attrs.tags.filter((t) => t !== tag) }),
    [attrs.tags, update],
  )

  const isEditable = editor.isEditable

  return (
    <NodeViewWrapper data-type="experiment-header" className="my-4">
      <div className={cn(
        'border rounded-lg overflow-hidden',
        'border-border bg-card',
      )}>
        {/* Header bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
          <FlaskConical className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {t('experimentHeader.title', 'Experiment Header')}
          </span>

          {isEditable ? (
            <select
              value={attrs.status}
              onChange={(e) => update({ status: e.target.value as Status })}
              className={cn(
                'ml-auto text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer',
                STATUS_COLORS[attrs.status],
              )}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`experimentHeader.status_${s}`, s)}
                </option>
              ))}
            </select>
          ) : (
            <span className={cn('ml-auto text-xs font-medium px-2 py-0.5 rounded-full', STATUS_COLORS[attrs.status])}>
              {t(`experimentHeader.status_${attrs.status}`, attrs.status)}
            </span>
          )}

          {isEditable && (
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

        {/* Body */}
        <div className="p-3 space-y-3">
          {/* Title row */}
          {isEditable ? (
            <input
              type="text"
              value={attrs.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder={t('experimentHeader.titlePlaceholder', 'Experiment title...')}
              className="w-full text-base font-semibold bg-transparent border-0 border-b border-border/50 focus:border-primary outline-none px-0 py-1 text-foreground placeholder:text-muted-foreground/50"
            />
          ) : (
            <div className="text-base font-semibold text-foreground py-1">
              {attrs.title || t('experimentHeader.untitled', 'Untitled')}
            </div>
          )}

          {/* 2-col grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field
              label={t('experimentHeader.date', 'Date')}
              value={attrs.date}
              type="date"
              editable={isEditable}
              onChange={(v) => update({ date: v })}
            />
            <Field
              label={t('experimentHeader.experimenter', 'Experimenter')}
              value={attrs.experimenter}
              editable={isEditable}
              onChange={(v) => update({ experimenter: v })}
            />
            <Field
              label={t('experimentHeader.project', 'Project')}
              value={attrs.project}
              editable={isEditable}
              onChange={(v) => update({ project: v })}
            />
            <Field
              label={t('experimentHeader.sampleId', 'Sample ID')}
              value={attrs.sampleId}
              editable={isEditable}
              onChange={(v) => update({ sampleId: v })}
            />
            <Field
              label={t('experimentHeader.protocolVersion', 'Protocol Ver.')}
              value={attrs.protocolVersion}
              editable={isEditable}
              onChange={(v) => update({ protocolVersion: v })}
            />
          </div>

          {/* Tags row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {attrs.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary"
              >
                {tag}
                {isEditable && (
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
            {isEditable && (
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addTag() }
                }}
                placeholder={t('experimentHeader.addTag', '+ tag')}
                className="text-xs bg-transparent border-0 outline-none w-16 text-muted-foreground placeholder:text-muted-foreground/50"
              />
            )}
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  )
}

function Field({
  label,
  value,
  type = 'text',
  editable,
  onChange,
}: {
  label: string
  value: string
  type?: string
  editable: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-0.5">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      {editable ? (
        <input
          type={type}
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
