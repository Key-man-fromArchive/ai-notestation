// @TASK P5-T5.2 - NoteDetail 페이지 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#노트-상세
// @TEST frontend/src/__tests__/NoteDetail.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { queryClient } from '@/lib/query-client'
import NoteDetail from '@/pages/NoteDetail'
import { apiClient } from '@/lib/api'
import type { Note } from '@/types/note'

// Mock API client
vi.mock('@/lib/api', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

const mockNote: Note = {
  id: '1',
  title: 'Test Note',
  content: '# Heading\n\nThis is **markdown** content.\n\n```js\nconsole.log("test")\n```',
  notebook: 'Work',
  created_at: '2026-01-29T00:00:00Z',
  updated_at: '2026-01-30T00:00:00Z',
  tags: ['tag1', 'tag2'],
  attachments: [
    { name: 'file1.pdf', url: '/files/file1.pdf' },
  ],
}

function renderNoteDetail(noteId = '1') {
  window.history.pushState({}, '', `/notes/${noteId}`)
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/notes/:id" element={<NoteDetail />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('NoteDetail Page', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('shows loading spinner initially', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}))
    renderNoteDetail()
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('renders note detail successfully', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(mockNote)

    renderNoteDetail()

    await waitFor(() => {
      expect(screen.getByText('Test Note')).toBeInTheDocument()
    })

    // 메타정보 확인
    expect(screen.getByText(/Work/i)).toBeInTheDocument()
    expect(screen.getByText(/tag1/i)).toBeInTheDocument()
    expect(screen.getByText(/tag2/i)).toBeInTheDocument()

    // 마크다운 렌더링 확인
    expect(screen.getByText('Heading')).toBeInTheDocument()
    expect(screen.getByText(/markdown/i)).toBeInTheDocument()
  })

  it('shows 404 for non-existent note', async () => {
    const error404 = new Error('Not found')
    Object.assign(error404, { status: 404, body: 'Not found' })
    vi.mocked(apiClient.get).mockRejectedValue(error404)

    renderNoteDetail()

    await waitFor(
      () => {
        expect(screen.getByText(/노트를 찾을 수 없습니다/i)).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })

  it('shows error state on API failure', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('API Error'))

    renderNoteDetail()

    await waitFor(
      () => {
        expect(screen.getByText(/에러가 발생했습니다/i)).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })

  it('sanitizes markdown content (XSS prevention)', async () => {
    const xssNote: Note = {
      ...mockNote,
      content: '<script>alert("XSS")</script>\n\n<img src=x onerror="alert(1)">',
    }
    vi.mocked(apiClient.get).mockResolvedValue(xssNote)

    renderNoteDetail()

    await waitFor(() => {
      expect(screen.getByText('Test Note')).toBeInTheDocument()
    })

    // script 태그와 onerror 속성이 제거되어야 함
    expect(document.querySelector('script')).toBeNull()
    const img = document.querySelector('img')
    // undefined나 null이면 OK (속성이 없는 것)
    expect(img?.getAttribute('onerror')).toBeFalsy()
  })

  it('displays attachments', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(mockNote)

    renderNoteDetail()

    await waitFor(() => {
      expect(screen.getByText('file1.pdf')).toBeInTheDocument()
    })
  })
})
