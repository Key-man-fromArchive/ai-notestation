import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Tag, Plus, Trash2, Save, CheckCircle, RotateCcw, Lock, ChevronDown, ChevronRight, Brain } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useCategories, CATEGORY_PRESETS_FALLBACK } from '@/lib/categories'
import type { CategoryPreset } from '@/lib/categories'
import { cn } from '@/lib/utils'

const COLOR_OPTIONS = [
  { value: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', label: 'Blue', preview: 'bg-blue-200 dark:bg-blue-800' },
  { value: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', label: 'Green', preview: 'bg-green-200 dark:bg-green-800' },
  { value: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', label: 'Purple', preview: 'bg-purple-200 dark:bg-purple-800' },
  { value: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400', label: 'Orange', preview: 'bg-orange-200 dark:bg-orange-800' },
  { value: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', label: 'Red', preview: 'bg-red-200 dark:bg-red-800' },
  { value: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400', label: 'Gray', preview: 'bg-gray-200 dark:bg-gray-700' },
  { value: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400', label: 'Yellow', preview: 'bg-yellow-200 dark:bg-yellow-800' },
  { value: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400', label: 'Pink', preview: 'bg-pink-200 dark:bg-pink-800' },
  { value: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400', label: 'Cyan', preview: 'bg-cyan-200 dark:bg-cyan-800' },
  { value: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400', label: 'Teal', preview: 'bg-teal-200 dark:bg-teal-800' },
  { value: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400', label: 'Indigo', preview: 'bg-indigo-200 dark:bg-indigo-800' },
  { value: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', label: 'Amber', preview: 'bg-amber-200 dark:bg-amber-800' },
]

export function CategorySettingsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const serverCategories = useCategories()
  const [localCategories, setLocalCategories] = useState<CategoryPreset[]>([])
  const [initialized, setInitialized] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!initialized && serverCategories.length > 0) {
      setLocalCategories(serverCategories.map(c => ({ ...c })))
      setInitialized(true)
    }
  }, [serverCategories, initialized])

  const saveMutation = useMutation({
    mutationFn: (categories: CategoryPreset[]) =>
      apiClient.put('/settings/notebook_categories', { value: categories }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebooks', 'categories'] })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleFieldChange = (index: number, field: keyof CategoryPreset, value: string) => {
    setLocalCategories(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleAdd = () => {
    setLocalCategories(prev => [
      ...prev,
      { value: '', ko: '', en: '', color: 'bg-gray-100 text-gray-700', prompt: '', extraction_hints: [], search_boost_terms: [] },
    ])
  }

  const handleArrayFieldChange = (index: number, field: 'extraction_hints' | 'search_boost_terms', raw: string) => {
    setLocalCategories(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [] }
      return next
    })
  }

  const handleRemove = (index: number) => {
    setLocalCategories(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    // Validate
    for (const cat of localCategories) {
      if (!cat.value.trim()) return
    }
    const values = localCategories.map(c => c.value)
    if (new Set(values).size !== values.length) return

    saveMutation.mutate(localCategories)
  }

  const handleReset = () => {
    if (!confirm(t('settings.categoryResetConfirm'))) return
    setLocalCategories(CATEGORY_PRESETS_FALLBACK.map(c => ({ ...c })))
  }

  const isDirty = JSON.stringify(localCategories) !== JSON.stringify(serverCategories)

  // Check for validation errors
  const valueErrors = new Map<number, string>()
  const seenValues = new Map<string, number>()
  localCategories.forEach((cat, i) => {
    if (!cat.value.trim()) {
      valueErrors.set(i, t('settings.categoryValueRequired'))
    } else if (seenValues.has(cat.value)) {
      valueErrors.set(i, t('settings.categoryValueDuplicate'))
      valueErrors.set(seenValues.get(cat.value)!, t('settings.categoryValueDuplicate'))
    } else {
      seenValues.set(cat.value, i)
    }
  })
  const hasErrors = valueErrors.size > 0

  return (
    <div className="p-4 border border-input rounded-md">
      <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <Tag className="h-5 w-5" aria-hidden="true" />
        {t('settings.categoryTitle')}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.categoryDesc')}
      </p>

      {/* Header row */}
      <div className="grid grid-cols-[24px_1fr_1fr_1fr_120px_36px] gap-2 mb-2 px-1">
        <span />
        <span className="text-xs font-medium text-muted-foreground">{t('settings.categoryValue')}</span>
        <span className="text-xs font-medium text-muted-foreground">{t('settings.categoryKo')}</span>
        <span className="text-xs font-medium text-muted-foreground">{t('settings.categoryEn')}</span>
        <span className="text-xs font-medium text-muted-foreground">{t('settings.categoryColor')}</span>
        <span />
      </div>

      {/* Category rows */}
      <div className="space-y-2 mb-4">
        {localCategories.map((cat, index) => {
          const isProtected = cat.value === 'labnote'
          const error = valueErrors.get(index)
          const isExpanded = expandedIndex === index

          return (
            <div key={index} className={cn(isProtected && 'bg-primary/5 rounded-md px-1 py-1')}>
              <div className="grid grid-cols-[24px_1fr_1fr_1fr_120px_36px] gap-2 items-center">
                <button
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={isExpanded ? 'Collapse AI settings' : 'Expand AI settings'}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className="relative">
                  <input
                    type="text"
                    value={cat.value}
                    onChange={e => handleFieldChange(index, 'value', e.target.value.replace(/[^a-z0-9_]/g, ''))}
                    disabled={isProtected}
                    placeholder="category_id"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      'disabled:opacity-60 disabled:cursor-not-allowed',
                      error ? 'border-destructive' : 'border-input',
                    )}
                  />
                  {isProtected && <Lock className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />}
                  {error && <p className="text-[10px] text-destructive mt-0.5">{error}</p>}
                </div>
                <input
                  type="text"
                  value={cat.ko}
                  onChange={e => handleFieldChange(index, 'ko', e.target.value)}
                  placeholder="한국어"
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <input
                  type="text"
                  value={cat.en}
                  onChange={e => handleFieldChange(index, 'en', e.target.value)}
                  placeholder="English"
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <select
                  value={cat.color}
                  onChange={e => handleFieldChange(index, 'color', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {COLOR_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleRemove(index)}
                  disabled={isProtected}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    isProtected
                      ? 'text-muted-foreground/30 cursor-not-allowed'
                      : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                  )}
                  title={isProtected ? t('settings.categoryProtected') : undefined}
                  aria-label={`Delete ${cat.value}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Expandable AI settings panel */}
              {isExpanded && (
                <div className="ml-6 mt-2 mb-1 p-3 border border-input rounded-md bg-muted/30 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Brain className="h-3.5 w-3.5" />
                    {t('settings.categoryAiSettings')}
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t('settings.categoryPrompt')}</label>
                    <textarea
                      value={cat.prompt || ''}
                      onChange={e => handleFieldChange(index, 'prompt', e.target.value)}
                      placeholder={t('settings.categoryPromptPlaceholder')}
                      rows={3}
                      className="w-full mt-1 px-2 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t('settings.categoryExtractionHints')}</label>
                    <input
                      type="text"
                      value={(cat.extraction_hints || []).join(', ')}
                      onChange={e => handleArrayFieldChange(index, 'extraction_hints', e.target.value)}
                      placeholder={t('settings.categoryExtractionHintsPlaceholder')}
                      className="w-full mt-1 px-2 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t('settings.categorySearchBoostTerms')}</label>
                    <input
                      type="text"
                      value={(cat.search_boost_terms || []).join(', ')}
                      onChange={e => handleArrayFieldChange(index, 'search_boost_terms', e.target.value)}
                      placeholder={t('settings.categorySearchBoostTermsPlaceholder')}
                      className="w-full mt-1 px-2 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleAdd}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
            'border border-input hover:bg-accent transition-colors',
          )}
        >
          <Plus className="h-4 w-4" />
          {t('settings.categoryAdd')}
        </button>

        <button
          onClick={handleReset}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
            'border border-input text-muted-foreground hover:bg-accent transition-colors',
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('settings.categoryReset')}
        </button>

        <div className="flex-1" />

        <button
          onClick={handleSave}
          disabled={saveMutation.isPending || !isDirty || hasErrors}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {saveMutation.isPending ? t('common.saving') : t('common.save')}
        </button>

        {saved && (
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">{t('common.saved')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
