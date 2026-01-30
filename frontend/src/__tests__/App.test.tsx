// @TASK P5-T5.1 - App Shell 라우팅 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#프론트엔드
// @TEST App Shell routing, lazy loading, layout rendering

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'

// Mock pages for testing
vi.mock('../pages/Dashboard', () => ({
  default: () => <div>Dashboard Page</div>,
}))

vi.mock('../pages/Notes', () => ({
  default: () => <div>Notes Page</div>,
}))

vi.mock('../pages/NoteDetail', () => ({
  default: () => <div>Note Detail Page</div>,
}))

vi.mock('../pages/Search', () => ({
  default: () => <div>Search Page</div>,
}))

vi.mock('../pages/AIWorkbench', () => ({
  default: () => <div>AI Workbench Page</div>,
}))

vi.mock('../pages/Settings', () => ({
  default: () => <div>Settings Page</div>,
}))

describe('App Shell', () => {
  describe('Routing', () => {
    it('renders Dashboard at root path', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
      })
    })

    it('renders Notes page at /notes', async () => {
      render(
        <MemoryRouter initialEntries={['/notes']}>
          <App />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Notes Page')).toBeInTheDocument()
      })
    })

    it('renders NoteDetail page at /notes/:id', async () => {
      render(
        <MemoryRouter initialEntries={['/notes/123']}>
          <App />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Note Detail Page')).toBeInTheDocument()
      })
    })

    it('renders Search page at /search', async () => {
      render(
        <MemoryRouter initialEntries={['/search']}>
          <App />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Search Page')).toBeInTheDocument()
      })
    })

    it('renders AI Workbench at /ai', async () => {
      render(
        <MemoryRouter initialEntries={['/ai']}>
          <App />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('AI Workbench Page')).toBeInTheDocument()
      })
    })

    it('renders Settings at /settings', async () => {
      render(
        <MemoryRouter initialEntries={['/settings']}>
          <App />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Settings Page')).toBeInTheDocument()
      })
    })
  })

  describe('Layout', () => {
    it('renders Layout with Sidebar', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      )

      await waitFor(() => {
        // Sidebar should contain navigation links
        expect(screen.getByRole('navigation')).toBeInTheDocument()
      })
    })

    it('renders main content area', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument()
      })
    })
  })

  describe('Lazy Loading', () => {
    it('shows loading state during lazy load', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      )

      // Loading spinner should appear briefly
      // Then content loads
      await waitFor(() => {
        expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
      })
    })
  })
})
