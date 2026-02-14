# LabNote AI Roadmap

> 리서치 기반 로드맵 — ReSeek(논문), Web-Shepherd(논문), Reseek(제품) 분석 종합
>
> 현재 버전: **v1.3.0** | 작성일: 2026-02-13
>
> **상세 계획**: [docs/roadmap/](docs/roadmap/) | **마스터 TODO**: [docs/roadmap/TODO.md](docs/roadmap/TODO.md)

---

## 현재 보유 기능 (v1.3.0)

| 영역 | 기능 |
|------|------|
| **검색** | Hybrid Search (FTS + Trigram + Semantic), RRF 병합, 12개 파라미터 튜닝 UI |
| **AI** | 6개 태스크 (insight, search_qa, writing, spellcheck, template, summarize), SSE 스트리밍, AI 품질 게이트 |
| **AI 프로바이더** | OpenAI, Anthropic, Google, ZhipuAI 자동 감지 + OAuth |
| **멀티모달** | OCR (AI Vision / PaddleOCR-VL / GLM-OCR), Vision 설명 (glm-4.6v), 배치 일괄 분석, 캐시 기반 AI Insight 최적화 |
| **에디터** | Tiptap 리치텍스트, 항상 편집 가능, 자동 저장 (3초/30초/이탈 시), 너비 4단계 조절 |
| **동기화** | Synology NoteStation 양방향 동기화, NSX 포맷 지원 |
| **기타** | 지식 그래프, 노트 발견, 공유/협업, i18n (한/영), 가상화 리스트 |

---

## Phase 1 — 검색 고도화 (v1.3.0)

> 핵심 근거: ReSeek 논문 — "neural reranker >> lexical matching", "self-correction으로 monotonic improvement"

### 1-1. 검색 결과 설명 ("Why this matched")
- 검색 결과마다 **왜 매칭되었는지** 하이라이트 + 설명 표시
- FTS 매칭 키워드, semantic similarity 스코어, 어떤 엔진이 기여했는지 분해
- Reseek 제품의 "Intelligent highlighting" 패턴 차용
- **구현**: SearchResult 응답에 `match_explanation` 필드 추가

### 1-2. Adaptive Search Strategy (적응형 검색) ✅
- Phase 1(FTS) 결과를 **JUDGE** 단계로 평가 → 충분하면 Phase 2(semantic) 스킵
- ReSeek 논문의 post-retrieval JUDGE 패턴 (원본 의도): "결과 품질 판단 → 전략 분기"
- 불필요한 임베딩 호출 절감 → 속도 향상 + 비용 절감
- **구현**: `search/judge.py` — FTS 결과 커버리지 점수 계산, 임계값 미달 시에만 semantic 실행

### 1-3. Multi-turn Search Refinement
- 첫 검색 결과 기반으로 **쿼리 자동 확장/축소**
- ReSeek 핵심 패턴: 1→4 턴까지 일관된 성능 향상 (baseline은 2턴에서 정체)
- 사용자가 원하면 "더 찾기" 버튼 → AI가 쿼리 리파인 후 추가 검색
- **구현**: `search/refinement.py` + 프론트엔드 "Refine Search" UI

---

## Phase 2 — AI 품질 게이트 (v1.4.0)

> 핵심 근거: Web-Shepherd 논문 — "checklist decomposition으로 모든 모델 품질 향상", "process reward >> outcome reward"

### 2-1. Checklist-Based AI Quality Gate ✅ (v1.2.0)
- ~~AI 응답 생성 전, 요청을 검증 가능한 체크리스트로 분해~~
- `ai_router/quality_gate.py` 구현 완료 — Settings에서 ON/OFF + 자동 재생성 토글

### 2-2. Search QA 결과 품질 평가
- search_qa 응답의 **정확성(Correctness) + 유용성(Utility)** 분리 평가
- ReSeek의 dense reward 분해: 사실 정확성 ↔ 쿼리 관련성 독립 측정
- 낮은 점수의 응답은 사용자에게 "신뢰도 낮음" 표시 또는 자동 재생성
- **구현**: reranker 스코어를 활용한 경량 평가 로직

### 2-3. 스트리밍 중간 품질 체크
- SSE 스트리밍 도중 **중간 지점에서 품질 평가** (process reward)
- Web-Shepherd 핵심: outcome reward(최종 결과만)보다 process reward(단계별)가 우수
- 초반에 잘못된 방향으로 가면 조기 중단 + 재생성
- **구현**: 스트리밍 청크 누적 후 n번째 청크마다 경량 평가

---

## Phase 3 — 콘텐츠 인텔리전스 (v1.5.0)

> 핵심 근거: Reseek 제품 분석 — 경쟁 제품의 핵심 차별 기능 중 우리에게 없는 것들

### 3-1. Auto-Tagging (AI 자동 태그)
- 노트 생성/동기화 시 AI가 **자동으로 태그 생성**
- Reseek의 핵심 기능 차용 + 우리의 multi-provider AI 강점 활용
- 기존 노트북 태그와 통합, 수동 편집 가능
- **구현**: `services/auto_tagger.py` — 동기화 훅 + 배치 태깅

### 3-2. 노트 간 관계 발견 (Content Relationship Graph)
- 기존 지식 그래프를 확장: **의미적 유사성 기반 자동 연결**
- 사용자가 인식하지 못한 노트 간 숨겨진 연결 발견
- "이 노트와 관련된 노트" 추천 패널
- **구현**: 임베딩 코사인 유사도 + 그래프 클러스터링 강화

### 3-3. 잊혀진 노트 재발견 (Rediscovery) ✅ (v1.2.0)
- ~~오래됐지만 현재 작업과 관련 있는 노트 주기적 서피스~~
- Dashboard "오늘의 재발견" 섹션, semantic similarity 기반 추천 완료

---

## Phase 4 — 멀티모달 확장 (v2.0.0)

> 핵심 근거: Reseek 제품 (OCR, PDF), Web-Shepherd 논문 ("text-only가 더 나을 수 있다" 주의)

### 4-1. PDF 텍스트 추출 ✅ (v1.2.0)
- ~~연구 논문, eBook PDF에서 텍스트 추출 → 검색 가능하게~~
- `PDFExtractor` + 첨부 파일 인덱싱 완료

### 4-2. OCR 파이프라인 (이미지 → 텍스트) ✅ (v1.2.0 ~ v1.3.0)
- ~~실험실 노트의 사진, 다이어그램, 손글씨를 검색 가능한 텍스트로~~
- v1.2.0: 수동 OCR (우클릭 → 텍스트 인식), 3개 엔진 (AI Vision / PaddleOCR-VL / GLM-OCR)
- v1.3.0: **배치 OCR + Vision 파이프라인 추가**
  - `ImageAnalysisService` — 배치 OCR (concurrency 3) + Vision 설명 (glm-4.6v, concurrency 10)
  - Vision 설명이 검색 임베딩에 포함 → 이미지 내용으로도 검색 가능
  - 캐시된 텍스트로 AI Insight 최적화 (이미지 재전송 불필요)
  - Settings 배치 처리 UI + Dashboard 현황 카드
  - 우클릭 개별 Vision 분석 + FIFO 큐 기반 다중 요청 관리

### 4-3. 외부 콘텐츠 캡처
- URL 북마크 → 콘텐츠 자동 추출 (Reseek의 Smart Bookmarks)
- 선택적: 학술 논문 메타데이터 (arXiv, PubMed 등) 자동 파싱
- 연구자 워크플로우에 특화

---

## Phase 5 — 지능형 평가 인프라 (v2.1.0)

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
| 1-1 | Why this matched | 🔲 | ★★★★★ | ★★☆☆☆ | Reseek 제품 핵심 UX, 기존 인프라 활용 |
| 1-2 | Adaptive Search | ✅ | ★★★★☆ | ★★★☆☆ | ReSeek post-retrieval JUDGE 패턴 (원본 의도), 비용 절감 |
| 2-1 | Checklist Quality Gate | ✅ | ★★★★★ | ★★★☆☆ | v1.2.0 구현 완료 |
| 3-1 | Auto-Tagging | 🔲 | ★★★★☆ | ★★☆☆☆ | Reseek 핵심 기능, 즉각적 UX 개선 |
| 3-2 | Content Relationships | 🔲 | ★★★★☆ | ★★★☆☆ | 기존 그래프/임베딩 인프라 활용 |
| 1-3 | Multi-turn Refinement | 🔲 | ★★★☆☆ | ★★★★☆ | ReSeek 핵심이나 UX 복잡도 높음 |
| 3-3 | Rediscovery | ✅ | ★★★☆☆ | ★★☆☆☆ | v1.2.0 구현 완료 |
| 4-1 | PDF 추출 | ✅ | ★★★★☆ | ★★★☆☆ | v1.2.0 구현 완료 |
| 4-2 | OCR + Vision 파이프라인 | ✅ | ★★★☆☆ | ★★★★☆ | v1.3.0 구현 완료 — 배치 + 개별 + 큐 |
| 4-3 | 외부 콘텐츠 캡처 | 🔲 | ★★★☆☆ | ★★★☆☆ | URL 북마크/학술 메타데이터 |
| 5-1 | 평가 프레임워크 | 🔲 | ★★★★★ | ★★★★★ | 장기적 품질 기반, 높은 초기 투자 |

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
