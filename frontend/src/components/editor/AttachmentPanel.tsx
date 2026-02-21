import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  Paperclip, Image, File, FileText, AlertCircle, Loader2,
  Sparkles, Download, Eye, ScanText, RotateCcw, CheckCircle2,
} from 'lucide-react'
import { apiClient } from '@/lib/api'
import { AttachmentContextMenu } from '@/components/AttachmentContextMenu'
import type { ContextMenuItem } from '@/components/AttachmentContextMenu'
import { ExtractedTextModal } from '@/components/ExtractedTextModal'
import { SummaryInsertModal } from '@/components/SummaryInsertModal'
import type { Note } from '@/types/note'

interface AttachmentPanelProps {
  note: Note
}

export function AttachmentPanel({ note }: AttachmentPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [extractingFileId, setExtractingFileId] = useState<string | null>(null)
  const [ocrQueue, setOcrQueue] = useState<Set<number>>(new Set())
  const [visionQueue, setVisionQueue] = useState<Set<number>>(new Set())
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number
    type: 'attachment' | 'image'
    id: string | number
    status: string | null
    visionStatus?: string | null
    name: string
    isPdf: boolean
    isHwp?: boolean
    isWord?: boolean
    pageCount?: number | null
    nasImage?: { noteId: string; attKey: string; filename: string }
  } | null>(null)
  const [textModal, setTextModal] = useState<{ title: string; text: string; pageCount?: number } | null>(null)
  const [summaryModal, setSummaryModal] = useState<{ fileId: string; fileName: string } | null>(null)
  const [, setExtractingNasImage] = useState<string | null>(null)

  const handleDownloadAttachment = async (fileId: string, fileName: string) => {
    const response = await fetch(`/api/files/${fileId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
    })
    if (!response.ok) return
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExtractPdf = async (fileId: string) => {
    setExtractingFileId(fileId)
    try {
      await apiClient.post(`/files/${fileId}/extract`, {})
      const poll = setInterval(async () => {
        try {
          const result = await apiClient.get<{ extraction_status: string; page_count: number; text: string }>(`/files/${fileId}/text`)
          if (result.extraction_status === 'completed' || result.extraction_status === 'failed') {
            clearInterval(poll)
            setExtractingFileId(null)
            queryClient.invalidateQueries({ queryKey: ['note', note.note_id] })
          }
        } catch {
          clearInterval(poll)
          setExtractingFileId(null)
        }
      }, 2000)
    } catch {
      setExtractingFileId(null)
    }
  }

  const handleShowPdfText = async (fileId: string, name: string, pageCount?: number | null) => {
    try {
      const result = await apiClient.get<{ text: string; page_count: number }>(`/files/${fileId}/text`)
      setTextModal({ title: name, text: result.text, pageCount: pageCount ?? result.page_count })
    } catch { /* ignore */ }
  }

  const handleExtractImage = async (imageId: number) => {
    setOcrQueue(prev => new Set(prev).add(imageId))
    try {
      await apiClient.post(`/images/${imageId}/extract`, {})
      const poll = setInterval(async () => {
        try {
          const result = await apiClient.get<{ extraction_status: string; text: string }>(`/images/${imageId}/text`)
          if (result.extraction_status === 'completed' || result.extraction_status === 'failed') {
            clearInterval(poll)
            setOcrQueue(prev => { const next = new Set(prev); next.delete(imageId); return next })
            queryClient.invalidateQueries({ queryKey: ['note', note.note_id] })
          }
        } catch {
          clearInterval(poll)
          setOcrQueue(prev => { const next = new Set(prev); next.delete(imageId); return next })
        }
      }, 2000)
    } catch {
      setOcrQueue(prev => { const next = new Set(prev); next.delete(imageId); return next })
    }
  }

  const handleVisionImage = async (imageId: number) => {
    setVisionQueue(prev => new Set(prev).add(imageId))
    try {
      const res = await apiClient.post<{ status: string }>(`/images/${imageId}/vision`, {})
      if (res.status === 'already_completed') {
        setVisionQueue(prev => { const next = new Set(prev); next.delete(imageId); return next })
        queryClient.invalidateQueries({ queryKey: ['note', note.note_id] })
        return
      }
      const poll = setInterval(async () => {
        try {
          const result = await apiClient.get<{ vision_status: string; description: string }>(`/images/${imageId}/vision-text`)
          if (result.vision_status === 'completed' || result.vision_status === 'failed') {
            clearInterval(poll)
            setVisionQueue(prev => { const next = new Set(prev); next.delete(imageId); return next })
            queryClient.invalidateQueries({ queryKey: ['note', note.note_id] })
          }
        } catch {
          clearInterval(poll)
          setVisionQueue(prev => { const next = new Set(prev); next.delete(imageId); return next })
        }
      }, 2000)
    } catch {
      setVisionQueue(prev => { const next = new Set(prev); next.delete(imageId); return next })
    }
  }

  const handleShowVisionText = async (imageId: number, name: string) => {
    try {
      const result = await apiClient.get<{ description: string }>(`/images/${imageId}/vision-text`)
      setTextModal({ title: `${name} — Vision`, text: result.description || '' })
    } catch { /* ignore */ }
  }

  const handleShowOcrText = async (imageId: number, name: string) => {
    try {
      const result = await apiClient.get<{ text: string }>(`/images/${imageId}/text`)
      setTextModal({ title: name, text: result.text })
    } catch { /* ignore */ }
  }

  const handleExtractNasImage = async (noteId: string, attKey: string, filename: string) => {
    const key = `${noteId}/${attKey}/${filename}`
    setExtractingNasImage(key)
    try {
      const res = await apiClient.post<{ image_id: number; status: string }>(
        `/nas-images/${noteId}/${attKey}/${filename}/ocr`, {}
      )
      if (res.status === 'already_completed') {
        setExtractingNasImage(null)
        queryClient.invalidateQueries({ queryKey: ['note', note.note_id] })
        return
      }
      const imageId = res.image_id
      const poll = setInterval(async () => {
        try {
          const result = await apiClient.get<{ extraction_status: string; text: string }>(`/images/${imageId}/text`)
          if (result.extraction_status === 'completed' || result.extraction_status === 'failed') {
            clearInterval(poll)
            setExtractingNasImage(null)
            queryClient.invalidateQueries({ queryKey: ['note', note.note_id] })
          }
        } catch {
          clearInterval(poll)
          setExtractingNasImage(null)
        }
      }, 2000)
    } catch {
      setExtractingNasImage(null)
    }
  }

  const handleAttachmentContextMenu = (
    e: React.MouseEvent,
    opts: { type: 'attachment' | 'image'; id: string | number; status: string | null; visionStatus?: string | null; name: string; isPdf: boolean; isHwp?: boolean; isWord?: boolean; pageCount?: number | null }
  ) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, ...opts })
  }

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu) return []
    const { type, id, status, visionStatus, name, isPdf, isHwp, isWord, pageCount } = contextMenu
    const isFile = type === 'attachment'
    const isDocument = isPdf || isHwp || isWord
    const items: ContextMenuItem[] = []

    if (isFile) {
      items.push({ icon: <Download className="h-4 w-4" />, label: t('files.download'), onClick: () => {
        setContextMenu(null)
        handleDownloadAttachment(id as string, name)
      }})
      if (status === 'completed') {
        items.push({ icon: <Eye className="h-4 w-4" />, label: isDocument ? t('files.viewExtractedText') : t('ocr.viewExtractedText'), onClick: () => handleShowPdfText(id as string, name, pageCount) })
        if (isDocument) {
          items.push({ icon: <FileText className="h-4 w-4" />, label: t('summary.insertSummary'), onClick: () => {
            setContextMenu(null)
            setSummaryModal({ fileId: id as string, fileName: name })
          }})
        }
      } else if (status === 'pending' || extractingFileId === id) {
        items.push({ icon: <ScanText className="h-4 w-4" />, label: isDocument ? t('files.extracting') : t('ocr.extracting'), disabled: true, loading: true, onClick: () => {} })
      } else if (status === 'failed') {
        items.push({ icon: <RotateCcw className="h-4 w-4" />, label: t('common.retry'), onClick: () => handleExtractPdf(id as string) })
      } else {
        items.push({ icon: <ScanText className="h-4 w-4" />, label: isDocument ? t('files.extractText') : t('ocr.extractText'), onClick: () => handleExtractPdf(id as string) })
      }
      return items
    }

    if (contextMenu.nasImage) {
      const { noteId, attKey, filename } = contextMenu.nasImage
      items.push({ icon: <ScanText className="h-4 w-4" />, label: t('ocr.extractText'), onClick: () => handleExtractNasImage(noteId, attKey, filename) })
      return items
    }

    const imageId = id as number
    if (status === 'completed') {
      items.push({ icon: <Eye className="h-4 w-4" />, label: t('ocr.viewExtractedText'), onClick: () => handleShowOcrText(imageId, name) })
    } else if (status === 'empty') {
      items.push({ icon: <ScanText className="h-4 w-4" />, label: t('ocr.noTextFound'), disabled: true, onClick: () => {} })
      items.push({ icon: <RotateCcw className="h-4 w-4" />, label: `${t('ocr.extractText')} (${t('common.retry')})`, onClick: () => handleExtractImage(imageId) })
    } else if (status === 'pending' || ocrQueue.has(imageId)) {
      items.push({ icon: <ScanText className="h-4 w-4" />, label: t('ocr.extracting'), disabled: true, loading: true, onClick: () => {} })
    } else if (status === 'failed') {
      items.push({ icon: <RotateCcw className="h-4 w-4" />, label: `${t('ocr.extractText')} (${t('common.retry')})`, onClick: () => handleExtractImage(imageId) })
    } else {
      items.push({ icon: <ScanText className="h-4 w-4" />, label: t('ocr.extractText'), onClick: () => handleExtractImage(imageId) })
    }

    if (visionStatus === 'completed') {
      items.push({ icon: <Sparkles className="h-4 w-4" />, label: t('vision.viewDescription'), onClick: () => handleShowVisionText(imageId, name) })
    } else if (visionStatus === 'pending' || visionQueue.has(imageId)) {
      items.push({ icon: <Sparkles className="h-4 w-4" />, label: t('vision.analyzing'), disabled: true, loading: true, onClick: () => {} })
    } else if (visionStatus === 'failed') {
      items.push({ icon: <RotateCcw className="h-4 w-4" />, label: `${t('vision.analyze')} (${t('common.retry')})`, onClick: () => handleVisionImage(imageId) })
    } else {
      items.push({ icon: <Sparkles className="h-4 w-4" />, label: t('vision.analyze'), onClick: () => handleVisionImage(imageId) })
    }

    return items
  }

  const hasAttachments = (note.attachments?.length ?? 0) > 0
  const hasImages = (note.images?.length ?? 0) > 0

  if (!hasAttachments && !hasImages) return null

  return (
    <>
      {/* Attachments */}
      {hasAttachments && (
        <section className="border-t border-border pt-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Paperclip className="h-5 w-5" aria-hidden="true" />
            {t('notes.attachments')}
            <span className="text-sm font-normal text-muted-foreground">
              ({note.attachments?.length})
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {note.attachments?.map((attachment, index) => {
              const ext = attachment.name.split('.').pop()?.toLowerCase() ?? ''
              const isPdf = ext === 'pdf'
              const isHwp = ext === 'hwp' || ext === 'hwpx'
              const isWord = ext === 'docx' || ext === 'doc'
              const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)
              const Icon = isPdf || isHwp || isWord ? FileText : isImage ? Image : File
              const fileId = attachment.file_id ?? attachment.url.split('/').pop()
              const canExtract = isPdf || isImage || isHwp || isWord
              const status = attachment.extraction_status ?? (extractingFileId === fileId ? 'pending' : null)
              return (
                <div
                  key={index}
                  className={`flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5${canExtract ? ' cursor-context-menu' : ''}`}
                  onContextMenu={canExtract && fileId ? (e) => handleAttachmentContextMenu(e, {
                    type: 'attachment', id: fileId, status, name: attachment.name, isPdf, isHwp, isWord, pageCount: attachment.page_count,
                  }) : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <button
                    onClick={() => fileId && handleDownloadAttachment(fileId, attachment.name)}
                    className="text-sm text-foreground truncate hover:text-primary hover:underline text-left"
                    title={t('files.download')}
                  >
                    {attachment.name}
                  </button>
                  <span className="ml-auto text-xs text-muted-foreground uppercase shrink-0">{ext}</span>
                  {canExtract && status === 'completed' && (
                    <span title={(isPdf || isHwp || isWord) ? t('files.viewExtractedText') : t('ocr.viewExtractedText')}><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" /></span>
                  )}
                  {canExtract && status === 'pending' && (
                    <span title={(isPdf || isHwp || isWord) ? t('files.extracting') : t('ocr.extracting')}><Loader2 className="h-3.5 w-3.5 shrink-0 text-amber-600 animate-spin" /></span>
                  )}
                  {canExtract && status === 'failed' && (
                    <span title={(isPdf || isHwp || isWord) ? t('files.extractionFailed') : t('ocr.extractionFailed')}><AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" /></span>
                  )}
                  <button
                    onClick={async () => {
                      if (!fileId) return
                      await apiClient.delete(`/notes/${note.note_id}/attachments/${fileId}`)
                      window.location.reload()
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive ml-2"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* NoteImages OCR */}
      {hasImages && (
        <section className="border-t border-border pt-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Image className="h-5 w-5" aria-hidden="true" />
            {t('ocr.extractText')}
            <span className="text-sm font-normal text-muted-foreground">
              ({note.images?.length})
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {note.images?.map((img) => {
              const imgStatus = img.extraction_status ?? (ocrQueue.has(img.id) ? 'pending' : null)
              const vStatus = img.vision_status ?? (visionQueue.has(img.id) ? 'pending' : null)
              return (
                <div
                  key={img.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 cursor-context-menu"
                  onContextMenu={(e) => handleAttachmentContextMenu(e, {
                    type: 'image', id: img.id, status: imgStatus, visionStatus: vStatus, name: img.name, isPdf: false,
                  })}
                >
                  <Image className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm text-foreground truncate">{img.name}</span>
                  <span className="ml-auto flex items-center gap-1">
                    {imgStatus === 'completed' && (
                      <span title={t('ocr.viewExtractedText')}><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" /></span>
                    )}
                    {imgStatus === 'empty' && (
                      <span title={t('ocr.noTextFound')}><ScanText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></span>
                    )}
                    {imgStatus === 'pending' && (
                      <span title={t('ocr.extracting')}><Loader2 className="h-3.5 w-3.5 shrink-0 text-amber-600 animate-spin" /></span>
                    )}
                    {imgStatus === 'failed' && (
                      <span title={t('ocr.extractionFailed')}><AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" /></span>
                    )}
                    {vStatus === 'completed' && (
                      <span title={t('vision.viewDescription')}><Sparkles className="h-3.5 w-3.5 shrink-0 text-blue-600" /></span>
                    )}
                    {vStatus === 'pending' && (
                      <span title={t('vision.analyzing')}><Loader2 className="h-3.5 w-3.5 shrink-0 text-blue-400 animate-spin" /></span>
                    )}
                    {vStatus === 'failed' && (
                      <span title={t('vision.failed')}><AlertCircle className="h-3.5 w-3.5 shrink-0 text-orange-500" /></span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Context menu */}
      {contextMenu && (
        <AttachmentContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Extracted text modal */}
      {textModal && (
        <ExtractedTextModal
          title={textModal.title}
          text={textModal.text}
          pageCount={textModal.pageCount}
          onClose={() => setTextModal(null)}
        />
      )}

      {/* Summary insert modal */}
      {summaryModal && (
        <SummaryInsertModal
          isOpen={!!summaryModal}
          onClose={() => setSummaryModal(null)}
          fileId={summaryModal.fileId}
          fileName={summaryModal.fileName}
          noteId={note.note_id}
          noteContent={note.content || ''}
        />
      )}
    </>
  )
}

