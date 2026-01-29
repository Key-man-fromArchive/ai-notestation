// @TASK P0-T0.4 - 메인 App 컴포넌트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#프론트엔드
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { queryClient } from './lib/query-client'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          {/* Header */}
          <header className="border-b">
            <div className="container mx-auto px-4 py-4">
              <h1 className="text-2xl font-bold text-foreground">
                LabNote AI
              </h1>
            </div>
          </header>

          {/* Main Content */}
          <main className="container mx-auto px-4 py-8">
            <Routes>
              <Route
                path="/"
                element={
                  <div className="text-center">
                    <h2 className="text-xl text-muted-foreground">
                      Synology NoteStation enhanced with AI
                    </h2>
                    <p className="mt-4 text-sm text-muted-foreground">
                      검색, 인사이트 도출, 연구노트 작성, 맞춤법 교정, 템플릿 생성
                    </p>
                  </div>
                }
              />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
