import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { cn } from '@/lib/utils'
import { FileArchive, CheckCircle, AlertCircle, Upload, Image } from 'lucide-react'
import type { NsxImportStatus } from './types'

export function NsxImportSection() {
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
        <h3 className="text-lg font-semibold">NSX 이미지 가져오기</h3>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        NoteStation에서 내보낸 NSX 파일을 업로드하면 노트에 포함된 이미지를 추출하여 표시할 수
        있습니다.
      </p>

      {importStatus && importStatus.status !== 'idle' && (
        <div
          className={cn(
            'mb-4 p-3 rounded-md border',
            importStatus.status === 'importing' && 'bg-blue-500/10 border-blue-500/20',
            importStatus.status === 'completed' && 'bg-green-500/10 border-green-500/20',
            importStatus.status === 'error' && 'bg-destructive/10 border-destructive/20',
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {importStatus.status === 'importing' && (
              <>
                <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-blue-600">가져오기 진행 중...</span>
              </>
            )}
            {importStatus.status === 'completed' && (
              <>
                <CheckCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
                <span className="text-sm font-medium text-green-600">가져오기 완료</span>
              </>
            )}
            {importStatus.status === 'error' && (
              <>
                <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                <span className="text-sm font-medium text-destructive">가져오기 실패</span>
              </>
            )}
          </div>

          {(importStatus.notes_processed !== null || importStatus.images_extracted !== null) && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              {importStatus.notes_processed !== null && (
                <span>노트: {importStatus.notes_processed}개</span>
              )}
              {importStatus.images_extracted !== null && (
                <span>이미지: {importStatus.images_extracted}개</span>
              )}
              {importStatus.last_import_at && (
                <span>완료: {new Date(importStatus.last_import_at).toLocaleString('ko-KR')}</span>
              )}
            </div>
          )}

          {importStatus.error_message && (
            <p className="mt-2 text-xs text-destructive">{importStatus.error_message}</p>
          )}

          {importErrors.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                경고 {importErrors.length}건 보기
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
              {selectedFile ? selectedFile.name : 'NSX 파일을 선택하거나 드래그하세요'}
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
              {isImporting ? '가져오는 중...' : '가져오기 시작'}
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
                : '업로드에 실패했습니다'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
