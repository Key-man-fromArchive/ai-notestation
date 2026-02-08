import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SharedView from '@/pages/SharedView'
import type { ReactNode } from 'react'

const mockFetch = vi.fn()
global.fetch = mockFetch

function createWrapper(initialRoute: string = '/shared/test-token') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/shared/:token" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

describe('SharedView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('displays loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))

    render(<SharedView />, { wrapper: createWrapper() })

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('displays notebook content when type is notebook', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          type: 'notebook',
          notebook: {
            id: 1,
            name: 'Test Notebook',
            description: 'A test notebook',
            notes: [
              { id: 1, title: 'Note 1', preview: 'Preview 1' },
              { id: 2, title: 'Note 2', preview: 'Preview 2' },
            ],
          },
          note: null,
          expires_at: null,
        }),
    })

    render(<SharedView />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Test Notebook')).toBeInTheDocument()
    })

    expect(screen.getByText('A test notebook')).toBeInTheDocument()
    expect(screen.getByText('Note 1')).toBeInTheDocument()
    expect(screen.getByText('Note 2')).toBeInTheDocument()
    expect(screen.getByText('노트 (2개)')).toBeInTheDocument()
  })

  it('displays note content when type is note', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          type: 'note',
          notebook: null,
          note: {
            id: 1,
            title: 'Test Note',
            content_html: '<p>This is the note content</p>',
            content_text: 'This is the note content',
          },
          expires_at: null,
        }),
    })

    render(<SharedView />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Test Note')).toBeInTheDocument()
    })

    expect(screen.getByText('This is the note content')).toBeInTheDocument()
  })

  it('displays expiry warning for time-limited links', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 5)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          type: 'notebook',
          notebook: {
            id: 1,
            name: 'Expiring Notebook',
            description: null,
            notes: [],
          },
          note: null,
          expires_at: futureDate.toISOString(),
        }),
    })

    render(<SharedView />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Expiring Notebook')).toBeInTheDocument()
    })

    expect(screen.getByText(/일 후 만료/)).toBeInTheDocument()
  })

  it('displays error state for expired links (410)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 410,
      text: () => Promise.resolve(JSON.stringify({ detail: 'Link expired' })),
    })

    render(<SharedView />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('링크가 만료되었습니다')).toBeInTheDocument()
    })
  })

  it('displays error state for not found links (404)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () =>
        Promise.resolve(JSON.stringify({ detail: 'Share link not found' })),
    })

    render(<SharedView />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('링크를 찾을 수 없습니다')).toBeInTheDocument()
    })
  })

  it('displays email input modal for email-required links (403)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () =>
        Promise.resolve(
          JSON.stringify({ detail: 'Email verification required' }),
        ),
    })

    render(<SharedView />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('이메일 확인')).toBeInTheDocument()
    })

    expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument()
  })

  it('displays footer with branding', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          type: 'notebook',
          notebook: {
            id: 1,
            name: 'Test',
            description: null,
            notes: [],
          },
          note: null,
          expires_at: null,
        }),
    })

    render(<SharedView />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Powered by LabNote AI')).toBeInTheDocument()
    })
  })
})
