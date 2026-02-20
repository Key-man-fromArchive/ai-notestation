# 검색 엔진 리뷰 보고서

**일시**: 2026-02-20
**참여**: Claude Opus 4.6 (진행/분석), Gemini Flash (초안 리뷰), Gemini Pro (심층 검증)
**대상**: LabNote AI 검색 시스템 (P0 수정 완료 후)

---

## 1. 리뷰 결론 요약

| # | 항목 | Flash 제안 | Pro 검증 | 최종 결정 |
|---|------|-----------|---------|----------|
| R1 | Trigram 제거 (Unified) | YES | **APPROVED** | ✅ unified_trigram_weight → 0.0 |
| R2 | Intent multiplier (질문 감지) | YES (0.5x) | **REJECTED** — 휴리스틱 취약 | ❌ 대신 coverage 강화 |
| R3 | trigram_weight 0.35→0.25 | YES | **MOOT** (R1으로 불필요) | — |
| R4 | judge_min_term_coverage | 미언급 | 0.5 → **0.75** | ✅ |
| R5 | judge_min_avg_score | 0.1 → 0.12 | 0.1 → **0.05** | ✅ (coverage 강화 대신 score 완화) |
| R6 | 3-mode UI | 좋은 UX | 좋은 UX | ✅ 유지 |

---

## 2. 핵심 발견

### 2.1 Trigram은 content_text에서 무용지물

**실측 데이터:**
```
similarity('PCR', content_text) = 0.02~0.06  ← threshold 0.1 미달
similarity('PCR', title)        = 0.4~1.0    ← title에서만 유효
```

- Trigram은 **짧은 쿼리 vs 긴 문서** 구조에서 수학적으로 실패
- FTS `simple` config + kiwipiepy 형태소 분석이 이미 충분
- Trigram의 유일한 가치: **오타 허용** (Pipete → Pipette) — 동기화된 NoteStation 노트에서는 극히 드문 시나리오

**결론:** UnifiedSearchEngine에서 Trigram 비활성화 (`unified_trigram_weight: 0.0`)

### 2.2 JUDGE 포뮬러 개선

**현재 문제 (Scenario C):**
```
쿼리: "왜 PCR 밴드가 안 나오는지"
형태소: [왜, PCR, 밴드, 나오다]
FTS: PCR로 많은 결과 → avg_score 높음 → coverage 0.5 → 통과
→ Semantic 스킵됨 ❌ (질문 의도를 놓침)
```

**Flash 제안 (REJECTED):** `intent_multiplier = 0.5` for 질문 단어 감지
- 문제: "PCR protocol" vs "Why PCR fail" 같은 경계 사례에서 취약
- 과학 문맥에서 "how", "why"는 실험 단계 설명에도 등장

**Pro 대안 (APPROVED):** Coverage 기준 강화
- `judge_min_term_coverage`: 0.5 → **0.75** (4단어 쿼리에서 3단어 이상 매칭 필요)
- `judge_min_avg_score`: 0.1 → **0.05** (score 기준 완화 — coverage가 주도)
- 효과: "왜 PCR 밴드가 안 나오는지" → coverage = 0.25 (1/4) → 확실히 Semantic 트리거

### 2.3 영어 스테밍 부재 (기술 부채)

**발견:** DB 트리거가 `to_tsvector('simple', ...)` 사용
- `simple` config = 공백 분리 + 소문자화만. **스테밍 없음**
- "experiments" 검색 시 "experiment" 미매칭
- Korean은 kiwipiepy가 쿼리 측에서 보상하지만, English는 보상 없음

**이것이 Korean fts_weight (0.7) > English fts_weight (0.6)인 이유:**
- Korean FTS는 kiwipiepy 덕분에 신뢰도 높음 → FTS 가중치 ↑
- English FTS는 스테밍 없어서 신뢰도 낮음 → Semantic 가중치 ↑

**향후 과제:** `to_tsvector('english', ...)` 또는 Python 측 영어 스테밍 추가

### 2.4 RRF 파라미터 (k=60, weights) — 적절

- `rrf_k=60`: RRF 원논문의 표준값. 이 규모에서 적절
- FTS/Semantic 비율 (0.6/0.4, Korean 0.7/0.3): 과학 노트의 정밀 검색 요구에 부합
- **변경 불필요**

---

## 3. 최종 권장 파라미터

```python
DEFAULT_SEARCH_PARAMS = {
    # Hybrid RRF — 변경 없음
    "rrf_k": 60,
    "fts_weight": 0.6,
    "semantic_weight": 0.4,
    "fts_weight_korean": 0.7,
    "semantic_weight_korean": 0.3,

    # FTS — 변경 없음
    "title_weight": 3.0,
    "content_weight": 1.0,

    # Trigram — Exact/Fuzzy 모드 전용, 값 유지
    "trigram_threshold_ko": 0.15,
    "trigram_threshold_en": 0.1,
    "trigram_title_weight": 3.0,

    # Unified Search — Trigram 비활성화
    "unified_fts_weight": 1.0,         # was 0.65
    "unified_trigram_weight": 0.0,     # was 0.35

    # Judge — Coverage 중심으로 재조정
    "adaptive_enabled": 1,
    "judge_min_results": 3,
    "judge_min_avg_score": 0.05,       # was 0.1 (완화)
    "judge_min_avg_score_ko": 0.05,    # was 0.08 (완화)
    "judge_min_term_coverage": 0.75,   # was 0.5 (강화)
    "judge_confidence_threshold": 0.7,
}
```

### 변경 요약 (4개 파라미터)

| 파라미터 | Before | After | 이유 |
|---------|--------|-------|------|
| `unified_fts_weight` | 0.65 | **1.0** | Trigram 제거, FTS 단독 |
| `unified_trigram_weight` | 0.35 | **0.0** | 비활성화 |
| `judge_min_avg_score` / `_ko` | 0.1 / 0.08 | **0.05 / 0.05** | Coverage 강화 대신 Score 완화 |
| `judge_min_term_coverage` | 0.5 | **0.75** | 핵심: 질문형 쿼리 → Semantic 트리거 보장 |

---

## 4. 검색 모드 최종 구성

```
[정확히 일치]    →  ExactMatchSearchEngine (ILIKE substring)
[키워드 검색]    →  FTS-only (UnifiedEngine, trigram weight=0)
[AI 검색]       →  HybridSearchEngine (FTS → JUDGE → conditional Semantic)
```

- **정확히 일치**: "이 단어가 포함된 노트를 찾아라" — 연구자가 특정 프라이머 서열이나 시약명을 검색할 때
- **키워드 검색**: "이 주제와 관련된 노트를 찾아라" — 형태소 분석 + BM25 스코어링
- **AI 검색**: "이 질문에 답하는 노트를 찾아라" — JUDGE가 FTS 부족 시 Semantic 보강

---

## 5. 향후 과제 (기술 부채)

1. **English stemming**: `to_tsvector('english', ...)` 마이그레이션 또는 Python 측 영어 스테머 추가
2. **과학 용어 사전**: "EtOH" = "Ethanol", "bp" = "base pair" 동의어 매핑
3. **Trigram → title-only fuzzy**: Exact 모드에 Trigram title 검색 통합 검토
4. **JUDGE 로깅/모니터링**: Semantic 트리거 비율 추적 → 파라미터 자동 튜닝 데이터 축적

---

## 6. 리뷰어 간 이견 및 해소

| 주제 | Flash | Pro | 해소 |
|------|-------|-----|------|
| Intent multiplier | 질문 단어 감지 (0.5x) | Rejected — coverage 강화로 대체 | **Pro 채택**: 통계적 접근이 더 견고 |
| judge_min_avg_score | 0.1 → 0.12 (강화) | 0.1 → 0.05 (완화) | **Pro 채택**: coverage 주도 전략에서 score는 보조 |
| Trigram 제거 | Remove from retrieval | Remove, keep index for suggestions | **합의**: weight=0으로 비활성화 (코드 제거는 향후) |

---

## 7. Codex CLI (GPT-5.3) 리뷰 — 2026-02-20

**모델**: GPT-5.3-codex (OpenAI Codex CLI v0.101.0)
**세션**: 019c7b2d-d71c-7531-8d20-be92268c0c6b

### 7.1 Codex가 발견한 버그 (Gemini가 놓친 것들)

#### BUG-1: CRITICAL — tsquery 인젝션 취약점
- **위치**: `query_preprocessor.py:93` (`_build_tsquery_expr`)
- **문제**: `'` 만 이스케이프하고, `| & ! : ( ) *` 같은 tsquery 연산자를 이스케이프하지 않음
- **영향**: 사용자가 `PCR | DROP TABLE` 같은 입력을 하면 tsquery 의미가 변경되거나 파서 에러 발생
- **심각도**: Critical (correctness + potential injection)

#### BUG-2: CRITICAL — RRF 병합 페이지네이션 오류
- **위치**: `engine.py:619,640,644` (HybridSearchEngine), `engine.py:902,972` (UnifiedSearchEngine)
- **문제**: `offset`이 각 엔진에 개별 적용된 후 병합되지만, 병합 후 슬라이싱이 없음
- **영향**: 2페이지 이후 결과 순서가 불안정하고 부정확
- **심각도**: Critical (pagination correctness)

#### BUG-3: HIGH — Semantic 검색 중복 노트
- **위치**: `engine.py:491,494,520` (SemanticSearchEngine)
- **문제**: `note_embeddings` 테이블을 직접 쿼리하므로 하나의 노트가 여러 청크로 인해 복수의 슬롯 차지
- **영향**: 결과 다양성 감소, total count 부정확, hybrid fusion 약화
- **심각도**: High

#### BUG-4: MEDIUM — ExactMatch regex 이스케이프 미비
- **위치**: `engine.py:1027-1031` (ExactMatchSearchEngine)
- **문제**: `regexp_replace`에 사용자 입력이 regex 메타문자 이스케이프 없이 직접 삽입
- **영향**: `PCR.+` 같은 입력이 regex로 해석되어 예상치 못한 하이라이팅
- **심각도**: Medium (functional, not security — DB-level regex)

#### BUG-5: MEDIUM — count().over() 성능 이슈
- **위치**: `engine.py:179,320,491`
- **문제**: 랭킹 쿼리 위에 `count().over()` 윈도우 함수 → 대규모 데이터에서 성능 저하
- **심각도**: Medium (현재 2,260건에서는 문제없으나 확장 시 이슈)

### 7.2 Codex의 파라미터 권장값

| 파라미터 | Gemini 권장 | Codex 권장 | 차이 |
|---------|------------|-----------|------|
| `rrf_k` | 60 (유지) | **30** | Codex: k=60은 top-20 UX에서 순위 차이가 너무 약해짐 |
| `fts_weight` | 0.6 (유지) | **0.65** | Codex: FTS 약간 더 신뢰 |
| `semantic_weight` | 0.4 (유지) | **0.35** | 위와 대응 |
| `fts_weight_korean` | 0.7 (유지) | **0.75** | Codex: kiwipiepy 덕에 KR FTS 더 신뢰 |
| `semantic_weight_korean` | 0.3 (유지) | **0.25** | 위와 대응 |
| `unified_fts_weight` | 1.0 | **0.85** | Codex: Trigram 완전 제거 대신 0.15로 폴백 유지 |
| `unified_trigram_weight` | 0.0 | **0.15** | Codex: adaptive fallback으로 유지 |
| `trigram_threshold_en` | 0.1 (유지) | **0.03** | Codex: 약어 대응 위해 대폭 하향 |
| `trigram_threshold_ko` | 0.15 (유지) | **0.08** | Codex: 한국어도 하향 |
| `judge_min_results` | 3 (유지) | **5** | Codex: 더 엄격 |
| `judge_min_term_coverage` | 0.75 | **0.6** | Codex: 0.75는 과도, 0.6이 적절 |
| `judge_confidence_threshold` | 0.7 (유지) | **0.75** | Codex: 약간 더 엄격 |

### 7.3 Gemini vs Codex 핵심 이견

| 주제 | Gemini (Flash+Pro) | Codex (GPT-5.3) | 분석 |
|------|-------------------|-----------------|------|
| **rrf_k** | 60 유지 (원논문 표준) | **30** (top-20에서 차별화 부족) | 논쟁적 — k=30은 상위 결과 차이를 키우지만 하위 결과가 불안정해질 수 있음 |
| **Trigram 처리** | weight=0 (완전 비활성화) | **weight=0.15** (adaptive fallback) | Codex가 더 보수적 — Trigram을 완전 죽이지 않고 약한 신호로 유지 |
| **coverage threshold** | 0.75 (강화) | **0.6** (완화) | 핵심 이견 — 0.75는 3단어 쿼리에서 모든 단어 매칭 강제, 0.6은 여유 |
| **judge_min_results** | 3 (유지) | **5** (강화) | Codex가 더 엄격 — 3건으로는 품질 판단 어려움 |
| **버그 발견** | 파라미터/아키텍처 중심 | **코드 레벨 버그 4건 발견** | Codex의 코드 리뷰가 더 세밀 |

### 7.4 세 리뷰어 종합 결론

**합의 사항:**
- Trigram은 content_text 검색에서 구조적으로 부적합 (3모델 모두 동의)
- JUDGE coverage 기준이 현재 0.5로 너무 낮음 (3모델 모두 동의)
- 3-mode UI (Exact/Keyword/AI)는 적절 (3모델 모두 동의)
- English stemming 부재는 기술 부채 (Gemini Pro + Codex 동의)

**미합의 (추가 논의 필요):**
- `rrf_k`: 60 vs 30 → A/B 테스트 필요
- Trigram weight: 0.0 vs 0.15 → 실측 비교 필요
- `judge_min_term_coverage`: 0.6 vs 0.75 → 다양한 쿼리 유형으로 시뮬레이션 필요
- BUG-1~4 수정 우선순위 결정 필요

---

## 8. 다관점 심층 토론 — 2026-02-20 (2차)

**참여 모델 & 소스:**

| # | 소스 | 역할 |
|---|------|------|
| 1 | Codex CLI (GPT-5.3-codex, v0.104.0) | 코드 리뷰 + 파라미터 분석 (non-interactive `codex exec --full-auto`) |
| 2 | Gemini CLI (gemini-3-pro-preview, v0.29.5) | via MCP — 아키텍처/IR 이론 분석 |
| 3 | Claude Opus 4.6 (서브에이전트 ×2) | Bug Hunter (Codex 대변), Architecture Defender (Gemini 대변) |
| 4 | Claude Sonnet 4.6 (서브에이전트 ×3) | Devil's Advocate, Production Engineer, IR Theory Expert |
| 5 | PostgreSQL 16 공식 문서 (Context7 MCP) | tsquery 함수 비교 근거 |
| 6 | Azure AI Search 문서 (WebFetch) | RRF 구현 + 페이지네이션 참조 구현 |
| 7 | WebSearch | pgvector 중복 제거, RAG chunking 모범 사례 |

### 8.1 버그 심각도 — 크로스 모델 검증

| 버그 | Codex CLI (GPT-5.3) | Gemini CLI | Bug Hunter | Arch Defender | Prod Eng | IR Expert | **합의** |
|------|---------------------|------------|------------|---------------|----------|-----------|----------|
| BUG-1 tsquery | HIGH | CRITICAL | CRITICAL | LOW (과장) | P3 | — | **HIGH** |
| BUG-2 pagination | HIGH | HIGH | CRITICAL | LOW (엣지) | P1 | — | **HIGH** |
| BUG-3 duplicates | HIGH | HIGH | HIGH | MEDIUM | **P0** | HIGH | **HIGH (P0)** |
| BUG-4 regex | HIGH | CRITICAL | MEDIUM | LOW | P3 | — | **HIGH** |
| BUG-5 count() | MEDIUM | MEDIUM | MEDIUM | — | P2 | — | **MEDIUM** |

### 8.2 BUG-1 확정적 해결책: `websearch_to_tsquery`

**PostgreSQL 16 공식 문서 (Context7 MCP):**

> `websearch_to_tsquery` creates a tsquery value... **this function will never raise syntax errors**,
> which makes it possible to use **raw user-supplied input** for search.

```sql
-- 현재 (위험): to_tsquery('simple', user_input)  → 연산자 해석, 파서 에러
-- 해결: websearch_to_tsquery('simple', user_input) → 항상 안전, 구문 에러 없음

-- 극단적 입력도 안전:
SELECT websearch_to_tsquery('english', '"" )( dummy \ query <->');
-- 결과: 'dummi' & 'queri'  (에러 없이 정상 처리)
```

**해결 방법:** `_build_tsquery_expr` 함수의 결과를 `to_tsquery`가 아닌 `websearch_to_tsquery`에 전달.
또는 형태소 분석 결과를 공백 join하여 `websearch_to_tsquery`에 직접 전달.

### 8.3 BUG-2 업계 표준 패턴: 병합 후 슬라이싱

**Azure AI Search 문서:**

> RRF is used anytime there's more than one query execution... `top` and `skip` determine
> the number of results in the response... based on defaults, the top 50 highest ranked
> matches of the **unified result set** are returned.

Azure/OpenSearch 모두 pagination을 RRF 병합 **이후** 적용:

```
올바른 패턴:
  각 엔진: offset=0, limit=(offset+limit) 만큼 fetch
  → RRF merge → 정렬
  → merged[offset:offset+limit] 슬라이싱

현재 (잘못된) 패턴:
  각 엔진: offset=offset, limit=limit (개별 적용)
  → RRF merge (이미 잘린 결과끼리 병합)
  → 2페이지부터 순서 불안정
```

### 8.4 파라미터 — 전체 투표 매트릭스

#### rrf_k: 30 vs 60

| 소스 | 권장값 | 근거 |
|------|--------|------|
| Codex CLI (GPT-5.3) 1차 | **30** | top-20에서 차별화 부족 |
| Codex CLI (GPT-5.3) 2차 | **60** | 안정적 기본값, 노이즈 내성 |
| Gemini CLI | **30** | 수학: k=60 → 1등/20등 비율 76% (평탄), k=30 → 61% (변별적) |
| Bug Hunter | 30 | top-20 UX에서 3.2배 분별력 |
| Arch Defender | 60 | 원논문 표준 |
| Devil's Advocate | 무의미 | A/B 테스트 없이 결정 불가 |
| Prod Engineer | 무의미 | 2,260개에서 체감 차이 0.01 미만 |
| IR Theory Expert | **30-40** | top-20 제시 시 이론적으로 더 적합, 단 실험 필수 |
| Azure AI Search | 60 | 공식 문서: "experiments show best when k=60" |

**수학적 검증:**

| Rank | k=60 Score | k=30 Score |
|------|-----------|-----------|
| 1등 | 0.0164 | 0.0323 |
| 20등 | 0.0125 | 0.0200 |
| **1등/20등 비율** | **1.31x** | **1.61x** |

**결론:** 3:2:3 (30파:60파:무의미파). **실험으로만 결정 가능.**

#### unified_trigram_weight: 0.0 vs 0.15

| 소스 | 권장값 | 근거 |
|------|--------|------|
| Codex CLI 1차 | 0.15 | 오탈자 대응 유지 |
| Codex CLI 2차 | **0.15** | adaptive fallback |
| Gemini CLI | 0.0 또는 title-only | content에서 similarity=0.02~0.06 → 노이즈 |
| Arch Defender | **0.0** | 수학적으로 무용 |
| Devil's Advocate | 0.0 | 0.15 × 0.06 = 0.009 → 순위 변경 불가, placebo |
| Prod Engineer | **0.0** | 쿼리 하나 감소 = 성능 향상 |
| IR Theory Expert | **title-only** | content에서 죽이고 title 전용으로 재배치 |

**결론:** content에서는 0.0 (5:2). IR Expert 제안 — title-only fuzzy로 재배치 검토.

#### judge_min_term_coverage: 0.6 vs 0.75

| 소스 | 권장값 | 근거 |
|------|--------|------|
| Codex CLI 1차 | **0.6** | 0.75는 과도 |
| Codex CLI 2차 | **0.6** | substring 기반 coverage에서 0.75는 과호출 유발 |
| Gemini CLI | 0.75 | 질문형 쿼리 커버 |
| Arch Defender | 0.75 | Scenario C 해결 |
| Devil's Advocate | **둘 다 결함** | 2단어 쿼리에서 차이 없음 |
| Prod Engineer | **0.6** | ODROID 성능 보호 |
| IR Theory Expert | — | JUDGE 공식 자체를 학습 기반으로 전환해야 |

**결론:** 4:2 (0.6파 다수). Devil's Advocate 지적 — 2단어 쿼리에서는 차이 없음.

#### judge_min_results: 3 vs 5

| 소스 | 권장값 | 근거 |
|------|--------|------|
| Codex CLI 1차 | **5** | 3건으로는 품질 판단 어려움 |
| Codex CLI 2차 | **3** | 5는 semantic 과호출, 버그 수정 후 재평가 |
| Gemini CLI | 3 | 기존 유지 |
| Prod Engineer | **3** | 지연/비용 증가 방지 |

**결론:** 3:1 (3 유지). 버그 수정 후 재평가.

### 8.5 새로운 제안 (이번 토론에서 도출)

#### 8.5.1 JUDGE 공식 개선: avg_score → max_score

**Gemini CLI + IR Expert 합의:**

```python
# 현재: quality = 0.3*count + 0.4*avg_score + 0.3*coverage
# 문제: "1개 완벽한 문서 + 9개 쓰레기" → avg 깎여 semantic 불필요하게 트리거

# 개선안:
max_score = max(r.score for r in fts_results)
max_score_factor = min(max_score / target_score, 1.0)
quality = 0.4 * max_score_factor + 0.6 * coverage_factor
```

#### 8.5.2 Trigram → title-only fuzzy 재배치

**IR Theory Expert:**
> Trigram (q-gram) 유사도의 이론적 기반은 문자 n-gram의 Jaccard 계수.
> |query| << |document|일 때 분모가 document에 압도되어 유사도가 0에 수렴.
> 그러나 title 검색에서는: "PCR" vs "PCR Protocol" → similarity ≈ 0.43 — 유용한 신호.

#### 8.5.3 JUDGE 가중치를 학습 기반으로 전환

**IR Theory Expert:**
> 가중치 0.3/0.4/0.3의 근거는 직관. IR 연구에서는 hand-tuned combination이
> 학습된 조합에 비해 일관되게 열등함이 반복 확인됨.
> 100개의 레이블된 쿼리에 로지스틱 회귀를 돌리면 현재보다 나은 결정 경계를 학습 가능.

#### 8.5.4 English stemming = "부채"가 아닌 "고장"

**Devil's Advocate + IR Theory Expert:**
> `to_tsvector('simple', ...)` = 공백 분리 + 소문자화만. 스테밍 없음.
> 이것은 1960년대 Boolean keyword search 수준.
> "experiments" 검색 → "experiment" 미매칭 = **silent failure**.
> 기술 부채가 아닌 현재 고장난 기능.

### 8.6 전원 합의 사항

| 합의 | 비고 |
|------|------|
| BUG-3(Semantic 중복) 즉시 수정 | 7개 관점 모두 최우선 또는 상위 |
| Trigram은 content_text에서 무용지물 | 수학적으로 입증, 전원 동의 |
| 실측 데이터 없이 파라미터 논쟁은 한계 | A/B 테스트, NDCG@20 측정 필요 |
| English stemming은 즉시 수정해야 할 문제 | "부채"가 아닌 "고장" |
| 버그 수정이 파라미터 튜닝보다 선행 | 오염된 데이터의 가중치 조정은 무의미 |

### 8.7 최종 실행 우선순위

```
P0 즉시 수정:
  1. BUG-3 — Semantic 중복 제거 (DISTINCT ON note_id)
  2. BUG-1 — websearch_to_tsquery 전환 (PostgreSQL 공식 권장)
  3. BUG-4 — ExactMatch regexp_replace에 regex escape 적용

P1 단기 수정:
  4. BUG-2 — 페이지네이션: fetch(offset+limit) → merge → slice (Azure/OpenSearch 패턴)
  5. unified_trigram_weight → 0.0 (content에서 비활성화)
  6. JUDGE: avg_score → max_score 전환 검토

P2 측정 후 결정:
  7. rrf_k — 50개 대표 쿼리로 NDCG@20 비교 (k=30,40,60)
  8. judge_min_term_coverage — 쿼리 길이별 시뮬레이션 (0.5/0.6/0.75)
  9. English stemming — to_tsvector('english', ...) 마이그레이션
  10. count().over() → 별도 COUNT 쿼리 분리
```

### 8.8 참고 소스

- PostgreSQL 16 공식: [Text Search Controls — websearch_to_tsquery](https://www.postgresql.org/docs/16/textsearch-controls.html)
- Azure AI Search: [Hybrid Search Scoring (RRF)](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking)
- Cormack, Clarke & Butt (2009): RRF 원논문 — k=60은 TREC 500K+ 규모 기준
- pgvector: [Open-source vector similarity search for Postgres](https://github.com/pgvector/pgvector)
