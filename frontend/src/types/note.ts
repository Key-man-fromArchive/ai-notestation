// @TASK P5-T5.2 - 노트 타입 정의
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#데이터-모델

/**
 * 노트 목록 아이템
 */
export interface NoteListItem {
  note_id: string
  title: string
  snippet?: string
  notebook: string | null
  updated_at: string | null
  tags: string[]
  sync_status?: string
}

/**
 * 노트 상세 정보
 */
export interface Note {
  note_id: string
  title: string
  content: string // Markdown content
  notebook: string | null
  created_at: string | null
  updated_at: string | null
  tags: string[]
  sync_status?: string
  attachments?: Array<{
    file_id?: string
    name: string
    url: string
    extraction_status?: string | null
    page_count?: number | null
  }>
  images?: NoteImage[]
}

/**
 * NSX에서 추출된 이미지 정보
 */
export interface NoteImage {
  id: number
  synology_note_id: string
  ref: string
  name: string
  file_path: string
  mime_type: string
  extraction_status?: string | null
  extracted_text?: string | null
  vision_status?: string | null
  vision_description?: string | null
}

/**
 * 동기화 충돌 아이템
 */
export interface ConflictItem {
  note_id: string
  title: string
  local_content: string
  local_updated_at: string | null
  remote_content: string
  remote_title: string
  remote_updated_at: string | null
}

export interface ConflictListResponse {
  items: ConflictItem[]
  total: number
}

/**
 * 노트 목록 응답
 */
export interface NotesResponse {
  items: NoteListItem[]
  total: number
  offset: number
  limit: number
}

/**
 * 노트북 정보 (legacy - for backward compatibility with notes sidebar)
 */
export interface LegacyNotebook {
  name: string
  note_count: number
}

/**
 * 노트북 정보 (new entity-based)
 */
export type NotebookCategory = 'labnote' | 'daily_log' | 'meeting' | 'sop' | 'protocol' | 'reference'

export interface Notebook {
  id: number
  name: string
  description: string | null
  category: NotebookCategory | null
  note_count: number
  is_public: boolean
  created_at: string
  updated_at: string
}

/**
 * 노트북 목록 응답
 */
export interface NotebooksResponse {
  items: Notebook[]
  total: number
}

/**
 * 노트북 접근 권한 정보
 */
export interface NotebookAccess {
  id: number
  user_id: number | null
  org_id: number | null
  user_email: string | null
  permission: 'read' | 'write' | 'admin'
  granted_by: number
  created_at: string
}

/**
 * 노트북 접근 권한 목록 응답
 */
export interface NotebookAccessListResponse {
  items: NotebookAccess[]
}
