# Phase 1 — 검색 고도화 (v1.3.0)

> 근거: ReSeek 논문 (JUDGE 자기 교정, neural reranking), Reseek 제품 (Intelligent highlighting)

## 현재 상태 분석

### 검색 인프라 (`backend/app/search/`)
- `engine.py` (917 lines) — 5개 검색 엔진 클래스
  - `FullTextSearchEngine` — PostgreSQL tsvector + BM25
  - `TrigramSearchEngine` — pg_trgm 퍼지 매칭
  - `SemanticSearchEngine` — pgvector + OpenAI 임베딩 (1536-dim)
  - `HybridSearchEngine` — FTS + Semantic, Weighted RRF 병합
  - `UnifiedSearchEngine` — FTS + Trigram, RRF 병합
  - `ExactMatchSearchEngine` — ILIKE 정확 매칭
- `reranker.py` (151 lines) — 결과 재랭킹
- `query_preprocessor.py` (169 lines) — 쿼리 분석 (언어 감지, QueryAnalysis)
- `params.py` (54 lines) — 12개 튜닝 파라미터
- `embeddings.py` (171 lines) — EmbeddingService
- `indexer.py` (223 lines) — NoteIndexer 배치 임베딩

### 검색 응답 구조 (`backend/app/api/search.py`)
```python
class SearchResultResponse(BaseModel):
    note_id: str
    title: str
    snippet: str
    score: float
    search_type: str        # "fts", "hybrid", "semantic", "search", "exact", "trigram"
    created_at: str | None
    updated_at: str | None
    # !! match_explanation 필드 없음 — 추가 필요
```

### 프론트엔드 (`frontend/src/`)
- `pages/Search.tsx` — 검색 페이지 (파라미터 튜닝 UI 포함)
- `components/SearchBar.tsx` — 검색 입력 + 자동완성
- `components/NoteCard.tsx` — 검색 결과 카드

---

## Task 1-1. 검색 결과 설명 ("Why this matched")

### 목표
검색 결과마다 **왜 매칭되었는지** 설명 표시 — 매칭 키워드, 기여 엔진, 유사도 스코어 분해

### TODO

#### Backend

- [ ] **SearchResult 모델 확장** (`search/engine.py`)
  - `match_sources: list[MatchSource]` 필드 추가
  - `MatchSource` dataclass: `engine: str`, `score: float`, `matched_terms: list[str]`
  - 각 엔진 결과에서 기여도 추적

- [ ] **FTS 엔진 — 매칭 키워드 추출** (`search/engine.py:FullTextSearchEngine`)
  - `ts_headline()` 결과에서 `<b>` 태그 파싱하여 matched_terms 추출
  - 또는 `ts_debug()` 활용하여 매칭 토큰 식별

- [ ] **Semantic 엔진 — 유사도 점수 보존** (`search/engine.py:SemanticSearchEngine`)
  - 코사인 유사도 원본 점수를 MatchSource.score에 보존
  - 임계값 대비 비율 표시 (예: "85% 유사")

- [ ] **RRF 병합 시 소스 추적** (`search/engine.py:HybridSearchEngine.rrf_merge`)
  - 각 결과의 원본 엔진별 rank/score 보존
  - `match_sources` 리스트로 집계: FTS 기여, Semantic 기여

- [ ] **API 응답 확장** (`api/search.py:SearchResultResponse`)
  ```python
  class MatchSource(BaseModel):
      engine: str          # "fts", "semantic", "trigram"
      score: float         # 원본 점수
      rank: int | None     # 원본 순위
      matched_terms: list[str]  # 매칭된 키워드들

  class SearchResultResponse(BaseModel):
      # ... 기존 필드 ...
      match_sources: list[MatchSource] = []
  ```

#### Frontend

- [ ] **검색 결과 카드 확장** (`components/NoteCard.tsx`)
  - 스코어 바: FTS/Semantic 기여 비율 시각화 (작은 가로 바)
  - 매칭 키워드 하이라이트 뱃지
  - 접을 수 있는 "왜 이 결과?" 토글

- [ ] **Search 페이지 업데이트** (`pages/Search.tsx`)
  - "매칭 설명 보기" 토글 옵션 추가

### 파일 변경 목록
| 파일 | 변경 유형 |
|------|-----------|
| `backend/app/search/engine.py` | 수정 — MatchSource 추가, 각 엔진에 소스 추적 |
| `backend/app/api/search.py` | 수정 — SearchResultResponse 확장 |
| `frontend/src/components/NoteCard.tsx` | 수정 — 매칭 설명 UI |
| `frontend/src/pages/Search.tsx` | 수정 — 토글 옵션 |

### 예상 난이도: ★★☆☆☆
기존 인프라에서 데이터를 추출하는 작업. 새 인프라 불필요.

---

## Task 1-2. Adaptive Search Strategy (적응형 검색)

### 목표
FTS 결과 품질을 **JUDGE** 단계로 평가 → 충분하면 Semantic 검색 스킵 → 비용/속도 절감

### 설계 근거 (ReSeek 논문)
- JUDGE 액션: 검색 후 결과를 평가, 충분하면 다음 단계 스킵
- 40-50% 긍정적 개입 달성
- 핵심: **경량 판단**으로 불필요한 임베딩 API 호출 방지

### TODO

#### Backend

- [ ] **Judge 모듈 생성** (`search/judge.py` — 신규)
  ```python
  class SearchJudge:
      """FTS 결과가 충분한지 판단"""

      def should_run_semantic(
          self,
          query: str,
          fts_results: list[SearchResult],
          analysis: QueryAnalysis,
      ) -> bool:
          """
          판단 기준:
          1. FTS 결과 수 >= threshold (기본 5개)
          2. 상위 결과 BM25 스코어 >= min_score
          3. 쿼리가 단순 키워드 매칭에 적합한 경우 (짧은 쿼리, 고유명사)
          4. 쿼리가 의미적 검색이 필요한 경우 (긴 자연어 질문) → True
          """
  ```

- [ ] **HybridSearchEngine 통합** (`search/engine.py:HybridSearchEngine`)
  - `search()` 메서드에 Judge 단계 삽입
  - `search_progressive()`에도 적용: Phase 1 후 Judge → Phase 2 조건부 실행

- [ ] **파라미터 추가** (`search/params.py`)
  - `adaptive_search_enabled: bool = True`
  - `adaptive_min_fts_results: int = 5`
  - `adaptive_min_fts_score: float = 0.3`
  - 프론트엔드 튜닝 UI에 노출

- [ ] **메트릭 로깅**
  - Judge 판단 결과 로깅 (semantic 스킵 비율)
  - 성능 향상 측정 기반 데이터

#### Frontend

- [ ] **검색 파라미터 UI 확장** (`pages/Search.tsx`)
  - "적응형 검색" 토글 추가
  - 관련 파라미터 슬라이더 (최소 FTS 결과 수, 최소 스코어)

### 파일 변경 목록
| 파일 | 변경 유형 |
|------|-----------|
| `backend/app/search/judge.py` | **신규** — SearchJudge 클래스 |
| `backend/app/search/engine.py` | 수정 — HybridSearchEngine에 Judge 통합 |
| `backend/app/search/params.py` | 수정 — adaptive 파라미터 추가 |
| `frontend/src/pages/Search.tsx` | 수정 — 적응형 검색 파라미터 UI |

### 예상 난이도: ★★★☆☆
새 모듈 필요하지만 로직은 규칙 기반으로 단순. 임계값 튜닝이 핵심.

---

## Task 1-3. Multi-turn Search Refinement

### 목표
첫 검색 결과 기반으로 **AI가 쿼리를 자동 확장/축소** → 추가 검색 → 더 나은 결과

### 설계 근거 (ReSeek 논문)
- 1→4 턴까지 일관된 성능 향상 (baseline은 2턴에서 정체)
- 각 턴에서 이전 결과를 평가하고 전략 수정

### TODO

#### Backend

- [ ] **Refinement 모듈 생성** (`search/refinement.py` — 신규)
  ```python
  class SearchRefiner:
      """검색 쿼리를 AI로 리파인"""

      async def refine_query(
          self,
          original_query: str,
          current_results: list[SearchResult],
          user_feedback: str | None = None,  # "더 구체적으로", "범위 넓히기" 등
      ) -> str:
          """
          AI를 사용하여 쿼리 개선:
          1. 현재 결과 분석 (상위 5개 snippet)
          2. 누락된 측면 식별
          3. 개선된 쿼리 생성 (동의어 확장, 키워드 추가/제거)
          """
  ```

- [ ] **리파인 프롬프트 생성** (`ai_router/prompts/search_refine.py` — 신규)
  - 현재 결과 요약 + 원본 쿼리 → 개선된 쿼리 생성
  - 한/영 시스템 프롬프트

- [ ] **API 엔드포인트** (`api/search.py`)
  ```python
  @router.post("/refine")
  async def refine_search(
      query: str,
      result_ids: list[str],  # 현재 표시 중인 결과
      feedback: str | None = None,
  ) -> SearchResponse:
      """기존 결과 기반으로 쿼리 리파인 후 재검색"""
  ```

#### Frontend

- [ ] **"더 찾기" 버튼** (`pages/Search.tsx`)
  - 검색 결과 하단에 "AI로 더 찾기" 버튼
  - 클릭 시 현재 결과 기반 리파인 → 추가 결과 표시
  - 리파인 히스토리 표시 (원본 쿼리 → 리파인 쿼리)

- [ ] **피드백 옵션**
  - "범위 넓히기" / "더 구체적으로" / "관련 주제 포함" 퀵 옵션
  - 자유 텍스트 입력 가능

### 파일 변경 목록
| 파일 | 변경 유형 |
|------|-----------|
| `backend/app/search/refinement.py` | **신규** — SearchRefiner |
| `backend/app/ai_router/prompts/search_refine.py` | **신규** — 리파인 프롬프트 |
| `backend/app/api/search.py` | 수정 — /refine 엔드포인트 |
| `frontend/src/pages/Search.tsx` | 수정 — 리파인 UI |

### 예상 난이도: ★★★★☆
AI 통합 필요, UX 복잡도 높음. 프롬프트 품질이 핵심.

---

## 구현 순서 (권장)

```
1-1 (Why matched) → 1-2 (Adaptive) → 1-3 (Multi-turn Refine)
      2일              3일               4일
```

- 1-1은 독립적, 즉시 착수 가능
- 1-2는 1-1의 MatchSource 데이터를 Judge에서 활용 가능
- 1-3은 AI 통합 필요, 가장 복잡

## 테스트 전략

- [ ] Unit: 각 엔진의 MatchSource 생성 검증
- [ ] Unit: SearchJudge 판단 로직 (다양한 시나리오)
- [ ] Integration: 전체 검색 파이프라인 (FTS → Judge → Semantic 조건부)
- [ ] E2E: 프론트엔드 검색 결과 설명 표시, 적응형 검색 토글
