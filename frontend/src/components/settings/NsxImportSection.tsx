import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiClient } from '@/lib/api'
import { cn } from '@/lib/utils'
import { FileArchive, CheckCircle, AlertCircle, Upload, Image } from 'lucide-react'
import type { NsxImportStatus } from './types'

export function NsxImportSection() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const emptyStatus: NsxImportStatus = {
    status: 'idle',
    last_import_at: null,
    notes_processed: null,
    images_extracted: null,
    error_message: null,
    errors: [],
  }

  const { data: importStatus = emptyStatus } = useQuery<NsxImportStatus>({
    queryKey: ['nsx-import-status'],
    queryFn: () => apiClient.get<NsxImportStatus>('/nsx/status'),
    refetchInterval: query => (query.state.data?.status === 'importing' ? 2000 : false),
  })

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)

      const token = apiClient.getToken()
      const response = await fetch('/api/nsx/import', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      return response.json()
    },
    onSuccess: () => {
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['nsx-import-status'] })
    },
  })

  const importErrors = importStatus.errors ?? []

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleImport = () => {
    if (selectedFile) {
      importMutation.mutate(selectedFile)
    }
  }

  const isImporting = importStatus?.status === 'importing' || importMutation.isPending

  return (
    <div className="p-4 border border-input rounded-md">
      <div className="flex items-center gap-2 mb-3">
        <FileArchive className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-lg font-semibold">{t('settings.nsxImport')}</h3>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.nsxImportDesc')}
      </p>

      {importStatus && importStatus.status !== 'idle' && (
        <div
          className={cn(
            'mb-4 p-3 rounded-md border',
            importStatus.status === 'importing' && 'bg-blue-500/10 dark:bg-blue-900/30 border-blue-500/20 dark:border-blue-700/40',
            importStatus.status === 'completed' && 'bg-green-500/10 dark:bg-green-900/30 border-green-500/20 dark:border-green-700/40',
            importStatus.status === 'error' && 'bg-destructive/10 border-destructive/20',
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {importStatus.status === 'importing' && (
              <>
                <div className="h-4 w-4 border-2 border-blue-500 dark:border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{t('common.importing', 'Importing...')}</span>
              </>
            )}
            {importStatus.status === 'completed' && (
              <>
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" />
                <span className="text-sm font-medium text-green-600 dark:text-green-400">{t('common.importComplete', 'Import complete')}</span>
              </>
            )}
            {importStatus.status === 'error' && (
              <>
                <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                <span className="text-sm font-medium text-destructive">{t('common.importFailed', 'Import failed')}</span>
              </>
            )}
          </div>

          {(importStatus.notes_processed !== null || importStatus.images_extracted !== null) && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              {importStatus.notes_processed !== null && (
                <span>{t('settings.nsxNotesCount', { count: importStatus.notes_processed })}</span>
              )}
              {importStatus.images_extracted !== null && (
                <span>{t('settings.nsxImagesCount', { count: importStatus.images_extracted })}</span>
              )}
              {importStatus.last_import_at && (
                <span>{t('common.completed', 'Completed')}: {new Date(importStatus.last_import_at).toLocaleString(i18n.language === 'ko' ? 'ko-KR' : 'en-US')}</span>
              )}
            </div>
          )}

          {importStatus.error_message && (
            <p className="mt-2 text-xs text-destructive">{importStatus.error_message}</p>
          )}

          {importErrors.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                {t('settings.nsxShowWarnings', { count: importErrors.length })}
              </summary>
              <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                {importErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <label
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-input rounded-md cursor-pointer',
              'hover:border-primary/50 hover:bg-muted/30 transition-colors',
              isImporting && 'opacity-50 cursor-not-allowed',
            )}
          >
            <input
              type="file"
              accept=".nsx"
              onChange={handleFileSelect}
              disabled={isImporting}
              className="sr-only"
            />
            <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm text-muted-foreground">
              {selectedFile ? selectedFile.name : t('common.selectNsxFile', 'Select NSX file')}
            </span>
          </label>
        </div>

        {selectedFile && (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2">
              <Image className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">{selectedFile.name}</span>
              <span className="text-xs text-muted-foreground">
                ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </span>
            </div>
            <button
              onClick={handleImport}
              disabled={isImporting}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {isImporting ? t('common.importing', 'Importing...') : t('common.startImport', 'Start Import')}
            </button>
          </div>
        )}

        {importMutation.isError && (
          <div
            className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
            <span className="text-sm text-destructive">
              {importMutation.error instanceof Error
                ? importMutation.error.message
                : t('settings.nsxUploadFailed')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
