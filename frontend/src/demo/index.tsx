// @TASK P5 - 데모 허브 페이지
// 모든 데모 페이지 링크 제공

import { Link } from 'react-router-dom'

export default function DemoHub() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">LabNote AI 데모 허브</h1>
        <p className="text-muted-foreground mb-8">
          각 Phase별 구현된 기능을 확인할 수 있습니다.
        </p>

        <div className="space-y-6">
          {/* Phase 5 */}
          <section className="border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Phase 5: Frontend UI</h2>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/demo/phase-5/t5-2-notes-pages"
                  className="text-primary hover:text-primary/80 underline"
                >
                  T5.2 - Notes 목록 & NoteDetail 페이지
                </Link>
                <p className="text-sm text-muted-foreground ml-4">
                  가상화된 노트 목록, 마크다운 렌더링, 노트북 필터
                </p>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
