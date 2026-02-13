# Phase 2 — AI 품질 게이트 (v1.4.0)

> 근거: Web-Shepherd 논문 (checklist decomposition, process reward > outcome reward)

## 현재 상태 분석

### AI 인프라 (`backend/app/ai_router/`)
- `router.py` — AIRouter: `chat()`, `stream()`, `resolve_model()`, 프로바이더 자동 감지
- `schemas.py` — AIRequest, AIResponse, Message, TokenUsage, ProviderError
- `providers/` — OpenAI, Anthropic, Google, ZhipuAI, ChatGPT Codex
- `prompts/` — 6개 태스크 (insight, search_qa, writing, spellcheck, template, summarize)

### SSE 스트리밍 패턴 (`api/ai.py`)
```
event: metadata → data: {"matched_notes": [...]}
data: {"chunk": "..."} → ... → data: [DONE]
event: error → data: {"error": "..."}
```

### 핵심 발견
- AIRequest → 프롬프트 빌드 → provider.stream() → SSE 청크 → [DONE]
- **품질 평가 단계가 전혀 없음** — 생성된 대로 그대로 전달
- summarize.py는 이미 JSON 형식 강제 (title + tags) — 구조화된 출력 패턴 존재

---

## Task 2-1. Checklist-Based AI Quality Gate

### 목표
AI 응답 생성 전 요청을 **검증 가능한 체크리스트로 분해**, 생성 후 자가 평가

### 설계 근거 (Web-Shepherd 논문)
- 체크리스트는 **모든 모델에 보편적으로 효과적** — 특정 모델 의존 아님
- 지시→체크리스트→단계별 평가→종합 점수 패턴
- Reward = avg P("Yes") + 0.5 * avg P("In Progress")

### TODO

#### Backend

- [ ] **Quality Gate 모듈 생성** (`ai_router/quality_gate.py` — 신규)
  ```python
  class QualityChecklist:
      """태스크별 품질 체크리스트"""
      items: list[str]        # 체크 항목들
      min_pass_ratio: float   # 최소 통과 비율 (기본 0.7)

  TASK_CHECKLISTS: dict[str, QualityChecklist] = {
      "insight": QualityChecklist(
          items=[
              "핵심 발견/패턴을 구체적으로 식별했는가?",
              "근거가 되는 노트 내용을 인용했는가?",
              "실행 가능한 시사점을 제시했는가?",
              "요청한 분석 범위를 충족했는가?",
          ],
          min_pass_ratio=0.75,
      ),
      "search_qa": QualityChecklist(
          items=[
              "질문에 직접적으로 답변했는가?",
              "검색 결과의 정보를 근거로 사용했는가?",
              "출처(노트 제목)를 명시했는가?",
              "불확실한 정보에 대해 솔직했는가?",
          ],
          min_pass_ratio=0.75,
      ),
      "writing": QualityChecklist(
          items=[
              "요청된 구조(섹션)를 갖추었는가?",
              "학술적 글쓰기 관례를 따랐는가?",
              "제공된 키워드를 자연스럽게 포함했는가?",
              "마크다운 형식이 올바른가?",
          ],
          min_pass_ratio=0.75,
      ),
      "spellcheck": QualityChecklist(
          items=[
              "수정 사항을 명확히 표시했는가?",
              "원문의 의미를 변경하지 않았는가?",
              "수정 이유를 설명했는가?",
          ],
          min_pass_ratio=1.0,  # 맞춤법은 100% 정확해야
      ),
      "template": QualityChecklist(
          items=[
              "요청된 유형에 적합한 구조인가?",
              "각 섹션에 작성 가이드가 있는가?",
              "메타데이터 필드를 포함했는가?",
              "마크다운 형식이 올바른가?",
          ],
          min_pass_ratio=0.75,
      ),
  }
  ```

- [ ] **자가 평가 프롬프트** (`ai_router/prompts/quality_eval.py` — 신규)
  ```python
  def build_eval_messages(
      checklist: QualityChecklist,
      original_request: str,
      ai_response: str,
  ) -> list[Message]:
      """
      시스템: "당신은 AI 응답 품질 평가자입니다..."
      유저: "원래 요청: {request}\n응답: {response}\n체크리스트: {items}\n
             각 항목에 대해 Yes/No/Partial로 평가하고 JSON으로 응답하세요."
      """
  ```

- [ ] **Quality Gate 통합** (`api/ai.py`)
  - **비스트리밍 (`/chat`)**: 응답 생성 후 → 자가 평가 → 미달 시 재생성 (최대 1회)
  - **스트리밍 (`/stream`)**: 완료 후 평가 → 결과를 별도 SSE 이벤트로 전달
    ```
    event: quality
    data: {"passed": true, "score": 0.85, "details": [...]}
    ```

- [ ] **설정 추가** (`api/settings.py`)
  - `quality_gate_enabled: bool = False` (기본 비활성, 옵트인)
  - `quality_gate_auto_retry: bool = True`

#### Frontend

- [ ] **품질 뱃지 표시** (`components/AIChat.tsx`, `components/NoteAIPanel.tsx`)
  - AI 응답 하단에 품질 점수 뱃지 (예: "품질 85%")
  - 클릭 시 체크리스트 상세 펼침
  - 미달 항목 하이라이트

- [ ] **재생성 버튼**
  - 품질 미달 시 "다시 생성" 버튼 표시
  - 어떤 항목이 미달인지 사용자에게 표시

### 파일 변경 목록
| 파일 | 변경 유형 |
|------|-----------|
| `backend/app/ai_router/quality_gate.py` | **신규** — QualityChecklist, 평가 로직 |
| `backend/app/ai_router/prompts/quality_eval.py` | **신규** — 평가 프롬프트 |
| `backend/app/api/ai.py` | 수정 — /chat, /stream에 Quality Gate 통합 |
| `frontend/src/components/AIChat.tsx` | 수정 — 품질 뱃지 |
| `frontend/src/components/NoteAIPanel.tsx` | 수정 — 품질 뱃지 |

### 예상 난이도: ★★★☆☆
추가 AI 호출 비용 발생. 프롬프트 엔지니어링이 핵심.

---

## Task 2-2. Search QA 결과 품질 평가

### 목표
search_qa 응답의 **정확성(Correctness) + 유용성(Utility)** 분리 평가

### 설계 근거 (ReSeek 논문)
- Dense reward = Correctness + Utility 분해
- 사실 정확성과 쿼리 관련성을 독립적으로 측정
- 0.7 임계값으로 이산 판단

### TODO

#### Backend

- [ ] **이중 평가 로직** (`ai_router/quality_gate.py` 확장)
  ```python
  class SearchQAEvaluator:
      async def evaluate(
          self,
          query: str,
          search_results: list[SearchResult],
          ai_response: str,
      ) -> QAEvaluation:
          """
          1. Correctness: 응답 내용이 검색 결과에 근거하는가? (환각 아닌가?)
             - 응답의 각 주장을 검색 결과와 대조
             - reranker 스코어 활용 가능

          2. Utility: 응답이 원래 질문에 유용한가?
             - 질문의 핵심을 다루었는가?
             - 실행 가능한 정보를 포함하는가?
          """
          return QAEvaluation(
              correctness_score=...,  # 0.0~1.0
              utility_score=...,      # 0.0~1.0
              confidence_level=...,   # "high" | "medium" | "low"
              grounding_issues=[...], # 근거 없는 주장 목록
          )
  ```

- [ ] **신뢰도 표시 SSE 이벤트**
  ```
  event: qa_evaluation
  data: {"correctness": 0.9, "utility": 0.8, "confidence": "high", "issues": []}
  ```

- [ ] **경량 평가 (reranker 기반)**
  - AI 추가 호출 없이 reranker 스코어로 근거 검증
  - 응답 문장 → 검색 결과 패시지 매칭 → 스코어 산출

#### Frontend

- [ ] **신뢰도 인디케이터** (`components/AIChat.tsx`)
  - Search QA 응답에 신뢰도 뱃지: 높음(초록)/보통(노랑)/낮음(빨강)
  - "이 답변은 N개 노트를 근거로 합니다" 표시
  - 근거 없는 주장 경고 표시

### 파일 변경 목록
| 파일 | 변경 유형 |
|------|-----------|
| `backend/app/ai_router/quality_gate.py` | 수정 — SearchQAEvaluator 추가 |
| `backend/app/api/ai.py` | 수정 — search_qa 응답에 평가 통합 |
| `frontend/src/components/AIChat.tsx` | 수정 — 신뢰도 표시 |

### 예상 난이도: ★★★☆☆
reranker 기반 경량 평가는 비교적 간단. AI 기반 평가는 추가 비용.

---

## Task 2-3. 스트리밍 중간 품질 체크

### 목표
SSE 스트리밍 도중 **중간 지점에서 품질 평가** → 잘못된 방향 조기 감지

### 설계 근거 (Web-Shepherd 논문)
- Process reward > Outcome reward
- 최종 결과만이 아닌 중간 단계 평가가 더 효과적
- 조기 감지로 낭비 방지

### TODO

#### Backend

- [ ] **스트리밍 모니터** (`ai_router/stream_monitor.py` — 신규)
  ```python
  class StreamMonitor:
      """스트리밍 청크를 버퍼링하며 중간 품질 체크"""

      buffer: str = ""
      check_interval: int = 500  # 500자마다 체크

      async def on_chunk(self, chunk: str) -> StreamAction:
          self.buffer += chunk
          if len(self.buffer) >= self.check_interval:
              quality = self._quick_check(self.buffer)
              if quality < threshold:
                  return StreamAction.ABORT_AND_RETRY
          return StreamAction.CONTINUE

      def _quick_check(self, text: str) -> float:
          """경량 휴리스틱 체크 (AI 호출 없음)"""
          # 1. 언어 일관성 (한글 요청에 영어 응답?)
          # 2. 반복 감지 (같은 문장 반복?)
          # 3. 형식 체크 (마크다운 요청에 플레인텍스트?)
          # 4. 길이 이상 감지 (과도한 반복)
  ```

- [ ] **AIRouter.stream()에 모니터 통합** (`ai_router/router.py`)
  - 스트리밍 루프에 모니터 삽입
  - ABORT 시 재시도 (최대 1회)
  - 재시도 시 SSE로 사용자에게 알림
    ```
    event: retry
    data: {"reason": "응답 품질 미달로 재생성 중"}
    ```

#### Frontend

- [ ] **재생성 알림 UI**
  - "AI가 더 나은 응답을 생성 중입니다..." 표시
  - 스피너 + 이유 텍스트

### 파일 변경 목록
| 파일 | 변경 유형 |
|------|-----------|
| `backend/app/ai_router/stream_monitor.py` | **신규** — StreamMonitor |
| `backend/app/ai_router/router.py` | 수정 — stream()에 모니터 통합 |
| `frontend/src/hooks/useAIStream.ts` | 수정 — retry 이벤트 핸들링 |

### 예상 난이도: ★★★★☆
스트리밍 중 인터럽트는 복잡. 휴리스틱 기반이므로 오탐 관리 필요.

---

## 구현 순서 (권장)

```
2-1 (Checklist Gate) → 2-2 (Search QA Eval) → 2-3 (Stream Monitor)
       3일                   2일                    3일
```

- 2-1이 기반 인프라 (quality_gate.py, quality_eval.py)
- 2-2는 2-1의 인프라 위에 Search QA 특화 로직 추가
- 2-3은 독립적이지만 가장 복잡

## 테스트 전략

- [ ] Unit: 각 태스크 체크리스트 평가 로직
- [ ] Unit: SearchQAEvaluator — 환각 감지 정확도
- [ ] Unit: StreamMonitor — 반복 감지, 언어 불일치 감지
- [ ] Integration: 전체 AI 파이프라인 (요청 → 생성 → 평가 → 응답)
- [ ] 비용 측정: Quality Gate 활성화 시 추가 AI 호출 비용
