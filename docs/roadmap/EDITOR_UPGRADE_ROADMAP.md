# Editor Upgrade Roadmap

> TipTap 에디터를 연구 전자노트 전용 플랫폼으로 진화시키는 로드맵
>
> 작성일: 2026-02-14 | 최종 업데이트: 2026-02-21 | 현재 버전: v3.1.0

---

## Current State (v3.1.0)

**20 official extensions + 5 custom extensions** (all tiptap ^2.27.2 ✅)

| Category | Extensions | Version |
|----------|-----------|---------|
| Core | StarterKit (Bold, Italic, Strike, Code, Heading, BulletList, OrderedList, Blockquote, HorizontalRule, History) | ^2.27.2 ✅ |
| Formatting | Underline, TextStyle, Color, Highlight (multicolor) | ^2.27.2 ✅ |
| Structure | Table (resizable) + Row/Cell/Header, Link, Placeholder | ^2.27.2 ✅ |
| Editing | Typography, TaskList + TaskItem, CodeBlockLowlight, CharacterCount | ^2.27.2 ✅ |
| Media | Custom NoteStationImage (S/M/L/Fit sizing, alignment, bubble menu, context menu, viewer modal) | ^2.27.2 ✅ |
| Research | HandwritingBlock (tldraw + AI OCR/Math), ExperimentHeader, StatusChip, Signature | custom |
| Search | SearchAndReplace (custom, Ctrl+H) | custom |
| AI | SpellCheck (inline wavy underlines, click-to-fix panel) | custom |
| Mention | MemberMention (@member), NoteMention (#note) — suggestion dropdown | ^2.27.2 ✅ |
| UX | Multi-tab, Split view, Outline panel, Zen mode, Auto-save (3s debounce) | — |

---

## ~~Phase 1: Core Editing Power-ups~~ ✅ COMPLETED (v3.0.0)

> Completed in commits `dffc2fb`, `3da4cc2`. 모든 항목 구현 완료.

| Item | Extension | Status |
|------|-----------|--------|
| 1.1 Typography | `@tiptap/extension-typography` | ✅ `…`, `→`, `⇒`, smart quotes |
| 1.2 Search & Replace | custom `SearchAndReplace.ts` + `SearchReplacePanel.tsx` | ✅ Ctrl+H, 정규식, 하이라이트 |
| 1.3 Task List | `@tiptap/extension-task-list` + `task-item` | ✅ 체크리스트, 중첩 |
| 1.4 Code Block | `@tiptap/extension-code-block-lowlight` + `lowlight` | ✅ 구문 하이라이팅, 언어 선택 |

### Lessons Learned (Phase 1)
- `tiptap-extension-resize-image` 는 노드명을 `imageResize`로 등록 → 기존 ProseMirror `image` 노드와 불일치 → **절대 사용 금지**
- 새 tiptap 확장 추가 시 반드시 `package-lock.json` peer dep 플래그 확인 → Docker `npm install`에서 누락 가능
- 이미지 리사이즈는 향후 `@tiptap/extension-image`를 직접 extend하여 구현 (E-0 이후)

---

## ~~Phase E-0: Version Unification (버전 통일)~~ ✅ COMPLETED (76f0492)
**Priority**: Critical | **Complexity**: Low-Medium | **Duration**: 1-2 days

모든 tiptap 패키지를 ^2.27.2로 통일. 혼합 버전 peer dep 충돌 제거. Phase 2~4의 전제조건.

### 업그레이드 대상 (12개 패키지)

| Package | Current | Target |
|---------|---------|--------|
| `@tiptap/starter-kit` | ^2.2.4 | ^2.27.2 |
| `@tiptap/react` | ^2.2.4 | ^2.27.2 |
| `@tiptap/extension-image` | ^2.2.4 | ^2.27.2 |
| `@tiptap/extension-link` | ^2.2.4 | ^2.27.2 |
| `@tiptap/extension-color` | ^2.2.4 | ^2.27.2 |
| `@tiptap/extension-highlight` | ^2.2.4 | ^2.27.2 |
| `@tiptap/extension-text-style` | ^2.2.4 | ^2.27.2 |
| `@tiptap/extension-underline` | ^2.2.4 | ^2.27.2 |
| `@tiptap/extension-table` | ^2.2.4 | ^2.27.2 |
| `@tiptap/extension-table-cell` | ^2.2.4 | ^2.27.2 |
| `@tiptap/extension-table-header` | ^2.2.4 | ^2.27.2 |
| `@tiptap/extension-table-row` | ^2.2.4 | ^2.27.2 |

### 작업 순서

1. `package.json` 12개 패키지 버전 일괄 변경
2. `npm install` → lock 파일 갱신, peer dep 충돌 확인
3. `npm run build` → 타입 에러 수정
4. 기존 노트 로드 테스트 (HTML 파싱 변경 여부)
5. Table 렌더링 확인 (table API 변경 가장 많음)
6. Image (NoteStationImage), Link 동작 확인
7. Docker 빌드 + 컨테이너 테스트

### 주의사항

- StarterKit 내장 `codeBlock` ↔ `CodeBlockLowlight` 충돌 가능 → `codeBlock: false` 필수
- Table 확장 2.2 → 2.27: `HTMLAttributes` 처리 방식 변경 가능
- Image 확장 API는 안정적 (NoteStationImage extend 패턴 유지 가능)
- **반드시** `package-lock.json` peer dep 정리 후 Docker 빌드 검증

### 완료 기준

- [x] 12개 패키지 모두 ^2.27.2
- [x] `npm run build` 성공
- [x] Docker `docker compose up -d --build frontend` 성공
- [ ] 기존 노트 이미지/테이블/링크 정상 렌더링
- [ ] BubbleMenu, ContextMenu, ViewerModal 정상 동작

---

## ~~Phase 2: Research-Specific Custom Nodes~~ ✅ COMPLETED (76f0492)
**Priority**: High | **Complexity**: Medium | **Duration**: 2 weeks

LabNote AI의 핵심 차별화. 연구 전자노트에 특화된 커스텀 노드 3종.

### 2.1 ExperimentHeader Node
카드 형태의 실험 메타데이터 블록. 문서 상단에 배치.

```
┌─────────────────────────────────────────────┐
│  🔬 Experiment: PCR Optimization            │
│  ─────────────────────────────────────────── │
│  Date: 2026-02-21      Experimenter: Kim    │
│  Project: Gene Cloning  Sample: pUC19-GFP   │
│  Status: ● Running      Protocol: v2.3      │
│  Tags: [PCR] [Optimization] [GFP]           │
└─────────────────────────────────────────────┘
```

**Attributes**:
- `title`: string (실험 제목)
- `date`: ISO date
- `experimenter`: string
- `project`: string
- `sampleId`: string
- `protocolVersion`: string
- `status`: enum (planned | running | completed | failed | paused)
- `tags`: string[]

**Features**:
- Slash command `/experiment` 또는 toolbar 버튼으로 삽입
- 인라인 편집 (각 필드 클릭하여 수정)
- Status 토글 (chip 클릭으로 순환)
- 노트 메타데이터(title, tags)와 자동 동기화 옵션
- 검색 색인에 반영 (experimenter, sampleId 등)
- 테마 대응 (light/dark)

### 2.2 Status Chip Node
텍스트 중간에 삽입 가능한 인라인 상태 표시 칩.

```
실험 결과: [● Completed] 젤 전기영동 후 밴드 확인됨
다음 단계: [○ Planned] Western blot으로 단백질 발현 확인
문제 발생: [✕ Failed] 프라이머 비특이적 결합
```

**Status Types & Colors**:
| Status | Color | Icon |
|--------|-------|------|
| Planned | Blue | ○ |
| Running | Amber | ◉ (pulse animation) |
| Completed | Green | ● |
| Failed | Red | ✕ |
| Paused | Gray | ◫ |
| Review | Purple | ◈ |

**Features**:
- Inline node (텍스트 흐름에 자연스럽게 배치)
- 클릭으로 상태 순환
- Slash command `/status`
- 문서 내 상태 요약 가능 (Outline panel 연동)

### 2.3 Signature Node
PI 승인, 동료 리뷰 확인을 위한 전자서명 블록.

```
┌─────────────────────────────────────┐
│  ✓ Signed by: Prof. Lee (PI)       │
│  Date: 2026-02-21 14:32 KST        │
│  Role: Principal Investigator       │
│  Comment: "Approved for submission" │
│  ─────── 🔒 Locked ──────          │
└─────────────────────────────────────┘
```

**Attributes**:
- `signedBy`: string (서명자 이름)
- `memberId`: number (시스템 멤버 ID, 기존 Member 시스템 연동)
- `role`: string (PI / Researcher / Technician / Reviewer)
- `signedAt`: ISO datetime
- `comment`: string (optional)
- `locked`: boolean (서명 후 이전 내용 수정 방지)

**Features**:
- Slash command `/sign` 또는 toolbar 버튼
- 서명 시 현재 로그인 사용자 자동 매핑
- 서명 후 블록 상단의 콘텐츠 lock (편집 방지)
- 서명 이력 (여러 서명 가능: 실험자 → PI)
- PDF 내보내기 시 서명 블록 포함

### Phase 2 Deliverables
```
frontend/
└── src/
    ├── extensions/
    │   ├── ExperimentHeader/
    │   │   ├── ExperimentHeader.ts          # Node definition
    │   │   └── ExperimentHeaderView.tsx     # React NodeView
    │   ├── StatusChip/
    │   │   ├── StatusChip.ts               # Inline Node definition
    │   │   └── StatusChipView.tsx          # React NodeView
    │   └── Signature/
    │       ├── Signature.ts                # Node definition
    │       └── SignatureView.tsx           # React NodeView
    ├── components/
    │   ├── NoteEditor.tsx                  # +3 extensions, toolbar
    │   └── editor/
    │       └── SlashCommandMenu.tsx        # NEW: / command palette
    └── index.css                           # custom node 스타일
```

---

## Phase 3: Review & Quality
**Priority**: Medium | **Complexity**: Medium | **Duration**: 2 weeks

팀 리뷰 워크플로와 텍스트 품질 보장.

### ~~3.1 Inline Comments / Review~~ ✅ COMPLETED
Custom `CommentMark` (TipTap Mark) + CommentPanel + Backend API 구현 완료.

**구현 내용**:
- `CommentMark.ts` — TipTap Mark extension, `data-comment-id` 속성, `setComment()`/`unsetComment()` commands
- `CommentPanel.tsx` — SpellCheckPanel 패턴, 코멘트 추가/해결/삭제, 클릭 네비게이션
- `useComments.ts` — TanStack Query CRUD hook (4 mutations)
- `comments.py` — 4 endpoints: GET list, POST create, PATCH resolve, DELETE
- `note_comments` DB 테이블 (migration 030)
- NAS push 시 `strip_comment_marks()` 자동 제거
- 다크모드 + amber/yellow 하이라이트 스타일
- Ctrl+Shift+M 단축키

### ~~3.2 Grammar & Spell Check~~ ✅ COMPLETED (41f29f3)
AI-based (Option B) 구현 완료. 기존 AI Router + 새 `spellcheck_inline` 프롬프트.

**구현 내용**:
- `SpellCheck.ts` TipTap extension — ProseMirror Decoration (wavy underlines)
- `SpellCheckPanel.tsx` — 에러 목록, 개별 수정/무시/전체 수정, 네비게이션
- `spellcheck_inline.py` — 구조화 JSON 응답 프롬프트 (`{errors: [{original, corrected, type, explanation}]}`)
- 3종 에러 타입: 빨강(spelling), 파랑(grammar), 노랑(expression)
- SSE 스트리밍으로 검사, 에디터 toolbar 버튼으로 토글
- Light/Dark 테마 대응, en/ko i18n

### ~~3.3 Mention / Reference~~ ✅ COMPLETED
`@tiptap/extension-mention` + `@tiptap/suggestion` (^2.27.2)

- `@member` → 팀 멤버 언급 (기존 Member 시스템 연동) ✅
- `#note` → 노트 간 크로스 레퍼런스 (기존 Quick Search API 연동) ✅
- `$sample` → 샘플/시약 참조 (future: inventory 시스템 구현 후)

**구현 내용**:
- `MemberMention.ts` — `Mention.extend({ name: 'memberMention' })`, `@` 트리거, `/members` API 캐시 후 클라이언트 필터링
- `NoteMention.ts` — `Mention.extend({ name: 'noteMention' })`, `#` 트리거, `/notes/quick-search` 서버 사이드 ILIKE
- `MentionList.tsx` — 공유 드롭다운 UI (키보드 네비게이션, 아이콘, 다크모드)
- `mentionRenderer.ts` — tippy.js 팝업 헬퍼 (두 확장 공유)
- 백엔드 변경 없음 — 기존 Members + Quick Search API 100% 재사용

### Phase 3 Deliverables
```
# 3.2 SpellCheck (✅ Done)
frontend/src/extensions/SpellCheck.ts              # TipTap extension + ProseMirror decorations
frontend/src/components/editor/SpellCheckPanel.tsx  # Panel UI (error list, fix/dismiss)
backend/app/ai_router/prompts/spellcheck_inline.py # Structured JSON prompt

# 3.1 Comments (✅ Done)
frontend/src/extensions/Comments/CommentMark.ts        # TipTap Mark extension (data-comment-id)
frontend/src/components/editor/CommentPanel.tsx         # Panel UI (add/resolve/delete, navigation)
frontend/src/hooks/useComments.ts                       # TanStack Query CRUD hook
backend/app/api/comments.py                             # 4 endpoints (list/create/resolve/delete)
backend/migrations/versions/030_add_note_comments.py    # DB migration
backend/app/utils/note_utils.py                         # strip_comment_marks() for NAS push

# 3.3 Mentions (✅ Done)
frontend/src/extensions/Mention/MemberMention.ts       # @member Mention extension
frontend/src/extensions/Mention/NoteMention.ts         # #note Mention extension
frontend/src/extensions/Mention/MentionList.tsx         # Shared dropdown UI
frontend/src/extensions/Mention/mentionRenderer.ts      # tippy.js popup helper
```

---

## Phase 4: Real-time Collaboration
**Priority**: Medium-Low | **Complexity**: High | **Duration**: 3-4 weeks

Y.js 기반 실시간 동시 편집. 연구실 공유 전자노트의 최종 단계.

### 4.1 Y.js Collaboration Backend

**Architecture**:
```
┌─────────┐  WebSocket  ┌──────────────┐  Y.js Doc  ┌────────────┐
│ Browser  │ ◄────────► │  Hocuspocus  │ ◄────────► │ PostgreSQL │
│ (TipTap) │            │  (WS Server) │            │  (storage) │
└─────────┘             └──────────────┘            └────────────┘
     │                        │
     │  Awareness Protocol    │
     └────────────────────────┘
```

**Components**:
- `@hocuspocus/server` — Y.js WebSocket provider (Node.js sidecar 또는 Python equivalent)
- `@tiptap/extension-collaboration` — TipTap ↔ Y.js binding
- Document storage: Y.js doc → PostgreSQL (기존 note content와 동기화)
- Authentication: 기존 JWT token 검증

### 4.2 Awareness Cursors
`@tiptap/extension-collaboration-cursor`

- 사용자별 컬러 커서 (이름 라벨)
- 선택 영역 하이라이트
- 접속 사용자 목록 (toolbar 또는 sidebar)
- Idle/Active 상태 표시

### 4.3 Conflict Resolution & Offline Support
- Y.js CRDT 기반 자동 충돌 해결
- 오프라인 편집 → 재접속 시 자동 병합
- 편집 이력 (Y.js UndoManager, 사용자별)

### Prerequisites
- WebSocket 인프라 (Traefik WS proxy 설정)
- 동시 편집 시 auto-save 로직 변경 (Y.js가 저장 담당)
- 기존 NAS 동기화와의 충돌 방지 전략

### Phase 4 Deliverables
```
# New service (Docker container)
services/collaboration/
├── Dockerfile
├── package.json
└── src/
    ├── server.ts                 # Hocuspocus server
    ├── auth.ts                   # JWT verification
    └── storage.ts                # PostgreSQL Y.js persistence

frontend/
└── src/
    ├── extensions/
    │   └── Collaboration/
    │       ├── CollaborationSetup.ts    # Y.js provider + extensions
    │       └── CursorColors.ts          # User color assignment
    └── components/editor/
        └── CollaborationBar.tsx         # Online users indicator

docker-compose.yml                # +collaboration service
```

---

## Implementation Priority Matrix

```
         High Impact
              │
    Phase 2   │   Phase 4
  (Custom     │  (Collab)
   Nodes)     │
              │
Low ──────────┼────────── High
Effort        │           Effort
              │
    Phase 1   │   Phase 3
  (Power-ups) │  (Review)
              │
         Low Impact
```

## Dependency Graph

```
Phase 1 ─────────────────────────────────────→ (independent, start immediately)
    │
    ▼
Phase 2 ─── (builds on Phase 1 slash commands) ──→ Phase 3.1 Comments
    │                                                    │
    ▼                                                    ▼
Phase 2.3 Signature ─── (needs Member system) ──→ Phase 3.3 Mention
                                                         │
                                                         ▼
                                                  Phase 4 Collaboration
                                                  (needs all above stable)
```

## npm Packages Summary

| Phase | Package | Version | Size |
|-------|---------|---------|------|
| 1 | `@tiptap/extension-typography` | ^2.27 | ~5KB |
| 1 | `@tiptap/extension-task-list` | ^2.27 | ~3KB |
| 1 | `@tiptap/extension-task-item` | ^2.27 | ~5KB |
| 1 | `@tiptap/extension-code-block-lowlight` | ^2.27 | ~8KB |
| 1 | `lowlight` | ^3.x | ~50KB (with languages) |
| 2 | (custom, no packages) | — | — |
| 3 | `@tiptap/extension-mention` | ^2.27 | ~8KB |
| 4 | `@tiptap/extension-collaboration` | ^2.27 | ~10KB |
| 4 | `@tiptap/extension-collaboration-cursor` | ^2.27 | ~5KB |
| 4 | `@hocuspocus/server` | ^2.x | ~150KB |
| 4 | `yjs` | ^13.x | ~80KB |
| 4 | `y-prosemirror` | ^1.x | ~30KB |

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Y.js storage ↔ NoteStation 동기화 충돌 | High | Phase 4 이전에 저장 구조 설계, NAS sync는 collaboration 비활성 시만 |
| Custom node backward compatibility | Medium | JSON schema versioning, 마이그레이션 스크립트 |
| 번들 사이즈 증가 | Low | Code splitting per extension, lazy load Phase 4 |
| Comment 데이터 무결실 (노트 편집 시 anchor 이동) | Medium | ProseMirror Decoration 기반, position mapping |

---

## Timeline Summary

| Phase | Duration | Milestone | Status |
|-------|----------|-----------|--------|
| **Phase 1**: Core Power-ups | 1 week | v3.0.0 — Typography, Search/Replace, TaskList, CodeBlock | ✅ Done |
| **Phase E-0**: Version Unification | 1-2 days | v3.1.0 — All tiptap ^2.27.2, peer dep 정리 | ✅ Done |
| **Phase 2**: Research Nodes | 2 weeks | v3.1.0 — ExperimentHeader, StatusChip, Signature | ✅ Done |
| **Phase 3**: Review & Quality | 2 weeks | v3.2.0 — Comments, AI SpellCheck, Mentions | ✅ Done |
| **Phase 4**: Collaboration | 3-4 weeks | v4.0.0 — Y.js real-time, Awareness, Offline | Planned |
| **Total** | ~8-9 weeks | | |
