// @TASK P5-T5.1 - App Shell with routing and layout
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#프론트엔드
// @TEST frontend/src/__tests__/App.test.tsx

import { Suspense, lazy } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Routes, Route, Navigate } from 'react-router-dom'
import { queryClient } from './lib/query-client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout } from './components/Layout'
import { LoadingSpinner } from './components/LoadingSpinner'
import { AuthProvider, useAuth } from './contexts/AuthContext'

// Lazy load all pages for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Notes = lazy(() => import('./pages/Notes'))
const NoteDetail = lazy(() => import('./pages/NoteDetail'))
const Notebooks = lazy(() => import('./pages/Notebooks'))
const NotebookDetail = lazy(() => import('./pages/NotebookDetail'))
const Search = lazy(() => import('./pages/Search'))
const AIWorkbench = lazy(() => import('./pages/AIWorkbench'))
const Settings = lazy(() => import('./pages/Settings'))
const Members = lazy(() => import('./pages/Members'))
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const SharedView = lazy(() => import('./pages/SharedView'))
const Discovery = lazy(() => import('./pages/Discovery'))
const Graph = lazy(() => import('./pages/Graph'))

// Demo pages
const DemoHub = lazy(() => import('./demo/index'))
const DemoNotesPages = lazy(() => import('./demo/phase-5/t5-2-notes-pages/page'))

/**
 * 인증 확인 후 보호된 라우트를 렌더링
 * - 로딩 중: 전체화면 스피너
 * - 미인증: /login으로 리다이렉트
 * - 인증: Layout + 자식 라우트 렌더링
 */
function ProtectedRoutes() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
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
          <Route path="/notebooks" element={<Notebooks />} />
          <Route path="/notebooks/:id" element={<NotebookDetail />} />
          <Route path="/notebooks/:id/discover" element={<Discovery />} />
          <Route path="/search" element={<Search />} />
          <Route path="/ai" element={<AIWorkbench />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/members" element={<Members />} />
          <Route path="/graph" element={<Graph />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />

          {/* Demo pages */}
          <Route path="/demo" element={<DemoHub />} />
          <Route path="/demo/phase-5/t5-2-notes-pages/*" element={<DemoNotesPages />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

/**
 * App Shell
 * - AuthProvider로 인증 상태 관리
 * - /login, /signup: 공개 라우트 (Layout 없음)
 * - /*: 보호 라우트 (인증 필요, Layout 포함)
 */
function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-screen">
                <LoadingSpinner size="lg" />
              </div>
            }
          >
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/shared/:token" element={<SharedView />} />
              <Route path="/*" element={<ProtectedRoutes />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
