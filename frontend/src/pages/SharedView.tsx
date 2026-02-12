import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  FileText,
  Clock,
  AlertCircle,
  Mail,
  XCircle,
} from 'lucide-react'
import { useSharedContent } from '@/hooks/useSharedContent'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { cn } from '@/lib/utils'

function formatExpiryDate(dateString: string, t: (key: string, options?: any) => string): string {
  const expiryDate = new Date(dateString)
  const now = new Date()
  const diffMs = expiryDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) {
    return t('sharing.sharedViewExpired')
  }
  if (diffDays === 1) {
    return t('sharing.expireIn1Day') || '1일 후 만료'
  }
  return t('sharing.expireInDays', { days: diffDays }) || `${diffDays}일 후 만료`
}

function EmailInputModal({
  onSubmit,
  onCancel,
  errorMessage,
}: {
  onSubmit: (email: string) => void
  onCancel: () => void
  errorMessage?: string
}) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email.trim()) {
      onSubmit(email.trim())
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">{t('common.email')}</h2>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          {t('sharing.enterPassword')}
        </p>

        {errorMessage && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg flex items-center gap-2">
            <XCircle className="h-4 w-4 flex-shrink-0" />
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring mb-4"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 text-sm rounded-lg border hover:bg-accent"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!email.trim()}
              className={cn(
                'flex-1 px-4 py-2 text-sm rounded-lg',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 disabled:opacity-50',
              )}
            >
              {t('common.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ErrorState({
  status,
  message,
}: {
  status?: number
  message: string
}) {
  const { t } = useTranslation()
  const getErrorContent = () => {
    if (status === 410) {
      return {
        icon: Clock,
        title: t('sharing.sharedViewExpired'),
        description: t('sharing.sharedViewExpired'),
      }
    }
    if (status === 403) {
      return {
        icon: XCircle,
        title: t('sharing.accessDenied'),
        description: message,
      }
    }
    if (status === 404) {
      return {
        icon: AlertCircle,
        title: t('sharing.sharedViewNotFound'),
        description: t('sharing.sharedViewNotFound'),
      }
    }
    return {
      icon: AlertCircle,
      title: t('common.errorOccurred'),
      description: message,
    }
  }

  const content = getErrorContent()
  const Icon = content.icon

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <Icon className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold mb-2">{content.title}</h1>
        <p className="text-muted-foreground">{content.description}</p>
      </div>
    </div>
  )
}

function NotebookView({
  notebook,
  expiresAt,
}: {
  notebook: {
    id: number
    name: string
    description: string | null
    notes: { id: number; title: string; preview: string }[]
  }
  expiresAt: string | null
}) {
  const { t } = useTranslation()
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 rounded-lg bg-primary/10">
          <BookOpen className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{notebook.name}</h1>
          {notebook.description && (
            <p className="mt-1 text-muted-foreground">{notebook.description}</p>
          )}
          {expiresAt && (
            <p className="mt-2 text-sm text-amber-600 flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatExpiryDate(expiresAt, t)}
            </p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t('notebooks.notes', { count: notebook.notes.length })}
        </h2>
        {notebook.notes.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            {t('notes.addNotes')}
          </p>
        ) : (
          <div className="space-y-3">
            {notebook.notes.map(note => (
              <div
                key={note.id}
                className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <h3 className="font-medium mb-1">{note.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {note.preview}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NoteView({
  note,
  expiresAt,
}: {
  note: {
    id: number
    title: string
    content_html: string
    content_text: string
  }
  expiresAt: string | null
}) {
  const { t } = useTranslation()
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 rounded-lg bg-primary/10">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{note.title}</h1>
          {expiresAt && (
            <p className="mt-2 text-sm text-amber-600 flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatExpiryDate(expiresAt, t)}
            </p>
          )}
        </div>
      </div>

      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: note.content_html }}
      />
    </div>
  )
}

export default function SharedView() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const [email, setEmail] = useState<string>()
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailError, setEmailError] = useState<string>()

  const { data, isLoading, error } = useSharedContent(token ?? '', { email })

  const handleEmailSubmit = (submittedEmail: string) => {
    setEmailError(undefined)
    setEmail(submittedEmail)
    setShowEmailModal(false)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    if (error.status === 403 && !email) {
      return (
        <EmailInputModal
          onSubmit={handleEmailSubmit}
          onCancel={() => window.history.back()}
          errorMessage={emailError}
        />
      )
    }

    if (error.status === 403 && email) {
      return (
        <EmailInputModal
          onSubmit={handleEmailSubmit}
          onCancel={() => window.history.back()}
          errorMessage={t('sharing.accessDenied')}
        />
      )
    }

    return <ErrorState status={error.status} message={error.message} />
  }

  if (!data) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b py-4 px-6 mb-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('sharing.sharedView')}
          </span>
        </div>
      </header>

      <main className="px-6 pb-12">
        {data.type === 'notebook' && data.notebook && (
          <NotebookView notebook={data.notebook} expiresAt={data.expires_at} />
        )}
        {data.type === 'note' && data.note && (
          <NoteView note={data.note} expiresAt={data.expires_at} />
        )}
      </main>

      <footer className="border-t py-6 mt-auto">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-sm text-muted-foreground">
            Powered by LabNote AI
          </p>
        </div>
      </footer>

      {showEmailModal && (
        <EmailInputModal
          onSubmit={handleEmailSubmit}
          onCancel={() => setShowEmailModal(false)}
          errorMessage={emailError}
        />
      )}
    </div>
  )
}
