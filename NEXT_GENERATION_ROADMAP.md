# LabNote AI — Next Generation Roadmap

> **기존 기능 로드맵(ROADMAP.md) + 제품 비전(VISION.md) + UI/UX 혁신(UI_UX_INNOVATION_ROADMAP.md)을 하나의 실행 가능한 릴리스 계획으로 통합**
>
> 현재 버전: **v2.1.0** | 작성일: 2026-02-14
>
> 참조 문서:
> - [ROADMAP.md](ROADMAP.md) — 기능 중심 Phase 1-5 (Phase 1-4 대부분 완료)
> - [docs/roadmap/VISION.md](docs/roadmap/VISION.md) — 제품 비전, 7단계 파이프라인, BM, Zotero
> - [docs/roadmap/UI_UX_INNOVATION_ROADMAP.md](docs/roadmap/UI_UX_INNOVATION_ROADMAP.md) — SiYuan 분석 기반 UI/UX Phase UI-1~4
> - NotebookLM `ainote-UIUX` — 43개 소스 (아이디어 7 + 전략 3 + Deep Research + 참조 33)

---

## 목차

1. [릴리스 개요](#1-릴리스-개요)
2. [v3.0.0 — Foundation UX](#2-v140--foundation-ux)
3. [v3.1.0 — Editor + Category](#3-v150--editor--category)
4. [v3.2.0 — Zotero + External Capture](#4-v160--zotero--external-capture)
5. [v4.0.0 — Research Platform](#5-v200--research-platform)
6. [v4.1.0 — Analytics, Mobile, Scale](#6-v210--analytics-mobile-scale)
7. [카테고리 시스템 DB 설계](#7-카테고리-시스템-db-설계)
8. [비즈니스 모델 연동 (Feature Gate)](#8-비즈니스-모델-연동-feature-gate)
9. [의존성 그래프](#9-의존성-그래프)
10. [마일스톤 체크포인트](#10-마일스톤-체크포인트)
11. [아키텍처 원칙](#11-아키텍처-원칙)

---

## 1. 릴리스 개요

```
v2.1.0 (현재)     v3.0.0          v3.1.0           v3.2.0          v4.0.0             v4.1.0
  ┃               ┃               ┃                ┃               ┃                  ┃
  ┣━ Phase 1-4 ✅  ┣━ Foundation   ┣━ Editor        ┣━ Zotero       ┣━ Research        ┣━ Analytics
  ┃  (검색,AI,     ┃   UX          ┃  Evolution     ┃  통합         ┃  Platform        ┃  Mobile
  ┃   OCR,동기화)  ┃               ┃  + Category    ┃  + External   ┃  + 연구 블록     ┃  Scale
  ┃               ┃               ┃                ┃   Capture     ┃  + AI Ambient    ┃
```

| 버전 | 코드명 | 핵심 가치 | 과금 변화 | 타깃 |
|------|--------|----------|----------|------|
| **v3.0.0** | Foundation UX | 일상 사용 경험의 질적 도약 | 없음 (기존 무료) | 전체 사용자 |
| **v3.1.0** | Editor + Category | 멀티 문서 작업 + 카테고리 시스템 기반 | Category Tier 1 도입 | 파워 유저 |
| **v3.2.0** | Zotero + Capture | 학술 생태계 연결 + 외부 콘텐츠 | Zotero는 Pro 전용 | 연구자 |
| **v4.0.0** | Research Platform | 7단계 연구 파이프라인 실현 | Pro/Enterprise 정식 출시 | 연구실/기업 |
| **v4.1.0** | Analytics & Scale | 시각화, 모바일, 실시간 협업 | Tier 2 카테고리 확장 | 기관 |

---

## 2. v3.0.0 — Foundation UX

> 모든 사용자에게 즉시 체감되는 UX 기반 개선. 후속 버전의 모든 기능이 이 위에 구축됨.

### 2-1. 접을 수 있는 사이드바 (UI-1.1)

| 항목 | 내용 |
|------|------|
| **문제** | 사이드바 `w-64` 고정. 모바일에서 16.67% 면적 낭비. 전체 화면 편집 불가 |
| **해결** | 토글 버튼으로 아이콘 모드(w-16) 축소 / 모바일: 오버레이. `Cmd+\` |

**백엔드**: 변경 없음

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| `components/Layout.tsx` | 사이드바 상태 관리 (collapsed/expanded), 조건부 너비 |
| `components/Sidebar.tsx` | 아이콘 모드 렌더링, 호버 확장, 애니메이션 |
| `index.css` | 사이드바 전환 트랜지션 토큰 |
| 새 `hooks/useSidebarState.ts` | localStorage 기반 상태 유지 |

**의존성**: 없음 | **예상 작업량**: 2~3일

---

### 2-2. 커맨드 팔레트 (UI-1.2)

| 항목 | 내용 |
|------|------|
| **문제** | 모든 기능에 마우스 클릭 필요. 파워 유저 생산성 병목 |
| **해결** | `Cmd+K` 퍼지 검색 팔레트. 노트/페이지/AI기능/설정 즉시 접근 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| `api/notes.py` | 노트 제목 퍼지 검색 엔드포인트 (기존 search와 별도, 경량) |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `components/CommandPalette.tsx` | cmdk 라이브러리 기반 팔레트 UI |
| `components/Layout.tsx` | 글로벌 `Cmd+K` 키 리스너 |
| 새 `hooks/useCommandRegistry.ts` | 명령어 등록/검색/실행 레지스트리 |

**명령어 우선순위**:
1. 노트 열기 (제목 퍼지 검색)
2. 페이지 이동 (Search, Graph, Settings, Librarian...)
3. AI 액션 (인사이트, 맞춤법, 요약...)
4. 설정 토글 (다크 모드, 사이드바...)

**의존성**: 없음 | **예상 작업량**: 3~4일

---

### 2-3. 다크 모드 (UI-1.3)

| 항목 | 내용 |
|------|------|
| **문제** | Light only. 야간 연구자 눈의 피로 |
| **해결** | OKLch 다크 컬러 토큰 + `prefers-color-scheme` 자동 감지 + 수동 토글 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| `api/settings.py` | 사용자별 테마 설정 저장/조회 (기존 Settings 확장) |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| `index.css` | `.dark` 클래스용 OKLch 다크 토큰 세트 전체 추가 |
| `components/Layout.tsx` | `<html>` 클래스 토글 (`dark`/`light`) |
| `pages/Settings.tsx` | 테마 선택 UI (Light / Dark / System) |
| 새 `hooks/useTheme.ts` | 테마 상태 관리, system 감지, localStorage |
| 전 컴포넌트 | semantic 토큰 사용 시 자동 적용 (수동 수정 최소) |

**다크 색상 전략 (OKLch)**:
```css
--color-background: oklch(14.5% 0.015 260);  /* Deep navy-gray */
--color-foreground: oklch(92% 0.008 260);     /* Off-white */
--color-primary: oklch(65% 0.18 263);         /* Brighter violet */
--color-card: oklch(18% 0.012 260);           /* Elevated surface */
--color-border: oklch(28% 0.01 260);          /* Subtle border */
```

**의존성**: 없음 | **예상 작업량**: 3~4일

---

### 2-4. 브레드크럼 (UI-1.4)

| 항목 | 내용 |
|------|------|
| **문제** | 노트 상세에서 위치 불분명. 뒤로가기만 의존 |
| **해결** | 페이지 상단 `홈 > 노트북 > 노트 제목`. 클릭 이동 |

**백엔드**: 변경 없음 (기존 API에서 notebook 정보 이미 포함)

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `components/Breadcrumb.tsx` | shadcn/ui Breadcrumb 기반 |
| `pages/NoteDetail.tsx` 등 | 각 페이지 상단에 삽입 |

**의존성**: 없음 | **예상 작업량**: 1일

---

### 2-5. 글로벌 키보드 단축키 시스템 (UI-1.5)

| 항목 | 내용 |
|------|------|
| **문제** | 단축키가 컴포넌트별 산발적. 충돌 관리 없음 |
| **해결** | 단축키 레지스트리 + 기본 세트 + `?` 도움말 오버레이 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `hooks/useShortcuts.ts` | 중앙 레지스트리: 등록, 충돌 감지, 범위 관리 |
| 새 `components/ShortcutHelp.tsx` | `?` 키로 열리는 단축키 도움말 모달 |
| `components/Layout.tsx` | 글로벌 키 리스너 통합 |
| `pages/Settings.tsx` | 키보드 단축키 확인 탭 추가 |

**기본 단축키 세트**:
| 키 | 동작 |
|----|------|
| `Cmd+K` | 커맨드 팔레트 |
| `Cmd+\` | 사이드바 토글 |
| `Cmd+N` | 새 노트 |
| `Cmd+Shift+F` | 글로벌 검색 |
| `Cmd+,` | 설정 |
| `?` | 단축키 도움말 |
| `Escape` | 팔레트/모달 닫기 |

**의존성**: UI-1.2 (커맨드 팔레트와 함께 구축) | **예상 작업량**: 2일

---

## 3. v3.1.0 — Editor + Category

> 단일 노트 뷰에서 멀티 문서 워크스페이스로 진화. 카테고리 시스템 Tier 1 도입.

### 3-1. 멀티탭 에디터 (UI-2.1)

| 항목 | 내용 |
|------|------|
| **문제** | 노트 하나만 열 수 있음. 참조할 다른 노트는 뒤로가기 필요 |
| **해결** | 메인 영역 상단 탭 바. 열기/닫기/핀/드래그 순서 변경. 최대 8탭 |

**백엔드**: 변경 없음

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `components/TabBar.tsx` | 탭 바 UI, 핀 고정, 수정 표시(●), 드래그 |
| 새 `hooks/useTabState.ts` | 탭 상태 관리 (열림/닫힘/순서/활성), localStorage |
| `pages/NoteDetail.tsx` | 탭 컨테이너 하위로 리팩토링 |
| `components/Layout.tsx` | 탭 바 영역 삽입 |

**아키텍처**:
```
┌─ TabBar ─────────────────────────────────────────┐
│ [📌 연구 노트] [실험 기록 ●] [참고문헌] [+]       │
├──────────────────────────────────────────────────┤
│                Active Tab Content                 │
│             (NoteDetail component)                │
└──────────────────────────────────────────────────┘
```

**의존성**: UI-1.1 (사이드바 접기) | **예상 작업량**: 5~7일

---

### 3-2. 분할 화면 (UI-2.2)

| 항목 | 내용 |
|------|------|
| **문제** | "읽으면서 쓰기" 워크플로우 불가 |
| **해결** | 탭 드래그로 좌/우 2분할. 리사이즈 바. `Cmd+Shift+\` |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `components/SplitView.tsx` | 2분할 컨테이너, 리사이즈 바 |
| `components/TabBar.tsx` | 탭 → 분할 영역 드래그 이벤트 |
| `components/Layout.tsx` | 분할 레이아웃 통합 |

**의존성**: UI-2.1 (멀티탭) | **예상 작업량**: 3~4일

---

### 3-3. 문서 아웃라인 (UI-2.3)

| 항목 | 내용 |
|------|------|
| **문제** | 긴 노트에서 섹션 이동은 스크롤뿐 |
| **해결** | 우측 접기 가능 패널. H1~H6 추출, 클릭 스크롤, 현재 위치 하이라이트 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `components/OutlinePanel.tsx` | TipTap `getJSON()` → 헤더 트리 추출 |
| `pages/NoteDetail.tsx` | 아웃라인 패널 우측 삽입, Intersection Observer |

**의존성**: 없음 | **예상 작업량**: 2일

---

### 3-4. 포커스/젠 모드 (UI-2.4)

| 항목 | 내용 |
|------|------|
| **문제** | 집중 글쓰기 시 사이드바/탭/패널이 산만 |
| **해결** | `Cmd+Shift+Enter` 전체 화면 에디터. 중앙 720px. `Esc` 복귀 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| `pages/NoteDetail.tsx` | 포커스 모드 상태, 조건부 UI 숨김 |
| `components/Layout.tsx` | 전체 화면 모드 z-index 관리 |

**의존성**: UI-1.1 (사이드바 접기) | **예상 작업량**: 1~2일

---

### 3-5. [[노트 링크]] + 백링크 (UI-2.5)

| 항목 | 내용 |
|------|------|
| **문제** | 노트 간 연결이 그래프에만 존재. 본문에서 직접 참조 불가 |
| **해결** | `[[` 자동완성, 호버 미리보기, 백링크 패널 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| 새 migration `022_add_note_links.py` | `note_links` 테이블 (source_note_id, target_note_id, context_snippet) |
| 새 `api/note_links.py` | 링크 CRUD + 백링크 조회 엔드포인트 |
| `services/sync_service.py` | 동기화 시 `[[...]]` 파싱 → note_links 자동 갱신 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| TipTap 커스텀 노드 `NoteLinkNode` | `[[` 입력 시 자동완성 드롭다운, 호버 팝오버 |
| 새 `components/BacklinkPanel.tsx` | "이 노트를 참조하는 노트" 목록 |
| `pages/NoteDetail.tsx` | 백링크 패널 삽입 (아웃라인 아래 또는 탭) |

**DB 스키마**:
```sql
CREATE TABLE note_links (
    id SERIAL PRIMARY KEY,
    source_note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    context_snippet TEXT,          -- 링크 주변 텍스트 (미리보기용)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_note_id, target_note_id)
);
CREATE INDEX idx_note_links_target ON note_links(target_note_id);  -- 백링크 조회
```

**의존성**: 없음 (에디터 확장) | **예상 작업량**: 7~10일

---

### 3-6. 노트북 카테고리 시스템 — Tier 1 (UI-3.8)

| 항목 | 내용 |
|------|------|
| **문제** | 노트북이 단순 폴더. 카테고리별 특화 기능 없음 |
| **해결** | 시스템 정의 카테고리 4종 (연구 노트, 논문 리뷰, 회의록, 자유 노트) |

> 상세 DB 설계는 [섹션 7](#7-카테고리-시스템-db-설계) 참조

**백엔드**:
| 파일 | 변경 |
|------|------|
| 새 migration `023_add_notebook_category.py` | `notebooks.category` 컬럼 + `category_configs` 테이블 |
| `models.py` | `Notebook` 모델에 `category` 필드 추가 |
| 새 `services/category_service.py` | 카테고리 메타데이터 조회, 기능 매핑 |
| `api/notebooks.py` | 카테고리 CRUD 확장, 카테고리별 필터 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `components/CategoryPicker.tsx` | 노트북 생성/수정 시 카테고리 선택 UI (아이콘+설명) |
| `components/NoteList.tsx` | 카테고리별 필터/아이콘 표시 |
| `pages/NoteDetail.tsx` | 카테고리별 에디터 도구 바 분기 (향후 연구 블록 준비) |

**Tier 1 카테고리 (v3.1.0)**:
| # | 카테고리 | 아이콘 | 과금 |
|---|---------|-------|------|
| 1 | 연구 노트 | 🔬 | Free(기본) / Pro(전체) |
| 2 | 논문 리뷰 | 📄 | Free(기본) / Pro(Zotero) |
| 3 | 회의록 | 📋 | Free |
| 4 | 자유 노트 | 📝 | Free (기본값) |

**의존성**: 없음 | **예상 작업량**: 4~5일

---

## 4. v3.2.0 — Zotero + External Capture

> 학술 생태계와 연결. 외부 콘텐츠를 LabNote AI로 끌어옴.

### 4-1. Zotero 양방향 동기화 (Z-2)

| 항목 | 내용 |
|------|------|
| **문제** | 논문 관리는 Zotero, 연구 노트는 LabNote — 단절된 워크플로우 |
| **해결** | Zotero Collection ↔ LabNote 노트북 매핑 + 실시간 증분 동기화 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| 새 migration `024_add_zotero_tables.py` | `zotero_items`, `zotero_sync_state` 테이블 |
| 새 `services/zotero_sync_service.py` | Zotero Web API v3 클라이언트 (Streaming API + `since=<version>` 증분 동기화) |
| `api/settings.py` | Zotero API Key 저장/검증 엔드포인트 |
| 새 `api/zotero.py` | 동기화 트리거/상태/매핑 CRUD 엔드포인트 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| `pages/Settings.tsx` | Zotero 연결 설정 섹션 (API Key, Collection 매핑 UI) |
| 새 `hooks/useZoteroSync.ts` | 동기화 상태 폴링, 트리거 |

**DB 스키마**:
```sql
CREATE TABLE zotero_items (
    id SERIAL PRIMARY KEY,
    item_key VARCHAR(50) UNIQUE NOT NULL,
    item_type VARCHAR(50),                -- journalArticle, book, etc.
    metadata JSONB NOT NULL,              -- title, authors, year, abstract, DOI
    collection_keys JSONB,                -- Zotero Collection IDs
    linked_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
    linked_notebook_id INTEGER REFERENCES notebooks(id) ON DELETE SET NULL,
    zotero_version INTEGER NOT NULL,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_zotero_items_key ON zotero_items(item_key);
CREATE INDEX idx_zotero_items_note ON zotero_items(linked_note_id);

CREATE TABLE zotero_sync_state (
    id SERIAL PRIMARY KEY,
    library_type VARCHAR(20) NOT NULL,    -- 'user' or 'group'
    library_id VARCHAR(50) NOT NULL,
    last_version INTEGER DEFAULT 0,
    last_synced_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'idle',    -- idle, syncing, error
    error_message TEXT,
    UNIQUE(library_type, library_id)
);
```

**기술 핵심**:
- Zotero API: `https://api.zotero.org/users/{id}/items?since={version}&format=json`
- 인증: `Zotero-API-Key` 헤더
- Rate Limiting: `Backoff` 헤더 준수 + 지수 백오프
- 태그 양방향 동기화: Zotero Tags ↔ LabNote 태그 자동 매핑

**의존성**: 3-6 카테고리 시스템 (논문 리뷰 카테고리) | **예상 작업량**: 10~14일

---

### 4-2. Citation Picker (Z-1)

| 항목 | 내용 |
|------|------|
| **문제** | 인용 삽입이 수동 타이핑. 서지 정보 정확도 낮음 |
| **해결** | 에디터에서 `[@` 또는 `/cite` → Zotero 검색 팝업 → 인라인 삽입 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| `api/zotero.py` | 아이템 퍼지 검색 엔드포인트 (제목, 저자, 연도) |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| TipTap 커스텀 노드 `CitationNode` | `[@` 트리거 → 검색 팝업 → 인라인 인용 블록 |
| 새 `components/CitationPicker.tsx` | 퍼지 검색, CSL 스타일 선택, 미리보기 |

**삽입 형식**:
- 인라인: `(Author, Year)` — APA, IEEE, Chicago 등 CSL 스타일 선택
- 각주: 하단 주석 링크
- 전체 서지: 완전한 인용 텍스트

**의존성**: Z-2 (Zotero 동기화) | **예상 작업량**: 5~7일

---

### 4-3. PDF 하이라이트 가져오기 (Z-3)

| 항목 | 내용 |
|------|------|
| **문제** | Zotero PDF에서 한 작업이 LabNote로 전달되지 않음 |
| **해결** | Annotations API로 하이라이트 가져오기 → 색상별 의미 분류 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| `services/zotero_sync_service.py` | Annotations 엔드포인트 호출 + 하이라이트 파싱 |
| `api/zotero.py` | 하이라이트 가져오기 트리거 + 색상별 분류 결과 반환 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `components/HighlightImporter.tsx` | 하이라이트 목록, 색상 필터, 선택적 가져오기 |

**색상별 의미 매핑**:
| 색상 | 의미 | 노트 섹션 |
|------|------|----------|
| 🟡 노란색 | 배경 지식 | Background |
| 🟢 초록색 | 핵심 기여 | Key Contribution |
| 🔴 빨간색 | 한계/문제 | Limitations |
| 🔵 파란색 | 방법론 | Methodology |

**의존성**: Z-2 (Zotero 동기화) | **예상 작업량**: 3~4일

---

### 4-4. 참고문헌 자동 생성 (Z-4)

| 항목 | 내용 |
|------|------|
| **문제** | 인용은 있지만 참고문헌 목록은 수동 작성 |
| **해결** | 노트 내 `[@citation]` 수집 → CSL 포맷 참고문헌 자동 생성 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| `api/zotero.py` | 노트 내 인용 키 추출 → Zotero API `format=bib` → 포맷된 목록 반환 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `components/BibliographyBlock.tsx` | 자동 생성된 참고문헌 목록 렌더링, CSL 스타일 선택 |

**기능**:
- 누락 인용 자동 감지
- 인용 순서 자동 정렬 (스타일별: 알파벳/인용순)
- 내보내기 시 참고문헌 섹션 자동 첨부

**의존성**: Z-1 (Citation Picker) | **예상 작업량**: 3~4일

---

### 4-5. 외부 콘텐츠 캡처 (Phase 4-3)

| 항목 | 내용 |
|------|------|
| **문제** | URL 북마크, 학술 논문 메타데이터 수동 입력 |
| **해결** | URL → 콘텐츠 자동 추출 + arXiv/PubMed 메타데이터 파싱 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| 새 `services/content_capture_service.py` | URL → readability 추출, OG 메타데이터 파싱 |
| 새 `services/academic_metadata.py` | arXiv/PubMed/DOI API → 서지정보 자동 생성 |
| 새 `api/capture.py` | URL 제출 → 추출 결과 반환 엔드포인트 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `components/CaptureInput.tsx` | URL/DOI 입력 → 미리보기 → 노트 생성 |
| `pages/Dashboard.tsx` | "빠른 캡처" 위젯 추가 |

**의존성**: 없음 | **예상 작업량**: 5~7일

---

## 5. v4.0.0 — Research Platform

> 7단계 연구 파이프라인이 실현되는 지능형 워크스페이스. Pro/Enterprise 정식 출시.

### 5-1. 슬래시 커맨드 시스템 (UI-3.1)

| 항목 | 내용 |
|------|------|
| **문제** | 블록 삽입이 에디터 도구 바에 한정 |
| **해결** | `/` 입력 시 블록 + AI 액션 메뉴. 카테고리 인식 (연구 블록은 연구 노트에서만) |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| TipTap Slash Command 확장 | `/` 트리거, 기본 블록(h1, table, code...) + 연구 블록 + AI 액션 |
| 새 `components/SlashMenu.tsx` | 메뉴 UI, 카테고리 필터링 |

**명령어 그룹**:
```
기본 블록: /h1, /h2, /table, /code, /image, /divider
연구 블록: /hypothesis, /experiment, /result, /review-matrix, /citation (카테고리 맥락)
AI 액션:  /ai-insight, /ai-continue, /ai-translate, /ai-summarize
```

**의존성**: 없음 | **예상 작업량**: 3~4일

---

### 5-2. 연구 블록 (UI-3.2)

| 항목 | 내용 |
|------|------|
| **문제** | 실험, 가설, 결과가 자유 형식 텍스트. 구조화/연결/추적 불가 |
| **해결** | `/hypothesis`, `/experiment`, `/result`, `/review-matrix` 전용 블록 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| 새 migration `025_add_research_blocks.py` | `research_blocks` 테이블 |
| 새 `models/research_block.py` | ResearchBlock 모델 |
| 새 `api/research_blocks.py` | CRUD + 상태 관리 + 블록 간 링크 조회 |
| 새 `services/research_block_service.py` | 가설 상태 자동 전환 제안, 블록 간 관계 관리 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| TipTap 커스텀 노드 4종 | HypothesisBlock, ExperimentBlock, ResultBlock, ReviewMatrixBlock |
| 새 `components/research/` 디렉토리 | 각 블록의 렌더/편집 컴포넌트 |

**DB 스키마**:
```sql
CREATE TABLE research_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    block_type VARCHAR(30) NOT NULL,      -- hypothesis, experiment, result, review_matrix
    content JSONB NOT NULL,               -- 블록별 구조화 데이터
    status VARCHAR(30) DEFAULT 'active',  -- 가설: proposed/verifying/supported/rejected/modified
    linked_blocks JSONB DEFAULT '[]',     -- 관련 블록 ID 배열 [{id, type, relation}]
    lock_hash VARCHAR(64),                -- Immutable Lock SHA-256 해시 (null=수정 가능)
    locked_at TIMESTAMPTZ,
    locked_by INTEGER REFERENCES users(id),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_research_blocks_note ON research_blocks(note_id);
CREATE INDEX idx_research_blocks_type ON research_blocks(block_type);
CREATE INDEX idx_research_blocks_status ON research_blocks(status);
```

**블록 간 관계 모델**:
```
/hypothesis ←──── "이 가설을 검증" ────→ /experiment
                                              │
/experiment ←──── "이 실험의 결과" ────→ /result
                                              │
/result    ────── "가설 상태 변경 제안" ────→ /hypothesis (AI)
                                              │
/review-matrix ── "근거 문헌" ──────────→ /citation
```

**의존성**: 5-1 (슬래시 커맨드), 3-6 (카테고리 시스템) | **예상 작업량**: 14~20일

---

### 5-3. 프로토콜 라이브러리 (UI-3.6)

| 항목 | 내용 |
|------|------|
| **문제** | 실험 프로토콜 버전 관리 없음. 포크/비교 불가 |
| **해결** | 특수 유형 노트로 관리. 버전 발행, 포크, 체크리스트, 사용 통계 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| 새 migration `026_add_protocols.py` | `protocols`, `protocol_versions` 테이블 |
| 새 `services/protocol_service.py` | 버전 발행 (스냅샷 저장), 포크, Diff 생성 |
| 새 `api/protocols.py` | CRUD + 버전 목록 + 포크 + 사용 통계 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `pages/Protocols.tsx` | 프로토콜 라이브러리 페이지 |
| 새 `components/ProtocolEditor.tsx` | 단계별 체크리스트, 재료 목록 (단위/수량) |
| 새 `components/ProtocolVersionDiff.tsx` | 버전 간 차이점 표시 |

**DB 스키마**:
```sql
CREATE TABLE protocols (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    notebook_id INTEGER REFERENCES notebooks(id),
    origin_id INTEGER REFERENCES protocols(id),  -- 포크 원본 (NULL=원본)
    current_version INTEGER DEFAULT 1,
    usage_count INTEGER DEFAULT 0,
    fork_count INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE protocol_versions (
    id SERIAL PRIMARY KEY,
    protocol_id INTEGER REFERENCES protocols(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content JSONB NOT NULL,         -- { steps: [...], materials: [...] }
    change_summary TEXT,            -- AI 또는 사용자 입력
    is_released BOOLEAN DEFAULT FALSE,
    released_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(protocol_id, version_number)
);
```

**버전 관리 전략**:
1. **작업 중**: 자유롭게 편집 (`is_released = false`)
2. **버전 발행**: "Release v1.2" → 스냅샷 저장, 이후 수정 불가 (`is_released = true`)
3. **실험 연결**: `/experiment` 블록 생성 시 `protocol_version_id` 참조 → 당시 프로토콜 고정
4. **포크**: 원본 복제 + `origin_id` 유지 → 계보 추적

**의존성**: 5-2 (연구 블록, /experiment 연결) | **예상 작업량**: 10~14일

---

### 5-4. Immutable Lock (서명 잠금)

| 항목 | 내용 |
|------|------|
| **문제** | 연구 데이터 무결성 보장 장치 없음. GLP/GMP 규정 미준수 |
| **해결** | 블록 서명 → SHA-256 해시 → 수정 불가. 정정 블록만 추가 가능 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| `services/research_block_service.py` | `sign_and_lock()` — SHA-256 해시 생성 + lock_hash 저장 |
| `api/research_blocks.py` | PUT 요청 시 lock_hash 존재하면 403 거부. 정정 블록 추가 API |

**잠금 프로세스**:
```python
payload = f"{block.id}|{user.id}|{timestamp}|{json.dumps(block.content, sort_keys=True)}"
lock_hash = hashlib.sha256(payload.encode()).hexdigest()
```

**정정 메커니즘**:
- 잠긴 블록은 삭제/수정 불가
- "정정 블록(Correction)" 추가만 허용: 수정 사유 + 변경 내용
- 원본에 "정정됨(Corrected)" 배지 표시, 원본 내용은 그대로 보존

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 연구 블록 컴포넌트들 | 잠금 버튼, 잠금 상태 시각 피드백 (🔒 아이콘, 테두리 색상), 편집 비활성화 |
| 새 `components/CorrectionBlock.tsx` | 정정 블록 UI |

**의존성**: 5-2 (연구 블록) | **과금**: Pro 이상 | **예상 작업량**: 3~4일

---

### 5-5. 도킹 패널 시스템 (UI-3.3)

| 항목 | 내용 |
|------|------|
| **문제** | AI 패널, 관련 노트, 첨부파일이 NoteDetail에 하드코딩 |
| **해결** | 우측 도킹 영역: 아웃라인/AI/관련노트/첨부/태그/백링크 — 탭 전환 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `components/DockPanel.tsx` | 도킹 컨테이너, 패널 탭 전환, 접기/펼침 |
| 새 `hooks/useDockState.ts` | 패널 상태 (열림/닫힘/순서/활성), localStorage |
| `pages/NoteDetail.tsx` | 기존 AI/관련노트/첨부 패널을 Dock으로 리팩토링 |

**패널 종류**:
| 패널 | 아이콘 | 소스 |
|------|--------|------|
| 아웃라인 | 📝 | TipTap 헤더 추출 (UI-2.3 확장) |
| AI 어시스턴트 | 🤖 | 기존 NoteAIPanel 독립화 |
| 관련 노트 | 🔗 | pgvector 코사인 유사도 (기존) |
| 첨부파일 | 📎 | 이미지/PDF 미리보기 |
| 태그 | 🏷️ | 노트 태그 관리 |
| 백링크 | 🔙 | note_links 테이블 (UI-2.5) |

```
┌───────┬──────────────────────────┬──────────┐
│       │  TabBar                  │ 📝🤖🔗📎 │
│ Side  │  ─────────────────────── │──────────│
│ bar   │                          │ Active   │
│       │     Editor Content       │ Panel    │
│       │                          │ Content  │
└───────┴──────────────────────────┴──────────┘
```

**의존성**: UI-2.1 (멀티탭), UI-2.3 (아웃라인), UI-2.5 (백링크) | **예상 작업량**: 7~10일

---

### 5-6. 컨텍스트 AI 사이드바 (UI-3.5)

| 항목 | 내용 |
|------|------|
| **문제** | AI 기능은 별도 페이지나 패널에서만 접근 가능 |
| **해결** | 텍스트 선택 → 플로팅 AI 메뉴 (설명/요약/번역/이어쓰기) |

**백엔드**: 기존 AI Router 엔드포인트 활용 (context 파라미터 확장)

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| 새 `components/FloatingAIMenu.tsx` | 텍스트 선택 시 팝업 메뉴, AI 호출, 인라인 삽입 |
| `pages/NoteDetail.tsx` | 선택 이벤트 감지 + FloatingAIMenu 렌더링 |

**의존성**: 5-5 (도킹 패널, AI 결과 표시) | **예상 작업량**: 4~5일

---

### 5-7. AI Ghost Text (UI-3.4)

| 항목 | 내용 |
|------|------|
| **문제** | AI 글쓰기 지원이 명시적 요청 기반. 흐름 단절 |
| **해결** | 타이핑 중 AI가 다음 문장을 회색으로 제안. Tab 수락. 카테고리 인식 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| `api/ai.py` | 경량 completion 엔드포인트 (디바운스, 짧은 응답, 빠른 모델) |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| TipTap 확장 `GhostTextExtension` | 입력 디바운스(500ms) → AI 호출 → 회색 인라인 텍스트 → Tab 수락 |

**의존성**: 5-1 (슬래시 커맨드) | **과금**: Pro 이상 | **예상 작업량**: 5~7일

---

### 5-8. 평가 인프라 (Phase 5-1, 5-2, 5-3)

| 항목 | 내용 |
|------|------|
| **문제** | AI/검색 품질을 객관적으로 측정할 수단 없음 |
| **해결** | A/B 평가 프레임워크 + 검색 품질 메트릭 대시보드 + 사용자 피드백 루프 |

**백엔드**:
| 파일 | 변경 |
|------|------|
| 새 `services/evaluation_service.py` | A/B 테스트 프레임워크, 합성 데이터 생성 (FictionalHot 패턴) |
| 새 `services/quality_metrics.py` | Correctness vs Utility 분리 메트릭 수집 |
| 새 `api/evaluation.py` | 평가 대시보드 데이터 API, 피드백 수집 API |
| 새 migration `027_add_evaluation.py` | `evaluation_sessions`, `user_feedback` 테이블 |

**프론트엔드**:
| 파일 | 변경 |
|------|------|
| `pages/Settings.tsx` (Admin 탭) | 검색 품질 대시보드 (차트, Correctness/Utility 분리) |
| 검색 결과 / AI 응답 컴포넌트 | 엄지 👍👎 피드백 버튼 |

**의존성**: 없음 (독립) | **예상 작업량**: 10~14일

---

## 6. v4.1.0 — Analytics, Mobile, Scale

> 시각화, 모바일 실험실 모드, 실시간 협업, Tier 2 카테고리 확장.

### 6-1. Knowledge Growth Heatmap (UI-4.1)

| 항목 | 내용 |
|------|------|
| **설명** | GitHub 잔디 스타일 활동 히트맵. 카테고리/멤버 필터 |

**백엔드**: `activity_logs` 테이블 기반 집계 API

**프론트엔드**: 새 `components/KnowledgeHeatmap.tsx` — SVG 그리드, 툴팁, 필터

**의존성**: 없음 | **예상 작업량**: 3일

---

### 6-2. 노트 성숙도 가든 (UI-4.2)

| 항목 | 내용 |
|------|------|
| **설명** | 🌱→🌿→🌲 디지털 가든 대시보드. AI가 성숙도 자동 판단 + 성장 제안 |

**백엔드**: 새 `services/maturity_service.py` — 노트 크기/링크 수/편집 빈도 기반 점수

**프론트엔드**: 새 `components/MaturityGarden.tsx` — 카드 그리드, 아이콘 단계, AI 제안

**의존성**: UI-2.5 (링크 데이터) | **예상 작업량**: 4일

---

### 6-3. Research Timeline (UI-4.3)

| 항목 | 내용 |
|------|------|
| **설명** | 시간 축 연구 진행 시각화. 가설→실험→결과 자동 배치 |

**프론트엔드**: 새 `components/ResearchTimeline.tsx` — 수평 타임라인, 블록 타입별 아이콘

**의존성**: 5-2 (연구 블록 데이터) | **예상 작업량**: 5일

---

### 6-4. Team Insight Dashboard (UI-4.4)

| 항목 | 내용 |
|------|------|
| **설명** | 카테고리 분포, 연결 밀도, 멤버 기여, 트렌드 키워드, AI 협업 제안 |

**백엔드**: 새 `api/team_insights.py` — 집계 쿼리 + AI 분석

**프론트엔드**: 새 `pages/TeamDashboard.tsx` — 차트(Recharts), 멤버 카드, AI 제안

**의존성**: 3-6 (카테고리) | **과금**: Enterprise | **예상 작업량**: 7~10일

---

### 6-5. Personal Analytics (UI-4.5)

| 항목 | 내용 |
|------|------|
| **설명** | 월간 요약, 추이 차트, 성취 배지, AI 종합 리뷰 제안 |

**프론트엔드**: 새 `pages/PersonalAnalytics.tsx` — 주간/월간 통계, 배지 시스템

**의존성**: 6-1 (히트맵 데이터) | **예상 작업량**: 4일

---

### 6-6. Lab Mode — 모바일 (UI-4.6)

| 항목 | 내용 |
|------|------|
| **설명** | 큰 버튼(64px), 카메라 직촬+OCR, 음성→텍스트, 데이터 입력 폼 |

**프론트엔드**: 새 `pages/LabMode.tsx` — 반응형, 터치 최적화, PWA 매니페스트

**의존성**: 5-2 (연구 블록, /experiment) | **예상 작업량**: 10~14일

---

### 6-7. 실시간 협업 편집 (UI-4.9)

| 항목 | 내용 |
|------|------|
| **설명** | 동시 편집, 커서 프레전스. TipTap Collaboration (Yjs CRDT) |

**백엔드**:
| 파일 | 변경 |
|------|------|
| 새 `services/collaboration_service.py` | WebSocket 서버 + Yjs 문서 동기화 |

**프론트엔드**: TipTap Collaboration 확장 + Yjs WebSocket Provider

**의존성**: UI-2.1 (멀티탭) | **예상 작업량**: 14~20일

---

### 6-8. Paper Draft Assistant (UI-4.10)

| 항목 | 내용 |
|------|------|
| **설명** | 프로젝트 블록 수집 → 섹션별 AI 초안 (Intro←리뷰, Methods←프로토콜, Results←결과) |

**백엔드**: 새 `services/paper_draft_service.py` — 블록 수집 + 섹션 매핑 + AI 생성

**프론트엔드**: 새 `pages/PaperDraft.tsx` — 섹션별 편집, 인용 자동 삽입, Word/LaTeX/PDF 내보내기

**의존성**: 5-2 (연구 블록), 5-3 (프로토콜), Z-1 (Citation Picker) | **과금**: Pro 이상 | **예상 작업량**: 14~20일

---

### 6-9. Tier 2 카테고리 확장

| # | 카테고리 | 아이콘 | 특화 기능 | 과금 |
|---|---------|-------|----------|------|
| 5 | 프로젝트 관리 | 📊 | 간트 차트, 마일스톤, 예산 추적 | Pro |
| 6 | 특허/IP | 🔒 | 발명 신고서, 선행기술 검색, 타임스탬프 증명 | Enterprise |
| 7 | 교육/세미나 | 🎓 | 강의 노트, 퀴즈 생성, 과제 관리 | Pro |
| 8 | 데이터 분석 | 📈 | CSV 임포트, 인라인 차트, 통계 블록 | Pro |
| 9 | 장비 관리 | 🔧 | 장비 로그, 캘리브레이션, 유지보수 일정 | Enterprise |
| 10 | 안전/규정 | ⚠️ | MSDS, 체크리스트, 사고 보고서 | Enterprise |
| 11 | 과제/지원금 | 💰 | 신청서 템플릿, 연구비, 성과 보고서 | Enterprise |

**구현**: `category_configs` 테이블에 시드 데이터 추가 + 카테고리별 전용 블록/템플릿

**의존성**: 3-6 (카테고리 시스템) | **예상 작업량**: 카테고리당 5~10일

---

## 7. 카테고리 시스템 DB 설계

### 핵심 원칙

**카테고리 = 기능 패키지 = 과금 단위**

카테고리는 사용자 임의 입력이 아닌 시스템 정의. 노트북 레벨에서 바인딩되어 해당 노트북 내 모든 노트가 카테고리 기능을 상속.

### 스키마

```sql
-- ① 기존 notebooks 테이블 확장
ALTER TABLE notebooks
    ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'FREE_NOTE';

-- category 허용 값은 애플리케이션 레벨에서 Enum으로 관리
-- DB ENUM 대신 CHECK 제약조건 사용 (Tier 2 확장 용이)
ALTER TABLE notebooks
    ADD CONSTRAINT chk_notebooks_category
    CHECK (category IN (
        -- Tier 1 (v3.1.0)
        'RESEARCH_NOTE', 'PAPER_REVIEW', 'MEETING_NOTE', 'FREE_NOTE',
        -- Tier 2 (v4.1.0)
        'PROJECT_MGMT', 'IP_PATENT', 'EDUCATION', 'DATA_ANALYSIS',
        'EQUIPMENT_MGMT', 'SAFETY_COMPLIANCE', 'GRANT_FUNDING'
    ));

CREATE INDEX idx_notebooks_category ON notebooks(category);

-- ② 카테고리 메타데이터 (시드 데이터, 런타임 읽기 전용)
CREATE TABLE category_configs (
    id VARCHAR(50) PRIMARY KEY,           -- 'RESEARCH_NOTE'
    display_name VARCHAR(100) NOT NULL,   -- '연구 노트'
    display_name_en VARCHAR(100),         -- 'Research Note'
    icon VARCHAR(10) NOT NULL,            -- '🔬'
    tier INTEGER NOT NULL DEFAULT 1,      -- 1 = Core, 2 = Extended
    min_plan VARCHAR(20) NOT NULL,        -- 'FREE', 'PRO', 'ENTERPRISE'
    allowed_blocks JSONB DEFAULT '[]',    -- ['/hypothesis', '/experiment', '/result']
    default_template JSONB,               -- 기본 노트 템플릿 JSON
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- ③ 기능 권한 매트릭스 (카테고리 × 기능 × 과금)
CREATE TABLE feature_gates (
    id SERIAL PRIMARY KEY,
    feature_key VARCHAR(100) UNIQUE NOT NULL,  -- 'IMMUTABLE_LOCK', 'ZOTERO_SYNC', 'AI_GHOST_TEXT'
    display_name VARCHAR(200) NOT NULL,
    min_plan VARCHAR(20) NOT NULL,             -- 필요 최소 플랜
    allowed_categories JSONB DEFAULT '["ALL"]', -- 사용 가능 카테고리 배열, ["ALL"]이면 전체
    quota_free INTEGER,                         -- Free 플랜 월간 한도 (NULL=무제한)
    quota_pro INTEGER,                          -- Pro 플랜 월간 한도
    quota_enterprise INTEGER,                   -- Enterprise 플랜 월간 한도
    is_active BOOLEAN DEFAULT TRUE
);
```

### 마이그레이션 계획

| 단계 | 마이그레이션 | 시점 |
|------|------------|------|
| 1 | `023_add_notebook_category.py` — `notebooks.category` 컬럼 추가 (DEFAULT 'FREE_NOTE') | v3.1.0 |
| 2 | `023` 내 — `category_configs` 테이블 + Tier 1 시드 데이터 4종 | v3.1.0 |
| 3 | `023` 내 — `feature_gates` 테이블 + 초기 기능 매트릭스 시드 | v3.1.0 |
| 4 | `028_add_tier2_categories.py` — Tier 2 시드 데이터 7종 추가 | v4.1.0 |

### 기존 데이터 호환

- 마이그레이션 시 모든 기존 notebooks는 `category = 'FREE_NOTE'`로 설정
- 기존 사용자는 노트북 설정에서 카테고리를 변경할 수 있음
- 카테고리 변경 시 기존 노트에는 영향 없음 (새로 생성되는 블록부터 적용)

---

## 8. 비즈니스 모델 연동 (Feature Gate)

### 8-1. 가격 구조 요약

```
┌─ Free ─────────────────────────────────────┐
│  카테고리: 자유 노트, 회의록, 연구 노트(기본), 논문 리뷰(기본)    │
│  멤버: 3명 | AI: 월 100회 | 저장: 1GB                            │
└────────────────────────────────────────────┘
┌─ Pro ($15/user/month) ─────────────────────┐
│  Free + Zotero 연동, Immutable Lock, 프로토콜 라이브러리           │
│  AI Ghost Text, Paper Draft, 프로젝트 관리, 교육, 데이터 분석      │
│  멤버: 20명 | AI: 월 1,000회 | 저장: 10GB                        │
└────────────────────────────────────────────┘
┌─ Enterprise (문의) ────────────────────────┐
│  Pro + 특허/IP, 장비 관리, 안전/규정, 과제/지원금                  │
│  GLP/GMP 감사 추적, SSO/LDAP, Team Insight Dashboard              │
│  멤버: 무제한 | AI: 무제한 | 전용 서버 배포                       │
└────────────────────────────────────────────┘
```

### 8-2. 코드 구현 전략

#### 백엔드: Gatekeeper 미들웨어

```python
# backend/app/services/feature_gate.py

from enum import IntEnum

class PlanTier(IntEnum):
    FREE = 0
    PRO = 1
    ENTERPRISE = 2

async def check_feature_access(
    db: AsyncSession,
    org_id: int,
    feature_key: str,
    notebook_category: str | None = None
) -> FeatureAccess:
    """Plan(과금) + Category(맥락) 동시 검증"""

    # 1. 조직의 현재 플랜 조회
    org = await get_org(db, org_id)
    current_plan = PlanTier[org.plan_tier]

    # 2. 기능의 최소 플랜 확인
    gate = await get_feature_gate(db, feature_key)
    required_plan = PlanTier[gate.min_plan]

    if current_plan < required_plan:
        return FeatureAccess(allowed=False, reason="UPGRADE_REQUIRED", required_plan=gate.min_plan)

    # 3. 카테고리 맥락 확인
    if notebook_category and gate.allowed_categories != ["ALL"]:
        if notebook_category not in gate.allowed_categories:
            return FeatureAccess(allowed=False, reason="CATEGORY_MISMATCH")

    # 4. Quota 확인
    quota_limit = getattr(gate, f"quota_{org.plan_tier.lower()}")
    if quota_limit is not None:
        usage = await get_monthly_usage(db, org_id, feature_key)
        if usage >= quota_limit:
            return FeatureAccess(allowed=False, reason="QUOTA_EXCEEDED", limit=quota_limit, used=usage)

    return FeatureAccess(allowed=True)
```

#### 프론트엔드: useFeatureGate 훅

```typescript
// frontend/src/hooks/useFeatureGate.ts

export function useFeatureGate(notebookCategory?: string) {
  const { organization } = useOrganization();

  const checkAccess = (featureKey: string): FeatureAccess => {
    const gate = FEATURE_MATRIX[featureKey];
    const planLevels = { FREE: 0, PRO: 1, ENTERPRISE: 2 };

    // 플랜 체크
    if (planLevels[organization.planTier] < planLevels[gate.minPlan]) {
      return { allowed: false, reason: 'UPGRADE_REQUIRED', requiredPlan: gate.minPlan };
    }

    // 카테고리 체크
    if (notebookCategory && !gate.allowedCategories.includes('ALL')) {
      if (!gate.allowedCategories.includes(notebookCategory)) {
        return { allowed: false, reason: 'CATEGORY_MISMATCH' };
      }
    }

    return { allowed: true };
  };

  return { checkAccess };
}
```

### 8-3. 기능별 과금 경계

| 기능 | Free | Pro | Enterprise |
|------|------|-----|-----------|
| 자유 노트 / 회의록 | ✅ 무제한 | ✅ | ✅ |
| 연구 노트 (기본) | ✅ 제한적 | ✅ 전체 | ✅ |
| 논문 리뷰 (기본) | ✅ 수동 입력만 | ✅ Zotero | ✅ |
| AI 인사이트/검색QA | ✅ 월 100회 | ✅ 월 1,000회 | ✅ 무제한 |
| Zotero 동기화 | ❌ | ✅ | ✅ |
| Immutable Lock | ❌ | ✅ | ✅ |
| AI Ghost Text | ❌ | ✅ | ✅ |
| 프로토콜 라이브러리 | ❌ | ✅ | ✅ |
| Paper Draft Assistant | ❌ | ✅ | ✅ |
| 특허/IP 카테고리 | ❌ | ❌ | ✅ |
| 장비/안전/과제 카테고리 | ❌ | ❌ | ✅ |
| GLP/GMP 감사 추적 | ❌ | ❌ | ✅ |
| Team Insight Dashboard | ❌ | ❌ | ✅ |
| SSO/LDAP | ❌ | ❌ | ✅ |
| 멤버 수 | 3명 | 20명 | 무제한 |

### 8-4. 과금 도입 시점

| 시점 | 변화 |
|------|------|
| v2.1.0 (현재) | 과금 없음. 모든 기능 무료 |
| v3.1.0 | 카테고리 시스템 + feature_gates 테이블 도입. 아직 무료. 인프라만 준비 |
| v3.2.0 | Zotero 기능에 "Pro 전용" 배지 표시. 아직 실제 과금 없음 (Early Adopter) |
| v4.0.0 | **Pro/Enterprise 정식 출시**. Stripe 연동. 기존 사용자 6개월 Grace Period |
| v4.1.0 | Tier 2 카테고리 + Enterprise 기능 전면 가동 |

---

## 9. 의존성 그래프

```
v3.0.0 Foundation UX
═══════════════════════════════════════════════════════════════
  [2-1 사이드바] ─────────────→ [3-1 멀티탭] ──→ [3-2 분할화면]
       │                              │
       └──→ [3-4 포커스 모드]         └──→ [5-5 도킹 패널] ──→ [5-6 AI 사이드바]
                                       │
  [2-2 커맨드팔레트] ──→ [2-5 단축키]  │
                                       │
  [2-3 다크 모드]                      │
                                       │
  [2-4 브레드크럼]                     │
                                       │
v3.1.0 Editor + Category               │
═══════════════════════════════════════════════════════════════
  [3-3 아웃라인] ───────────────────────┘
                                       │
  [3-5 노트링크+백링크] ───────────────┘
                                       │
  [3-6 카테고리 시스템] ──→ [4-1 Zotero 동기화] ──→ [4-2 Citation Picker] ──→ [4-4 참고문헌]
                    │              │
                    │              └──→ [4-3 PDF 하이라이트]
                    │
v3.2.0 Zotero       │
═══════════════════════════════════════════════════════════════
  [4-5 외부 캡처]    │
                    │
v4.0.0 Research Platform
═══════════════════════════════════════════════════════════════
  [5-1 슬래시커맨드] ──→ [5-2 연구 블록] ──→ [5-3 프로토콜] ──→ [5-4 Immutable Lock]
                              │
                              └──→ [5-7 AI Ghost Text]
                              │
  [5-8 평가 인프라] (독립)     └──→ [6-3 Research Timeline]
                                    │
v4.1.0 Analytics & Scale            │
═══════════════════════════════════════════════════════════════
  [6-1 히트맵] ──→ [6-5 개인분석]   │
  [6-2 성숙도가든]                  │
  [6-4 팀대시보드]                  │
  [6-6 Lab Mode] ←──────────────────┘
  [6-7 실시간 협업]
  [6-8 Paper Draft] ←── [5-2 연구블록] + [5-3 프로토콜] + [4-2 Citation]
  [6-9 Tier 2 카테고리]
```

### 병렬 작업 가능 그룹

**v3.0.0 내**:
- 병렬 A: 사이드바(2-1) + 브레드크럼(2-4) + 다크 모드(2-3)
- 병렬 B: 커맨드 팔레트(2-2) + 단축키(2-5)

**v3.1.0 내**:
- 병렬 A: 멀티탭(3-1) → 분할화면(3-2) (직렬)
- 병렬 B: 아웃라인(3-3) + 포커스 모드(3-4)
- 병렬 C: 노트 링크(3-5)
- 병렬 D: 카테고리 시스템(3-6)

**v3.2.0 내**:
- 병렬 A: Zotero 동기화(4-1) → Citation(4-2) → 참고문헌(4-4) (직렬)
- 병렬 B: PDF 하이라이트(4-3) (Z-2 이후)
- 병렬 C: 외부 캡처(4-5) (독립)

**v4.0.0 내**:
- 병렬 A: 슬래시 커맨드(5-1) → 연구 블록(5-2) → 프로토콜(5-3) → Immutable Lock(5-4) (직렬)
- 병렬 B: 도킹 패널(5-5) → AI 사이드바(5-6) (직렬)
- 병렬 C: 평가 인프라(5-8) (독립)
- 병렬 D: AI Ghost Text(5-7) (5-1 이후)

---

## 10. 마일스톤 체크포인트

각 버전의 **"이걸 할 수 있으면 출시"** 기준:

### v3.0.0 — Foundation UX ✅ 기준

| # | 체크포인트 | 검증 방법 |
|---|----------|----------|
| 1 | 사이드바를 접고 전체 화면으로 노트를 편집할 수 있다 | `Cmd+\` 토글 확인 |
| 2 | `Cmd+K`로 노트를 이름으로 찾아 열 수 있다 | 퍼지 검색 정확도 |
| 3 | 다크 모드에서 모든 페이지가 읽기 쉽다 | 전 페이지 스크린샷 리뷰 |
| 4 | 현재 위치를 브레드크럼으로 확인할 수 있다 | 노트 상세 페이지 |
| 5 | `?`를 누르면 사용 가능한 단축키가 표시된다 | 오버레이 확인 |

### v3.1.0 — Editor + Category ✅ 기준

| # | 체크포인트 | 검증 방법 |
|---|----------|----------|
| 1 | 노트 3개를 동시에 탭으로 열어 전환할 수 있다 | 탭 열기/닫기/전환 |
| 2 | 두 노트를 나란히 놓고 참조하며 작성할 수 있다 | 분할 화면에서 편집 |
| 3 | `[[`로 다른 노트를 링크하고 백링크를 확인할 수 있다 | 링크 생성 + 백링크 패널 |
| 4 | 노트북에 "연구 노트" 카테고리를 지정할 수 있다 | 카테고리 선택 UI |
| 5 | 카테고리별로 노트북 목록을 필터링할 수 있다 | 필터 기능 |

### v3.2.0 — Zotero + Capture ✅ 기준

| # | 체크포인트 | 검증 방법 |
|---|----------|----------|
| 1 | Zotero API Key를 입력하면 라이브러리가 동기화된다 | 논문 목록 확인 |
| 2 | 에디터에서 `[@`로 논문을 검색하여 인용을 삽입할 수 있다 | 인라인 인용 확인 |
| 3 | Zotero PDF 하이라이트를 색상별로 가져올 수 있다 | 하이라이트 목록 |
| 4 | 노트의 모든 인용에서 참고문헌 목록이 자동 생성된다 | APA 형식 확인 |
| 5 | URL을 입력하면 콘텐츠가 자동 추출된다 | 메타데이터 확인 |

### v4.0.0 — Research Platform ✅ 기준

| # | 체크포인트 | 검증 방법 |
|---|----------|----------|
| 1 | `/hypothesis` → `/experiment` → `/result` 파이프라인이 작동한다 | 블록 간 링크 + 상태 전이 |
| 2 | 프로토콜을 버전 발행하고 실험에 연결할 수 있다 | 스냅샷 고정 확인 |
| 3 | 실험 블록을 서명 잠금하면 수정이 불가능하다 | Immutable Lock + 정정 블록 |
| 4 | 텍스트 선택 → AI 메뉴가 뜨고 인라인 삽입된다 | 플로팅 AI 동작 |
| 5 | `/` 슬래시로 연구 블록과 AI 액션을 삽입할 수 있다 | 슬래시 메뉴 확인 |
| 6 | Pro 기능에 업그레이드 유도가 표시된다 | Feature Gate UI |

### v4.1.0 — Analytics & Scale ✅ 기준

| # | 체크포인트 | 검증 방법 |
|---|----------|----------|
| 1 | Knowledge Heatmap에서 팀 활동을 확인할 수 있다 | 히트맵 시각화 |
| 2 | 모바일에서 Lab Mode로 실험을 기록할 수 있다 | 모바일 PWA 테스트 |
| 3 | 두 명이 동시에 같은 노트를 편집할 수 있다 | 실시간 커서 확인 |
| 4 | 연구 블록에서 Paper Draft를 생성할 수 있다 | 섹션별 초안 + 인용 |
| 5 | Tier 2 카테고리 (프로젝트 관리, 특허/IP...)가 작동한다 | Enterprise 기능 확인 |

---

## 11. 아키텍처 원칙

### 연구 논문에서 도출 (ROADMAP.md 계승)

1. **Neural reranking > Lexical matching** — 하이브리드 검색 유지 (ReSeek)
2. **Checklist decomposition은 보편적** — 모든 AI 응답에 품질 게이트 (Web-Shepherd)
3. **Process reward > Outcome reward** — 중간 단계 평가 (Web-Shepherd)
4. **Self-correction은 비용 효율적** — JUDGE 패턴 유지 (ReSeek)

### 제품 설계 원칙 (VISION.md 계승)

5. **Research-Native** — 범용 노트가 아닌 연구 프로세스 최적화
6. **Category = Feature** — 카테고리가 기능을 결정, 기능이 가치를 만들고, 가치가 과금을 정당화
7. **AI is Ambient** — AI가 에디터 안에서 자연스럽게 동작 (별도 페이지 X)
8. **Progressive Disclosure** — 기본은 심플, 파워 기능은 Cmd+K/슬래시/단축키
9. **Context Preservation** — 탭, 분할, 패널로 맥락 전환 최소화
10. **Keyboard First** — 모든 핵심 동작을 키보드로 완료 가능
11. **Bottom-Up Growth** — 대학 무료 → 기업 Pro → 기관 Enterprise
12. **Self-Hosted Trust** — 데이터가 사용자의 서버를 떠나지 않음

---

## 전체 예상 작업량 요약

| 버전 | 기능 수 | 총 예상 일수 | 비고 |
|------|--------|-------------|------|
| **v3.0.0** | 5 | 11~14일 | 프론트엔드 위주, 병렬 작업 가능 |
| **v3.1.0** | 6 | 21~28일 | 멀티탭+노트링크가 핵심 난이도 |
| **v3.2.0** | 5 | 26~36일 | Zotero 동기화가 핵심 난이도 |
| **v4.0.0** | 8 | 46~64일 | 연구 블록+프로토콜이 핵심 |
| **v4.1.0** | 9+ | 61~90일 | 실시간 협업+Paper Draft가 핵심 |

---

*이 로드맵은 다음 문서들의 통합입니다:*
- *[ROADMAP.md](ROADMAP.md) — 기능 중심 Phase 1-5*
- *[docs/roadmap/VISION.md](docs/roadmap/VISION.md) — 제품 비전 + BM + 7단계 파이프라인*
- *[docs/roadmap/UI_UX_INNOVATION_ROADMAP.md](docs/roadmap/UI_UX_INNOVATION_ROADMAP.md) — SiYuan 분석 기반 UI/UX*
- *NotebookLM `ainote-UIUX` 43개 소스 — 인지과학, 경쟁 분석, 기술 설계*

*작성일: 2026-02-14*
