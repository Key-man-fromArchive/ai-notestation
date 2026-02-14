import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Brain,
  MessageSquare,
  Trash2,
  Calendar,
  Cpu,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useGraphInsightList,
  useGraphInsightDetail,
  useDeleteGraphInsight,
} from '@/hooks/useGraphInsights'
import { EmptyState } from '@/components/EmptyState'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'

export function InsightHistory() {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const { data: listData, isLoading: isListLoading } = useGraphInsightList(PAGE_SIZE, page * PAGE_SIZE)
  const { data: detail } = useGraphInsightDetail(selectedId)
  const deleteInsight = useDeleteGraphInsight()

  const handleDelete = (id: number) => {
    if (!confirm(t('librarian.deleteInsightConfirm'))) return
    deleteInsight.mutate(id, {
      onSuccess: () => setSelectedId(null),
    })
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Detail view
  if (selectedId && detail) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedId(null)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('librarian.backToHistory')}
        </button>

        <div>
          <h2 className="text-lg font-semibold text-foreground">{detail.hub_label}</h2>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(detail.created_at)}
            </span>
            {detail.model && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">
                <Cpu className="h-2.5 w-2.5" />
                {detail.model}
              </span>
            )}
          </div>
        </div>

        {/* Analyzed notes */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {t('librarian.analyzedNotes')}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {detail.notes.map((note) => (
              <span
                key={note.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs text-foreground"
              >
                <FileText className="h-3 w-3 text-muted-foreground" />
                {note.title}
              </span>
            ))}
          </div>
        </div>

        {/* Markdown content */}
        <div className="prose prose-sm max-w-none">
          <MarkdownRenderer content={detail.content} />
        </div>

        {/* Chat messages */}
        {detail.chat_messages && detail.chat_messages.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              {t('librarian.followUpChat')}
            </h3>
            <div className="space-y-3">
              {detail.chat_messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm',
                    msg.role === 'user'
                      ? 'bg-primary/10 text-foreground ml-8'
                      : 'bg-muted text-foreground mr-8'
                  )}
                >
                  {msg.content}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delete */}
        <div className="pt-4 border-t border-border">
          <button
            onClick={() => handleDelete(detail.id)}
            disabled={deleteInsight.isPending}
            className="inline-flex items-center gap-1.5 text-sm text-destructive hover:text-destructive/80 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            {t('librarian.deleteInsight')}
          </button>
        </div>
      </div>
    )
  }

  // List view
  if (isListLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!listData?.items.length) {
    return (
      <EmptyState
        icon={Brain}
        title={t('librarian.noInsights')}
        description={t('librarian.noInsightsDesc')}
      />
    )
  }

  const totalPages = Math.ceil(listData.total / PAGE_SIZE)

  return (
    <div className="space-y-3">
      {listData.items.map((item) => (
        <button
          key={item.id}
          onClick={() => setSelectedId(item.id)}
          className={cn(
            'w-full text-left p-4 rounded-xl border border-border',
            'hover:border-primary/30 hover:bg-muted/30 transition-colors duration-200',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-foreground truncate">{item.hub_label}</h3>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(item.created_at)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {t('librarian.notes_count', { count: item.note_count })}
                </span>
                {item.model && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">
                    <Cpu className="h-2.5 w-2.5" />
                    {item.model}
                  </span>
                )}
                {item.has_chat && (
                  <MessageSquare className="h-3 w-3 text-primary" />
                )}
              </div>
            </div>
          </div>
        </button>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            &laquo;
          </button>
          <span className="px-3 py-1.5 text-sm text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            &raquo;
          </button>
        </div>
      )}
    </div>
  )
}
