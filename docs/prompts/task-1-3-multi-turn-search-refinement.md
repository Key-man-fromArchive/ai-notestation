# Task 1-3: Multi-turn Search Refinement 구현

## 프로젝트 컨텍스트

LabNote AI는 Synology NoteStation에 AI 기능을 추가하는 프로젝트입니다.
- **Tech Stack**: FastAPI (Python 3.12+) + React 19 + Vite + TailwindCSS + shadcn/ui + PostgreSQL 16 + pgvector
- **현재 버전**: v1.2.1
- **Phase 1 (검색 고도화)** 중 1-1(Why matched) ✅, 1-2(Adaptive Search) ✅ 완료. **1-3(Multi-turn Refinement)만 남음**.

## 구현 목표

첫 검색 결과 기반으로 **AI가 쿼리를 자동 확장/축소** → 추가 검색 → 더 나은 결과 제공.

**설계 근거 (ReSeek 논문)**: 1→4 턴까지 일관된 성능 향상 (baseline은 2턴에서 정체). 각 턴에서 이전 결과를 평가하고 전략 수정.

---

## 현재 검색 아키텍처 (이미 구현됨)

### 검색 엔진 (`backend/app/search/engine.py`, 1059 lines)

```python
class SearchResult(BaseModel):
    note_id: str
    title: str
    snippet: str          # ts_headline(FTS) or chunk_text(semantic)
    score: float
    search_type: str      # "fts", "semantic", "hybrid", "trigram", "exact", "reranked"
    created_at: str | None
    updated_at: str | None
    match_explanation: MatchExplanation | None

class MatchExplanation(BaseModel):
    engines: list[EngineContribution]  # engine별 기여도
    matched_terms: list[str]           # <b> 태그에서 추출한 매칭 키워드
    combined_score: float

class JudgeInfo(BaseModel):
    strategy: str          # "fts_only", "semantic_only", "hybrid"
    engines: list[str]
    skip_reason: str | None
    confidence: float

class SearchPage(BaseModel):
    results: list[SearchResult]
    total: int
    judge_info: JudgeInfo | None
```

**5개 엔진**: FullTextSearchEngine(tsvector), SemanticSearchEngine(pgvector), TrigramSearchEngine(pg_trgm), HybridSearchEngine(RRF merge), UnifiedSearchEngine(FTS+Trigram), ExactMatchSearchEngine(ILIKE)

**HybridSearchEngine.search()** 흐름:
1. `analyze_query(q)` → QueryAnalysis (morphemes, language, tsquery)
2. `SearchJudge.judge()` → SearchStrategy (fts_only / semantic_only / hybrid)
3. 병렬 실행: FTS + Semantic (전략에 따라)
4. `rrf_merge()` — 가중 RRF: `score = fts_weight * 1/(k+rank_fts) + semantic_weight * 1/(k+rank_sem)`

### 쿼리 분석 (`backend/app/search/query_preprocessor.py`)

```python
class QueryAnalysis(NamedTuple):
    original: str
    morphemes: list[str]     # Korean: kiwipiepy, English: whitespace split
    language: str            # "ko", "en", "mixed"
    is_single_term: bool
    tsquery_expr: str        # "morpheme1 | morpheme2 | token1"
    normalized: str
```

### 적응형 검색 판단 (`backend/app/search/judge.py`)

```python
class SearchJudge:
    def judge(self, analysis: QueryAnalysis) -> SearchStrategy:
        # 1. 짧은 키워드 (1-2 Latin words) → fts_only
        # 2. 긴 영어 질문 (5+ words + question word) → semantic_only
        # 3. 한국어 형태소 (2-3개, 비질문) → fts + trigram
        # 4. 기본 → hybrid
```

### 검색 API (`backend/app/api/search.py`)

```python
@router.get("", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1),
    type: SearchType = Query(SearchType.search),  # search|hybrid|exact|fts|semantic|trigram
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    notebook: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    rerank: bool = Query(False),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
```

### AI Router (`backend/app/ai_router/router.py`)

```python
class AIRouter:
    _providers: dict[str, AIProvider]  # auto-detected from env vars
    async def chat(self, request: AIRequest) -> AIResponse:      # 비스트리밍
    async def stream(self, request: AIRequest) -> AsyncIterator:  # SSE 스트리밍
```

`AIRequest`에 `provider`, `model`, `messages`, `temperature`, `max_tokens` 포함.
프롬프트 템플릿은 `backend/app/ai_router/prompts/` 하위에 태스크별 파일로 관리.

### 프론트엔드 검색 (`frontend/src/`)

- `pages/Search.tsx` — 검색 페이지 (모드 선택, 필터, 무한스크롤, Judge 뱃지)
- `hooks/useSearch.ts` — TanStack Query `useInfiniteQuery`, 300ms debounce, PAGE_SIZE=20
- API 클라이언트: `lib/api.ts` — `apiClient.get()`, `apiClient.post()`

```typescript
// useSearch 핵심 구조
function useSearch(query, searchType, filters) {
  return useInfiniteQuery<SearchResponse>({
    queryKey: ['search', debouncedQuery, searchType, ...],
    queryFn: ({ pageParam }) => apiClient.get(`/search?q=${query}&offset=${pageParam}`),
    ...
  })
}
```

---

## 구현할 내용

### 1. Backend: SearchRefiner 모듈 (신규 파일)

**파일**: `backend/app/search/refinement.py`

```python
class RefinementResult(BaseModel):
    refined_query: str           # AI가 생성한 개선된 쿼리
    strategy: str                # "broaden" | "narrow" | "related" | "rephrase"
    reasoning: str               # 왜 이렇게 리파인했는지 (한 줄)

class SearchRefiner:
    def __init__(self, ai_router: AIRouter):
        self._ai_router = ai_router

    async def refine_query(
        self,
        original_query: str,
        current_results: list[SearchResult],
        user_feedback: str | None = None,  # "broaden" | "narrow" | "related" | 자유텍스트
        turn: int = 1,                     # 현재 리파인 턴 (1-based)
    ) -> RefinementResult:
        """
        1. 상위 5개 결과의 title + snippet 분석
        2. 누락된 측면 식별
        3. AI로 개선된 쿼리 생성
        """
```

**핵심 로직**:
- 현재 결과의 `title`, `snippet`, `matched_terms`를 컨텍스트로 제공
- 피드백에 따라 전략 분기: broaden(동의어/상위개념), narrow(구체화), related(관련주제)
- AI는 **개선된 검색 쿼리만** 반환 (짧고 검색에 최적화된 형태)
- 비스트리밍 `ai_router.chat()` 사용 (쿼리 생성은 짧으므로)

### 2. Backend: 리파인 프롬프트 (신규 파일)

**파일**: `backend/app/ai_router/prompts/search_refine.py`

시스템 프롬프트 핵심:
- 역할: 연구노트 검색 쿼리 최적화 전문가
- 입력: 원본 쿼리, 현재 결과 요약, 사용자 피드백
- 출력: JSON `{"refined_query": "...", "strategy": "...", "reasoning": "..."}`
- 규칙: 검색에 최적화된 키워드 조합 생성, 자연어 질문 형태 아닌 키워드 나열
- 한/영 양쪽 지원 (쿼리 언어에 맞춤)

**기존 프롬프트 파일 패턴 참고**: `backend/app/ai_router/prompts/search_qa.py` — `build_messages(question, context_notes, lang)` → `list[Message]` 형태.

### 3. Backend: POST /search/refine 엔드포인트

**파일**: `backend/app/api/search.py` (기존 파일 수정)

```python
class RefineRequest(BaseModel):
    query: str                    # 원본 검색 쿼리
    results: list[RefineResultItem]  # 현재 표시 중인 결과 (note_id, title, snippet)
    feedback: str | None = None   # "broaden" | "narrow" | "related" | 자유텍스트
    search_type: SearchType = SearchType.search  # 검색 모드 유지
    turn: int = 1                 # 현재 리파인 턴

class RefineResultItem(BaseModel):
    note_id: str
    title: str
    snippet: str

class RefineResponse(BaseModel):
    results: list[SearchResultResponse]  # 새로운 검색 결과
    refined_query: str                   # AI가 생성한 개선 쿼리
    strategy: str                        # 적용된 전략
    reasoning: str                       # 리파인 이유
    query: str                           # 원본 쿼리 (echo)
    search_type: str
    total: int
    turn: int                            # 현재 턴 번호

@router.post("/refine", response_model=RefineResponse)
async def refine_search(request: RefineRequest, ...):
    """기존 결과 기반으로 쿼리 리파인 후 재검색"""
    # 1. SearchRefiner.refine_query() → RefinementResult
    # 2. 리파인된 쿼리로 기존 search 로직 실행
    # 3. 기존 결과와 중복 제거 (note_id 기준)
    # 4. RefineResponse 반환
```

**중요**: 기존 `search()` 엔드포인트는 변경하지 않음. `/refine`은 독립 엔드포인트.

### 4. Frontend: 리파인 UI

**파일**: `frontend/src/pages/Search.tsx` (기존 파일 수정)

추가할 UI 요소:

1. **검색 결과 하단 — "AI로 더 찾기" 섹션**
   - 결과가 있을 때만 표시
   - 3개 퀵 피드백 버튼: "범위 넓히기" / "더 구체적으로" / "관련 주제 포함"
   - 자유 텍스트 입력 (선택적)
   - "AI로 더 찾기" 실행 버튼

2. **리파인 히스토리 표시**
   - 원본 쿼리 → 리파인 쿼리 체인 (뱃지 형태)
   - 각 턴의 전략 (broaden/narrow/related) 표시
   - 클릭하면 해당 턴의 쿼리로 돌아가기

3. **리파인 결과 표시**
   - 기존 결과 아래에 구분선 + "AI 추천 결과" 섹션
   - 또는 기존 결과에 합쳐서 표시 (중복 제거 후)
   - 리파인 쿼리와 이유 표시

**새 훅 필요**: `hooks/useSearchRefine.ts`

```typescript
function useSearchRefine() {
  return useMutation<RefineResponse, Error, RefineRequest>({
    mutationFn: (request) => apiClient.post('/search/refine', request),
  })
}
```

---

## 파일 변경 목록

| 파일 | 유형 | 내용 |
|------|------|------|
| `backend/app/search/refinement.py` | **신규** | SearchRefiner, RefinementResult |
| `backend/app/ai_router/prompts/search_refine.py` | **신규** | 리파인 프롬프트 템플릿 |
| `backend/app/api/search.py` | 수정 | RefineRequest/Response, POST /refine 엔드포인트 |
| `frontend/src/pages/Search.tsx` | 수정 | 리파인 UI (버튼, 히스토리, 결과) |
| `frontend/src/hooks/useSearchRefine.ts` | **신규** | useMutation 훅 |

---

## 구현 순서 (권장)

1. **프롬프트 작성** — `search_refine.py` (가장 핵심, 품질 결정)
2. **SearchRefiner** — `refinement.py` (AI 호출 + 쿼리 생성)
3. **API 엔드포인트** — `search.py` (리파인 → 재검색 → 중복 제거)
4. **프론트엔드 훅** — `useSearchRefine.ts`
5. **프론트엔드 UI** — `Search.tsx` (버튼, 히스토리, 결과 표시)
6. **테스트** — 백엔드 단위 + 수동 E2E

---

## 코드 스타일 & 규칙

- **Backend**: ruff (lint + format), async/await 일관 사용, 타입 힌트 필수
- **Frontend**: ESLint + Prettier, shadcn/ui 컴포넌트, TailwindCSS, Light mode only
- **커밋**: Conventional Commits (Korean 허용), `feat:` / `fix:` 접두사
- **AI 프로바이더**: `AIRouter`의 `chat()` 사용 (리파인은 짧은 응답이므로 비스트리밍)
- **기존 패턴 준수**: `search_qa.py`의 `build_messages()` 패턴, `SearchResult` 모델 재사용
- **i18n**: 프론트엔드 텍스트는 한국어 우선 (영어 번역은 나중에)

---

## 주의사항

1. **기존 검색 엔드포인트 변경 금지** — `/search` GET은 그대로 유지, `/refine` POST는 별도
2. **AI 호출 최소화** — 리파인 쿼리 생성만 AI 사용, 재검색은 기존 엔진 사용
3. **중복 제거** — 리파인 결과에서 기존 결과와 겹치는 note_id 제거
4. **턴 제한** — 최대 4턴까지 (ReSeek 논문 근거: 4턴 후 수확체감)
5. **에러 핸들링** — AI 호출 실패 시 원본 쿼리로 fallback
6. **프론트엔드 상태** — 리파인 히스토리는 컴포넌트 state로 관리 (URL에는 원본 쿼리만)
