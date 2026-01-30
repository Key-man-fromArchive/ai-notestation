// @TASK P5-T5.1 - App Shell with routing and layout
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#프론트엔드
// @TEST frontend/src/__tests__/App.test.tsx

import { Suspense, lazy } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Routes, Route } from 'react-router-dom'
import { queryClient } from './lib/query-client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout } from './components/Layout'
import { LoadingSpinner } from './components/LoadingSpinner'

// Lazy load all pages for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Notes = lazy(() => import('./pages/Notes'))
const NoteDetail = lazy(() => import('./pages/NoteDetail'))
const Search = lazy(() => import('./pages/Search'))
const AIWorkbench = lazy(() => import('./pages/AIWorkbench'))
const Settings = lazy(() => import('./pages/Settings'))

// Demo pages
const DemoHub = lazy(() => import('./demo/index'))
const DemoNotesPages = lazy(() => import('./demo/phase-5/t5-2-notes-pages/page'))

/**
 * App Shell (without Router wrapper for testing flexibility)
 * - React Router v7 라우팅
 * - React.lazy 코드 스플리팅
 * - TanStack Query Provider
 * - ErrorBoundary
 * - Layout (Sidebar + Main)
 */
function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Layout>
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[400px]">
                <LoadingSpinner />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/notes/:id" element={<NoteDetail />} />
              <Route path="/search" element={<Search />} />
              <Route path="/ai" element={<AIWorkbench />} />
              <Route path="/settings" element={<Settings />} />

              {/* Demo pages */}
              <Route path="/demo" element={<DemoHub />} />
              <Route path="/demo/phase-5/t5-2-notes-pages/*" element={<DemoNotesPages />} />
            </Routes>
          </Suspense>
        </Layout>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
