import type { NotebookCategory } from '@/types/note'

export interface CategoryPreset {
  value: NotebookCategory
  ko: string
  en: string
  color: string
}

/**
 * Notebook category presets — single source of truth.
 * "labnote" is always the first entry.
 */
export const CATEGORY_PRESETS: CategoryPreset[] = [
  { value: 'labnote', ko: '연구 노트', en: 'Lab Note', color: 'bg-blue-100 text-blue-700' },
  { value: 'daily_log', ko: '업무록', en: 'Daily Log', color: 'bg-green-100 text-green-700' },
  { value: 'meeting', ko: '회의록', en: 'Meeting', color: 'bg-purple-100 text-purple-700' },
  { value: 'sop', ko: '표준 운영 절차', en: 'SOP', color: 'bg-orange-100 text-orange-700' },
  { value: 'protocol', ko: '실험 프로토콜', en: 'Protocol', color: 'bg-red-100 text-red-700' },
  { value: 'reference', ko: '참고 자료', en: 'Reference', color: 'bg-gray-100 text-gray-700' },
]

/** Category values including empty string (for "none" option in selects) */
export const CATEGORY_OPTIONS: (NotebookCategory | '')[] = [
  '',
  ...CATEGORY_PRESETS.map(p => p.value),
]

/** Color map keyed by category value */
export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  CATEGORY_PRESETS.map(p => [p.value, p.color]),
)

/** Get localized label for a category */
export function getCategoryLabel(value: string, lang: 'ko' | 'en' = 'ko'): string {
  return CATEGORY_PRESETS.find(p => p.value === value)?.[lang] ?? value
}
