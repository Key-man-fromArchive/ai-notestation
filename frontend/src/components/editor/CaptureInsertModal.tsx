import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { X, Loader2, Globe, BookOpen, Beaker } from 'lucide-react'
import type { useInsertCapture } from '@/hooks/useCapture'

type CaptureTab = 'url' | 'arxiv' | 'pubmed'

interface CaptureInsertModalProps {
  noteId: string
  onClose: () => void
  insertCapture: ReturnType<typeof useInsertCapture>
}

export function CaptureInsertModal({ noteId, onClose, insertCapture }: CaptureInsertModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<CaptureTab>('pubmed')
  const [url, setUrl] = useState('')
  const [arxivId, setArxivId] = useState('')
  const [pmid, setPmid] = useState('')
  const [error, setError] = useState('')

  const isPending = insertCapture.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (tab === 'url' && url.trim()) {
        await insertCapture.mutateAsync({ url: url.trim() })
      } else if (tab === 'arxiv' && arxivId.trim()) {
        await insertCapture.mutateAsync({ arxiv_id: arxivId.trim() })
      } else if (tab === 'pubmed' && pmid.trim()) {
        await insertCapture.mutateAsync({ pmid: pmid.trim() })
      } else {
        return
      }
      queryClient.invalidateQueries({ queryKey: ['note', noteId] })
      onClose()
    } catch (err) {
      if (err && typeof err === 'object' && 'body' in err) {
        try {
          const body = JSON.parse((err as { body: string }).body)
          setError(body.detail || t('capture.error'))
        } catch {
          setError(t('capture.error'))
        }
      } else {
        setError(t('capture.error'))
      }
    }
  }

  const isValid = (tab === 'url' && url.trim()) ||
    (tab === 'arxiv' && arxivId.trim()) ||
    (tab === 'pubmed' && pmid.trim())

  const tabs: { key: CaptureTab; icon: typeof Globe; label: string }[] = [
    { key: 'pubmed', icon: Beaker, label: 'PubMed' },
    { key: 'arxiv', icon: BookOpen, label: 'arXiv' },
    { key: 'url', icon: Globe, label: 'URL' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={isPending ? undefined : onClose} />
      <div className="relative bg-card rounded-lg border border-border shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">{t('capture.insertTitle')}</h2>
          <button onClick={onClose} disabled={isPending} className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex border-b border-border">
          {tabs.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setError('') }}
              disabled={isPending}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === key ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
              } disabled:opacity-50`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {tab === 'pubmed' && (
            <div>
              <label htmlFor="insert-pmid" className="block text-sm font-medium mb-1">PubMed ID (PMID)</label>
              <input id="insert-pmid" type="text" value={pmid} onChange={e => setPmid(e.target.value)}
                placeholder={t('capture.pubmedPlaceholder')} autoFocus required disabled={isPending}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">{t('capture.pubmedHint')}</p>
            </div>
          )}
          {tab === 'arxiv' && (
            <div>
              <label htmlFor="insert-arxiv" className="block text-sm font-medium mb-1">arXiv ID</label>
              <input id="insert-arxiv" type="text" value={arxivId} onChange={e => setArxivId(e.target.value)}
                placeholder={t('capture.arxivPlaceholder')} autoFocus required disabled={isPending}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
          {tab === 'url' && (
            <div>
              <label htmlFor="insert-url" className="block text-sm font-medium mb-1">URL</label>
              <input id="insert-url" type="url" value={url} onChange={e => setUrl(e.target.value)}
                placeholder={t('capture.urlPlaceholder')} autoFocus required disabled={isPending}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={isPending}
              className="px-4 py-2 text-sm rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={!isValid || isPending}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPending ? t('capture.capturing') : t('capture.insertAction')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
