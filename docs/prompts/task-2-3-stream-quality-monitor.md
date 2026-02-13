# Task 2-3: 스트리밍 중간 품질 체크 구현

## 프로젝트 컨텍스트

LabNote AI는 Synology NoteStation에 AI 기능을 추가하는 프로젝트입니다.
- **Tech Stack**: FastAPI (Python 3.12+) + React 19 + Vite + TailwindCSS + shadcn/ui + PostgreSQL 16 + pgvector
- **현재 버전**: v1.4.0-dev (Phase 2 진행 중)
- **Phase 2 (AI 품질 게이트)** 중 **2-3(Stream Quality Monitor)만 구현**. 2-1, 2-2는 완료.

## 구현 목표

SSE 스트리밍 중 AI 청크를 **실시간으로 모니터링**하여 품질 이슈(반복, 언어 불일치, 형식 오류)를 mid-stream에서 감지.
초기 응답 품질이 미달이면 **자동 재생성** (최대 1회).

**설계 근거 (Web-Shepherd 논문)**: Process reward > Outcome reward — 최종 결과만 평가하는 것보다 **중간 단계 평가가 더 효과적**.
SSE 스트리밍은 자연스럽게 중간 단계 평가에 적합한 구조.

**기존 2-1, 2-2와의 차이**:
- 2-1 (체크리스트): 스트리밍 완료 후 AI가 체크리스트 평가 → 최대 1회 재시도 (UI에만 반영)
- 2-2 (Search QA): 검색 결과 근거 검증 (post-hoc, AI 기반)
- **2-3 (Stream Monitor)**: 스트리밍 **중간**에 순수 휴리스틱으로 즉시 판단 → abort/warn → **스트림 자체 재시작**

---

## 현재 AI 스트리밍 아키텍처 (이미 구현됨)

### AIRouter.stream() (`backend/app/ai_router/router.py` Line 292-337)

```python
async def stream(self, request: AIRequest) -> AsyncIterator[str]:
    model_name, provider = self.resolve_model(request.model)
    kwargs = {}
    if request.temperature is not None:
        kwargs["temperature"] = request.temperature
    if request.max_tokens is not None:
        kwargs["max_tokens"] = request.max_tokens
    try:
        async for chunk in provider.stream(messages=request.messages, model=model_name, **kwargs):
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"
    except ProviderError as exc:
        yield f"event: error\ndata: {json.dumps({'error': exc.message})}\n\n"
        return
    yield "data: [DONE]\n\n"
```

### SSE event_generator() in `/stream` endpoint (`backend/app/api/ai.py` Line 658-716)

```python
async def event_generator():
    if notes_metadata:
        yield f"event: metadata\ndata: {json.dumps(...)}\n\n"

    accumulated_content = ""
    try:
        async for sse_line in effective_router.stream(ai_request):
            yield sse_line
            # 청크에서 텍스트 추출 (2-1 평가용)
            if sse_line.startswith("data: ") and "[DONE]" not in sse_line:
                try:
                    chunk_data = json.loads(sse_line[6:])
                    accumulated_content += chunk_data.get("chunk", "")
                except (json.JSONDecodeError, KeyError):
                    pass
    except ProviderError as exc:
        yield f"event: error\ndata: {exc.message}\n\n"
        return

    # 스트리밍 완료 후 평가 (2-1 quality gate + 2-2 search_qa eval)
    if await _is_quality_gate_enabled_cached() and accumulated_content:
        # ... quality gate evaluation ...
        yield f"event: quality\ndata: {json.dumps(...)}\n\n"
        # ... search_qa evaluation ...
        yield f"event: qa_evaluation\ndata: {json.dumps(...)}\n\n"
```

### 기존 SSE 이벤트 흐름

```
event: metadata              # 검색 결과 매칭 노트
data: {"chunk": "텍스트"}    # AI 텍스트 청크들
data: [DONE]                # 스트리밍 완료
event: quality              # 2-1 체크리스트 평가 (post-streaming)
event: qa_evaluation        # 2-2 search_qa 평가 (post-streaming)
```

### Provider stream 구현들

모든 프로바이더 (OpenAI, Anthropic, Google, ZhipuAI)는 `provider.stream()` 메서드를 통해 **원본 텍스트 청크**를 yield.

### 프론트엔드 useAIStream.ts (`frontend/src/hooks/useAIStream.ts`)

```typescript
interface StreamOptions {
  message: string
  feature: 'insight' | 'search_qa' | 'writing' | 'spellcheck' | 'template'
  model?: string
  noteId?: string
  options?: Record<string, unknown>
}

function useAIStream() {
  const [content, setContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matchedNotes, setMatchedNotes] = useState<any[]>([])
  const [qualityResult, setQualityResult] = useState<QualityResult | null>(null)
  const [qaEvaluation, setQaEvaluation] = useState<SearchQAEvaluation | null>(null)

  // SSE 파싱 로직:
  // - event: metadata → setMatchedNotes()
  // - data: [DONE] → setIsStreaming(false)
  // - message.error → setError()
  // - message.chunk → setContent(prev + chunk)
  // - event: quality → setQualityResult()
  // - event: qa_evaluation → setQaEvaluation()

  return { content, isStreaming, error, matchedNotes, qualityResult, qaEvaluation, ... }
}
```

### 프론트엔드 컴포넌트

- `components/AIChat.tsx` — AI 워크벤치 대화 UI. quality + qa_evaluation 뱃지 표시.
- `components/NoteAIPanel.tsx` — 노트 상세 내 AI 패널. 매칭 노트 + 평가 결과.

### 설정 (`backend/app/api/settings.py`)

기존 설정:
- `quality_gate_enabled` (기본값: False)
- `quality_gate_auto_retry` (기본값: True)

---

## 구현할 내용

### 1. Backend: StreamMonitor 모듈 (신규 파일)

**파일**: `backend/app/ai_router/stream_monitor.py`

```python
from enum import Enum
from pydantic import BaseModel

class StreamAction(str, Enum):
    """스트리밍 모니터링 판단"""
    CONTINUE = "continue"     # 계속 진행
    WARN = "warn"            # 경고 발생, 계속 진행
    ABORT = "abort"          # 중단, 재생성 요청

class StreamCheckResult(BaseModel):
    """휴리스틱 체크 결과"""
    action: StreamAction
    reason: str = ""          # 사용자 메시지
    issue_type: str = ""      # "language_mismatch", "repetition", "format", "length"

class StreamMonitor:
    """SSE 청크 실시간 모니터링"""

    def __init__(self, task: str, lang: str = "ko"):
        """
        Args:
            task: Feature 타입 (insight, search_qa, writing, spellcheck, template)
            lang: 요청 언어 (ko, en, etc.)
        """
        self._task = task
        self._lang = lang
        self._buffer = ""               # 누적된 모든 청크
        self._chunk_count = 0
        self._check_interval = 300      # 체크 간격 (chars)
        self._last_check_pos = 0
        self._warnings: list[str] = []

    def process_chunk(self, chunk: str) -> StreamCheckResult:
        """
        청크 처리 및 품질 판단.
        - 누적 길이가 check_interval에 도달할 때만 체크 실행
        - CONTINUE: 체크 패스 또는 체크 미실행
        - WARN: 경고 발생 (계속 진행)
        - ABORT: 심각한 이슈 (재생성 요청)
        """
        self._buffer += chunk
        self._chunk_count += 1

        # 누적된 길이가 충분할 때만 체크 실행 (성능)
        if len(self._buffer) - self._last_check_pos < self._check_interval:
            return StreamCheckResult(action=StreamAction.CONTINUE)

        self._last_check_pos = len(self._buffer)
        return self._run_checks()

    def _run_checks(self) -> StreamCheckResult:
        """모든 휴리스틱 체크 순차 실행"""
        # 1. 언어 불일치 체크
        result = self._check_language_mismatch()
        if result:
            return result

        # 2. 반복 패턴 감지
        result = self._check_repetition()
        if result:
            return result

        # 3. 형식 검증
        result = self._check_format()
        if result:
            return result

        # 4. 길이 이상 체크
        result = self._check_length_anomaly()
        if result:
            return result

        return StreamCheckResult(action=StreamAction.CONTINUE)

    def _check_language_mismatch(self) -> StreamCheckResult | None:
        """
        한국어 요청에 대한 응답 언어 검증.
        최근 500자 기준 한국어 비율 < 15% → 경고
        """
        if self._lang != "ko":
            return None

        # 최근 누적된 텍스트에서만 검증 (시작 부분은 제외)
        recent = self._buffer[-500:] if len(self._buffer) > 500 else self._buffer
        if len(recent) < 100:
            return None  # 너무 짧으면 판단 불가

        # 한글 글자 수 계산
        korean_chars = sum(1 for c in recent if '\uac00' <= c <= '\ud7a3')
        total_chars = sum(1 for c in recent if c.strip())

        if total_chars < 100:
            return None

        korean_ratio = korean_chars / total_chars
        if korean_ratio < 0.15:  # 15% 미만
            return StreamCheckResult(
                action=StreamAction.WARN,
                reason="응답 언어가 요청 언어(한국어)와 다릅니다",
                issue_type="language_mismatch",
            )
        return None

    def _check_repetition(self) -> StreamCheckResult | None:
        """
        반복 패턴 감지 (hallucination 지표).
        동일하거나 거의 동일한 문장이 3회 이상 반복 → 중단
        """
        # 문장 단위로 분해 (최소 20자 이상)
        sentences = [s.strip() for s in self._buffer.split('.') if len(s.strip()) > 20]
        if len(sentences) < 5:
            return None  # 충분한 문장이 없으면 판단 불가

        # 동일 문장 개수 세기
        from collections import Counter
        counts = Counter(sentences)
        for sentence, count in counts.items():
            if count >= 3:
                return StreamCheckResult(
                    action=StreamAction.ABORT,
                    reason=f"반복 패턴 감지: '{sentence[:50]}...' ({count}회 반복)",
                    issue_type="repetition",
                )
        return None

    def _check_format(self) -> StreamCheckResult | None:
        """
        태스크별 형식 검증 (task-specific).
        - writing, template: 마크다운 헤딩(#) 포함 필수
        """
        if self._task not in ("template", "writing"):
            return None

        if len(self._buffer) < 500:
            return None  # 충분한 길이 이전에는 판단 불가

        # 마크다운 헤딩 확인
        if "#" not in self._buffer:
            return StreamCheckResult(
                action=StreamAction.WARN,
                reason="마크다운 형식(# 헤딩)이 감지되지 않습니다",
                issue_type="format",
            )
        return None

    def _check_length_anomaly(self) -> StreamCheckResult | None:
        """
        과도한 반복으로 인한 길이 이상 감지.
        3000자 이상이면서 마지막 1000자가 매우 반복적 → 중단
        """
        if len(self._buffer) < 3000:
            return None

        tail = self._buffer[-1000:]
        unique_words = set(tail.split())

        # 1000자에 20개 미만의 고유 단어 → 매우 반복적
        if len(unique_words) < 20:
            return StreamCheckResult(
                action=StreamAction.ABORT,
                reason="과도한 반복 출력 감지",
                issue_type="length",
            )
        return None
```

**핵심 설계 결정**:
- **No AI calls**: 모든 체크는 순수 파이썬 휴리스틱 (정규식, 문자 수 세기, 단어 분해)
- **성능**: 300자 간격으로만 체크 실행 (< 1ms per check)
- **보수적**: WARN 과다, ABORT 최소 (false positive 방지)
- **언어 감지 안전**: 100자 미만에서는 판단 스킵

### 2. Backend: `/stream` 엔드포인트에 StreamMonitor 통합

**파일**: `backend/app/api/ai.py` (기존 파일 수정, `event_generator()` 함수)

**변경**:

```python
async def event_generator():
    if notes_metadata:
        yield f"event: metadata\ndata: {json.dumps(...)}\n\n"

    # StreamMonitor 초기화 (quality gate 활성 시에만)
    stream_monitor = None
    if await _is_quality_gate_enabled_cached():
        from app.ai_router.stream_monitor import StreamMonitor
        stream_monitor = StreamMonitor(task=request.feature, lang=lang)

    accumulated_content = ""
    retry_count = 0
    max_retries = 1

    while True:
        accumulated_content = ""  # 재시도 시 리셋
        should_retry = False

        try:
            async for sse_line in effective_router.stream(ai_request):
                yield sse_line

                # 텍스트 청크 추출 및 모니터링
                if sse_line.startswith("data: ") and "[DONE]" not in sse_line:
                    try:
                        chunk_data = json.loads(sse_line[6:])
                        chunk = chunk_data.get("chunk", "")
                        accumulated_content += chunk

                        # === 새로 추가: StreamMonitor 실시간 체크 ===
                        if stream_monitor:
                            result = stream_monitor.process_chunk(chunk)

                            if result.action == StreamAction.WARN:
                                # 경고 이벤트 전송 (계속 진행)
                                yield f"event: stream_warning\ndata: {json.dumps({'reason': result.reason, 'issue_type': result.issue_type}, ensure_ascii=False)}\n\n"

                            elif result.action == StreamAction.ABORT and retry_count < max_retries:
                                # 중단 + 재시도 가능 (최대 1회)
                                yield f"event: retry\ndata: {json.dumps({'reason': result.reason, 'issue_type': result.issue_type}, ensure_ascii=False)}\n\n"
                                should_retry = True
                                retry_count += 1
                                break  # 현재 스트림 탈출
                    except (json.JSONDecodeError, KeyError):
                        pass
        except ProviderError as exc:
            yield f"event: error\ndata: {exc.message}\n\n"
            return

        # 재시도 루프 제어
        if should_retry:
            # StreamMonitor 리셋 (재시도)
            if stream_monitor:
                stream_monitor = StreamMonitor(task=request.feature, lang=lang)
            continue  # 다시 while 루프로 (새 스트림)

        # 정상 완료 또는 재시도 한도 초과
        break

    # === 기존 post-streaming 평가 (2-1, 2-2) ===
    if await _is_quality_gate_enabled_cached() and accumulated_content:
        # ... quality gate evaluation ...
        yield f"event: quality\ndata: {json.dumps(...)}\n\n"
        # ... search_qa evaluation ...
        yield f"event: qa_evaluation\ndata: {json.dumps(...)}\n\n"
```

**핵심**:
- `StreamMonitor.process_chunk()` 호출은 `yield sse_line` **직후** (클라이언트에 청크 전송 후)
- WARN 이벤트 즉시 전송 (계속 진행)
- ABORT 시 새로운 `event: retry` 전송 + `break` + 재시도 루프
- 재시도는 **같은 provider에서** (ai_request는 변경 없음)
- 최대 1회 재시도 (무한 루프 방지)
- 재시도 성공/실패 무관 post-streaming 평가는 최종 accumulated_content로 실행

### 3. Helper 함수 추가

**파일**: `backend/app/api/ai.py` (기존 파일에 추가)

```python
async def _is_quality_gate_enabled_cached() -> bool:
    """
    품질 게이트 활성화 여부 확인 (캐시됨).
    StreamMonitor는 quality_gate_enabled 설정과 동일 조건으로 활성화.
    """
    # 기존 _is_quality_gate_enabled(db) 호출과 동일
    # (또는 캐시 메모리에서 읽음)
```

### 4. Frontend: useAIStream.ts 확장

**파일**: `frontend/src/hooks/useAIStream.ts` (기존 파일 수정)

**새 state 추가**:

```typescript
const [retryReason, setRetryReason] = useState<string | null>(null)
const [streamWarnings, setStreamWarnings] = useState<Array<{reason: string, issueType: string}>>([])
```

**SSE 파싱 루프에 추가** (Line ~150 부근):

```typescript
// event: retry 핸들링
if (currentEvent === 'retry') {
  try {
    const retryData = JSON.parse(data)
    setRetryReason(retryData.reason)
    setContent('')  // 재시도 시 누적 콘텐츠 리셋
  } catch {
    console.warn('Failed to parse retry SSE:', data)
  }
  currentEvent = ''
  continue
}

// event: stream_warning 핸들링
if (currentEvent === 'stream_warning') {
  try {
    const warning = JSON.parse(data)
    setStreamWarnings(prev => [...prev, {
      reason: warning.reason,
      issueType: warning.issue_type
    }])
  } catch {
    console.warn('Failed to parse stream_warning SSE:', data)
  }
  currentEvent = ''
  continue
}
```

**reset 함수에 추가**:

```typescript
const reset = () => {
  setContent('')
  setError(null)
  setMatchedNotes([])
  setQualityResult(null)
  setQaEvaluation(null)
  setRetryReason(null)        // 새로 추가
  setStreamWarnings([])        // 새로 추가
}
```

**반환값 확장**:

```typescript
return {
  content,
  isStreaming,
  error,
  matchedNotes,
  qualityResult,
  qaEvaluation,
  retryReason,                 // 새로 추가
  streamWarnings,              // 새로 추가
  startStream,
  stopStream,
  reset,
}
```

**새 타입 정의**:

```typescript
interface StreamWarning {
  reason: string
  issueType: 'language_mismatch' | 'repetition' | 'format' | 'length'
}
```

### 5. Frontend: 재시도 알림 UI

**파일**: `frontend/src/components/AIChat.tsx`, `frontend/src/components/NoteAIPanel.tsx` (기존 파일 수정)

**변경**: AI 응답 영역에 다음 UI 추가

```tsx
{/* 재시도 진행 중 알림 */}
{retryReason && isStreaming && (
  <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-500/10 px-3 py-2 rounded-md mb-3 animate-pulse">
    <RefreshCw className="h-4 w-4 animate-spin" />
    <div className="flex-1">
      <p className="font-medium">{t('ai.retryingBetterResponse')}</p>
      <p className="text-xs text-amber-700">{retryReason}</p>
    </div>
  </div>
)}

{/* 스트리밍 경고들 (스트리밍 완료 후 표시) */}
{!isStreaming && streamWarnings.length > 0 && (
  <div className="mt-2 space-y-1">
    {streamWarnings.map((warning, idx) => (
      <div key={idx} className="flex items-center gap-2 text-amber-600 text-xs bg-amber-500/10 px-2 py-1 rounded">
        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
        <span>{warning.reason}</span>
      </div>
    ))}
  </div>
)}
```

**위치**: 기존 quality/qa_evaluation 뱃지 위에 배치.

### 6. Frontend: i18n 키 추가

**파일**: `frontend/src/locales/ko.json` (기존 파일 수정)

```json
"ai": {
    ...
    "retryingBetterResponse": "품질 미달로 다시 생성 중...",
    "streamWarning": "스트리밍 경고",
    "languageMismatchWarning": "응답 언어 불일치",
    "repetitionDetected": "반복 패턴 감지",
    "formatWarning": "형식 미충족",
    "lengthAnomaly": "비정상적인 길이"
}
```

**파일**: `frontend/src/locales/en.json` (기존 파일 수정)

```json
"ai": {
    ...
    "retryingBetterResponse": "Regenerating for better quality...",
    "streamWarning": "Streaming warning",
    "languageMismatchWarning": "Response language mismatch",
    "repetitionDetected": "Repetition pattern detected",
    "formatWarning": "Format not met",
    "lengthAnomaly": "Abnormal length"
}
```

---

## 파일 변경 목록

| 파일 | 유형 | 내용 |
|------|------|------|
| `backend/app/ai_router/stream_monitor.py` | **신규** | StreamMonitor, StreamAction, StreamCheckResult, 휴리스틱 체크들 |
| `backend/app/api/ai.py` | 수정 | `/stream` event_generator()에 StreamMonitor 통합, retry 루프, _is_quality_gate_enabled_cached() 헬퍼 |
| `frontend/src/hooks/useAIStream.ts` | 수정 | retry/stream_warning 이벤트 핸들링, retryReason/streamWarnings state |
| `frontend/src/components/AIChat.tsx` | 수정 | 재시도 알림 + 경고 표시 UI |
| `frontend/src/components/NoteAIPanel.tsx` | 수정 | 재시도 알림 + 경고 표시 UI |
| `frontend/src/locales/ko.json` | 수정 | Stream monitoring i18n 키 |
| `frontend/src/locales/en.json` | 수정 | Stream monitoring i18n 키 |

---

## 구현 순서 (권장)

1. **StreamMonitor 모듈** — `stream_monitor.py` (휴리스틱 로직)
2. **Backend 통합** — `ai.py` `/stream` event_generator() (모니터 + 재시도 루프)
3. **프론트엔드 훅** — `useAIStream.ts` (retry/warning 이벤트 파싱)
4. **프론트엔드 UI** — `AIChat.tsx`, `NoteAIPanel.tsx` (알림 표시)
5. **i18n** — `ko.json`, `en.json`
6. **테스트** — 백엔드 단위 + 수동 통합 (반복 감지, 언어 불일치)
7. **커밋**

---

## 코드 스타일 & 규칙

- **Backend**: ruff (lint + format), async/await, 타입 힌트 필수
- **Frontend**: ESLint + Prettier, shadcn/ui, TailwindCSS, Light mode only
- **커밋**: Conventional Commits (Korean 허용), `feat:` / `fix:` 접두사
- **기존 패턴 준수**: 프로바이더 stream 구조 유지, useAIStream.ts의 SSE 파싱 패턴
- **i18n**: 한국어 우선
- **StreamMonitor는 독립 모듈**: event_generator() 내부에서만 사용 (router.py 변경 없음)

---

## 주의사항

1. **기존 엔드포인트 동작 보존** — quality_gate_enabled=False(기본값) 시 StreamMonitor 비활성화, 기존과 100% 동일
2. **No AI calls** — 모든 체크는 순수 파이썬 (regex, char counting, word counting) 기반, 성능 < 1ms/check
3. **최대 1회 재시도** — 무한 루프 방지. 재시도 후에도 미달이면 그대로 계속 (post-streaming 평가는 최종 결과로 실행)
4. **재시도 시 콘텐츠 리셋** — 프론트엔드에서 `retry` 이벤트 수신 시 `setContent('')` 실행 필수 (누적 콘텐츠 제거)
5. **SSE 이벤트 순서** — `data: [DONE]` → `event: quality` → `event: qa_evaluation` (기존), **새로 추가**: 스트리밍 중 `event: retry` / `event: stream_warning`
6. **StreamMonitor 초기화** — 각 스트림 시작 시 새 인스턴스 생성 (상태 독립성 보장)
7. **언어 감지 안전** — 100자 미만에서는 판단 스킵 (초기 시작 부분에서 false positive 방지)
8. **false positive 방지** — WARN은 민감, ABORT는 보수적 (3회 이상 정확히 동일한 문장만 감지)
9. **형식 체크 task-specific** — template/writing에만 적용, 다른 feature는 스킵
10. **프론트엔드 하위 호환** — retry/stream_warning 이벤트가 없는 기존 응답도 정상 처리 (기존 설정 비활성 상태)

---

## 테스트 전략

### Backend 단위 테스트

1. **StreamMonitor 언어 불일치 감지**
   - 입력: 한국어 요청, 영어 응답 (>85%)
   - 예상: `StreamAction.WARN` + "응답 언어가 요청 언어와 다릅니다"

2. **StreamMonitor 반복 감지**
   - 입력: 동일 문장 3회 반복
   - 예상: `StreamAction.ABORT` + "반복 패턴 감지"

3. **StreamMonitor 형식 검증**
   - 입력: `task="writing"`, 500+ chars without `#`
   - 예상: `StreamAction.WARN` + "마크다운 형식 미사용"

4. **StreamMonitor 길이 이상**
   - 입력: 3000+ chars, 마지막 1000자가 20개 미만 고유 단어
   - 예상: `StreamAction.ABORT` + "과도한 반복 출력"

5. **StreamMonitor 체크 간격**
   - 입력: 300자 미만 + 중단 이슈
   - 예상: 체크 실행 안 함, `StreamAction.CONTINUE` 반환

### Integration 테스트

1. **event_generator() 재시도 루프**
   - Mock provider가 반복 내용 반환
   - 예상: 1회 재시도 후 두 번째 응답 스트리밍
   - 확인: `event: retry` 전송 확인

2. **최대 재시도 1회 준수**
   - Mock provider가 연속 2회 미달 내용 반환
   - 예상: 1회만 재시도, 2번째 미달 응답 그대로 전송

3. **quality_gate_enabled=False 시 StreamMonitor 비활성**
   - 예상: retry/stream_warning 이벤트 전송 안 됨

### 수동 통합 테스트

1. **반복 감지 + 재시도**
   - 설정: quality_gate_enabled=True
   - 프롬프트: 일부러 반복적인 응답 유도 (테스트용)
   - 확인: 브라우저 콘솔에서 retry 이벤트 로그 확인

2. **언어 불일치 경고**
   - 한국어 요청 → 영어 응답
   - 확인: `event: stream_warning` 발생 → UI 경고 표시

3. **UI 알림 표시**
   - 재시도 중: animated alert 표시 확인
   - 경고들: 스트리밍 완료 후 목록 표시 확인

---

## 설계 원칙

1. **Process Reward** — 최종 결과만 평가하는 2-1과 달리, 중간 단계 실시간 평가
2. **Lightweight** — AI 호출 불필요, 순수 휴리스틱으로 밀리초 단위 응답
3. **Non-blocking** — StreamMonitor 실패해도 스트림 진행 (안전 장치)
4. **Graceful degradation** — quality_gate_enabled=False 시 자동 비활성화
5. **최소 재시도** — 최대 1회로 재시도 루프 상한선 설정

---

## 추후 개선 사항

- **동적 check_interval**: 누적 길이에 따라 adaptive하게 조정
- **더 정교한 언어 감지**: unicode-segmentation 라이브러리 활용
- **Multi-turn 반복 감지**: 이전 회차 응답과의 비교
- **비용 모니터링**: 재시도로 인한 추가 토큰 계산
