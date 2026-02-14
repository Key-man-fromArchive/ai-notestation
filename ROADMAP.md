# LabNote AI Roadmap

> 리서치 기반 로드맵 — ReSeek(논문), Web-Shepherd(논문), Reseek(제품) 분석 종합
>
> 현재 버전: **v1.5.1** | 최종 갱신: 2026-02-14
>
> **상세 계획**: [docs/roadmap/](docs/roadmap/) | **마스터 TODO**: [docs/roadmap/TODO.md](docs/roadmap/TODO.md)
>
> **차세대 로드맵**: [NEXT_GENERATION_ROADMAP.md](NEXT_GENERATION_ROADMAP.md) | **차세대 TODO**: [docs/roadmap/NEXT_GEN_TODO.md](docs/roadmap/NEXT_GEN_TODO.md)

---

## 현재 보유 기능 (v1.5.1)

| 영역 | 기능 |
|------|------|
| **검색** | Hybrid Search (FTS + Trigram + Semantic), RRF 병합, 12개 파라미터 튜닝 UI |
| **AI** | 6개 태스크 (insight, search_qa, writing, spellcheck, template, summarize), SSE 스트리밍, AI 품질 게이트 |
| **AI 프로바이더** | OpenAI, Anthropic, Google, ZhipuAI 자동 감지 + OAuth |
| **멀티모달** | 3엔진 하이브리드 OCR (GLM-OCR → PaddleOCR-VL → AI Vision 자동 폴백), Vision 설명 생성, 듀얼 파이프라인 배치 분석, 캐시 기반 AI Insight 최적화 |
| **에디터** | Tiptap 리치텍스트, 항상 편집 가능, 자동 저장 (3초/30초/이탈 시), 너비 4단계 조절, KaTeX 수식 렌더링 |
| **동기화** | Synology NoteStation 양방향 동기화, NSX 포맷 지원 |
| **백업** | 통합 백업 시스템 — DB 백업(임베딩·OCR·Vision·설정) + 네이티브 백업(노트·이미지·첨부) 병렬 생성, StreamingResponse 대용량 안전 다운로드, 설정 백업 |
| **그래프** | 지식 그래프 + 클러스터 AI 인사이트 영속화 + AI 사서 히스토리, 그래프 기본값 Settings 연동 |
| **기타** | 노트 발견, 공유/협업, i18n (한/영), 가상화 리스트, Settings 6탭 재구성, Admin 통합 |
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

### v1.4.1 ~ v1.5.1 추가 구현 (로드맵 외)

- **그래프 기본값 Settings 연동** (v1.4.1) — 유사도, 연결 수, 노드 수 기본값을 Settings에서 관리
- **PDF 하이브리드 텍스트 추출** (v1.4.1) — 페이지별 OCR fallback, 텍스트 레이어 부실 페이지만 선별 OCR
- **통합 백업 시스템** (v1.5.0) — DB+네이티브 병렬 생성, 네이티브 백업 목록/다운로드/삭제, StreamingResponse 1MB 청크
- **설정 백업 관리** (v1.5.0) — 목록/다운로드/삭제 API + Admin UI
- **Admin 데이터베이스 탭 통합** (v1.5.0) — 전체 백업 → 네이티브 백업 → DB 백업 → 설정 백업

---

## Phase 4 — 멀티모달 확장 (v1.3.0 ~ 진행 중)

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
    - 1차: GLM-OCR (ZhipuAI layout_parsing, 마크다운 출력)
    - 2차: PaddleOCR-VL (로컬 CPU, 120초 타임아웃)
    - 3차: AI Vision 클라우드 (7개 모델 우선순위: glm-4.6v-flash → claude-sonnet-4-5)
  - `ImageAnalysisService` — 듀얼 파이프라인 배치 프로세서:
    - OCR 파이프라인 (동시성=1, GLM-OCR rate limit)
    - Vision 파이프라인 (동시성=8, 429 방지) — 이미지 설명 생성
    - `asyncio.gather()` 독립 실행 → 한 파이프라인 실패해도 다른 쪽 계속
    - 완료 후 자동 검색 재인덱싱 (`_reindex_affected_notes`)
  - Vision 설명이 검색 임베딩에 포함 → "그래프가 있는 노트" 같은 시각적 검색 가능
  - 캐시된 OCR+Vision 텍스트로 AI Insight 최적화 (이미지 재전송 불필요)
  - Settings UI: OCR 엔진 선택, Vision 모델 선택, 배치 제어, DB 기준 전체 통계

### 4-3. 외부 콘텐츠 캡처 ✅ (v1.4.0)
- URL 북마크 → 콘텐츠 자동 추출 (readability-lxml + html2text)
- 학술 논문 메타데이터: arXiv Atom API, PubMed NCBI E-utilities 자동 파싱
- 3개 POST 엔드포인트 (`/capture/url`, `/capture/arxiv`, `/capture/pubmed`)
- Notes 페이지 "외부 캡처" 버튼 → 3탭 모달 (URL/arXiv/PubMed)
- 캡처 결과 → Note 즉시 생성 + 메타데이터 content_json 저장

---

## Phase 5 — 지능형 평가 인프라 (예정)

> 핵심 근거: 두 논문 모두 — "평가 인프라가 곧 개선의 기반"

### 5-1. AI 기능 A/B 평가 프레임워크
- FictionalHot 패턴: **합성 테스트 데이터로 LLM 암기 바이어스 제거**
- 프로바이더/모델 간 객관적 비교 가능
- ReSeek: "모델 크기 우위는 암기가 불가능하면 사라진다" → 작은 모델도 공정하게 평가

### 5-2. 검색 품질 메트릭 대시보드
- Correctness vs Utility 분리 메트릭 (ReSeek의 dense reward 분해)
- 검색 파라미터 변경의 영향을 실시간 모니터링
- Admin 페이지 확장 → 검색 품질 탭

### 5-3. 사용자 피드백 루프
- 검색 결과 / AI 응답에 대한 사용자 평가 수집
- WebRewardBench 패턴: 벤치마크 데이터 자체 구축
- 수집된 피드백으로 검색 파라미터 자동 최적화

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
| **4-3** | **외부 콘텐츠 캡처** | **✅ v1.4.0** | ★★★☆☆ | ★★★☆☆ | URL/arXiv/PubMed 캡처 |
| **5-1** | **평가 프레임워크** | **🔲** | ★★★★★ | ★★★★★ | 장기적 품질 기반, 높은 초기 투자 |
| **5-2** | **검색 품질 메트릭** | **🔲** | ★★★★☆ | ★★★☆☆ | Correctness vs Utility 대시보드 |
| **5-3** | **사용자 피드백 루프** | **🔲** | ★★★★☆ | ★★★☆☆ | 엄지 up/down + 자동 최적화 |

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
