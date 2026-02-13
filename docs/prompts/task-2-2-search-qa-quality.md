# Task 2-2: Search QA 결과 품질 평가 구현

## 프로젝트 컨텍스트

LabNote AI는 Synology NoteStation에 AI 기능을 추가하는 프로젝트입니다.
- **Tech Stack**: FastAPI (Python 3.12+) + React 19 + Vite + TailwindCSS + shadcn/ui + PostgreSQL 16 + pgvector
- **현재 버전**: v1.4.0-dev (Phase 2 진행 중)
- **Phase 2 (AI 품질 게이트)** 중 **2-2(Search QA Quality)만 구현**. 2-1은 완료.

## 구현 목표

Search QA 응답의 **정확성(Correctness) + 유용성(Utility)** 분리 평가.
ReSeek 논문의 dense reward 분해 패턴 적용 — 사실 정확성 ↔ 쿼리 관련성 독립 측정.
기존 2-1 QualityGate의 범용 체크리스트와 **별개로**, search_qa 전용 심층 평가.

**설계 근거 (ReSeek 논문)**: "Correctness + Utility 분리가 단일 점수보다 유의미한 품질 신호 제공"

---

## 현재 Search QA 아키텍처 (이미 구현됨)

### Search QA 프롬프트 (`backend/app/ai_router/prompts/search_qa.py`)

```python
# 시스템 프롬프트 핵심:
# - 반드시 제공된 노트 내용을 근거로 답변
# - 출처 명시 ([노트 1], [노트 2])
# - 관련 정보 없으면 솔직히 표시
# - 추측 구분 표시

def build_messages(question, context_notes, lang) -> list[Message]:
    # [노트 1]\n{note}\n\n[노트 2]\n{note}
    # 질문: {question}
```

### Search QA 호출 흐름 (`backend/app/api/ai.py`)

**두 가지 경로**:
1. `feature="search_qa"` + `options.context_notes` — 클라이언트가 context 직접 전달
2. `feature="insight"` + `options.mode="search"` — 서버에서 `_search_and_fetch_notes()` 호출

**`_search_and_fetch_notes()`** (Line 283-339):
- `FullTextSearchEngine`으로 상위 5개 노트 검색
- `content_text` 가져와서 12k chars까지 결합
- 반환: `(notes_metadata, combined_content)` — metadata에 note_id, title, score 포함

### 기존 Quality Gate (`backend/app/ai_router/quality_gate.py`)

2-1에서 구현한 범용 체크리스트:
```python
"search_qa": QualityChecklist(
    items=[
        "질문에 직접적으로 답변했는가?",
        "검색 결과를 근거로 활용했는가?",
        "출처(노트 제목 등)를 명시했는가?",
        "불확실한 부분을 솔직히 표시했는가?",
    ],
    min_pass_ratio=0.75,
)
```
**한계**: 응답이 "출처를 명시했다"고 평가할 수 있지만, 실제로 context_notes 내용과 일치하는지 **검증하지 않음**.

### 프론트엔드 SSE 이벤트 (`frontend/src/hooks/useAIStream.ts`)

```
event: metadata → setMatchedNotes()
data: {"chunk": ...} → setContent()
data: [DONE] → setIsStreaming(false)
event: quality → setQualityResult()    # 2-1에서 추가
```

### 프론트엔드 컴포넌트

- `AIChat.tsx` — AI 워크벤치 대화 UI. quality 뱃지 표시.
- `NoteAIPanel.tsx` — 노트 상세 AI 패널. search_qa 모드에서 matchedNotes + quality 뱃지.

---

## 구현할 내용

### 1. Backend: SearchQAEvaluator 모듈 (신규 파일)

**파일**: `backend/app/ai_router/search_qa_evaluator.py`

```python
class SourceCoverage(BaseModel):
    """어떤 소스가 실제로 인용되었는지 추적"""
    note_index: int       # [노트 1] → 1
    note_title: str
    cited: bool           # AI 응답에서 인용했는가
    relevant_claim: str   # 인용된 주장 (빈 문자열이면 미인용)

class SearchQAEvaluation(BaseModel):
    """Search QA 전용 평가 결과"""
    correctness: float    # 0.0~1.0 — 응답이 context에 근거하는 정도
    utility: float        # 0.0~1.0 — 질문에 대한 답변 적절성
    confidence: Literal["high", "medium", "low"]
    source_coverage: list[SourceCoverage]  # 소스별 인용 여부
    grounding_issues: list[str]  # 근거 없는 주장 목록
    summary: str          # 한 줄 요약

class SearchQAEvaluator:
    def __init__(self, ai_router: AIRouter):
        self._ai_router = ai_router

    async def evaluate(
        self,
        question: str,
        context_notes: list[str],      # RAG에 제공된 노트 원문
        note_titles: list[str],        # 노트 제목들
        ai_response: str,
        lang: str = "ko",
    ) -> SearchQAEvaluation | None:
        """
        1. 평가 프롬프트로 AI 호출 (비스트리밍, 경량)
        2. Correctness: context_notes 대비 근거 검증
        3. Utility: 질문 대비 답변 적절성
        4. Source coverage: 각 노트 인용 여부
        """
```

**핵심 설계 결정**:
- 2-1의 QualityGate와 **독립 모듈**. QualityGate는 범용, SearchQAEvaluator는 search_qa 전용
- QualityGate가 이미 활성화되어 있어도 SearchQAEvaluator는 **추가 실행** (더 심층적인 평가)
- 평가 AI 호출: `temperature=0.1`, `max_tokens=768`
- context_notes가 없으면 평가 스킵 → `None` 반환

### 2. Backend: Search QA 평가 프롬프트 (신규 파일)

**파일**: `backend/app/ai_router/prompts/search_qa_eval.py`

시스템 프롬프트 핵심:
- 역할: RAG 응답 품질 평가 전문가
- 입력: 원본 질문, 참조 노트 목록 (제목 + 요약), AI 응답
- 출력 형식 (JSON 강제):
  ```json
  {
    "correctness": 0.85,
    "utility": 0.9,
    "source_coverage": [
      {"note_index": 1, "cited": true, "relevant_claim": "PCR 조건은..."},
      {"note_index": 2, "cited": false, "relevant_claim": ""}
    ],
    "grounding_issues": ["'최적 온도는 72도'는 노트에 없는 정보"],
    "summary": "질문에 정확히 답변했으나 일부 미인용 소스 존재"
  }
  ```
- 규칙:
  - correctness: 응답의 모든 주장이 context_notes에 근거하면 1.0, 근거 없는 주장이 있으면 감점
  - utility: 질문에 대한 직접적/완전한 답변이면 1.0, 부분 답변이면 감점
  - source_coverage: 각 노트가 응답에서 인용/활용되었는지 판별
  - grounding_issues: context에 없는 주장(hallucination) 목록

### 3. Backend: `/chat`, `/stream`에 search_qa 평가 통합

**파일**: `backend/app/api/ai.py` (기존 파일 수정)

**변경**: search_qa feature 전용 평가 추가

```python
# /chat에서 — 기존 quality gate 이후 추가
if request.feature == "search_qa" and await _is_quality_gate_enabled(db):
    from app.ai_router.search_qa_evaluator import SearchQAEvaluator
    qa_eval = SearchQAEvaluator(effective_router)
    qa_result = await qa_eval.evaluate(
        question=request.content,
        context_notes=context_notes_for_eval,  # 빌드 시 보존
        note_titles=note_titles_for_eval,
        ai_response=ai_response.content,
        lang=lang,
    )
    if qa_result:
        quality_dict["qa_evaluation"] = qa_result.model_dump()
```

**핵심**: context_notes 정보를 평가 시점까지 보존해야 함.
- `/chat`: `_build_messages_for_feature()` 호출 전에 context_notes를 변수에 저장
- `/stream`: `event_generator()` 클로저에서 접근 가능하도록 외부 변수에 저장

**AIChatResponse 변경 없음** — 기존 `quality: dict | None` 필드 내부에 `qa_evaluation` 키 추가.

**새 SSE 이벤트**:
```
event: qa_evaluation
data: {"correctness": 0.9, "utility": 0.75, "confidence": "high", ...}
```
**타이밍**: `event: quality` 이후에 전송 (quality gate → search_qa eval 순서)

### 4. Backend: context_notes 전달 경로 정비

**문제**: 현재 search_qa 호출 시 context_notes가 두 경로로 전달됨
1. `options.context_notes` — 클라이언트 직접 전달
2. `_search_and_fetch_notes()` — 서버 검색 (insight+search 모드만)

**해결**: search_qa + search 모드에서도 `_search_and_fetch_notes()` 사용하도록 통합하되, 기존 context_notes 경로도 유지.

평가를 위해 두 경로 모두에서 `context_notes`와 `note_titles`를 추출하여 보존:
```python
# /chat, /stream 공통
eval_context_notes: list[str] = []
eval_note_titles: list[str] = []

if request.feature == "search_qa":
    opts = request.options or {}
    if opts.get("context_notes"):
        eval_context_notes = opts["context_notes"]
        # titles는 context에서 추출 불가 → 빈 리스트
    # insight+search 모드에서 사용된 notes_metadata가 있으면
    if notes_metadata:
        eval_note_titles = [n["title"] for n in notes_metadata]
```

### 5. Frontend: `useAIStream.ts` 확장

**파일**: `frontend/src/hooks/useAIStream.ts` (기존 파일 수정)

```typescript
// 새 타입
interface SourceCoverage {
  note_index: number
  note_title: string
  cited: boolean
  relevant_claim: string
}

export interface SearchQAEvaluation {
  correctness: number
  utility: number
  confidence: 'high' | 'medium' | 'low'
  source_coverage: SourceCoverage[]
  grounding_issues: string[]
  summary: string
}

// 새 state
const [qaEvaluation, setQaEvaluation] = useState<SearchQAEvaluation | null>(null)

// SSE 파싱에 추가
if (currentEvent === 'qa_evaluation') {
  const eval: SearchQAEvaluation = JSON.parse(data)
  setQaEvaluation(eval)
}

// 반환값 확장
return { ..., qaEvaluation }
```

### 6. Frontend: 신뢰도 뱃지 UI

**파일**: `frontend/src/components/AIChat.tsx`, `frontend/src/components/NoteAIPanel.tsx` (기존 파일 수정)

**기존 quality 뱃지 아래에 추가**:

1. **신뢰도 뱃지** (confidence):
   - `high` → 초록 뱃지 + ShieldCheck 아이콘
   - `medium` → 주황 뱃지 + AlertTriangle 아이콘
   - `low` → 빨강 뱃지 + AlertOctagon 아이콘

2. **소스 커버리지** (클릭 펼침):
   - 각 노트: 인용됨 ✅ / 미인용 ⬜
   - 인용된 주장 표시

3. **근거 이슈** (grounding_issues):
   - 빨간 텍스트로 hallucination 경고

4. **정확성/유용성 바**:
   - Correctness: 진행률 바 (초록/주황/빨강)
   - Utility: 진행률 바

**컴포넌트 구조** (인라인, quality 뱃지 아래):
```tsx
{qaEvaluation && !isStreaming && (
  <div className="mt-2 border-t border-border pt-2">
    {/* Confidence badge */}
    <div className="flex items-center gap-2">
      <ConfidenceBadge confidence={qaEvaluation.confidence} />
      <span className="text-xs text-muted-foreground">
        정확성 {(qaEvaluation.correctness * 100).toFixed(0)}%
        · 유용성 {(qaEvaluation.utility * 100).toFixed(0)}%
      </span>
    </div>

    {/* Expandable details */}
    {expanded && (
      <>
        {/* Source coverage */}
        {/* Grounding issues */}
      </>
    )}
  </div>
)}
```

### 7. Frontend: i18n 키 추가

**파일**: `frontend/src/locales/ko.json`, `en.json`

```json
"ai": {
    "qaCorrectness": "정확성",
    "qaUtility": "유용성",
    "qaConfidenceHigh": "높은 신뢰도",
    "qaConfidenceMedium": "보통 신뢰도",
    "qaConfidenceLow": "낮은 신뢰도",
    "qaSourceCoverage": "소스 활용",
    "qaSourceCited": "인용됨",
    "qaSourceNotCited": "미인용",
    "qaGroundingIssues": "근거 이슈",
    "qaNoIssues": "근거 문제 없음"
}
```

---

## 파일 변경 목록

| 파일 | 유형 | 내용 |
|------|------|------|
| `backend/app/ai_router/search_qa_evaluator.py` | **신규** | SearchQAEvaluator, SearchQAEvaluation, SourceCoverage |
| `backend/app/ai_router/prompts/search_qa_eval.py` | **신규** | Search QA 전용 평가 프롬프트 |
| `backend/app/api/ai.py` | 수정 | /chat, /stream에 search_qa 평가 통합, context_notes 보존 |
| `frontend/src/hooks/useAIStream.ts` | 수정 | qa_evaluation 이벤트 파싱, SearchQAEvaluation 타입 |
| `frontend/src/components/AIChat.tsx` | 수정 | 신뢰도 뱃지 + 소스 커버리지 UI |
| `frontend/src/components/NoteAIPanel.tsx` | 수정 | 신뢰도 뱃지 + 소스 커버리지 UI |
| `frontend/src/locales/ko.json` | 수정 | QA 평가 i18n 키 |
| `frontend/src/locales/en.json` | 수정 | QA 평가 i18n 키 |

---

## 구현 순서 (권장)

1. **평가 프롬프트** — `search_qa_eval.py` (JSON 출력 품질 결정)
2. **SearchQAEvaluator** — `search_qa_evaluator.py` (평가 로직)
3. **`/chat` 통합** — `ai.py` (context_notes 보존 + 평가 호출)
4. **`/stream` 통합** — `ai.py` (qa_evaluation SSE 이벤트)
5. **프론트엔드 훅** — `useAIStream.ts` (이벤트 파싱)
6. **프론트엔드 UI** — `AIChat.tsx`, `NoteAIPanel.tsx` (뱃지 + 상세)
7. **i18n** — `ko.json`, `en.json`
8. **테스트** — 백엔드 단위 + 수동 통합

---

## 코드 스타일 & 규칙

- **Backend**: ruff (lint + format), async/await, 타입 힌트 필수
- **Frontend**: ESLint + Prettier, shadcn/ui, TailwindCSS, Light mode only
- **커밋**: Conventional Commits (Korean 허용), `feat:` 접두사
- **기존 패턴 준수**: `quality_eval.py`의 JSON 강제 패턴, `useAIStream.ts`의 이벤트 파싱 패턴
- **i18n**: 한국어 우선
- **`get_ai_router()` 임포트**: `from app.api.ai import get_ai_router`

---

## 주의사항

1. **기존 QualityGate와 공존** — SearchQAEvaluator는 QualityGate 이후 추가 실행. quality_gate_enabled=False면 둘 다 스킵
2. **context_notes 보존** — 평가 시점에 원본 context_notes 접근 가능해야 함. `/chat`과 `/stream` 모두에서 변수로 보존
3. **non-search_qa 영향 없음** — insight, writing 등 다른 feature는 기존 동작 그대로
4. **SSE 이벤트 순서** — `[DONE]` → `event: quality` → `event: qa_evaluation`
5. **평가 실패 안전** — AI 호출 실패 시 qa_evaluation=None, 원본 응답 정상 전달
6. **비용** — 평가 호출 1회 추가 (temperature=0.1, max_tokens=768). quality gate 설정으로 opt-in
7. **confidence 결정 로직** — correctness >= 0.8 AND utility >= 0.7 → high, correctness >= 0.5 → medium, else low
