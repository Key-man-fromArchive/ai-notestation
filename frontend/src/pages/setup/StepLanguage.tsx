import { Globe, Languages } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StepLanguageProps {
  language: string
  onSelect: (lang: string) => void
}

export default function StepLanguage({ language, onSelect }: StepLanguageProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          Select Language / 언어 선택
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Choose your preferred language for the application.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onSelect('ko')}
          className={cn(
            'flex flex-col items-center justify-center p-8 rounded-xl border-2 transition-all',
            'hover:border-primary/50 hover:bg-primary/5',
            language === 'ko'
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-border bg-card',
          )}
        >
          <Globe className="h-10 w-10 mb-3 text-primary" />
          <span className="text-lg font-semibold text-foreground">한국어</span>
          <span className="text-sm text-muted-foreground mt-1">Korean</span>
        </button>

        <button
          onClick={() => onSelect('en')}
          className={cn(
            'flex flex-col items-center justify-center p-8 rounded-xl border-2 transition-all',
            'hover:border-primary/50 hover:bg-primary/5',
            language === 'en'
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-border bg-card',
          )}
        >
          <Languages className="h-10 w-10 mb-3 text-primary" />
          <span className="text-lg font-semibold text-foreground">English</span>
          <span className="text-sm text-muted-foreground mt-1">영어</span>
        </button>
      </div>
    </div>
  )
}
