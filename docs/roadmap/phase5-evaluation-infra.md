# Phase 5 — 지능형 평가 인프라 (v2.1.0)

> 근거: ReSeek (FictionalHot 합성 벤치마크), Web-Shepherd (WebRewardBench 메타 평가)

## 현재 상태 분석

### 기존 인프라
- **Admin 페이지** — `pages/Admin.tsx` (사용자 관리, DB 통계, NAS 상태)
- **Search Params** — 12개 파라미터 튜닝 UI (이미 A/B 테스트의 기반)
- **Activity Log** — `services/activity_log.py` (`log_activity()`)
- **AI 프로바이더** — 4개 (OpenAI, Anthropic, Google, ZhipuAI) — 비교 대상 풍부

### 부재
- 품질 메트릭 수집 없음
- 사용자 피드백 수집 없음
- AI 응답 비교 프레임워크 없음

---

## Task 5-1. AI 기능 A/B 평가 프레임워크

### 목표
**합성 테스트 데이터**로 프로바이더/모델 간 객관적 비교

### 설계 근거 (ReSeek FictionalHot)
- 실제 데이터 → LLM이 이미 암기했을 수 있음 → 불공정 비교
- 합성 데이터로 "순수 추론 능력"만 평가
- 핵심 발견: "모델 크기 우위는 암기가 불가능하면 사라진다"

### TODO

#### Backend

- [ ] **평가 프레임워크** (`services/evaluation/` — 신규 디렉토리)
  ```
  services/evaluation/
  ├── __init__.py
  ├── framework.py       # EvaluationFramework 메인 클래스
  ├── test_generator.py  # 합성 테스트 데이터 생성
  ├── scorer.py          # 자동 채점 로직
  └── report.py          # 평가 리포트 생성
  ```

- [ ] **합성 테스트 생성기** (`test_generator.py`)
  ```python
  class SyntheticTestGenerator:
      """FictionalHot 패턴: 합성 노트 + 합성 질문 생성"""

      def generate_test_notes(self, count: int = 20) -> list[SyntheticNote]:
          """
          1. 실제 노트 구조 참고하여 합성 연구 노트 생성
          2. 가상 연구 주제, 가상 연구자명 사용
          3. 정답이 명확한 질문-답변 쌍 포함
          """

      def generate_test_queries(
          self, notes: list[SyntheticNote]
      ) -> list[TestQuery]:
          """
          다양한 난이도의 테스트 쿼리:
          - 단순 사실 질문 (단일 노트 참조)
          - 비교/대조 질문 (복수 노트 참조)
          - 추론 질문 (여러 노트 조합)
          """
  ```

- [ ] **자동 채점** (`scorer.py`)
  ```python
  class AutoScorer:
      def score_search(
          self, query: TestQuery, results: list[SearchResult]
      ) -> SearchScore:
          """Precision@K, Recall, MRR"""

      def score_qa(
          self, query: TestQuery, response: str, ground_truth: str
      ) -> QAScore:
          """Correctness, Utility, Faithfulness (환각 비율)"""

      def score_summary(
          self, note: SyntheticNote, summary: str
      ) -> SummaryScore:
          """Coverage, Conciseness, Accuracy"""
  ```

- [ ] **A/B 비교 실행기** (`framework.py`)
  ```python
  class EvaluationFramework:
      async def run_comparison(
          self,
          models: list[str],  # ["gpt-4o", "claude-3.5-sonnet", "gemini-pro"]
          test_suite: TestSuite,
      ) -> ComparisonReport:
          """각 모델로 동일 테스트 실행 → 점수 비교 리포트"""
  ```

- [ ] **API 엔드포인트**
  ```python
  POST /api/admin/evaluation/run   → {"task_id": "..."}
  GET  /api/admin/evaluation/{id}  → ComparisonReport
  GET  /api/admin/evaluation/list  → list[EvaluationSummary]
  ```

#### Frontend

- [ ] **평가 대시보드** (`pages/Admin.tsx` 확장)
  - 모델 비교 차트 (레이더 차트 또는 바 차트)
  - 테스트 실행 버튼 + 진행률
  - 히스토리 뷰

### 예상 난이도: ★★★★★
새로운 서브시스템. 합성 데이터 품질이 핵심.

---

## Task 5-2. 검색 품질 메트릭 대시보드

### 목표
Correctness vs Utility **분리 메트릭**, 검색 파라미터 변경의 실시간 영향 모니터링

### TODO

#### Backend

- [ ] **메트릭 수집** (`services/metrics.py` — 신규)
  ```python
  class SearchMetrics:
      """검색 품질 메트릭 수집/집계"""

      async def record_search(
          self,
          query: str,
          results: list[SearchResult],
          search_type: str,
          duration_ms: int,
          user_id: int,
      ) -> None:
          """검색 이벤트 기록"""

      async def get_dashboard_data(
          self,
          period: str = "7d",
      ) -> MetricsDashboard:
          """
          집계 데이터:
          - 총 검색 수, 평균 결과 수
          - 검색 유형별 분포
          - 평균 응답 시간
          - 0-result 검색 비율 (문제 지표)
          - 일별 트렌드
          """
  ```

- [ ] **DB 테이블** (마이그레이션)
  ```python
  class SearchEvent(Base):
      id: int
      user_id: int
      query: str
      search_type: str
      result_count: int
      duration_ms: int
      created_at: datetime
      # 선택: 사용자 클릭 결과 (클릭률 측정용)
      clicked_note_id: int | None
  ```

- [ ] **API 엔드포인트**
  ```python
  GET /api/admin/metrics/search?period=7d → MetricsDashboard
  ```

#### Frontend

- [ ] **메트릭 대시보드** (`pages/Admin.tsx` 확장)
  - 검색 품질 탭 추가
  - 일별 검색량 차트
  - 0-result 쿼리 목록 (검색 개선 힌트)
  - 검색 유형별 분포 파이 차트
  - 파라미터 변경 전/후 비교

### 예상 난이도: ★★★☆☆
표준적인 메트릭 수집/대시보드. DB 설계가 핵심.

---

## Task 5-3. 사용자 피드백 루프

### 목표
검색 결과/AI 응답에 대한 **사용자 평가 수집** → 자동 최적화

### TODO

#### Backend

- [ ] **피드백 수집** (`services/feedback.py` — 신규)
  ```python
  class FeedbackService:
      async def submit_search_feedback(
          self,
          search_event_id: int,
          relevant_note_ids: list[int],  # 사용자가 유용하다고 선택한 결과
          irrelevant_note_ids: list[int],  # 관련 없다고 선택한 결과
      ) -> None:

      async def submit_ai_feedback(
          self,
          feature: str,
          rating: int,  # 1-5
          comment: str | None = None,
      ) -> None:

      async def compute_optimal_params(self) -> dict[str, float]:
          """
          피드백 기반 검색 파라미터 최적화:
          1. 피드백 데이터 집계
          2. 유용/비유용 결과의 엔진별 기여도 분석
          3. 최적 가중치 추천
          """
  ```

- [ ] **DB 테이블** (마이그레이션)
  ```python
  class SearchFeedback(Base):
      id: int
      search_event_id: int  # FK → SearchEvent
      note_id: int
      relevant: bool  # True = 유용, False = 관련 없음
      created_at: datetime

  class AIFeedback(Base):
      id: int
      user_id: int
      feature: str  # "insight", "search_qa", etc.
      rating: int   # 1-5
      comment: str | None
      model_used: str
      created_at: datetime
  ```

- [ ] **API 엔드포인트**
  ```python
  POST /api/feedback/search  {"search_id": 1, "relevant": [5,8], "irrelevant": [12]}
  POST /api/feedback/ai      {"feature": "insight", "rating": 4}
  GET  /api/admin/feedback/summary → 피드백 집계
  ```

#### Frontend

- [ ] **검색 결과 피드백** (`components/NoteCard.tsx`)
  - 결과 카드에 미니 엄지 up/down 버튼
  - 클릭 시 피드백 전송

- [ ] **AI 응답 피드백** (`components/AIChat.tsx`)
  - 응답 하단에 별점 (1-5) + 선택적 코멘트
  - "이 답변이 도움이 되었나요?" 프롬프트

- [ ] **Admin 피드백 뷰** (`pages/Admin.tsx`)
  - 피드백 요약 차트
  - AI 기능별 만족도 트렌드
  - 파라미터 최적화 추천값 표시 + 적용 버튼

### 예상 난이도: ★★★☆☆
표준적인 피드백 시스템. 최적화 알고리즘은 향후 고도화.

---

## 구현 순서 (권장)

```
5-2 (메트릭) → 5-3 (피드백) → 5-1 (A/B 평가)
     3일           3일            5일
```

- 5-2가 기반 (SearchEvent 테이블, 메트릭 수집)
- 5-3은 5-2의 SearchEvent 위에 피드백 추가
- 5-1은 독립적이지만 가장 복잡, 마지막에

## 테스트 전략

- [ ] Unit: 합성 테스트 생성기 — 다양한 시나리오
- [ ] Unit: 자동 채점 — 정확도 검증
- [ ] Unit: 메트릭 집계 — 기간별 쿼리 정확성
- [ ] Integration: 피드백 수집 → 파라미터 최적화 파이프라인
- [ ] 비용 측정: A/B 평가 실행 시 API 호출 비용
