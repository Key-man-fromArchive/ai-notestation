# Editor Upgrade Roadmap

> TipTap 에디터를 연구 전자노트 전용 플랫폼으로 진화시키는 4-Phase 로드맵

## Current State (v2.1.0)

**15 official extensions + 2 custom extensions**

| Category | Extensions |
|----------|-----------|
| Core | StarterKit (Bold, Italic, Strike, Code, Heading, BulletList, OrderedList, Blockquote, HorizontalRule, History) |
| Formatting | Underline, TextStyle, Color, Highlight (multicolor) |
| Structure | Table (resizable) + Row/Cell/Header, Link, Placeholder |
| Media | Custom NoteStationImage (resize, align, bubble menu, context menu, viewer modal) |
| Research | HandwritingBlock (tldraw + AI OCR/Math recognition) |
| UX | Multi-tab, Split view, Outline panel, Zen mode, Auto-save (3s debounce) |

---

## Phase 1: Core Editing Power-ups
**Priority**: High | **Complexity**: Low | **Duration**: 1 week

Quick-win 확장으로 기본 편집 경험 대폭 강화. 외부 의존성 없이 TipTap 공식 패키지만 사용.

### 1.1 Typography Auto-correction
`@tiptap/extension-typography`

| Input | Output | Use Case |
|-------|--------|----------|
| `...` | `…` | 일반 텍스트 |
| `->` | `→` | 반응식, 플로우 |
| `=>` | `⇒` | 논리식 |
| `!=` | `≠` | 비교 |
| `"text"` | `"text"` | Smart quotes |
| `1/2` | `½` | 농도/비율 |
| `(c)` | `©` | 저작권 |

**연구 노트 가치**: 실험 프로토콜, 반응식 작성 시 자동 정리. 타이핑 효율 ↑

### 1.2 Search & Replace
`tiptap-search-and-replace` (community) or custom implementation

- `Ctrl+H`: Search & Replace 패널 open
- 정규식 지원 (optional)
- 대소문자 구분 toggle
- Replace All / Replace One
- Match count 표시
- Highlight all matches in editor

**연구 노트 가치**: 시약명 일괄 수정 (e.g., "PBS" → "1× PBS"), 프로토콜 버전 업데이트

### 1.3 Task List
`@tiptap/extension-task-list` + `@tiptap/extension-task-item`

- `[ ]` / `[x]` markdown 호환 체크리스트
- 드래그로 순서 변경
- 중첩 가능
- CSS: 체크된 항목 strikethrough + opacity

**연구 노트 가치**: 실험 체크리스트, 준비물 확인, 단계별 프로토콜 진행 추적

### 1.4 Code Block with Syntax Highlighting
`@tiptap/extension-code-block-lowlight` + `lowlight`

- Python, R, Julia, MATLAB, JSON, YAML, Bash 기본 지원
- 언어 선택 드롭다운
- 복사 버튼
- 라인 넘버 (optional)

**연구 노트 가치**: 데이터 분석 코드 스니펫 (Python/R), 스크립트 기록, config 파일

### Phase 1 Deliverables
```
frontend/
├── package.json                    # +4 dependencies
└── src/
    ├── components/
    │   ├── NoteEditor.tsx          # extensions array 확장, toolbar 버튼 추가
    │   └── editor/
    │       └── SearchReplacePanel.tsx  # NEW: 검색/치환 패널
    └── index.css                   # task-list, code-block 스타일
```

---

## Phase 2: Research-Specific Custom Nodes
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

### 3.1 Inline Comments / Review
`tiptap-comment-extension` (community) or custom Mark + sidebar

```
선택한 텍스트에 코멘트를 달면
[highlighted text](💬 3 comments)  ──→  │ Comment sidebar │
                                        │ Prof. Lee: 수정 │
                                        │ Kim: 확인했음   │
                                        │ + Reply...      │
```

**Features**:
- 텍스트 범위 선택 → 코멘트 추가
- 오른쪽 사이드 패널에 스레드 표시
- Resolve / Reopen
- 코멘트 시 알림 (future: 멤버 시스템 연동)
- 코멘트 수 badge (toolbar)
- 코멘트 모드 toggle (코멘트 하이라이트 on/off)

**Architecture**:
- `Comment` Mark: 텍스트에 comment ID 마킹
- Comments 데이터: 별도 JSON 저장 (노트 본문과 분리)
- Backend: `POST /api/notes/{id}/comments` 엔드포인트 추가

### 3.2 Grammar & Spell Check
`tiptap-languagetool` integration or custom AI-based

**Option A: LanguageTool** (self-hosted)
- Docker 컨테이너 추가 (languagetool-server)
- 실시간 밑줄 표시 (red: spelling, blue: grammar)
- 클릭하면 수정 제안

**Option B: AI-based** (기존 AI Router 활용) ← **Recommended**
- 기존 spellcheck 프롬프트 연동 (`ai_router/prompts/spellcheck/`)
- 단락 단위 비동기 검사
- 인라인 Decoration으로 오류 표시
- 클릭 시 AI 수정 제안 + 원클릭 적용
- 과학 용어 사전 (사용자 추가 가능)

**연구 노트 가치**: 긴 실험 보고서 오타·문법 오류 자동 감지, 논문 드래프트 품질 ↑

### 3.3 Mention / Reference
`@tiptap/extension-mention`

- `@member` → 팀 멤버 언급 (기존 Member 시스템 연동)
- `#note` → 노트 간 크로스 레퍼런스 (기존 Graph/Discovery 연동)
- `$sample` → 샘플/시약 참조 (future: inventory 연동)

**연구 노트 가치**: 실험 노트에서 관련 노트, 팀원, 시료를 직접 링크

### Phase 3 Deliverables
```
frontend/
└── src/
    ├── extensions/
    │   ├── Comment/
    │   │   ├── CommentMark.ts             # Mark definition
    │   │   └── CommentThread.tsx          # Thread UI
    │   └── Mention/
    │       ├── MentionExtension.ts        # Mention node
    │       └── MentionSuggestion.tsx      # Autocomplete popup
    ├── components/editor/
    │   ├── CommentSidebar.tsx             # NEW: 코멘트 사이드바
    │   └── SpellCheckDecoration.tsx       # NEW: AI 맞춤법 데코레이션
    └── hooks/
        ├── useComments.ts                 # Comment CRUD
        └── useSpellCheck.ts              # AI spellcheck integration

backend/
└── app/
    ├── api/
    │   └── comments.py                   # NEW: Comment endpoints
    ├── models.py                         # NoteComment model
    └── migrations/
        └── versions/030_note_comments.py # NEW: comments table
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

| Phase | Duration | Milestone |
|-------|----------|-----------|
| **Phase 1**: Core Power-ups | 1 week | v2.2.0 — Typography, Search/Replace, TaskList, CodeBlock |
| **Phase 2**: Research Nodes | 2 weeks | v2.3.0 — ExperimentHeader, StatusChip, Signature |
| **Phase 3**: Review & Quality | 2 weeks | v2.4.0 — Comments, AI SpellCheck, Mentions |
| **Phase 4**: Collaboration | 3-4 weeks | v3.0.0 — Y.js real-time, Awareness, Offline |
| **Total** | ~8-9 weeks | |
