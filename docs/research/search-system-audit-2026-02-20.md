# LabNote AI 검색 시스템 전면 감사 보고서

**일시**: 2026-02-20
**작성**: Claude Opus 4.6 (Gemini CLI 429 rate limit으로 단독 분석)
**트리거**: 사용자 보고 — "키워드 검색" 버튼 2개가 동일 라벨, "PCR" 검색 불가

---

## 1. Executive Summary

**LabNote AI의 검색 시스템은 현재 심각하게 고장나 있다.** DB 트리거와 인덱스 누락으로 인해 6개 검색 엔진 중 4개가 사실상 작동하지 않으며, 유일하게 작동하는 것은 가장 원시적인 ILIKE 서브스트링 매칭뿐이다.

### 발견된 치명적 문제들

| # | 심각도 | 문제 | 영향 |
|---|--------|------|------|
| 1 | **P0** | `search_vector` 컬럼이 **전체 2,260개 노트에서 NULL** | FTS 엔진 완전 불능 |
| 2 | **P0** | `update_search_vector()` 트리거 함수 **DB에 존재하지 않음** | 새 노트도 인덱싱 안 됨 |
| 3 | **P0** | `trigger_update_search_vector` 트리거 **DB에 존재하지 않음** | 위와 동일 |
| 4 | **P1** | trigram GIN 인덱스 (`idx_notes_title_trgm`, `idx_notes_content_text_trgm`) **누락** | Trigram 검색 극도로 느림 (seq scan) |
| 5 | **P1** | UI 버튼 3개 중 2개가 동일 라벨 "키워드 검색" | 사용자 혼란 |
| 6 | **P2** | Trigram similarity threshold(0.1)가 과학 약어(PCR, DNA)에 너무 높음 | 짧은 약어 검색 실패 |
| 7 | **P2** | Alembic version이 023에서 멈춤 (024, 025 미적용) | 평가/그룹 테이블 누락 가능 |

---

## 2. 근본 원인 분석 (Root Cause)

### 2.1 search_vector NULL 문제

**증거:**
```sql
SELECT count(*) AS total, count(search_vector) AS has_sv FROM notes;
-- total=2260, has_sv=0 → 100% NULL
```

**원인 추적:**
- Migration `001_initial_schema.py`에서 트리거와 함수를 `op.execute()` SQL로 생성하도록 정의되어 있음
- 그러나 실제 DB에는 트리거도 함수도 존재하지 않음
- 가능한 원인:
  1. Docker 볼륨 재생성 시 마이그레이션이 건너뛰어졌을 수 있음
  2. 별도의 마이그레이션이나 DB 복원 과정에서 트리거가 DROP되었을 수 있음
  3. `pg_dump --data-only` 복원 시 트리거/함수가 빠졌을 수 있음

### 2.2 trigram 인덱스 누락

**증거:**
```sql
SELECT indexname FROM pg_indexes WHERE indexname LIKE '%trgm%';
-- (0 rows)
```

Migration `006_pg_trgm_korean_search.py`에서 생성해야 하지만 실제로는 없음. 001과 동일한 원인으로 추정.

### 2.3 "PCR" 검색 실패 메커니즘

**ILIKE (ExactMatchEngine):** ✅ 작동함 — 976개 노트에서 "PCR" 발견
```sql
SELECT count(*) FROM notes WHERE content_text ILIKE '%PCR%';  -- 976
```

**FTS (FullTextSearchEngine):** ❌ search_vector가 NULL이므로 0건
```sql
SELECT count(*) FROM notes WHERE search_vector @@ to_tsquery('simple', 'pcr');  -- 0
```

**Trigram (TrigramSearchEngine):** ❌ similarity가 threshold 이하
```sql
SELECT similarity('PCR', '긴 문서 내용...');  -- 0.02~0.06 (threshold 0.1 미달)
```

**결과:** UnifiedSearchEngine(FTS+Trigram) = 0 + 0 = 0건 반환

---

## 3. 현재 검색 아키텍처 분석

### 3.1 백엔드 엔진 구성 (6개)

```
SearchType enum:
├── exact  → ExactMatchSearchEngine (ILIKE %q%)     ← 유일하게 작동
├── search → UnifiedSearchEngine (FTS + Trigram RRF) ← 둘 다 고장
├── hybrid → HybridSearchEngine (FTS + Semantic RRF) ← FTS 고장
├── fts    → FullTextSearchEngine (tsvector)          ← 고장
├── semantic → SemanticSearchEngine (pgvector)        ← 임베딩 필요
└── trigram  → TrigramSearchEngine (pg_trgm)          ← 인덱스 없음, 느림
```

### 3.2 프론트엔드 UI (Search.tsx)

```
버튼 1: "키워드 검색" (TextSearch 아이콘) → exact 모드
버튼 2: "키워드 검색" (아이콘 없음)       → search 모드   ← 동일 라벨!
버튼 3: "하이브리드" (Sparkles 아이콘)    → hybrid 모드
```

**문제점:**
- 버튼 1, 2가 동일한 라벨 `t('search.fts')` = "키워드 검색"
- 사용자는 차이를 알 수 없음
- 실제로 버튼 2(search)가 작동 안 하므로, 사용자는 버튼 1만 사용 가능
- 버튼 1은 ILIKE로 정확 매칭만 하므로 형태소 분석이나 유사 검색 불가

### 3.3 검색 파이프라인 흐름

```
사용자 입력 "PCR"
    │
    ├─ exact 모드: ILIKE '%PCR%' → 976건 ✅
    │
    ├─ search 모드:
    │   ├─ FTS: search_vector @@ to_tsquery('simple', 'pcr') → 0건 (NULL vector)
    │   └─ Trigram: similarity('pcr', content) > 0.1 → 0건 (sim=0.02)
    │   └─ RRF merge: 0 + 0 = 0건 ❌
    │
    └─ hybrid 모드:
        ├─ FTS: 0건 (같은 이유)
        └─ Semantic: 임베딩 있으면 의미 기반 검색 → ?건
        └─ RRF merge: 0 + ?건 = ?건
```

---

## 4. 수정 제안

### Phase 1: 긴급 수정 (P0 — 즉시)

#### 4.1 DB 트리거 및 함수 복원

```sql
-- 1. 트리거 함수 재생성
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.content_text, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. 트리거 재생성
CREATE TRIGGER trigger_update_search_vector
    BEFORE INSERT OR UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION update_search_vector();

-- 3. 기존 노트 전체 백필 (2,260건)
UPDATE notes SET
    search_vector =
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(content_text, '')), 'B');
```

#### 4.2 Trigram GIN 인덱스 복원

```sql
CREATE INDEX IF NOT EXISTS idx_notes_title_trgm
    ON notes USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_notes_content_text_trgm
    ON notes USING GIN (content_text gin_trgm_ops);
```

→ 이 모든 것을 **Alembic 마이그레이션 026**으로 구현

### Phase 2: 검색 엔진 개선 (P1)

#### 4.3 UnifiedSearchEngine에 ILIKE 폴백 추가

현재 FTS + Trigram 둘 다 결과 0이면 빈 결과 반환. 개선:

```python
async def search(self, query, ...):
    fts_page, trigram_page = await asyncio.gather(fts_task, trigram_task)
    merged = self._rrf_merge(fts_page.results, trigram_page.results, ...)

    # NEW: ILIKE fallback for short queries or when both engines return 0
    if not merged and len(query.strip()) <= 10:
        exact_engine = ExactMatchSearchEngine(self._session)  # 의존성 주입 필요
        return await exact_engine.search(query, limit=limit, offset=offset, ...)

    return SearchPage(results=merged, total=total)
```

#### 4.4 Trigram 임계값 조정 (과학 약어용)

```python
# params.py 수정
DEFAULT_SEARCH_PARAMS = {
    "trigram_threshold_ko": 0.10,   # 0.15 → 0.10 (한국어)
    "trigram_threshold_en": 0.05,   # 0.10 → 0.05 (영어, 약어 대응)
}
```

**근거:** `similarity('PCR', '...PCR...')` = 0.02~0.06이므로 threshold 0.05 이하가 필요.
단, 이렇게 낮추면 노이즈가 증가하므로 **ILIKE 폴백**이 더 실용적.

### Phase 3: UX 개선 (P1)

#### 4.5 검색 모드 재구성

**현재 (3 버튼, 혼란스러움):**
```
[키워드 검색] [키워드 검색] [하이브리드]
```

**제안 A: 2 모드로 단순화 (권장)**
```
[정확히 일치] [스마트 검색]
 exact         unified+semantic (auto)
```

- **정확히 일치**: ILIKE 서브스트링 매칭. "이 단어가 정확히 포함된 노트"
- **스마트 검색**: Unified(FTS+Trigram) → 결과 부족시 자동 Semantic 보강 (기존 hybrid의 JUDGE 로직 활용)

사용자가 엔진을 선택할 필요 없이, 시스템이 자동으로 최적 전략 결정.

**제안 B: 3 모드 유지 (명확한 라벨)**
```
[정확히 일치] [키워드] [AI 검색]
 exact         unified  hybrid+semantic
```

- **정확히 일치** (TextSearch 아이콘): 서브스트링 매칭
- **키워드** (Search 아이콘): FTS + Trigram (형태소 분석, 유사어)
- **AI 검색** (Sparkles 아이콘): FTS + Semantic (의미 기반, 임베딩 필요)

#### 4.6 라벨 번역 키 변경

```json
// ko.json
{
  "search.exact": "정확히 일치",
  "search.keyword": "키워드",
  "search.smart": "스마트 검색",
  "search.ai": "AI 검색"
}

// en.json
{
  "search.exact": "Exact Match",
  "search.keyword": "Keyword",
  "search.smart": "Smart Search",
  "search.ai": "AI Search"
}
```

---

## 5. Trigram vs ILIKE vs FTS: 과학 약어 검색 비교

| 엔진 | "PCR" 검색 | "폴리머라제" 검색 | "polymerase chain" 검색 | 속도 |
|------|-----------|----------------|----------------------|------|
| ILIKE | ✅ 976건 | ✅ 정확 매칭 | ✅ 정확 매칭 | 느림 (seq scan) |
| FTS (fixed) | ✅ (simple config) | ✅ (형태소) | ✅ (OR join) | 빠름 (GIN index) |
| Trigram | ❌ (sim=0.02) | ⚠️ (한국어 sim 낮음) | ⚠️ 부분 매칭 | 중간 |
| Semantic | ✅ (의미 이해) | ✅ (의미 이해) | ✅ (의미 이해) | 느림 (임베딩+코사인) |

**결론:** 과학 약어에는 **FTS가 최적** (simple config에서 "PCR"은 단일 토큰으로 정확히 매칭). Trigram은 약어에 구조적으로 부적합. ILIKE는 정확하지만 느림.

---

## 6. DB 실사 결과 상세

```sql
-- 실행된 쿼리와 결과

-- 1. search_vector 상태
SELECT count(*) AS total, count(search_vector) AS has_sv FROM notes;
-- total=2260, has_sv=0

-- 2. 트리거 존재 여부
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%search%';
-- (0 rows)

-- 3. 함수 존재 여부
SELECT proname FROM pg_proc WHERE proname = 'update_search_vector';
-- (0 rows)

-- 4. trigram 인덱스 존재 여부
SELECT indexname FROM pg_indexes WHERE indexname LIKE '%trgm%';
-- (0 rows)

-- 5. FTS 작동 검증 (search_vector가 있다면 작동할 것)
SELECT to_tsvector('simple', 'PCR is common') @@ to_tsquery('simple', 'pcr');
-- true ✅

-- 6. Trigram similarity 실측
SELECT similarity('PCR', 'PCR is a polymerase chain reaction...');
-- 0.059 (threshold 0.1 미달)

-- 7. ILIKE 작동 확인
SELECT count(*) FROM notes WHERE content_text ILIKE '%PCR%';
-- 976 ✅

-- 8. Alembic version
SELECT version_num FROM alembic_version;
-- 023_repair_notebook_data (024, 025 미적용)

-- 9. pg_trgm 확장 확인
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';
-- pg_trgm 1.6 ✅ (확장은 있으나 인덱스 없음)
```

---

## 7. 구현 우선순위

```
P0 (즉시):
  ├── Migration 026: 트리거/함수 복원 + search_vector 백필 + trigram 인덱스 복원
  └── 예상 소요: 1시간 (마이그레이션 작성 + 테스트)

P1 (1-2일):
  ├── UI 검색 모드 라벨 수정 (중복 "키워드 검색" 해결)
  ├── UnifiedSearchEngine에 ILIKE 폴백 추가
  └── 검색 모드 2-3개로 재구성

P2 (선택):
  ├── Trigram threshold 미세 조정
  ├── 과학 약어 사전 기반 검색 보강
  └── Alembic version을 025까지 적용
```

---

## 8. 참고 자료

- [PostgreSQL pg_trgm 공식 문서](https://www.postgresql.org/docs/current/pgtrgm.html) — similarity 기본 threshold 0.3, 짧은 문자열에서 낮은 similarity
- [Sourcegraph: Postgres text search balancing](https://sourcegraph.com/blog/postgres-text-search-balancing-query-time-and-relevancy) — FTS + trigram + ILIKE 조합 전략
- [Tiger Data: pg_trgm Guide](https://www.tigerdata.com/learn/postgresql-extensions-pg-trgm) — GIN 인덱스의 중요성

---

## 9. 결론

검색 시스템의 핵심 문제는 **인프라 레벨의 결함** (트리거/인덱스 누락)이다. 엔진 코드 자체는 잘 설계되어 있으나, DB 인프라가 빠져 있어서 대부분의 엔진이 "빈 껍데기"로 작동하고 있다.

Migration 026으로 트리거와 인덱스를 복원하면, 기존 FTS + Trigram + Unified + Hybrid 엔진이 모두 정상 작동할 것이며, "PCR" 같은 과학 약어도 FTS에서 올바르게 검색될 것이다.

UI 라벨 문제는 별도로 수정이 필요하며, 2모드(정확히 일치 / 스마트 검색) 구조로 단순화하는 것을 권장한다.
