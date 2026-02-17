# LabNote AI Roadmap

> 리서치 기반 로드맵 — ReSeek(논문), Web-Shepherd(논문), Reseek(제품) 분석 종합
>
> 현재 버전: **v2.1.0** | 최종 갱신: 2026-02-17
>
> **상세 계획**: [docs/roadmap/](docs/roadmap/) | **마스터 TODO**: [docs/roadmap/TODO.md](docs/roadmap/TODO.md)
>
> **차세대 로드맵**: [NEXT_GENERATION_ROADMAP.md](NEXT_GENERATION_ROADMAP.md) | **차세대 TODO**: [docs/roadmap/NEXT_GEN_TODO.md](docs/roadmap/NEXT_GEN_TODO.md)

---

## 현재 보유 기능 (v2.1.0)

| 영역 | 기능 |
|------|------|
| **검색** | Hybrid Search (FTS + Trigram + Semantic), RRF 병합, 12개 파라미터 튜닝 UI |
| **AI** | 6개 태스크 (insight, search_qa, writing, spellcheck, template, summarize), SSE 스트리밍, AI 품질 게이트, 카테고리 인식 AI (프롬프트/힌트/부스트 자동 주입) |
| **AI 프로바이더** | OpenAI, Anthropic, Google, ZhipuAI 자동 감지 + OAuth |
| **멀티모달** | 3엔진 하이브리드 OCR (GLM-OCR → PaddleOCR-VL → AI Vision 자동 폴백), GLM-OCR 레이아웃 시각화, PDF 50페이지 청크 OCR, Vision 설명 생성, 듀얼 파이프라인 배치 분석, 캐시 기반 AI Insight 최적화, PDF AI 요약 삽입, **HWP/HWPX 텍스트 추출 + 내장 이미지 OCR** |
| **에디터** | Tiptap 리치텍스트, 항상 편집 가능, 자동 저장 (3초/30초/이탈 시), 너비 4단계 조절, KaTeX 수식 렌더링, **드래그앤드롭 파일 업로드**, **저장 버튼 + 단축키**, **참고문헌 삽입 (PubMed/arXiv/URL)** |
| **동기화** | Synology NoteStation 양방향 동기화, NSX 포맷 지원, 동기화 시 Notebook 테이블 자동 생성 + FK 연결 |
| **백업** | 통합 백업 시스템 — DB 백업(임베딩·OCR·Vision·설정) + 네이티브 백업(노트·이미지·첨부) 병렬 생성, StreamingResponse 대용량 안전 다운로드, 설정 백업, **서버 직접 복원** (설정/네이티브/DB/전체) |
| **그래프** | 지식 그래프 + 클러스터 AI 인사이트 영속화 + AI 사서 히스토리, 그래프 기본값 Settings 연동 |
| **평가** | A/B 평가 프레임워크 (합성 데이터, FictionalHot), 검색 품질 메트릭 대시보드, 사용자 피드백 루프 (검색 👍👎, AI ★1-5) |
| **카테고리** | 노트북 카테고리 12종 프리셋 (연구 6 + 라이프스타일 6), AI 프롬프트/힌트/부스트 자동 주입, Settings에서 편집 가능 |
| **멤버 관리** | 멤버 그룹 시스템, 배치 역할 변경/삭제, 그룹별 노트북 접근 제어 (개인 > 그룹 > 조직 우선순위) |
| **외부 캡처** | URL/arXiv/PubMed 캡처 → 노트 자동 생성, **PubMed 전문 체인 (PMC JATS XML + Unpaywall OA)**, **노트 에디터 참고문헌 삽입** |
| **노트 목록** | 가상화 리스트 + 무한 스크롤, **정렬 (수정일/생성일, 최신순/오래된순)**, **달력 스타일 썸네일** |
| **기타** | 노트 발견, 공유/협업, i18n (한/영), Settings 7탭 재구성, Admin 통합, 빈 노트 정리, 첨부파일 다운로드, E2E 테스트 506개 |
| **외부 지식** | NotebookLM CLI (`nlm`) — 프로젝트 문서 장기 보관 + 인용 기반 질의 (노트북: `labnote`) |

---

## Phase 1 — 검색 고도화 ✅ (v1.1.0)

> 핵심 근거: ReSeek 논문 — "neural reranker >> lexical matching", "self-correction으로 monotonic improvement"

### 1-1. 검색 결과 설명 ("Why this matched") ✅
- ~~검색 결과마다 **왜 매칭되었는지** 하이라이트 + 설명 표시~~
- FTS 매칭 키워드, semantic similarity 스코어, 엔진별 기여도 분해
- **구현**: `MatchSource` 모델 + SearchResult 응답 확장 + NoteCard 매칭 설명 UI

### 1-2. Adaptive Search Strategy (적응형 검색) ✅
- Phase 1(FTS) 결과를 **JUDGE** 단계로 평가 → 충분하면 Phase 2(semantic) 스킵
- ReSeek 논문의 post-retrieval JUDGE 패턴 (원본 의도): "결과 품질 판단 → 전략 분기"
- 불필요한 임베딩 호출 절감 → 속도 향상 + 비용 절감
- **구현**: `search/judge.py` — FTS 결과 커버리지 점수 계산, 임계값 미달 시에만 semantic 실행

### 1-3. Multi-turn Search Refinement ✅
- ~~첫 검색 결과 기반으로 **쿼리 자동 확장/축소**~~
- ReSeek 핵심 패턴: 1→4 턴까지 일관된 성능 향상
- **구현**: `search/refinement.py` + "AI로 더 찾기" 버튼 + 피드백 옵션 + 리파인 히스토리

---

## Phase 2 — AI 품질 게이트 ✅ (v1.2.0)

> 핵심 근거: Web-Shepherd 논문 — "checklist decomposition으로 모든 모델 품질 향상", "process reward >> outcome reward"

### 2-1. Checklist-Based AI Quality Gate ✅ (v1.2.0)
- ~~AI 응답 생성 전, 요청을 검증 가능한 체크리스트로 분해~~
- `ai_router/quality_gate.py` 구현 완료 — Settings에서 ON/OFF + 자동 재생성 토글

### 2-2. Search QA 결과 품질 평가 ✅
- ~~search_qa 응답의 **정확성(Correctness) + 유용성(Utility)** 분리 평가~~
- ReSeek의 dense reward 분해 적용
- **구현**: `SearchQAEvaluator` + 신뢰도 뱃지 (높음/보통/낮음) + 소스 커버리지 표시

### 2-3. 스트리밍 중간 품질 체크 ✅
- ~~SSE 스트리밍 도중 **중간 지점에서 품질 평가** (process reward)~~
- Web-Shepherd 핵심: process reward > outcome reward
- **구현**: `StreamMonitor` — 언어 불일치/반복 감지/형식 체크 + 자동 재시도

---

## Phase 3 — 콘텐츠 인텔리전스 ✅ (v1.3.1)

> 핵심 근거: Reseek 제품 분석 — 경쟁 제품의 핵심 차별 기능 중 우리에게 없는 것들

### 3-1. Auto-Tagging (AI 자동 태그) ✅
- ~~노트 생성/동기화 시 AI가 **자동으로 태그 생성**~~
- **구현**: `services/auto_tagger.py` — 동기화 훅 + 배치 태깅 + 태그 필터 + 인라인 편집

### 3-2. 노트 간 관계 발견 (Content Relationship Graph) ✅
- ~~기존 지식 그래프를 확장: **의미적 유사성 기반 자동 연결**~~
- **구현**: `services/related_notes.py` — pgvector 코사인 유사도 + 관련 노트 패널 + 그래프 시각화

### 3-3. 잊혀진 노트 재발견 (Rediscovery) ✅ (v1.2.0)
- ~~오래됐지만 현재 작업과 관련 있는 노트 주기적 서피스~~
- Dashboard "오늘의 재발견" 섹션, semantic similarity 기반 추천 완료

### 3-4. 그래프 인사이트 영속화 + AI 사서 히스토리 ✅ (v1.3.1)
- 그래프 클러스터 AI 분석 결과를 DB에 자동 저장 (스트리밍 완료 시)
- AI 사서 페이지(/librarian)에 History 탭 추가 — 인사이트 목록/상세/삭제
- Settings 페이지 6탭 재구성 (General, AI Models, Search Engine, Data Analysis, Connection, Admin)
- 마크다운 수식 렌더링 (KaTeX) 지원

### v1.4.1 ~ v1.6.0 추가 구현 (로드맵 외)

- **그래프 기본값 Settings 연동** (v1.4.1) — 유사도, 연결 수, 노드 수 기본값을 Settings에서 관리
- **PDF 하이브리드 텍스트 추출** (v1.4.1) — 페이지별 OCR fallback, 텍스트 레이어 부실 페이지만 선별 OCR
- **통합 백업 시스템** (v1.5.0) — DB+네이티브 병렬 생성, 네이티브 백업 목록/다운로드/삭제, StreamingResponse 1MB 청크
- **설정 백업 관리** (v1.5.0) — 목록/다운로드/삭제 API + Admin UI
- **Admin 데이터베이스 탭 통합** (v1.5.0) — 전체 백업 → 네이티브 백업 → DB 백업 → 설정 백업

---

## Phase 4 — 멀티모달 확장 ✅ (v1.3.0 ~ v1.6.0)

> 핵심 근거: Reseek 제품 (OCR, PDF), Web-Shepherd 논문 ("text-only가 더 나을 수 있다" 주의)

### 4-1. PDF 텍스트 추출 ✅ (v1.2.0)
- ~~연구 논문, eBook PDF에서 텍스트 추출 → 검색 가능하게~~
- `PDFExtractor` + 첨부 파일 인덱싱 완료

### 4-2. OCR + Vision 이미지 분석 시스템 ✅ (v1.2.0 → v1.3.0 → v1.3.1)
- ~~실험실 노트의 사진, 다이어그램, 손글씨를 검색 가능한 텍스트로~~
- **3세대에 걸친 아키텍처 진화**:
- v1.2.0: **수동 단건 OCR** — 우클릭 → 텍스트 인식, 3엔진 선택
- v1.3.0: **배치 파이프라인 도입** — OCR+Vision 일괄 처리, 검색 통합
- v1.3.1: **듀얼 파이프라인 아키텍처** — 독립 병렬 처리, 6배 처리량 향상
- **핵심 아키텍처**:
  - `OCRService` — 3엔진 하이브리드 + 자동 폴백 체인:
    - 1차: GLM-OCR (ZhipuAI layout_parsing, 마크다운 출력, 레이아웃 시각화)
    - 2차: PaddleOCR-VL (로컬 CPU, 120초 타임아웃)
    - 3차: AI Vision 클라우드 (7개 모델 우선순위: glm-4.6v-flash → claude-sonnet-4-5)
  - `GlmOcrEngine` — 네이티브 PDF 지원 + 50페이지 단위 자동 청크 처리 (v1.6.0)
  - `PDFExtractor` — GLM-OCR 엔진 시 네이티브 PDF 경로, 실패 시 하이브리드 폴백
  - `ImageAnalysisService` — 듀얼 파이프라인 배치 프로세서:
    - OCR 파이프라인 (동시성=1, GLM-OCR rate limit)
    - Vision 파이프라인 (동시성=8, 429 방지) — 이미지 설명 생성
    - `asyncio.gather()` 독립 실행 → 한 파이프라인 실패해도 다른 쪽 계속
    - 완료 후 자동 검색 재인덱싱 (`_reindex_affected_notes`)
  - Vision 설명이 검색 임베딩에 포함 → "그래프가 있는 노트" 같은 시각적 검색 가능
  - 캐시된 OCR+Vision 텍스트로 AI Insight 최적화 (이미지 재전송 불필요)
  - Settings UI: OCR 엔진 선택, Vision 모델 선택, 배치 제어, DB 기준 전체 통계

### 4-3. 외부 콘텐츠 캡처 ✅ (v1.4.0 → v2.1.0)
- URL 북마크 → 콘텐츠 자동 추출 (readability-lxml + html2text)
- 학술 논문 메타데이터: arXiv Atom API, PubMed NCBI E-utilities 자동 파싱
- 3개 POST 엔드포인트 (`/capture/url`, `/capture/arxiv`, `/capture/pubmed`)
- Notes 페이지 "외부 캡처" 버튼 → 3탭 모달 (URL/arXiv/PubMed)
- 캡처 결과 → Note 즉시 생성 + 메타데이터 content_json 저장
- **v2.1.0 PubMed 전문 체인**: PMID → PMC ID Converter → PMC 전문 (JATS XML 파싱) → Unpaywall OA PDF 링크 폴백
- **v2.1.0 노트 에디터 참고문헌 삽입**: `POST /capture/insert/{note_id}` — 기존 노트에 PubMed/arXiv/URL 캡처 결과 추가 (3탭 모달)

### 4-4. GLM-OCR 강화 ✅ (v1.6.0)
- `need_layout_visualization=True` 기본 활성화 — 인식 결과 시각화 이미지 반환
- `OCRResult`에 `layout_visualization` 필드 추가
- PDF 네이티브 지원: GLM-OCR `start_page_id`/`end_page_id`로 50페이지 단위 자동 분할 → 결과 병합
- `PDFExtractor`: `glm_ocr` 엔진일 때 네이티브 PDF 경로 사용, 실패 시 하이브리드 폴백

---

## Phase 5 — 지능형 평가 인프라 ✅ (v2.0.0)

> 핵심 근거: 두 논문 모두 — "평가 인프라가 곧 개선의 기반"

### 5-1. AI 기능 A/B 평가 프레임워크 ✅
- ~~FictionalHot 패턴: **합성 테스트 데이터로 LLM 암기 바이어스 제거**~~
- `SyntheticTestGenerator` + `AutoScorer` + `EvaluationFramework` 구현
- **구현**: `services/evaluation/` (framework, test_generator, scorer, report) + `api/evaluation.py`
- Admin 평가 대시보드 — 모델 비교 실행/결과 차트, 백그라운드 진행률 추적
- DB: `evaluation_runs` 테이블 (마이그레이션 024)

### 5-2. 검색 품질 메트릭 대시보드 ✅
- ~~Correctness vs Utility 분리 메트릭 (ReSeek의 dense reward 분해)~~
- **구현**: `services/search_metrics.py` — fire-and-forget 이벤트 기록
- 검색 이벤트 로깅 (쿼리, 결과 수, 소요 시간, 클릭 노트, JUDGE 전략)
- Admin 검색 품질 탭 (일별 검색량, 평균 소요 시간, 0-result 비율, 클릭률 추이)
- DB: `search_events` 테이블 (마이그레이션 024)

### 5-3. 사용자 피드백 루프 ✅
- ~~검색 결과 / AI 응답에 대한 사용자 평가 수집~~
- **구현**: `services/feedback_service.py` — 피드백 집계 + 긍정률/추이
- 검색 결과 👍👎 (relevant boolean) + AI 응답 ★1~5 + 코멘트
- Admin 피드백 요약 뷰 (7일/30일/90일 기간별)
- DB: `search_feedback`, `ai_feedback` 테이블 (마이그레이션 024)

### v1.6.0 ~ v2.0.0 추가 구현 (로드맵 외)

- **노트북 카테고리 시스템** (v2.0.0) — 12종 프리셋 (연구 6: labnote, daily_log, meeting, sop, protocol, reference / 라이프스타일 6: diary, travel, recipe, health, finance, hobby), 카테고리별 AI 프롬프트·추출 힌트·검색 부스트 자동 주입, Settings 카테고리 탭에서 CRUD 편집
- **멤버 그룹 및 배치 관리** (v2.0.0) — 멤버 그룹 생성·삭제, 그룹별 노트북 접근 제어 (read/write/admin), 배치 역할 변경/삭제, 개인 > 그룹 > 조직 우선순위 해석, 26개 API 테스트
- **서버 직접 복원** (v2.0.0) — 설정/네이티브/DB/전체 백업을 서버에서 직접 복원 (다운로드+업로드 불필요)
- **PDF AI 요약 삽입** (v2.0.0) — 우클릭 → "요약 삽입", SSE 스트리밍 미리보기 후 노트에 삽입
- **첨부파일 다운로드** (v2.0.0) — 파일명 클릭 다운로드 + 원본 파일명·MIME 타입 보존
- **빈 노트 조회 + 삭제** (v2.0.0) — NAS·DB 양쪽 정리, 사이드바 필터 + 일괄 삭제
- **E2E 테스트 스위트** (v2.0.0) — Playwright 기반 506개 테스트, 30+ spec 파일
- **성능 최적화** (v2.0.0) — get_note() NAS 호출 제거 (200-400ms → ~15ms)

### v2.0.0 ~ v2.1.0 추가 구현

- **HWP/HWPX 문서 지원** (v2.1.0) — OpenHWP(Rust) 기반 텍스트 추출, 내장 이미지 OCR, 검색 인덱서 통합
- **에디터 드래그앤드롭 파일 업로드** (v2.1.0) — 복수 파일 병렬 업로드 + 클립보드 붙여넣기
- **노트 저장 버튼 + 단축키** (v2.1.0) — Ctrl+S 저장 + 단축키 안내 표시
- **파일 첨부 본문 삽입 형식 개선** (v2.1.0) — `첨부[파일명]` 형태
- **AI 요약 삽입 개선** (v2.1.0) — Markdown→HTML 변환 + 모델명/시간 메타 표시
- **노트 목록 정렬** (v2.1.0) — 수정일/생성일 기준, 최신순/오래된순 토글
- **노트 목록 달력 스타일 썸네일** (v2.1.0) — 날짜 카드 + 이미지 배경
- **모든 노트 카운트 수정** (v2.1.0) — 노트북 선택과 무관하게 항상 전체 노트 수 표시
- **무한 스크롤 수정** (v2.1.0) — 20개 이상 노트 자동 로딩 복구
- **썸네일 이미지 인증** (v2.1.0) — NAS/NSX 이미지 로드 시 인증 토큰 추가

---

## 우선순위 매트릭스

| Phase | 기능 | 상태 | 영향도 | 난이도 | 근거 |
|-------|------|------|--------|--------|------|
| 1-1 | Why this matched | ✅ | ★★★★★ | ★★☆☆☆ | 구현 완료 — MatchSource + 엔진 뱃지 |
| 1-2 | Adaptive Search | ✅ | ★★★★☆ | ★★★☆☆ | 구현 완료 — post-retrieval JUDGE |
| 1-3 | Multi-turn Refinement | ✅ | ★★★☆☆ | ★★★★☆ | 구현 완료 — AI 쿼리 리파인 + 리파인 히스토리 |
| 2-1 | Checklist Quality Gate | ✅ | ★★★★★ | ★★★☆☆ | v1.2.0 구현 완료 |
| 2-2 | Search QA 품질 평가 | ✅ | ★★★★☆ | ★★★☆☆ | 구현 완료 — Correctness + Utility 분리 |
| 2-3 | 스트리밍 중간 품질 체크 | ✅ | ★★★☆☆ | ★★★★☆ | 구현 완료 — StreamMonitor 자동 재시도 |
| 3-1 | Auto-Tagging | ✅ | ★★★★☆ | ★★☆☆☆ | 구현 완료 — 동기화 훅 + 배치 + 필터 |
| 3-2 | Content Relationships | ✅ | ★★★★☆ | ★★★☆☆ | 구현 완료 — pgvector 유사도 + 그래프 |
| 3-3 | Rediscovery | ✅ | ★★★☆☆ | ★★☆☆☆ | v1.2.0 구현 완료 |
| 3-4 | 그래프 인사이트 영속화 | ✅ | ★★★☆☆ | ★★☆☆☆ | v1.3.1 구현 완료 |
| 4-1 | PDF 추출 | ✅ | ★★★★☆ | ★★★☆☆ | v1.2.0 구현 완료 |
| 4-2 | OCR + Vision 이미지 분석 | ✅ | ★★★★★ | ★★★★☆ | v1.3.1 — 3엔진 하이브리드 OCR + 듀얼 파이프라인 |
| **4-3** | **외부 콘텐츠 캡처** | **✅ v2.1.0** | ★★★★☆ | ★★★☆☆ | URL/arXiv/PubMed 캡처 + PMC 전문 + 참고문헌 삽입 |
| **4-4** | **GLM-OCR 강화** | **✅ v1.6.0** | ★★★★☆ | ★★☆☆☆ | 레이아웃 시각화 + PDF 50p 청크 |
| **5-1** | **평가 프레임워크** | **✅ v2.0.0** | ★★★★★ | ★★★★★ | 합성 데이터 + 자동 채점 + 모델 비교 |
| **5-2** | **검색 품질 메트릭** | **✅ v2.0.0** | ★★★★☆ | ★★★☆☆ | 이벤트 로깅 + 클릭률 + 0-result 추이 |
| **5-3** | **사용자 피드백 루프** | **✅ v2.0.0** | ★★★★☆ | ★★★☆☆ | 검색 👍👎 + AI ★1-5 + Admin 요약 |

---

## 핵심 아키텍처 원칙 (논문에서 도출)

1. **Neural reranking > Lexical matching** — 현재 hybrid 접근이 올바른 방향 (ReSeek 검증)
2. **Checklist decomposition은 보편적** — 어떤 AI 모델이든 체크리스트 추가 시 품질 향상 (Web-Shepherd)
3. **Process reward > Outcome reward** — 최종 결과만이 아닌 중간 단계 평가가 더 효과적 (Web-Shepherd)
4. **Text-only가 더 나을 수 있다** — 멀티모달이 항상 좋은 건 아님, 구조화된 작업은 텍스트 우선 (Web-Shepherd)
5. **Generative scoring > Classification** — next-token prediction 기반 평가가 OOD 일반화에 강함 (Web-Shepherd)
6. **Self-correction은 비용 효율적** — 경량 JUDGE 단계로 40-50% 긍정적 개입 달성 (ReSeek)
7. **합성 데이터로 암기 바이어스 제거** — 모델 크기 우위가 사라짐, 공정 평가 가능 (ReSeek FictionalHot)

---

## 경쟁 포지셔닝

```
LabNote AI의 차별화 = Self-hosted(Synology) + Multi-provider AI + 연구자 특화

vs Reseek (SaaS)     → 데이터 주권, AI 프로바이더 선택, 도메인 특화 기능
vs Notion AI          → Synology 생태계 통합, 실험실/연구 워크플로우
vs Obsidian           → 서버 사이드 AI, 하이브리드 검색, 팀 협업
```

---

*이 로드맵은 아래 리서치를 기반으로 작성되었습니다:*
- *ReSeek: Self-Correcting Search Agents (Tencent/Tsinghua, arxiv 2510.00568v2)*
- *Web-Shepherd: PRMs for Web Agents (Yonsei/CMU, arxiv 2505.15277v1)*
- *Reseek Product Analysis (reseek.net)*

*UI/UX 혁신 로드맵은 별도 문서를 참고하세요:*
- *[UI/UX Innovation Roadmap](docs/roadmap/UI_UX_INNOVATION_ROADMAP.md) — SiYuan Note 분석 기반 Phase UI-1~4*
