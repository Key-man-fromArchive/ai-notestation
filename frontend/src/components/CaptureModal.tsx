import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Globe, BookOpen, Beaker, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNotebooks } from '@/hooks/useNotebooks'
import { useCaptureURL, useCaptureArxiv, useCapturePubmed } from '@/hooks/useCapture'
import { cn } from '@/lib/utils'

type TabType = 'url' | 'arxiv' | 'pubmed'

const TABS: { key: TabType; icon: typeof Globe }[] = [
  { key: 'url', icon: Globe },
  { key: 'arxiv', icon: BookOpen },
  { key: 'pubmed', icon: Beaker },
]

export function CaptureModal({
  isOpen,
  onClose,
  defaultNotebook,
}: {
  isOpen: boolean
  onClose: () => void
  defaultNotebook?: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: notebooksData } = useNotebooks()

  const [tab, setTab] = useState<TabType>('url')
  const [url, setUrl] = useState('')
  const [arxivId, setArxivId] = useState('')
  const [pmid, setPmid] = useState('')
  const [notebook, setNotebook] = useState(defaultNotebook || '')
  const [error, setError] = useState('')

  const captureUrl = useCaptureURL()
  const captureArxiv = useCaptureArxiv()
  const capturePubmed = useCapturePubmed()

  const isPending = captureUrl.isPending || captureArxiv.isPending || capturePubmed.isPending

  const resetForm = () => {
    setUrl('')
    setArxivId('')
    setPmid('')
    setNotebook(defaultNotebook || '')
    setError('')
  }

  const handleClose = () => {
    if (isPending) return
    resetForm()
    onClose()
  }

  const handleSuccess = (noteId: string) => {
    resetForm()
    onClose()
    navigate(`/notes/${noteId}`)
  }

  const handleError = (err: unknown) => {
    if (err && typeof err === 'object' && 'body' in err) {
      try {
        const body = JSON.parse((err as { body: string }).body)
        setError(body.detail || t('capture.error'))
      } catch {
        setError((err as { body: string }).body || t('capture.error'))
      }
    } else {
      setError(t('capture.error'))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      let result: { note_id: string }

      if (tab === 'url') {
        if (!url.trim()) return
        result = await captureUrl.mutateAsync({
          url: url.trim(),
          notebook: notebook || undefined,
        })
      } else if (tab === 'arxiv') {
        if (!arxivId.trim()) return
        result = await captureArxiv.mutateAsync({
          arxiv_id: arxivId.trim(),
          notebook: notebook || undefined,
        })
      } else {
        if (!pmid.trim()) return
        result = await capturePubmed.mutateAsync({
          pmid: pmid.trim(),
          notebook: notebook || undefined,
        })
      }

      handleSuccess(result.note_id)
    } catch (err) {
      handleError(err)
    }
  }

  const isValid = (tab === 'url' && url.trim()) ||
    (tab === 'arxiv' && arxivId.trim()) ||
    (tab === 'pubmed' && pmid.trim())

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-card rounded-lg border border-border shadow-lg w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">{t('capture.title')}</h2>
          <button
            onClick={handleClose}
            disabled={isPending}
            className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {TABS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setError('') }}
              disabled={isPending}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors',
                tab === key
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground',
                'disabled:opacity-50',
              )}
            >
              <Icon className="h-4 w-4" />
              {t(`capture.tab_${key}`)}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Input per tab */}
          {tab === 'url' && (
            <div>
              <label htmlFor="capture-url" className="block text-sm font-medium mb-1">
                URL
              </label>
              <input
                id="capture-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('capture.urlPlaceholder')}
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2',
                  'text-sm placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
                autoFocus
                required
                disabled={isPending}
              />
            </div>
          )}

          {tab === 'arxiv' && (
            <div>
              <label htmlFor="capture-arxiv" className="block text-sm font-medium mb-1">
                arXiv ID
              </label>
              <input
                id="capture-arxiv"
                type="text"
                value={arxivId}
                onChange={(e) => setArxivId(e.target.value)}
                placeholder={t('capture.arxivPlaceholder')}
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2',
                  'text-sm placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
                autoFocus
                required
                disabled={isPending}
              />
            </div>
          )}

          {tab === 'pubmed' && (
            <div>
              <label htmlFor="capture-pmid" className="block text-sm font-medium mb-1">
                PubMed ID (PMID)
              </label>
              <input
                id="capture-pmid"
                type="text"
                value={pmid}
                onChange={(e) => setPmid(e.target.value)}
                placeholder={t('capture.pubmedPlaceholder')}
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2',
                  'text-sm placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
                autoFocus
                required
                disabled={isPending}
              />
            </div>
          )}

          {/* Notebook selector */}
          <div>
            <label htmlFor="capture-notebook" className="block text-sm font-medium mb-1">
              {t('notes.notebookLabel')}
            </label>
            <select
              id="capture-notebook"
              value={notebook}
              onChange={(e) => setNotebook(e.target.value)}
              disabled={isPending}
              className={cn(
                'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <option value="">{t('notes.noNotebookOption')}</option>
              {notebooksData?.items.map((nb) => (
                <option key={nb.id} value={nb.name}>
                  {nb.name}
                </option>
              ))}
            </select>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className={cn(
                'px-4 py-2 text-sm rounded-md border border-input',
                'hover:bg-muted transition-colors',
                'disabled:opacity-50',
              )}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!isValid || isPending}
              className={cn(
                'px-4 py-2 text-sm rounded-md',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center gap-1.5',
              )}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPending ? t('capture.capturing') : t('capture.captureButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
