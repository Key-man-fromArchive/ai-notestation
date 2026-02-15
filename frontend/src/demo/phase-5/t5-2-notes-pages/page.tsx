// @TASK P5-T5.2 - Notes & NoteDetail 데모 페이지
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-목록-상세

import { useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import Notes from '@/pages/Notes'
import NoteDetail from '@/pages/NoteDetail'
import { apiClient } from '@/lib/api'
import type { NotesResponse, NotebooksResponse, Note } from '@/types/note'

// Mock 데이터
const mockNotesResponse: NotesResponse = {
  items: [
    {
      note_id: '1',
      title: 'React 19 새로운 기능',
      snippet: 'React 19에서는 서버 컴포넌트와 액션이 안정화되었습니다...',
      notebook: 'Dev',
      updated_at: new Date().toISOString(),
      tags: ['react', 'frontend'],
    },
    {
      note_id: '2',
      title: 'TypeScript 5.7 릴리스',
      snippet: 'TypeScript 5.7이 릴리스되면서 새로운 타입 기능이 추가되었습니다...',
      notebook: 'Dev',
      updated_at: new Date(Date.now() - 86400000).toISOString(),
      tags: ['typescript', 'release'],
    },
    {
      note_id: '3',
      title: '주간 회의 노트',
      snippet: '2026년 1월 30일 주간 회의 내용입니다...',
      notebook: 'Work',
      updated_at: new Date(Date.now() - 172800000).toISOString(),
      tags: ['meeting'],
    },
  ],
  total: 3,
  offset: 0,
  limit: 20,
}

const mockNotebooksResponse: NotebooksResponse = {
  items: [
    {
      id: 1,
      name: 'Dev',
      description: null,
      category: null,
      note_count: 10,
      is_public: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 2,
      name: 'Work',
      description: null,
      category: null,
      note_count: 5,
      is_public: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 3,
      name: 'Personal',
      description: null,
      category: null,
      note_count: 3,
      is_public: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ],
  total: 3,
}

const mockNote: Note = {
  note_id: '1',
  title: 'React 19 새로운 기능',
  content: `# React 19 새로운 기능

React 19에서는 다음과 같은 기능이 안정화되었습니다:

## 서버 컴포넌트

서버 컴포넌트를 사용하면 서버에서 렌더링된 컴포넌트를 클라이언트로 스트리밍할 수 있습니다.

\`\`\`tsx
export default async function Page() {
  const data = await fetchData()
  return <div>{data}</div>
}
\`\`\`

## 액션 (Actions)

폼 제출과 데이터 변경을 간편하게 처리할 수 있습니다.

\`\`\`tsx
export default function Form() {
  return (
    <form action={submitAction}>
      <input name="title" />
      <button type="submit">Submit</button>
    </form>
  )
}
\`\`\`

## 주요 개선사항

- **Suspense**: 더욱 안정적이고 강력해졌습니다
- **useOptimistic**: 낙관적 업데이트 지원
- **useFormStatus**: 폼 제출 상태 추적

자세한 내용은 [React 공식 블로그](https://react.dev/blog)를 참고하세요.
`,
  notebook: 'Dev',
  created_at: new Date(Date.now() - 604800000).toISOString(),
  updated_at: new Date().toISOString(),
  tags: ['react', 'frontend'],
  attachments: [
    { name: 'react-19-slides.pdf', url: '/files/react-19-slides.pdf' },
  ],
}

const DEMO_STATES = {
  normal: { status: 'normal', description: '정상 상태 (노트 목록 표시)' },
  loading: { status: 'loading', description: '로딩 중' },
  empty: { status: 'empty', description: '빈 상태 (노트 없음)' },
  error: { status: 'error', description: '에러 상태' },
} as const

export default function DemoPage() {
  const [state, setState] = useState<keyof typeof DEMO_STATES>('normal')

  // API Mock 설정
  const setupMock = (selectedState: keyof typeof DEMO_STATES) => {
    // @ts-expect-error - Mock override
    apiClient.get = async (path: string) => {
      await new Promise((resolve) => setTimeout(resolve, 500))

      if (selectedState === 'loading') {
        return new Promise(() => {}) // Never resolve
      }

      if (selectedState === 'error') {
        throw new Error('API 연결 실패')
      }

      if (selectedState === 'empty') {
        if (path.includes('/notebooks')) {
          return { items: [] }
        }
        return { items: [], total: 0, offset: 0, limit: 20 }
      }

      // Normal state
      if (path.includes('/notebooks')) {
        return mockNotebooksResponse
      }
      if (path.includes('/notes/')) {
        return mockNote
      }
      if (path.includes('/notes')) {
        return mockNotesResponse
      }
      throw new Error('Unknown path')
    }

    setState(selectedState)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 상태 선택기 */}
      <div className="border-b border-border bg-card p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">
            P5-T5.2 데모: Notes & NoteDetail 페이지
          </h1>
          <div className="flex gap-2 mb-4">
            {Object.entries(DEMO_STATES).map(([key]) => (
              <button
                key={key}
                onClick={() => setupMock(key as keyof typeof DEMO_STATES)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  state === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
          <div className="text-sm text-muted-foreground">
            현재 상태: <strong>{DEMO_STATES[state].description}</strong>
          </div>
        </div>
      </div>

      {/* 컴포넌트 렌더링 */}
      <div className="h-[calc(100vh-180px)]">
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <div className="p-4 max-w-7xl mx-auto">
              <nav className="mb-4 flex gap-4">
                <Link
                  to="/demo/notes"
                  className="text-primary hover:text-primary/80 underline"
                >
                  Notes 목록
                </Link>
                <Link
                  to="/demo/notes/1"
                  className="text-primary hover:text-primary/80 underline"
                >
                  Note 상세 (ID: 1)
                </Link>
              </nav>
            </div>

            <Routes>
              <Route path="/demo/notes" element={<Notes />} />
              <Route path="/demo/notes/:id" element={<NoteDetail />} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </div>

      {/* 상태 정보 */}
      <div className="border-t border-border bg-card p-4">
        <div className="max-w-7xl mx-auto">
          <h3 className="text-sm font-semibold mb-2">Mock 데이터 정보</h3>
          <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(
              {
                notesCount: mockNotesResponse.items.length,
                notebooksCount: mockNotebooksResponse.items.length,
                sampleNote: {
                  note_id: mockNote.note_id,
                  title: mockNote.title,
                  contentLength: mockNote.content.length,
                },
              },
              null,
              2
            )}
          </pre>
        </div>
      </div>
    </div>
  )
}
