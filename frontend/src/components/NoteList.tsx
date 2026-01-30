// @TASK P5-T5.2 - 가상화된 노트 목록 컴포넌트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-목록

import { useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { NoteCard } from './NoteCard'
import type { NoteListItem } from '@/types/note'

interface NoteListProps {
  notes: NoteListItem[]
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}

/**
 * 가상화된 노트 목록 컴포넌트
 * - @tanstack/react-virtual로 1000+ 노트 지원
 * - 무한 스크롤 페이지네이션
 */
export function NoteList({
  notes,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: NoteListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140, // 노트 카드 예상 높이 (px)
    overscan: 5, // 스크롤 시 미리 렌더링할 아이템 수
  })

  // 무한 스크롤: 마지막 아이템에 가까워지면 다음 페이지 로드
  useEffect(() => {
    const virtualItems = virtualizer.getVirtualItems()
    if (!virtualItems.length) return

    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem) return

    // 마지막에서 5개 이내면 다음 페이지 로드
    if (
      lastItem.index >= notes.length - 5 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    notes.length,
    virtualizer,
  ])

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto"
      role="list"
      aria-label="노트 목록"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const note = notes[virtualItem.index]
          return (
            <div
              key={note.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <NoteCard note={note} className="mb-2" />
            </div>
          )
        })}
      </div>

      {/* 로딩 인디케이터 */}
      {isFetchingNextPage && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          로딩 중...
        </div>
      )}
    </div>
  )
}
