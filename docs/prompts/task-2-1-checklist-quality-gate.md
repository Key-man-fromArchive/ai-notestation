# Task 2-1: Checklist-Based AI Quality Gate 구현

## 프로젝트 컨텍스트

LabNote AI는 Synology NoteStation에 AI 기능을 추가하는 프로젝트입니다.
- **Tech Stack**: FastAPI (Python 3.12+) + React 19 + Vite + TailwindCSS + shadcn/ui + PostgreSQL 16 + pgvector
- **현재 버전**: v1.3.0 (Phase 1 완료)
- **Phase 2 (AI 품질 게이트)** 중 **2-1(Checklist Quality Gate)만 구현**. 2-2, 2-3은 이후.

## 구현 목표

AI 응답 생성 후 **태스크별 체크리스트로 자가 평가** → 품질 점수 + 상세 피드백 제공. 미달 시 선택적 재생성.

**설계 근거 (Web-Shepherd 논문)**: 체크리스트 분해는 **모든 모델에 보편적으로 효과적**. 특정 모델에 의존하지 않는 범용 품질 향상.

---

## 현재 AI 아키텍처 (이미 구현됨)

### AI Router (`backend/app/ai_router/router.py`)

```python
class AIRouter:
    _providers: dict[str, AIProvider]  # auto-detected from env vars

    async def chat(self, request: AIRequest) -> AIResponse:
        """비스트리밍. model → provider 매핑 후 provider.chat() 호출"""
        model_name, provider = self.resolve_model(request.model)
        return await provider.chat(messages=request.messages, model=model_name, ...)

    async def stream(self, request: AIRequest) -> AsyncIterator[str]:
        """SSE 스트리밍. 청크 → data: {"chunk": "..."}\n\n → data: [DONE]\n\n"""
        model_name, provider = self.resolve_model(request.model)
        async for chunk in provider.stream(messages=..., model=...):
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        yield "data: [DONE]\n\n"
```

### 스키마 (`backend/app/ai_router/schemas.py`)

```python
class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str
    images: list[ImageContent] | None = None

class AIRequest(BaseModel):
    messages: list[Message]
    model: str | None = None
    temperature: float = 0.7
    max_tokens: int = 4096
    stream: bool = False

class AIResponse(BaseModel):
    content: str
    model: str
    provider: str
    usage: TokenUsage | None = None
    finish_reason: str = "stop"
```

### AI API 엔드포인트 (`backend/app/api/ai.py`)

**FeatureType**: `"insight" | "search_qa" | "writing" | "spellcheck" | "template" | "summarize"`

```python
class AIChatRequest(BaseModel):
    feature: FeatureType
    content: str
    model: str | None = None
    options: dict | None = None
    note_id: str | None = None

class AIChatResponse(BaseModel):
    content: str
    model: str
    provider: str
    usage: dict | None = None
```

**`/chat` 흐름** (Line 384-482):
1. `_build_messages_for_feature(feature, content, options, lang)` → `list[Message]`
2. OAuth 토큰 주입
3. `ai_router.chat(ai_request)` → `AIResponse`
4. `AIChatResponse` 반환

**`/stream` 흐름** (Line 485-599):
1. 위와 동일하게 messages 빌드
2. `event_generator()` 내부에서 `ai_router.stream(ai_request)` 호출
3. SSE 이벤트: `event: metadata` → `data: {"chunk": ...}` → `data: [DONE]`

### 기존 SSE 이벤트 타입

```
event: metadata\ndata: {"matched_notes": [...]}\n\n   # 검색모드 매칭 노트
data: {"chunk": "텍스트"}\n\n                        # AI 텍스트 청크
data: [DONE]\n\n                                     # 완료
event: error\ndata: {"error": "..."}\n\n             # 에러
```

### 프론트엔드 AI 스트리밍 (`frontend/src/hooks/useAIStream.ts`)

```typescript
interface StreamOptions {
  message: string
  feature: 'insight' | 'search_qa' | 'writing' | 'spellcheck' | 'template'
  model?: string
  noteId?: string
  options?: Record<string, unknown>
}

function useAIStream() {
  // SSE 파싱 로직 (Line 100-152):
  // - event: metadata → setMatchedNotes()
  // - data: [DONE] → setIsStreaming(false)
  // - message.error → setError()
  // - message.chunk → setContent(prev + chunk)
  return { content, isStreaming, error, matchedNotes, startStream, stopStream, reset }
}
```

### 프론트엔드 AI 컴포넌트

- `components/AIChat.tsx` — AI 워크벤치 대화 UI. markdown 렌더링, 매칭 노트 뱃지, 복사 버튼.
- `components/NoteAIPanel.tsx` — 노트 상세 내 AI 패널. 동일 구조 + "노트에 삽입" 버튼.

### 프롬프트 패턴 (`backend/app/ai_router/prompts/`)

모든 프롬프트는 동일 패턴:
```python
SYSTEM_PROMPTS: dict[str, str] = {"ko": "...", "en": "..."}
USER_PROMPT_TEMPLATES: dict[str, str] = {"ko": "...", "en": "..."}

def build_messages(..., lang: str = "ko") -> list[Message]:
    return [
        Message(role="system", content=SYSTEM_PROMPTS[lang]),
        Message(role="user", content=USER_PROMPT_TEMPLATES[lang].format(...)),
    ]
```

**JSON 출력 강제 패턴** — `summarize.py`, `search_refine.py`에서 사용됨:
시스템 프롬프트에 `"반드시 JSON 형식으로만 응답하세요"` + 예시 구조 포함.

### 설정 패턴 (`backend/app/api/settings.py`)

```python
_SETTING_DESCRIPTIONS = {
    "key": "설명 텍스트",
    ...
}

def _get_default_settings():
    return {"key": default_value, ...}
```

설정은 DB `settings` 테이블에 JSON 저장, `_settings_cache` 메모리 캐시.

---

## 구현할 내용

### 1. Backend: QualityGate 모듈 (신규 파일)

**파일**: `backend/app/ai_router/quality_gate.py`

```python
class ChecklistItem(BaseModel):
    question: str         # 체크 항목 (질문 형태)
    passed: bool | None = None  # Yes=True, No=False, Partial=None
    note: str = ""        # 평가자 코멘트

class QualityChecklist(BaseModel):
    task: str             # 태스크명 (insight, search_qa, ...)
    items: list[str]      # 체크 항목 질문 리스트
    min_pass_ratio: float = 0.75  # 최소 통과 비율

class QualityResult(BaseModel):
    passed: bool          # 전체 통과 여부
    score: float          # 0.0~1.0 (Yes=1, Partial=0.5, No=0)
    details: list[ChecklistItem]  # 항목별 결과
    summary: str          # 평가 요약 한 줄

TASK_CHECKLISTS: dict[str, QualityChecklist]  # 태스크별 체크리스트 정의
```

**태스크별 체크리스트**:

| 태스크 | 항목 수 | min_pass_ratio | 핵심 체크 항목 |
|--------|---------|----------------|---------------|
| insight | 4 | 0.75 | 핵심 발견 식별, 근거 인용, 시사점 제시, 범위 충족 |
| search_qa | 4 | 0.75 | 직접 답변, 검색 결과 근거, 출처 명시, 불확실성 표시 |
| writing | 4 | 0.75 | 구조 충족, 학술 관례, 키워드 포함, 마크다운 형식 |
| spellcheck | 3 | 1.0 | 수정 표시, 의미 보존, 이유 설명 |
| template | 4 | 0.75 | 유형 적합, 가이드 포함, 메타데이터, 마크다운 형식 |

**핵심 메서드**:

```python
class QualityGate:
    def __init__(self, ai_router: AIRouter):
        self._ai_router = ai_router

    async def evaluate(
        self,
        task: str,           # FeatureType
        original_request: str,  # 사용자 원본 요청
        ai_response: str,    # AI 생성 응답
        lang: str = "ko",
    ) -> QualityResult:
        """
        1. 태스크에 해당하는 체크리스트 조회
        2. 평가 프롬프트로 AI 호출 (비스트리밍, 저비용 모델)
        3. JSON 응답 파싱 → QualityResult
        """

    def get_checklist(self, task: str) -> QualityChecklist | None:
        """태스크별 체크리스트 반환. summarize는 None (평가 불필요)."""
```

**중요 설계 결정**:
- `summarize`는 평가하지 않음 (JSON 출력이므로 구조적 검증만)
- 평가 AI 호출은 `temperature=0.1`, `max_tokens=512` (결정적, 짧은 응답)
- 체크리스트가 없는 태스크는 평가 스킵 → `None` 반환

### 2. Backend: 평가 프롬프트 (신규 파일)

**파일**: `backend/app/ai_router/prompts/quality_eval.py`

시스템 프롬프트 핵심:
- 역할: AI 응답 품질 평가 전문가
- 입력: 원본 요청, AI 응답, 체크리스트 항목들
- 출력 형식 (JSON 강제):
  ```json
  {
    "items": [
      {"question": "...", "passed": true, "note": "구체적인 이유"},
      {"question": "...", "passed": false, "note": "미달 이유"},
      {"question": "...", "passed": null, "note": "부분 충족 이유"}
    ],
    "summary": "전체 평가 한 줄 요약"
  }
  ```
- 규칙: `true`=완전 충족, `false`=미충족, `null`=부분 충족 (0.5점)
- 점수 계산: `score = (true_count + 0.5 * null_count) / total_count`

**기존 패턴 참고**: `search_refine.py`의 `build_messages()` 패턴 동일 사용.

### 3. Backend: `/chat` 엔드포인트 수정

**파일**: `backend/app/api/ai.py` (기존 파일 수정)

**`/chat` 변경** (Line 384-482):

```python
@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(...):
    # ... (기존 로직 그대로) ...
    ai_response = await effective_router.chat(ai_request)

    # === 새로 추가: Quality Gate 평가 ===
    quality_result = None
    if await _is_quality_gate_enabled(db):
        from app.ai_router.quality_gate import QualityGate
        gate = QualityGate(effective_router)
        quality_result = await gate.evaluate(
            task=request.feature,
            original_request=request.content,
            ai_response=ai_response.content,
            lang=lang,
        )

        # 미달 + 자동 재생성 활성화 시 1회 재시도
        if quality_result and not quality_result.passed:
            if await _is_quality_gate_auto_retry(db):
                ai_response = await effective_router.chat(ai_request)
                quality_result = await gate.evaluate(
                    task=request.feature,
                    original_request=request.content,
                    ai_response=ai_response.content,
                    lang=lang,
                )
    # === 여기까지 ===

    return AIChatResponse(
        content=ai_response.content,
        model=ai_response.model,
        provider=ai_response.provider,
        usage=usage_dict,
        quality=quality_result.model_dump() if quality_result else None,  # 새 필드
    )
```

**`AIChatResponse` 확장**:
```python
class AIChatResponse(BaseModel):
    content: str
    model: str
    provider: str
    usage: dict | None = None
    quality: dict | None = None  # QualityResult dict
```

### 4. Backend: `/stream` 엔드포인트 수정

**파일**: `backend/app/api/ai.py` (기존 파일 수정)

**`/stream` 변경** (Line 485-599):

`event_generator()` 내부에서 스트리밍 완료 후 평가 실행:

```python
async def event_generator():
    if notes_metadata:
        yield f"event: metadata\ndata: {json.dumps(...)}\n\n"

    # 스트리밍 텍스트 누적 (평가용)
    accumulated_content = ""
    try:
        async for sse_line in effective_router.stream(ai_request):
            yield sse_line
            # 청크에서 텍스트 추출하여 누적
            if sse_line.startswith("data: ") and "[DONE]" not in sse_line:
                try:
                    chunk_data = json.loads(sse_line[6:])
                    accumulated_content += chunk_data.get("chunk", "")
                except (json.JSONDecodeError, KeyError):
                    pass
    except ProviderError as exc:
        yield f"event: error\ndata: {exc.message}\n\n"
        return

    # === 새로 추가: 스트리밍 완료 후 품질 평가 ===
    if await _is_quality_gate_enabled_cached() and accumulated_content:
        from app.ai_router.quality_gate import QualityGate
        gate = QualityGate(effective_router)
        quality_result = await gate.evaluate(
            task=request.feature,
            original_request=request.content,
            ai_response=accumulated_content,
            lang=lang,
        )
        if quality_result:
            yield f"event: quality\ndata: {json.dumps(quality_result.model_dump(), ensure_ascii=False)}\n\n"
    # === 여기까지 ===
```

**새 SSE 이벤트 형식**:
```
event: quality
data: {"passed": true, "score": 0.85, "details": [...], "summary": "..."}
```

**중요**: `data: [DONE]`은 `ai_router.stream()` 내부에서 이미 전송됨. quality 이벤트는 `[DONE]` **이후**에 전송. 프론트엔드에서 `[DONE]` 후에도 추가 이벤트를 수신할 수 있어야 함.

### 5. Backend: 설정 추가

**파일**: `backend/app/api/settings.py` (기존 파일 수정)

```python
_SETTING_DESCRIPTIONS에 추가:
    "quality_gate_enabled": "AI 응답 품질 검증 활성화 (체크리스트 기반)",
    "quality_gate_auto_retry": "품질 미달 시 자동 재생성",

_get_default_settings()에 추가:
    "quality_gate_enabled": False,
    "quality_gate_auto_retry": True,
```

**헬퍼 함수** (`api/ai.py`에 추가):
```python
async def _is_quality_gate_enabled(db: AsyncSession) -> bool:
    """설정에서 quality_gate_enabled 읽기"""

async def _is_quality_gate_auto_retry(db: AsyncSession) -> bool:
    """설정에서 quality_gate_auto_retry 읽기"""
```

### 6. Frontend: `useAIStream.ts` 수정

**파일**: `frontend/src/hooks/useAIStream.ts` (기존 파일 수정)

**변경**: `event: quality` SSE 이벤트 핸들링 추가

```typescript
// 새 state 추가
const [qualityResult, setQualityResult] = useState<QualityResult | null>(null)

// SSE 파싱 루프 내 (Line 104-108 부근):
if (currentEvent === 'quality') {
  try {
    const quality: QualityResult = JSON.parse(data)
    setQualityResult(quality)
  } catch { /* ignore */ }
  currentEvent = ''
  continue
}
```

**새 타입**:
```typescript
interface QualityCheckItem {
  question: string
  passed: boolean | null  // true/false/null(partial)
  note: string
}

interface QualityResult {
  passed: boolean
  score: number
  details: QualityCheckItem[]
  summary: string
}
```

**반환값 확장**:
```typescript
return { content, isStreaming, error, matchedNotes, qualityResult, startStream, stopStream, reset }
```

### 7. Frontend: 품질 뱃지 UI

**파일**: `frontend/src/components/AIChat.tsx`, `frontend/src/components/NoteAIPanel.tsx` (기존 파일 수정)

**추가할 UI 요소**:

1. **품질 뱃지** (AI 응답 하단):
   - 품질 점수 표시: `85%` 형태
   - 색상: passed=초록(emerald), failed=주황(amber)
   - 아이콘: `ShieldCheck` (lucide)

2. **체크리스트 상세 (접기/펼치기)**:
   - 뱃지 클릭 시 펼침
   - 각 항목: ✅ passed, ❌ failed, ⚠️ partial + note
   - 평가 요약 텍스트

3. **품질 미달 알림** (optional):
   - `passed=false` 시 부드러운 경고 표시
   - "어떤 항목이 미달인지" 요약

**컴포넌트 구조** (별도 파일 불필요, AIChat/NoteAIPanel 내부에 인라인):
```tsx
{qualityResult && (
  <div className="mt-3 border-t border-border pt-3">
    <button onClick={toggle} className="inline-flex items-center gap-1.5 text-xs">
      <ShieldCheck className="h-3.5 w-3.5" />
      품질 {(qualityResult.score * 100).toFixed(0)}%
    </button>
    {expanded && (
      <ul className="mt-2 space-y-1">
        {qualityResult.details.map(item => (
          <li className="text-xs flex items-start gap-1.5">
            {item.passed === true && <CheckCircle2 />}
            {item.passed === false && <XCircle />}
            {item.passed === null && <AlertCircle />}
            <span>{item.question}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
)}
```

### 8. Frontend: i18n 키 추가

**파일**: `frontend/src/locales/ko.json`, `en.json`

```json
"ai": {
    ...
    "qualityScore": "품질 {{score}}%",
    "qualityPassed": "품질 검증 통과",
    "qualityFailed": "품질 검증 미달",
    "qualityChecklist": "체크리스트 상세",
    "qualityItemPassed": "충족",
    "qualityItemFailed": "미달",
    "qualityItemPartial": "부분 충족"
}
```

### 9. Frontend: 설정 UI

**파일**: `frontend/src/pages/Settings.tsx` (기존 파일 수정)

기존 설정 섹션에 2개 토글 추가:
- "AI 품질 검증" 활성화 토글 (`quality_gate_enabled`)
- "자동 재생성" 토글 (`quality_gate_auto_retry`) — 위 토글 활성 시에만 표시

---

## 파일 변경 목록

| 파일 | 유형 | 내용 |
|------|------|------|
| `backend/app/ai_router/quality_gate.py` | **신규** | QualityGate, QualityChecklist, QualityResult, TASK_CHECKLISTS |
| `backend/app/ai_router/prompts/quality_eval.py` | **신규** | 평가 프롬프트 build_messages() |
| `backend/app/api/ai.py` | 수정 | /chat에 평가+재생성, /stream에 quality 이벤트, AIChatResponse 확장 |
| `backend/app/api/settings.py` | 수정 | quality_gate_enabled, quality_gate_auto_retry 설정 추가 |
| `frontend/src/hooks/useAIStream.ts` | 수정 | event: quality 핸들링, qualityResult state |
| `frontend/src/components/AIChat.tsx` | 수정 | 품질 뱃지 + 체크리스트 상세 |
| `frontend/src/components/NoteAIPanel.tsx` | 수정 | 품질 뱃지 + 체크리스트 상세 |
| `frontend/src/locales/ko.json` | 수정 | 품질 관련 i18n 키 |
| `frontend/src/locales/en.json` | 수정 | 품질 관련 i18n 키 |
| `frontend/src/pages/Settings.tsx` | 수정 | 품질 게이트 토글 |

---

## 구현 순서 (권장)

1. **평가 프롬프트** — `quality_eval.py` (핵심, JSON 출력 품질 결정)
2. **QualityGate 모듈** — `quality_gate.py` (체크리스트 정의 + 평가 로직)
3. **설정 추가** — `settings.py` (opt-in 토글)
4. **`/chat` 통합** — `ai.py` (평가 → 재시도 → 응답 확장)
5. **`/stream` 통합** — `ai.py` (누적 → 평가 → SSE quality 이벤트)
6. **프론트엔드 훅** — `useAIStream.ts` (quality 이벤트 파싱)
7. **프론트엔드 UI** — `AIChat.tsx`, `NoteAIPanel.tsx` (뱃지 + 체크리스트)
8. **설정 UI** — `Settings.tsx` (토글)
9. **테스트** — 백엔드 단위 + Playwright E2E

---

## 코드 스타일 & 규칙

- **Backend**: ruff (lint + format), async/await 일관 사용, 타입 힌트 필수
- **Frontend**: ESLint + Prettier, shadcn/ui 컴포넌트, TailwindCSS, Light mode only
- **커밋**: Conventional Commits (Korean 허용), `feat:` / `fix:` 접두사
- **AI 프로바이더**: `AIRouter`의 `chat()` 사용 (평가는 비스트리밍)
- **기존 패턴 준수**: `search_refine.py`의 JSON 강제 패턴, `useAIStream.ts`의 이벤트 파싱 패턴
- **i18n**: 프론트엔드 텍스트는 한국어 우선 (영어 번역은 나중에)
- **`get_ai_router()` 임포트**: `from app.api.ai import get_ai_router` (싱글톤)

---

## 주의사항

1. **기존 엔드포인트 동작 보존** — quality_gate_enabled=False(기본값) 시 기존과 100% 동일하게 동작
2. **AI 호출 최소화** — 평가는 `temperature=0.1`, `max_tokens=512`. 평가 모델은 기존 모델 그대로 사용 (별도 모델 설정 불필요)
3. **`summarize` 태스크 스킵** — JSON 출력이므로 체크리스트 평가 불필요
4. **재시도 최대 1회** — 무한 루프 방지. 재시도 후에도 미달이면 그대로 반환 (결과에 quality 정보 포함)
5. **스트리밍 quality 이벤트 타이밍** — `data: [DONE]` **이후**에 `event: quality` 전송. 프론트엔드에서 [DONE] 이후에도 reader를 닫지 않고 추가 이벤트를 기다려야 함
6. **에러 핸들링** — 평가 AI 호출 실패 시 quality=None 반환 (원본 응답은 정상 전달)
7. **프론트엔드 하위 호환** — quality 필드가 없는 응답도 정상 처리 (optional chaining)
8. **비용 고려** — 평가 호출은 원본 응답 대비 ~20% 추가 토큰. 설정으로 opt-in이므로 기본적으로 비용 발생 안 함
