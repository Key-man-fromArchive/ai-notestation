# Workplan: Post-Retrieval JUDGE 후속 작업

> 작성일: 2026-02-13 | 기반: SearchJudge post-retrieval 전환 완료

---

## 현재 상태

| 항목 | 상태 |
|------|------|
| Post-retrieval JUDGE 구현 | ✅ FTS→Judge→conditional semantic |
| JudgeInfo API 필드 확장 | ✅ fts_result_count, fts_avg_score, term_coverage |
| Settings UI 임계값 5개 | ✅ judge_min_results 등 |
| 검색 뱃지 (Search.tsx) | ✅ WP-1 완료 - semantic_only 제거, 메트릭 tooltip, confidence 표시 |
| 테스트 스위트 | ⚠️ test_hybrid_search 26/26 통과, test_api_search·test_fts·test_semantic 기존 깨짐 |

---

## WP-1. 검색 뱃지 개선 + dead code 정리 ✅ `완료: 2026-02-13`

### 목표
Judge가 판단한 이유를 사용자에게 투명하게 보여주기

### 변경 (완료)

**`frontend/src/pages/Search.tsx`**:
- ✅ `semantic_only` 뱃지 케이스 제거 (더 이상 발생 안 함)
- ✅ `fts_only` 뱃지에 tooltip 강화: "FTS sufficient (4 results, avg score 0.85, coverage 100%)"
- ✅ `hybrid` 뱃지에 tooltip: "FTS insufficient (1 results, avg score 0.02) → Semantic boost"
- ✅ confidence 수치를 뱃지 내 숫자로 표시 (예: "FTS ⚡ 92")
- ✅ `cursor-help` 클래스 추가로 UX 개선

**`frontend/src/locales/{en,ko}.json`**:
- ✅ `search.strategy_fts_only` → "FTS ⚡" (라이트닝 이모지 포함)
- ✅ `search.strategy_hybrid` → "Hybrid" / "하이브리드"
- ✅ `search.strategy_semantic_only` 제거 (전체 codebase에서 제거 확인)

### 검증 결과
- ✅ `npx tsc --noEmit` - 타입 체크 통과
- ✅ `grep -r "semantic_only"` - 잔여 참조 없음
- ⏳ 브라우저 테스트 대기 (개발 서버에서 확인 필요)

### 구현 세부사항

**Badge Tooltip 로직**:
```tsx
title={
  judgeInfo.strategy === 'fts_only'
    ? `FTS sufficient (${judgeInfo.fts_result_count ?? 0} results, avg score ${(judgeInfo.fts_avg_score ?? 0).toFixed(2)}, coverage ${((judgeInfo.term_coverage ?? 0) * 100).toFixed(0)}%)`
    : judgeInfo.strategy === 'hybrid'
    ? `FTS insufficient (${judgeInfo.fts_result_count ?? 0} results, avg score ${(judgeInfo.fts_avg_score ?? 0).toFixed(2)}) → Semantic boost`
    : judgeInfo.skip_reason || undefined
}
```

**Confidence Display**:
```tsx
<span className="ml-0.5 opacity-80">{(judgeInfo.confidence * 100).toFixed(0)}</span>
```

### 사용자 경험 개선
- **투명성**: Judge 판단 근거가 tooltip으로 명확히 표시
- **신뢰성**: Confidence 점수 표시로 시스템 확신도 전달
- **간결성**: 이모지 사용으로 시각적 식별성 향상 (⚡ = 빠른 FTS)

---

## WP-2. 깨진 테스트 일괄 수정 `~2h`

### 문제
`test_api_search.py`, `test_fts.py`, `test_semantic.py`가 엔진 반환값을 `list[SearchResult]`로 기대하지만 실제로는 `SearchPage` 반환

### 변경

**`backend/tests/test_fts.py`**:
- 모든 `assert result == []` → `assert result.results == []` 또는 `assert isinstance(result, SearchPage)`
- mock 반환값을 `SearchPage(results=[...], total=N)`으로 통일

**`backend/tests/test_semantic.py`**:
- 동일한 SearchPage 적응
- `MagicMock` source_created_at/updated_at → `None` 또는 ISO 문자열로 수정

**`backend/tests/test_api_search.py`**:
- mock engine이 `SearchPage` 반환하도록 수정
- `_build_hybrid_engine` → 기본 search type이 `search`(unified)임을 반영하여 `_build_unified_engine` 패치로 변경
- 또는 `type=hybrid` 쿼리 파라미터 명시

### 검증
```bash
docker exec labnote-backend python -m pytest tests/test_fts.py tests/test_semantic.py tests/test_api_search.py -v
```

---

## WP-3. ROADMAP / TODO 업데이트 `~15min`

### 변경

**`ROADMAP.md`**:
- Phase 1-2 상태: 🔲 → ✅
- 설명에 "post-retrieval JUDGE 패턴 (ReSeek 논문 원본 의도)" 추가

**`docs/roadmap/TODO.md`**:
- Phase 1-2 체크박스: `[x]` 완료 표시
- 추가 항목: "Post-retrieval 전환 (2026-02-13)" 기록

---

## WP-4. Search QA에 Judge 통합 `~2h`

### 목표
`/search/refine` 엔드포인트의 재검색도 post-retrieval judge를 거치도록

### 현재 문제
Refine은 `HybridSearchEngine.search()`를 호출하므로 이미 judge가 적용됨.
하지만 `judge_info`가 refine 응답에 포함되는지, 턴별 judge 판단이 누적 표시되는지 확인 필요.

### 변경

**`backend/app/api/search.py`** (refine endpoint):
- `RefineResponse`에 이미 `judge_info` 있음 → 확인만
- 턴별 judge_info를 refine history에 포함

**`frontend/src/hooks/useSearchRefine.ts`**:
- refine 히스토리에 judge_info 저장
- 턴별 "FTS 충분/시맨틱 보강" 표시

### 검증
- 리파인 2-3턴 실행 → 각 턴마다 judge 판단 확인

---

## WP-5. 검색 메트릭 로깅 (Phase 5-2 선행) `~3h`

### 목표
Judge 판단 통계를 수집하여 임계값 튜닝의 근거 제공

### 변경

**`backend/app/search/engine.py`**:
- `HybridSearchEngine.search()` 끝에 메트릭 이벤트 발행
- 이벤트: `{query, strategy, confidence, fts_count, avg_score, coverage, semantic_ran, latency_ms}`

**`backend/app/services/search_metrics.py`** (신규):
- 인메모리 링 버퍼 (최근 1000건)
- `GET /api/search/metrics/judge` → 최근 통계 반환
  - semantic 실행 비율, 평균 confidence, 평균 FTS 레이턴시

**`frontend/src/pages/Settings.tsx`** (또는 Admin):
- Judge 통계 카드: "최근 1000 검색 중 73%는 FTS만으로 충분"

### 검증
```bash
docker exec labnote-backend python -m pytest tests/test_hybrid_search.py -v
# + 브라우저에서 메트릭 확인
```

---

## 실행 순서

```
WP-1 (뱃지) ─┐
WP-2 (테스트) ├── 병렬 가능, 독립적
WP-3 (문서)  ─┘
     │
     ▼
WP-4 (Refine 통합) ── WP-1 완료 후
     │
     ▼
WP-5 (메트릭) ── Phase 5-2 선행 작업
```

**예상 총 소요**: ~8h (WP-1~3 병렬 시 ~5h)

---

## 스코프 외 (다음 사이클)

| 항목 | 이유 |
|------|------|
| Phase 4-3 외부 콘텐츠 캡처 | 검색과 무관, 별도 사이클 |
| Phase 5-1 A/B 프레임워크 | 대규모, WP-5 완료 후 |
| Reranker 통합 | Neural reranker는 임베딩 모델 의존, 별도 평가 필요 |
