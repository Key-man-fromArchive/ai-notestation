# Session Prompt: Task 2-3 스트리밍 중간 품질 체크

## 지시사항

아래 계획 문서를 읽고 **Task 2-3: 스트리밍 중간 품질 체크**를 구현하세요.

**계획 문서**: `docs/prompts/task-2-3-stream-quality-monitor.md` — 이 파일에 모든 설계, 스키마, 코드 구조, 파일 목록, 구현 순서, 주의사항이 포함되어 있습니다. **반드시 먼저 읽으세요.**

---

## 프로젝트 상태

- **현재 버전**: v1.4.0-dev (Phase 2 진행 중)
- **현재 브랜치**: `main`
- **이번 태스크**: Phase 2 (AI 품질 게이트)의 세 번째이자 마지막 태스크

### 완료된 항목
- Phase 1: 1-1 Why matched ✅, 1-2 Adaptive Search ✅, 1-3 Multi-turn Refinement ✅
- Phase 2: 2-1 Checklist Quality Gate ✅, 2-2 Search QA Quality ✅
- Phase 3 (일부): 3-1 Auto-Tagging ✅, 3-2 Related Notes ✅, 3-3 Rediscovery ✅

### 이번에 구현할 것
Web-Shepherd 논문의 Process Reward 패턴 — SSE 스트리밍 **중간**에 순수 휴리스틱으로 품질 이슈(반복, 언어 불일치, 형식 오류)를 실시간 감지. 심각한 이슈 시 **자동 재생성** (최대 1회).

---

## 핵심 구현 항목 (7개)

| # | 파일 | 유형 | 내용 |
|---|------|------|------|
| 1 | `backend/app/ai_router/stream_monitor.py` | **신규** | StreamMonitor, StreamAction, StreamCheckResult, 4가지 휴리스틱 체크 |
| 2 | `backend/app/api/ai.py` | 수정 | `/stream` event_generator()에 StreamMonitor 통합 + retry 루프 |
| 3 | `frontend/src/hooks/useAIStream.ts` | 수정 | retry/stream_warning 이벤트 파싱 + 새 state |
| 4 | `frontend/src/components/AIChat.tsx` | 수정 | 재시도 알림 + 경고 표시 UI |
| 5 | `frontend/src/components/NoteAIPanel.tsx` | 수정 | 재시도 알림 + 경고 표시 UI |
| 6 | `frontend/src/locales/ko.json` | 수정 | Stream monitoring i18n 키 |
| 7 | `frontend/src/locales/en.json` | 수정 | Stream monitoring i18n 키 |

---

## 구현 순서 (권장)

```
1. 계획 문서 읽기 → docs/prompts/task-2-3-stream-quality-monitor.md
2. 기존 코드 구조 파악:
   - backend/app/ai_router/router.py (AIRouter.stream() Line 292-337)
   - backend/app/api/ai.py (event_generator() Line 658-716)
   - frontend/src/hooks/useAIStream.ts (SSE 파싱 패턴)
3. Backend 구현 (1→2 순서)
4. Frontend 구현 (3→4→5→6→7 순서)
5. 통합 테스트 (quality_gate_enabled ON → 스트리밍 중 retry/warning 이벤트 확인)
6. 커밋
```

---

## 핵심 설계 원칙

1. **No AI calls** — 모든 체크는 순수 파이썬 휴리스틱 (regex, char counting, word counting), < 1ms/check
2. **quality_gate_enabled 재사용** — 별도 설정 불필요, 기존 설정으로 on/off
3. **최대 1회 재시도** — 무한 루프 방지, 재시도 후에도 미달이면 그대로 진행
4. **SSE 이벤트 순서** — 스트리밍 중: `event: retry` / `event: stream_warning` → `data: [DONE]` → `event: quality` → `event: qa_evaluation`
5. **에러 안전** — StreamMonitor 실패해도 스트림 정상 진행 (Non-blocking)
6. **하위 호환** — quality_gate_enabled=False(기본값) 시 기존과 100% 동일
7. **보수적 ABORT** — WARN은 민감, ABORT는 보수적 (3회+ 정확히 동일 문장만 중단)

---

## 패턴 레퍼런스

### 기존 SSE 이벤트 흐름 (2-1, 2-2 완료 상태)
```
event: metadata              # 검색 결과 매칭 노트
data: {"chunk": "텍스트"}     # AI 텍스트 청크들
data: [DONE]                 # 스트리밍 완료
event: quality               # 2-1 체크리스트 평가
event: qa_evaluation         # 2-2 search_qa 평가
```

### 2-3 추가 후 이벤트 흐름
```
event: metadata              # 검색 결과 매칭 노트
data: {"chunk": "텍스트"}     # AI 텍스트 청크들
event: stream_warning        # ← 2-3 추가 (스트리밍 중, WARN)
event: retry                 # ← 2-3 추가 (스트리밍 중, ABORT → 재시도)
data: {"chunk": "재생성..."}  # ← 재시도 시 새 청크들
data: [DONE]                 # 스트리밍 완료
event: quality               # 2-1 체크리스트 평가
event: qa_evaluation         # 2-2 search_qa 평가
```

### 4가지 휴리스틱 체크
| 체크 | 조건 | 액션 |
|------|------|------|
| 언어 불일치 | ko 요청, 한글 비율 < 15% | WARN |
| 반복 감지 | 동일 문장 3회+ 반복 | ABORT |
| 형식 검증 | writing/template, 500자+ without `#` | WARN |
| 길이 이상 | 3000자+, 마지막 1000자에 고유 단어 < 20 | ABORT |

---

## 테스트 방법

1. **Backend 단위 테스트**: StreamMonitor 4가지 휴리스틱 각각 테스트
2. **수동 통합 테스트**:
   - Settings에서 quality_gate_enabled 켜기
   - AI 워크벤치에서 반복적 응답 유도 → retry 이벤트 발생 확인
   - 브라우저 DevTools Network/EventStream에서 SSE 이벤트 확인
3. **하위 호환**: quality_gate_enabled=False(기본값)에서 retry/stream_warning 이벤트 미발생 확인

---

## 코드 스타일

- **Backend**: ruff (lint + format), async/await, 타입 힌트
- **Frontend**: ESLint, shadcn/ui, TailwindCSS, Light mode only
- **커밋**: Conventional Commits — `feat: 스트리밍 중간 품질 체크 (Stream Quality Monitor) — Task 2-3`
- **i18n**: 한국어 우선
