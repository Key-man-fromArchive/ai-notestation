import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '@/lib/api'
import { cn } from '@/lib/utils'
import { FileArchive, Download, Upload, CheckCircle, AlertCircle } from 'lucide-react'

export function BackupSection() {
  const { t } = useTranslation()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleBackupExport = async () => {
    setIsExporting(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const token = apiClient.getToken()
      const response = await fetch('/api/backup/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('Content-Disposition')
      const filename =
        contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || 'ainx_backup.zip'

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      setSuccessMessage(t('settings.backupExportSuccess'))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('settings.backupExportFailed'))
    } finally {
      setIsExporting(false)
    }
  }

  const handleBackupImport = async () => {
    if (!selectedFile) return
    setIsImporting(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const token = apiClient.getToken()
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('/api/backup/import', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      setSelectedFile(null)
      setSuccessMessage(t('settings.backupImportSuccess'))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('settings.backupImportFailed'))
    } finally {
      setIsImporting(false)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  return (
    <div className="p-4 border border-input rounded-md">
      <div className="flex items-center gap-2 mb-3">
        <FileArchive className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-lg font-semibold">{t('settings.backup')}</h3>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.backupDesc')}
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={handleBackupExport}
          disabled={isExporting}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {isExporting ? t('common.exporting', 'Exporting...') : t('common.export', 'Export')}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <label
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-input rounded-md cursor-pointer',
            'hover:border-primary/50 hover:bg-muted/30 transition-colors',
            isImporting && 'opacity-50 cursor-not-allowed',
          )}
        >
          <input
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            disabled={isImporting}
            className="sr-only"
          />
          <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">
            {selectedFile ? selectedFile.name : t('common.selectFile', 'Select file')}
          </span>
        </label>

        {selectedFile && (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2">
              <FileArchive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">{selectedFile.name}</span>
              <span className="text-xs text-muted-foreground">
                ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </span>
            </div>
            <button
              onClick={handleBackupImport}
              disabled={isImporting}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {isImporting ? t('common.importing', 'Importing...') : t('common.import', 'Import')}
            </button>
          </div>
        )}

        {errorMessage && (
          <div
            className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
            <span className="text-sm text-destructive">{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-md">
            <CheckCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
            <span className="text-sm text-green-700">{successMessage}</span>
          </div>
        )}
      </div>
    </div>
  )
}
