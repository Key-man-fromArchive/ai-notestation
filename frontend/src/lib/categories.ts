import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

export interface CategoryPreset {
  value: string
  ko: string
  en: string
  color: string
}

/**
 * Hardcoded fallback — used when API is unavailable.
 */
export const CATEGORY_PRESETS_FALLBACK: CategoryPreset[] = [
  // Research
  { value: 'labnote', ko: '연구 노트', en: 'Lab Note', color: 'bg-blue-100 text-blue-700' },
  { value: 'daily_log', ko: '업무록', en: 'Daily Log', color: 'bg-green-100 text-green-700' },
  { value: 'meeting', ko: '회의록', en: 'Meeting', color: 'bg-purple-100 text-purple-700' },
  { value: 'sop', ko: '표준 운영 절차', en: 'SOP', color: 'bg-orange-100 text-orange-700' },
  { value: 'protocol', ko: '실험 프로토콜', en: 'Protocol', color: 'bg-red-100 text-red-700' },
  { value: 'reference', ko: '참고 자료', en: 'Reference', color: 'bg-gray-100 text-gray-700' },
  // Lifestyle
  { value: 'diary', ko: '일기', en: 'Diary', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'travel', ko: '여행', en: 'Travel', color: 'bg-pink-100 text-pink-700' },
  { value: 'recipe', ko: '레시피', en: 'Recipe', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'health', ko: '건강', en: 'Health', color: 'bg-teal-100 text-teal-700' },
  { value: 'finance', ko: '재무', en: 'Finance', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'hobby', ko: '취미', en: 'Hobby', color: 'bg-amber-100 text-amber-700' },
]

/**
 * Fetch categories from API with fallback.
 */
export function useCategories(): CategoryPreset[] {
  const { data } = useQuery<CategoryPreset[]>({
    queryKey: ['notebooks', 'categories'],
    queryFn: () => apiClient.get('/notebooks/categories'),
    staleTime: 5 * 60 * 1000,
    placeholderData: CATEGORY_PRESETS_FALLBACK,
  })
  return data ?? CATEGORY_PRESETS_FALLBACK
}

/** Build category options (empty string = "none") */
export function getCategoryOptions(categories: CategoryPreset[]): string[] {
  return ['', ...categories.map(p => p.value)]
}

/** Build color map from categories */
export function getCategoryColors(categories: CategoryPreset[]): Record<string, string> {
  return Object.fromEntries(categories.map(p => [p.value, p.color]))
}

/** Get localized label for a category */
export function getCategoryLabel(
  value: string,
  lang: 'ko' | 'en' = 'ko',
  categories?: CategoryPreset[],
): string {
  const list = categories ?? CATEGORY_PRESETS_FALLBACK
  return list.find(p => p.value === value)?.[lang] ?? value
}
