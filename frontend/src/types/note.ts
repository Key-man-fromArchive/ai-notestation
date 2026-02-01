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
  attachments?: Array<{
    name: string
    url: string
  }>
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
 * 노트북 정보
 */
export interface Notebook {
  name: string
  note_count: number
}

/**
 * 노트북 목록 응답
 */
export interface NotebooksResponse {
  items: Notebook[]
}
