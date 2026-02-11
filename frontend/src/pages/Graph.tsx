import { useState } from 'react'
import { Network, SlidersHorizontal } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ObsidianGraph } from '@/components/ObsidianGraph'
import { useGlobalGraph } from '@/hooks/useGlobalGraph'

export default function Graph() {
  const [showSettings, setShowSettings] = useState(false)
  const [limit, setLimit] = useState(200)
  const [threshold, setThreshold] = useState(0.5)

  const { data, isLoading, error, refetch } = useGlobalGraph({
    limit,
    similarityThreshold: threshold,
  })

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">그래프 뷰</h1>
            <p className="text-sm text-muted-foreground">
              노트 간 연결성을 시각화합니다
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border',
            showSettings ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          설정
        </button>
      </div>

      {showSettings && (
        <div className="mb-4 p-4 border border-border rounded-lg bg-card">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium block mb-2">
                표시할 노트 수: {limit}
              </label>
              <input
                type="range"
                min={50}
                max={500}
                step={50}
                value={limit}
                onChange={e => setLimit(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>50</span>
                <span>500</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">
                유사도 임계값: {(threshold * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min={0.3}
                max={0.95}
                step={0.05}
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>30% (더 많은 연결)</span>
                <span>95% (강한 연결만)</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            적용
          </button>
        </div>
      )}

      <div className="flex-1 border border-border rounded-lg overflow-hidden">
        <ObsidianGraph
          data={data}
          isLoading={isLoading}
          error={error}
          className="h-full"
        />
      </div>
    </div>
  )
}
