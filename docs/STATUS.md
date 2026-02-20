# LabNote AI 프로젝트 현황

> 최종 갱신: 2026-02-20 | 현재 버전: v2.1.0

---

## 프로젝트 개요

**포지셔닝**: "Zotero로 논문 관리 → LabNote AI로 연구 → 결과가 논문"

**타깃**: 기업부설연구소 · 대학 연구실 · 기관 연구팀

**스택**: FastAPI (Python 3.12) + React 19 + Vite + TailwindCSS + shadcn/ui + PostgreSQL 16 + pgvector

**배포**: Docker Compose (self-hosted) + labnote-box 하드웨어 어플라이언스 (ODROID H4)

---

## 코드베이스 규모

| 영역 | 파일 수 | LOC |
|------|---------|-----|
| Frontend (TSX/TS) | 153 | 32,885 |
| Backend (Python) | 111 | 30,940 |
| Tests (Python) | 55 | 20,602 |
| **합계** | **319** | **84,427** |
| DB Migrations | 28 (001~027) | — |
| Git Commits | 296 | — |

---

## 인프라 상태

- Docker 컨테이너 3개: `backend` (FastAPI), `db` (PostgreSQL 16 + pgvector), `frontend` (Nginx + React)
- DB: Migration 027 (head) — English stemming combined tsvector
- **labnote-box** 하드웨어 어플라이언스: Phase 0~4 완료, 별도 repo ([labnote-box](https://github.com/Key-man-fromArchive/labnote-box))

---

## 기능 로드맵 — 전 Phase 완료

| Phase | 내용 | 버전 | 상태 |
|-------|------|------|------|
| **Phase 1** | 검색 고도화 — Why matched, Adaptive JUDGE, Multi-turn Refinement | v1.1.0 | ✅ |
| **Phase 2** | AI 품질 게이트 — Checklist QG, SearchQA 평가, 스트리밍 중간 체크 | v1.2.0 | ✅ |
| **Phase 3** | 콘텐츠 인텔리전스 — Auto-tag, 관계 그래프, Rediscovery, 인사이트 영속화 | v1.3.1 | ✅ |
| **Phase 4** | 멀티모달 — PDF, 3엔진 하이브리드 OCR, 외부 캡처, GLM-OCR 강화 | v1.6.0 | ✅ |
| **Phase 5** | 평가 인프라 — A/B eval (FictionalHot), 검색 메트릭, 피드백 루프 | v2.0.0 | ✅ |

---

## UI/UX 로드맵 (SiYuan Note 분석 기반)

| Phase | 내용 | 상태 |
|-------|------|------|
| **UI-1 Foundation** | 접을 수 있는 사이드바, 커맨드 팔레트 (Ctrl+K), 다크 모드 (Light/Dark/System), 브레드크럼, 글로벌 단축키 | ✅ 완료 |
| **UI-2 Editor** | 멀티탭 에디터, 분할 화면, 문서 아웃라인, 포커스/젠 모드 | 미착수 |
| **UI-3 Workspace** | 도킹 패널 시스템, Quick Switcher, 컨텍스트 AI 사이드바, 워크스페이스 저장 | 미착수 |
| **UI-4 Advanced** | 블록 레퍼런스 & 백링크, 인라인 AI 액션, PDF 주석, 데이터 테이블 뷰 | 미착수 |

---

## 현재 보유 기능 (v2.1.0)

### 검색 엔진
- **하이브리드 검색**: FTS (BM25 + English stemming) + Semantic (pgvector cosine)
- **RRF 병합**: Reciprocal Rank Fusion (k=60), 한국어/영어 가중치 분리
- **Adaptive JUDGE**: FTS 결과 품질 판단 → 조건부 시맨틱 실행 (비용 절감)
- **3-mode UI**: 정확히 일치 (ILIKE) / 키워드 검색 (FTS) / AI 검색 (Hybrid)
- **검색 엔진 심층 리뷰 완료** (2026-02-20): 3-AI 크로스 모델 리뷰 (Codex GPT-5.3 + Gemini Pro + Claude Opus 4.6, 7개 관점), P0 버그 3건 + P1 개선 3건 + P2 개선 4건 = 10건 수정
- **12개 파라미터 런타임 튜닝**: Settings UI에서 실시간 조정 가능

### AI
- **6개 태스크**: insight, search_qa, writing, spellcheck, template, summarize
- **4개 프로바이더**: OpenAI, Anthropic, Google, ZhipuAI (환경 변수 자동 감지)
- **SSE 스트리밍** + 품질 게이트 (Checklist QG) + 스트리밍 중간 체크 (StreamMonitor)
- **카테고리 인식 AI**: 12종 프리셋 카테고리별 프롬프트/힌트/부스트 자동 주입

### 멀티모달
- **3엔진 하이브리드 OCR**: GLM-OCR → Tesseract (로컬, 55배 속도 향상) → AI Vision 자동 폴백
- **듀얼 파이프라인 배치 분석**: OCR + Vision 독립 병렬 처리
- **PDF**: 50페이지 청크 OCR, 하이브리드 텍스트 추출, AI 요약 삽입
- **문서 지원**: HWP/HWPX (OpenHWP Rust), Word (.docx/.doc)

### 에디터
- **TipTap 리치텍스트**: KaTeX 수식, 표, 코드 블록
- **드래그앤드롭 파일 업로드** + 클립보드 붙여넣기
- **자동 저장** (3초/30초/이탈 시) + Ctrl+S 저장 버튼
- **참고문헌 삽입**: PubMed/arXiv/URL 캡처 결과를 기존 노트에 추가
- **너비 4단계 조절**

### 외부 캡처
- **URL 캡처**: readability-lxml + html2text
- **arXiv**: Atom API 메타데이터 파싱
- **PubMed 전문 체인**: PMID → PMC ID → PMC 전문 (JATS XML) → Unpaywall OA PDF 폴백

### 시각화 & 발견
- **지식 그래프**: 2D 포스 레이아웃, AI 클러스터 분석, 인사이트 영속화
- **관련 노트**: pgvector 코사인 유사도 자동 추천
- **Rediscovery**: 오래된 관련 노트 재발견
- **AI 사서**: 히스토리 + 마크다운 수식 렌더링

### 관리
- **멤버 관리**: 그룹 시스템, 배치 역할 변경/삭제, 그룹별 노트북 접근 제어
- **노트북 카테고리**: 12종 프리셋 (연구 6 + 라이프스타일 6)
- **통합 백업**: DB + 네이티브 병렬 생성, 서버 직접 복원
- **설정**: 7탭 패널 (General, AI Models, Search Engine, Data Analysis, Category, Connection, Admin)
- **Admin**: DB 백업/복원, 검색 메트릭 대시보드, 피드백 요약, 평가 대시보드
- **E2E 테스트**: Playwright 506개, 0 failures

### UX
- **사이드바**: 접기/펼치기, 아이콘 모드, 키보드 단축키
- **커맨드 팔레트**: Ctrl+K 글로벌 검색, 노트/페이지/AI 액션
- **다크 모드**: Light / Dark / System (useTheme 훅)
- **노트 목록**: 가상화 리스트 + 무한 스크롤, 정렬, 달력 썸네일, 멀티 선택 + 배치 작업
- **i18n**: 한국어/영어

---

## 하드웨어 어플라이언스 (labnote-box)

| 항목 | 상태 |
|------|------|
| 하드웨어 선정 (ODROID H4 Plus/Ultra, Intel N305) | ✅ |
| SW 스택 설계 (Ubuntu 24.04 + Docker Compose) | ✅ |
| Docker 5컨테이너 (db, backend, frontend, embedding, ocr) | ✅ |
| Setup Wizard + mDNS (labnote.local) | ✅ |
| On-device AI (ONNX Embedding + Tesseract OCR) | ✅ |
| 5단계 AI 보안 레벨 설계 | ✅ |
| Phase 0~4 구현 완료 | ✅ |
| Phase 5 Factory Image | 미구현 |
| Phase 6 Appliance Compose | 미구현 |
| 가격: Lite $299 / Pro $499 / Lab 견적 | 설계 완료 |

---

## 다음 후보

| 방향 | 핵심 기능 | 의존성 |
|------|----------|--------|
| **UI-2 Editor Evolution** | 멀티탭 에디터, 분할 화면, 문서 아웃라인, 포커스 모드 | UI-1 완료 ✅ |
| **UI-3 Workspace Intelligence** | 도킹 패널, Quick Switcher, 컨텍스트 AI 사이드바 | UI-2 필요 |
| **Zotero 통합** | Citation Picker, 양방향 동기화, 참고문헌 자동생성, 팀 라이브러리 | 독립 가능 |
| **블록 레퍼런스 & 백링크** | `[[노트]]` 양방향 링크, 백링크 패널 | DB 스키마 변경 |
| **labnote-box Phase 5~6** | Factory Image, Appliance Compose | Phase 4 완료 ✅ |
| **검색 미래 과제** | 과학 용어 사전, JUDGE 학습 기반 전환, A/B 테스트 | 독립 가능 |

---

## 핵심 아키텍처 원칙

1. **Neural reranking > Lexical matching** — hybrid 접근 (ReSeek 논문 검증)
2. **Checklist decomposition은 보편적** — 어떤 AI 모델이든 체크리스트 추가 시 품질 향상 (Web-Shepherd)
3. **Process reward > Outcome reward** — 중간 단계 평가가 더 효과적 (Web-Shepherd)
4. **Self-correction은 비용 효율적** — 경량 JUDGE 단계로 40-50% 긍정적 개입 (ReSeek)
5. **합성 데이터로 암기 바이어스 제거** — 공정 평가 (ReSeek FictionalHot)

---

## 비즈니스 모델

- **시스템 정의 카테고리 = 기능 패키지 = 과금 단위**
- Free: 기본 노트 + 검색
- Pro ($15/월): 전체 AI + 고급 검색 + OCR
- Enterprise: 팀 관리 + 보안 레벨 + 전용 지원
- **하드웨어**: Lite $299 / Pro $499 / Lab 견적

---

*상세 로드맵: [ROADMAP.md](../ROADMAP.md) | 비전: [VISION.md](roadmap/VISION.md) | UI/UX: [UI_UX_INNOVATION_ROADMAP.md](roadmap/UI_UX_INNOVATION_ROADMAP.md)*
