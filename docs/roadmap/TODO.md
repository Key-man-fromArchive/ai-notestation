# LabNote AI — Master TODO

> 리서치 기반 로드맵 종합 TODO | 현재 v2.0.0 | 최종 갱신: 2026-02-16

## Overview

| Phase | 버전 | 테마 | 태스크 | 예상 기간 | 상세 |
|-------|------|------|--------|-----------|------|
| 1 | v1.1.0 | 검색 고도화 | 3 | ~9일 | ✅ [phase1](phase1-search-enhancement.md) |
| 2 | v1.2.0 | AI 품질 게이트 | 3 | ~8일 | ✅ [phase2](phase2-ai-quality-gate.md) |
| 3 | v1.3.1 | 콘텐츠 인텔리전스 | 3 | ~7일 | ✅ [phase3](phase3-content-intelligence.md) |
| 4 | v1.6.0 | 멀티모달 확장 | 4 | ~10일 | ✅ [phase4](phase4-multimodal.md) |
| 5 | v2.0.0 | 평가 인프라 | 3 | ~11일 | ✅ [phase5](phase5-evaluation-infra.md) |

---

## Quick Wins (즉시 착수 가능, 고효과)

- [x] **3-1. Auto-Tagging** — ✅ 완료 (커밋 94ba748)
- [x] **1-1. Why this matched** — ✅ 완료 (v1.2.0+)
- [x] **3-3. Rediscovery** — ✅ 완료 (커밋 19f49e3)

---

## Phase 1 — 검색 고도화 (v1.3.0)

### 1-1. 검색 결과 설명 ("Why this matched") `★★☆ 난이도` ✅ 완료
- [x] Backend: SearchResult에 MatchSource 필드 추가
- [x] Backend: FTS — ts_headline에서 매칭 키워드 추출
- [x] Backend: Semantic — 코사인 유사도 점수 보존
- [x] Backend: RRF 병합 시 소스별 기여도 추적
- [x] Backend: API 응답 SearchResultResponse 확장
- [x] Frontend: NoteCard에 매칭 설명 UI
- [x] Frontend: Search 페이지 엔진 뱃지 + 매칭 키워드 표시

### 1-2. Adaptive Search Strategy `★★★ 난이도` ✅ 완료
- [x] Backend: SearchJudge 모듈 생성 (`search/judge.py`)
- [x] Backend: HybridSearchEngine에 Judge 통합
- [x] Backend: adaptive 파라미터 추가 (`search/params.py`)
- [x] Backend: 메트릭 로깅 (semantic 스킵 비율)
- [x] Frontend: 적응형 검색 파라미터 UI
- [x] Post-retrieval 전환 (2026-02-13) — ReSeek 논문 post-retrieval JUDGE 패턴 적용

### 1-3. Multi-turn Search Refinement `★★★★ 난이도` ✅
- [x] Backend: SearchRefiner 모듈 (`search/refinement.py`)
- [x] Backend: 리파인 프롬프트 (`ai_router/prompts/search_refine.py`)
- [x] Backend: POST /search/refine 엔드포인트
- [x] Frontend: "AI로 더 찾기" 버튼 + 피드백 옵션 + 리파인 히스토리

---

## Phase 2 — AI 품질 게이트 (v1.4.0)

### 2-1. Checklist-Based Quality Gate `★★★ 난이도` ✅ 완료
- [x] Backend: QualityChecklist + 태스크별 체크리스트 정의
- [x] Backend: 자가 평가 프롬프트 (`ai_router/prompts/quality_eval.py`)
- [x] Backend: /chat에 Quality Gate 통합 (평가 → 재생성)
- [x] Backend: /stream에 quality SSE 이벤트 추가
- [x] Backend: quality_gate_enabled 설정
- [x] Frontend: AIChat, NoteAIPanel에 품질 뱃지
- [x] Frontend: 체크리스트 상세 + 재생성 버튼

### 2-2. Search QA 품질 평가 `★★★ 난이도` ✅ 완료
- [x] Backend: SearchQAEvaluator (Correctness + Utility)
- [x] Backend: Search QA 전용 평가 프롬프트 (`search_qa_eval.py`)
- [x] Backend: qa_evaluation SSE 이벤트
- [x] Frontend: 신뢰도 뱃지 (높음/보통/낮음) + 소스 커버리지 + 근거 이슈

### 2-3. 스트리밍 중간 품질 체크 `★★★★ 난이도` ✅ 완료
- [x] Backend: StreamMonitor (`ai_router/stream_monitor.py`)
- [x] Backend: 휴리스틱 체크 (언어 불일치, 반복 감지, 형식 체크)
- [x] Backend: `/stream` event_generator()에 모니터 통합 + retry 루프
- [x] Frontend: retry/stream_warning 이벤트 핸들링 + 재시도 알림 UI

---

## Phase 3 — 콘텐츠 인텔리전스 (v1.5.0)

### 3-1. Auto-Tagging `★★☆ 난이도` ⚡ Quick Win ✅ 완료
- [x] Backend: AutoTagger 서비스 (summarize 프롬프트 활용)
- [x] Backend: 동기화 훅 통합 (`sync_service.py`)
- [x] Backend: POST /notes/{id}/auto-tag, POST /notes/batch-auto-tag
- [x] Backend: auto_tag_on_sync 설정
- [x] Frontend: NoteCard 태그 뱃지
- [x] Frontend: 태그 인라인 편집
- [x] Frontend: 태그 필터 (Notes, Search 페이지)
- [x] Frontend: 배치 태깅 UI (진행률 표시)

### 3-2. 노트 간 관계 발견 `★★★ 난이도` ✅ 완료
- [x] Backend: RelatedNotesService (`services/related_notes.py`)
- [x] Backend: pgvector 코사인 유사도 검색
- [x] Backend: GET /notes/{id}/related 엔드포인트
- [x] Backend: graph_service에 유사도 기반 엣지 추가
- [x] Frontend: NoteDetail 관련 노트 패널
- [x] Frontend: DiscoveryGraph 유사도 엣지 시각화

### 3-3. 잊혀진 노트 재발견 `★★☆ 난이도` ⚡ Quick Win ✅ 완료
- [x] Backend: RediscoveryService (`services/rediscovery.py`)
- [x] Backend: 일일/컨텍스트 재발견 로직 (centroid + random sampling)
- [x] Backend: GET /api/discovery/rediscovery 엔드포인트
- [x] Frontend: Dashboard "오늘의 재발견" 카드 섹션

---

## Phase 4 — 멀티모달 확장 (v2.0.0)

### 4-1. PDF 텍스트 추출 `★★★ 난이도` ✅ 완료 (v1.2.0)
- [x] Backend: `PDFExtractor` 서비스 (`services/pdf_extractor.py`) — PyMuPDF + OCR 폴백
- [x] Backend: NoteAttachment.extracted_text/extraction_status 필드 + 마이그레이션 (017)
- [x] Backend: POST /files/{id}/extract, GET /files/{id}/text
- [x] Backend: 임베딩 파이프라인에 PDF 텍스트 포함
- [x] Frontend: PDF 텍스트 추출 UI

### 4-2. OCR + Vision 이미지 분석 시스템 `★★★★ 난이도` ✅ 완료 (v1.2.0 → v1.3.0 → v1.3.1)
- [x] Backend: `OCRService` (`services/ocr_service.py`) — 3엔진 하이브리드 + 자동 폴백 체인
  - GLM-OCR (layout_parsing, 마크다운) → PaddleOCR-VL (로컬 CPU) → AI Vision (7모델 우선순위)
  - `OCRResult` 모델: text, confidence (0-1), method (엔진/모델 ID)
- [x] Backend: NoteImage.extracted_text/extraction_status 필드 + 마이그레이션 (018)
- [x] Backend: `ImageAnalysisService` (`services/image_analysis_service.py`) — 듀얼 파이프라인 배치 프로세서
  - OCR 파이프라인 (동시성=1) + Vision 파이프라인 (동시성=8) 독립 병렬 실행
  - `asyncio.gather()` 기반 — 한쪽 실패해도 다른 파이프라인 계속
  - 완료 후 `_reindex_affected_notes()` 자동 검색 재인덱싱
  - Settings에서 Vision 모델 선택 가능 (기본: glm-4.6v)
- [x] Backend: Vision 설명 필드 (`vision_description`) + 마이그레이션 (019)
- [x] Backend: FTS/임베딩에 OCR + Vision 텍스트 포함 → 시각적 검색 가능
- [x] Backend: API — trigger/status/stats/failed 엔드포인트 + 인메모리 진행 추적
- [x] Frontend: 배치 처리 UI + 실패 상세 팝업 + Dashboard OCR/Vision 분리 현황 카드
- [x] Frontend: Settings OCR 엔진 선택, Vision 모델 선택, 배치 제어 UI

### 4-3. 외부 콘텐츠 캡처 `★★★ 난이도` ✅ 완료 (v1.4.0)
- [x] Backend: ContentCaptureService (URL → readability-lxml + html2text)
- [x] Backend: arXiv Atom API, PubMed NCBI E-utilities 메타데이터 파서
- [x] Backend: POST /capture/url, /capture/arxiv, /capture/pubmed
- [x] Frontend: Notes 페이지 "외부 캡처" 버튼 → 3탭 모달 (URL/arXiv/PubMed)

---

## Phase 5 — 평가 인프라 (v2.0.0)

### 5-1. A/B 평가 프레임워크 `★★★★★ 난이도` ✅ 완료
- [x] Backend: services/evaluation/ 디렉토리 (framework, test_generator, scorer, report)
- [x] Backend: SyntheticTestGenerator (FictionalHot 패턴)
- [x] Backend: AutoScorer (검색, QA, 요약 자동 채점)
- [x] Backend: EvaluationFramework (모델 비교 실행 + 백그라운드 진행률)
- [x] Backend: api/evaluation.py — 실행/목록/상세 엔드포인트
- [x] Frontend: Admin 평가 대시보드 (비교 차트)
- [x] DB: evaluation_runs 테이블 (마이그레이션 024)

### 5-2. 검색 품질 메트릭 `★★★ 난이도` ✅ 완료
- [x] Backend: services/search_metrics.py — fire-and-forget 이벤트 기록
- [x] Backend: search_events DB 테이블 (마이그레이션 024)
- [x] Backend: GET /admin/metrics/search 대시보드 데이터 API
- [x] Frontend: Admin Metrics 탭 (일별 검색량, 평균 소요 시간, 0-result 비율, 클릭률)

### 5-3. 사용자 피드백 루프 `★★★ 난이도` ✅ 완료
- [x] Backend: services/feedback_service.py — 피드백 집계 + 긍정률/추이
- [x] Backend: search_feedback, ai_feedback DB 테이블 (마이그레이션 024)
- [x] Backend: POST /feedback/search, POST /feedback/ai
- [x] Backend: GET /admin/feedback/summary — 기간별 요약 데이터
- [x] Frontend: 검색 결과 👍👎 피드백
- [x] Frontend: AI 응답 ★1-5 별점 + 코멘트
- [x] Frontend: Admin Feedback 탭 (7일/30일/90일 요약)

---

## 신규 파일 총 목록

### Backend
| 파일 | Phase | 설명 |
|------|-------|------|
| `search/judge.py` | 1-2 | Adaptive Search Judge |
| `search/refinement.py` | 1-3 | Multi-turn Search Refiner |
| `ai_router/prompts/search_refine.py` | 1-3 | 리파인 프롬프트 |
| `ai_router/quality_gate.py` | 2-1 | Checklist Quality Gate |
| `ai_router/prompts/quality_eval.py` | 2-1 | 자가 평가 프롬프트 |
| `ai_router/search_qa_evaluator.py` | 2-2 | Search QA Evaluator |
| `ai_router/prompts/search_qa_eval.py` | 2-2 | Search QA 평가 프롬프트 |
| `ai_router/stream_monitor.py` | 2-3 | 스트리밍 품질 모니터 |
| `services/auto_tagger.py` | 3-1 | AI 자동 태깅 |
| `services/related_notes.py` | 3-2 | 관련 노트 발견 |
| `services/rediscovery.py` | 3-3 | 잊혀진 노트 재발견 |
| `services/pdf_extractor.py` | 4-1 | PDF 텍스트 추출 |
| `services/ocr_service.py` | 4-2 | OCR 파이프라인 |
| `services/content_capture.py` | 4-3 | 외부 콘텐츠 캡처 |
| `services/evaluation/` | 5-1 | A/B 평가 프레임워크 |
| `services/metrics.py` | 5-2 | 검색 메트릭 수집 |
| `services/feedback.py` | 5-3 | 사용자 피드백 |

### DB 마이그레이션
| 마이그레이션 | Phase | 변경 |
|-------------|-------|------|
| NoteImage.ocr_text 추가 | 4-2 | 컬럼 추가 |
| NoteAttachmentText 테이블 | 4-1 | 신규 테이블 |
| SearchEvent 테이블 | 5-2 | 신규 테이블 |
| SearchFeedback 테이블 | 5-3 | 신규 테이블 |
| AIFeedback 테이블 | 5-3 | 신규 테이블 |

---

## 리서치 출처

| 출처 | 핵심 인사이트 | 적용 Phase |
|------|-------------|-----------|
| ReSeek (arxiv 2510.00568v2) | JUDGE 자기 교정, Correctness+Utility 분해 | 1-2, 2-2, 5-1 |
| Web-Shepherd (arxiv 2505.15277v1) | Checklist decomposition, Process reward | 2-1, 2-3 |
| Reseek (reseek.net) | Auto-tagging, OCR, "Why matched", Rediscovery | 1-1, 3-1, 3-3, 4-2 |
