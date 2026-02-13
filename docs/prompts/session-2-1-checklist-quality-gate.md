# Session Prompt: Task 2-1 Checklist-Based AI Quality Gate

## 지시사항

아래 계획 문서를 읽고 **Task 2-1: Checklist-Based AI Quality Gate**를 구현하세요.

**계획 문서**: `docs/prompts/task-2-1-checklist-quality-gate.md` — 이 파일에 모든 설계, 스키마, 코드 구조, 파일 목록, 구현 순서, 주의사항이 포함되어 있습니다. **반드시 먼저 읽으세요.**

---

## 프로젝트 상태

- **현재 버전**: v1.3.0 (Phase 1 검색 고도화 완료)
- **현재 브랜치**: `main`
- **마지막 커밋**: `c525714 fix: NAS 이미지 프록시 안정성 개선`
- **이번 태스크**: Phase 2 (AI 품질 게이트)의 첫 번째 태스크

### 완료된 항목
- Phase 1: 1-1 Why matched ✅, 1-2 Adaptive Search ✅, 1-3 Multi-turn Refinement ✅
- Phase 3 (일부): 3-1 Auto-Tagging ✅, 3-2 Related Notes ✅, 3-3 Rediscovery ✅

### 이번에 구현할 것
Web-Shepherd 논문 기반 — AI 응답 생성 후 **태스크별 체크리스트로 자가 평가** → 품질 점수 + 상세 피드백 제공. 미달 시 선택적 재생성.

---

## 핵심 구현 항목 (9개)

| # | 파일 | 유형 | 내용 |
|---|------|------|------|
| 1 | `backend/app/ai_router/prompts/quality_eval.py` | **신규** | 평가 프롬프트 (JSON 출력 강제) |
| 2 | `backend/app/ai_router/quality_gate.py` | **신규** | QualityGate, TASK_CHECKLISTS, 평가 로직 |
| 3 | `backend/app/api/settings.py` | 수정 | `quality_gate_enabled`, `quality_gate_auto_retry` 설정 |
| 4 | `backend/app/api/ai.py` | 수정 | `/chat`에 평가+재생성 통합 |
| 5 | `backend/app/api/ai.py` | 수정 | `/stream`에 `event: quality` SSE 이벤트 |
| 6 | `frontend/src/hooks/useAIStream.ts` | 수정 | quality 이벤트 파싱 + qualityResult state |
| 7 | `frontend/src/components/AIChat.tsx` | 수정 | 품질 뱃지 + 체크리스트 상세 UI |
| 8 | `frontend/src/components/NoteAIPanel.tsx` | 수정 | 품질 뱃지 + 체크리스트 상세 UI |
| 9 | `frontend/src/pages/Settings.tsx` | 수정 | 품질 게이트 토글 2개 |

i18n 키: `frontend/src/locales/ko.json`, `en.json`에도 추가.

---

## 구현 순서 (권장)

```
1. 계획 문서 읽기 → docs/prompts/task-2-1-checklist-quality-gate.md
2. 기존 코드 구조 파악 (계획 문서에 핵심 구조 포함, 실제 파일 확인)
   - backend/app/ai_router/prompts/search_refine.py (JSON 강제 프롬프트 패턴)
   - backend/app/api/ai.py (기존 /chat, /stream 흐름)
   - frontend/src/hooks/useAIStream.ts (SSE 파싱 패턴)
3. Backend 구현 (1→2→3→4→5 순서)
4. Frontend 구현 (6→7→8→9 순서)
5. 통합 테스트 (설정 켜고 AI 호출 → 품질 뱃지 확인)
6. 커밋
```

---

## 핵심 설계 원칙

1. **기본 OFF** — `quality_gate_enabled=False`가 기본값. 켜지 않으면 기존 동작과 100% 동일
2. **에러 안전** — 평가 AI 호출 실패 시 `quality=None` 반환 (원본 응답 정상 전달)
3. **재시도 최대 1회** — 무한 루프 방지. 재시도 후에도 미달이면 그대로 반환
4. **`summarize` 스킵** — JSON 출력 태스크는 체크리스트 평가 불필요
5. **스트리밍 타이밍** — `data: [DONE]` **이후**에 `event: quality` 전송
6. **비용** — 평가 호출: `temperature=0.1`, `max_tokens=512` (경량)

---

## 패턴 레퍼런스

### JSON 강제 프롬프트 (참고: `search_refine.py`)
```python
SYSTEM_PROMPTS = {"ko": "...", "en": "..."}
USER_PROMPT_TEMPLATES = {"ko": "...", "en": "..."}

def build_messages(..., lang="ko") -> list[Message]:
    return [
        Message(role="system", content=SYSTEM_PROMPTS[lang]),
        Message(role="user", content=USER_PROMPT_TEMPLATES[lang].format(...)),
    ]
```

### SSE 이벤트 (참고: `useAIStream.ts`)
```
event: metadata\ndata: {...}\n\n    # 검색 매칭 노트
data: {"chunk": "텍스트"}\n\n     # AI 텍스트
data: [DONE]\n\n                  # 완료
event: quality\ndata: {...}\n\n   # ← 새로 추가 (DONE 이후)
```

### 설정 패턴 (참고: `settings.py`)
```python
_SETTING_DESCRIPTIONS = {"key": "설명", ...}
_get_default_settings() → {"key": default, ...}
```

---

## 테스트 방법

1. **Backend 단위 테스트**: QualityGate.evaluate() 모킹 테스트
2. **수동 통합 테스트**:
   - Settings에서 quality_gate_enabled 켜기
   - AI 워크벤치에서 insight/writing 요청
   - 응답 하단에 품질 뱃지 표시 확인
   - 뱃지 클릭 → 체크리스트 상세 펼침 확인
3. **하위 호환**: quality_gate_enabled OFF 시 기존 동작 확인

---

## 코드 스타일

- **Backend**: ruff (lint + format), async/await, 타입 힌트
- **Frontend**: ESLint, shadcn/ui, TailwindCSS, Light mode only
- **커밋**: Conventional Commits — `feat: 체크리스트 기반 AI 품질 게이트 (Quality Gate) — Task 2-1`
- **i18n**: 한국어 우선
