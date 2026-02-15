import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import '@/lib/i18n' // Initialize i18next
import NoteDetail from '@/pages/NoteDetail'
import { apiClient } from '@/lib/api'
import type { Note } from '@/types/note'

// Mock API client
vi.mock('@/lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

// Mock MarkdownRenderer
vi.mock('@/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}))

// Mock NoteEditor (heavy component not under test)
vi.mock('@/components/NoteEditor', () => ({
  NoteEditor: () => <div data-testid="note-editor" />,
}))

// Mock NoteAIPanel
vi.mock('@/components/NoteAIPanel', () => ({
  NoteAIPanel: () => <div data-testid="note-ai-panel" />,
}))

// Mock NoteSharing
vi.mock('@/components/NoteSharing', () => ({
  NoteSharing: () => null,
}))

// Mock ConflictDialog
vi.mock('@/components/ConflictDialog', () => ({
  ConflictDialog: () => null,
}))

// Mock hooks that are not under test
vi.mock('@/hooks/useConflicts', () => ({
  useConflicts: () => ({ conflicts: [], resolveConflict: vi.fn(), refreshConflicts: vi.fn() }),
}))

vi.mock('@/hooks/useTimezone', () => ({
  useTimezone: () => 'Asia/Seoul',
  formatDateWithTz: (date: string | null) => date ?? '',
}))

vi.mock('@/hooks/useAutoTag', () => ({
  useAutoTagNote: () => vi.fn(),
}))

vi.mock('@/hooks/useRelatedNotes', () => ({
  useRelatedNotes: () => ({ data: null, isLoading: false }),
}))

const noteWithImages: Note = {
  note_id: '42',
  title: 'OCR Test Note',
  content: '# Test',
  notebook: 'Lab',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  tags: [],
  images: [
    {
      id: 1,
      synology_note_id: 'n001',
      ref: 'img1.png',
      name: 'diagram.png',
      file_path: '/data/images/img1.png',
      mime_type: 'image/png',
      extraction_status: null,
      extracted_text: null,
    },
    {
      id: 2,
      synology_note_id: 'n001',
      ref: 'img2.png',
      name: 'screenshot.png',
      file_path: '/data/images/img2.png',
      mime_type: 'image/png',
      extraction_status: 'completed',
      extracted_text: 'Extracted screenshot text',
    },
    {
      id: 3,
      synology_note_id: 'n001',
      ref: 'img3.png',
      name: 'failed.png',
      file_path: '/data/images/img3.png',
      mime_type: 'image/png',
      extraction_status: 'failed',
      extracted_text: null,
    },
  ],
}

let queryClient: QueryClient

function renderNoteDetail() {
  window.history.pushState({}, '', '/notes/42')
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/notes/:id" element={<NoteDetail />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

describe('NoteDetail OCR', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/notes/42') return Promise.resolve(noteWithImages)
      return Promise.resolve({})
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows images section with OCR heading', async () => {
    renderNoteDetail()
    await waitFor(() => {
      expect(screen.getByText('diagram.png')).toBeInTheDocument()
    })
    expect(screen.getByText('screenshot.png')).toBeInTheDocument()
    expect(screen.getByText('failed.png')).toBeInTheDocument()
  })

  it('shows context menu on right-click of unextracted image', async () => {
    renderNoteDetail()
    await waitFor(() => {
      expect(screen.getByText('diagram.png')).toBeInTheDocument()
    })

    // Right-click on unextracted image
    const imageEl = screen.getByText('diagram.png').closest('div[class*="cursor-context-menu"]')!
    fireEvent.contextMenu(imageEl)

    // Context menu should appear with OCR option
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Text recognition|텍스트 인식/i })).toBeInTheDocument()
    })
  })

  it('triggers POST and shows loading on extract click', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ status: 'pending' })
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/notes/42') return Promise.resolve(noteWithImages)
      if (path.startsWith('/images/') && path.endsWith('/text')) {
        return Promise.resolve({ extraction_status: 'pending', text: null })
      }
      return Promise.resolve({})
    })

    renderNoteDetail()
    await waitFor(() => {
      expect(screen.getByText('diagram.png')).toBeInTheDocument()
    })

    // Right-click and click extract
    const imageEl = screen.getByText('diagram.png').closest('div[class*="cursor-context-menu"]')!
    fireEvent.contextMenu(imageEl)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Text recognition|텍스트 인식/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Text recognition|텍스트 인식/i }))

    expect(apiClient.post).toHaveBeenCalledWith('/images/1/extract')
  })

  it('shows "View recognized text" for completed image', async () => {
    renderNoteDetail()
    await waitFor(() => {
      expect(screen.getByText('screenshot.png')).toBeInTheDocument()
    })

    // Right-click on completed image
    const imageEl = screen.getByText('screenshot.png').closest('div[class*="cursor-context-menu"]')!
    fireEvent.contextMenu(imageEl)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /View recognized text|인식된 텍스트 보기/i })).toBeInTheDocument()
    })
  })

  it('opens modal when clicking "View recognized text"', async () => {
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/notes/42') return Promise.resolve(noteWithImages)
      if (path === '/images/2/text') {
        return Promise.resolve({ text: 'Extracted screenshot text', extraction_status: 'completed' })
      }
      return Promise.resolve({})
    })

    renderNoteDetail()
    await waitFor(() => {
      expect(screen.getByText('screenshot.png')).toBeInTheDocument()
    })

    // Right-click and click view
    const imageEl = screen.getByText('screenshot.png').closest('div[class*="cursor-context-menu"]')!
    fireEvent.contextMenu(imageEl)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /View recognized text|인식된 텍스트 보기/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /View recognized text|인식된 텍스트 보기/i }))

    await waitFor(() => {
      // Modal title (h2) should show screenshot.png
      expect(screen.getByRole('heading', { name: 'screenshot.png' })).toBeInTheDocument()
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('Extracted screenshot text')
    })
  })

  it('shows retry option for failed image', async () => {
    renderNoteDetail()
    await waitFor(() => {
      expect(screen.getByText('failed.png')).toBeInTheDocument()
    })

    const imageEl = screen.getByText('failed.png').closest('div[class*="cursor-context-menu"]')!
    fireEvent.contextMenu(imageEl)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry|다시/i })).toBeInTheDocument()
    })
  })

  it('closes context menu on Escape', async () => {
    renderNoteDetail()
    await waitFor(() => {
      expect(screen.getByText('diagram.png')).toBeInTheDocument()
    })

    const imageEl = screen.getByText('diagram.png').closest('div[class*="cursor-context-menu"]')!
    fireEvent.contextMenu(imageEl)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Text recognition|텍스트 인식/i })).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Text recognition|텍스트 인식/i })).not.toBeInTheDocument()
    })
  })

  it('closes modal on Escape', async () => {
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/notes/42') return Promise.resolve(noteWithImages)
      if (path === '/images/2/text') {
        return Promise.resolve({ text: 'Modal text', extraction_status: 'completed' })
      }
      return Promise.resolve({})
    })

    renderNoteDetail()
    await waitFor(() => {
      expect(screen.getByText('screenshot.png')).toBeInTheDocument()
    })

    // Open modal
    const imageEl = screen.getByText('screenshot.png').closest('div[class*="cursor-context-menu"]')!
    fireEvent.contextMenu(imageEl)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /View recognized text|인식된 텍스트 보기/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /View recognized text|인식된 텍스트 보기/i }))

    await waitFor(() => {
      expect(screen.getByTestId('markdown-content')).toBeInTheDocument()
    })

    // Press Escape to close
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument()
    })
  })
})
