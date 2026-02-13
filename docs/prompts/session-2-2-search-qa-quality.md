# Session Prompt: Task 2-2 Search QA 결과 품질 평가

## 지시사항

아래 계획 문서를 읽고 **Task 2-2: Search QA 결과 품질 평가**를 구현하세요.

**계획 문서**: `docs/prompts/task-2-2-search-qa-quality.md` — 이 파일에 모든 설계, 스키마, 코드 구조, 파일 목록, 구현 순서, 주의사항이 포함되어 있습니다. **반드시 먼저 읽으세요.**

---

## 프로젝트 상태

- **현재 버전**: v1.4.0-dev (Phase 2 진행 중)
- **현재 브랜치**: `main`
- **이번 태스크**: Phase 2 (AI 품질 게이트)의 두 번째 태스크

### 완료된 항목
- Phase 1: 1-1 Why matched ✅, 1-2 Adaptive Search ✅, 1-3 Multi-turn Refinement ✅
- Phase 2: 2-1 Checklist Quality Gate ✅
- Phase 3 (일부): 3-1 Auto-Tagging ✅, 3-2 Related Notes ✅, 3-3 Rediscovery ✅

### 이번에 구현할 것
ReSeek 논문의 dense reward 분해 패턴 — Search QA 응답의 **Correctness(사실 정확성) + Utility(쿼리 관련성)** 독립 평가. 기존 2-1 QualityGate 범용 체크리스트와 **별개의** search_qa 전용 심층 평가.

---

## 핵심 구현 항목 (8개)

| # | 파일 | 유형 | 내용 |
|---|------|------|------|
| 1 | `backend/app/ai_router/prompts/search_qa_eval.py` | **신규** | Search QA 전용 평가 프롬프트 (JSON 출력 강제) |
| 2 | `backend/app/ai_router/search_qa_evaluator.py` | **신규** | SearchQAEvaluator, SearchQAEvaluation, SourceCoverage |
| 3 | `backend/app/api/ai.py` | 수정 | /chat에 search_qa 평가 통합 + context_notes 보존 |
| 4 | `backend/app/api/ai.py` | 수정 | /stream에 `event: qa_evaluation` SSE 이벤트 |
| 5 | `frontend/src/hooks/useAIStream.ts` | 수정 | qa_evaluation 이벤트 파싱 + SearchQAEvaluation 타입 |
| 6 | `frontend/src/components/AIChat.tsx` | 수정 | 신뢰도 뱃지 + 소스 커버리지 UI |
| 7 | `frontend/src/components/NoteAIPanel.tsx` | 수정 | 신뢰도 뱃지 + 소스 커버리지 UI |
| 8 | `frontend/src/locales/ko.json`, `en.json` | 수정 | QA 평가 i18n 키 |

---

## 구현 순서 (권장)

```
1. 계획 문서 읽기 → docs/prompts/task-2-2-search-qa-quality.md
2. 기존 코드 구조 파악:
   - backend/app/ai_router/prompts/search_qa.py (RAG 프롬프트 패턴)
   - backend/app/ai_router/quality_gate.py (2-1 QualityGate 참고)
   - backend/app/api/ai.py (_search_and_fetch_notes, /chat, /stream)
   - frontend/src/hooks/useAIStream.ts (SSE 파싱 패턴)
3. Backend 구현 (1→2→3→4 순서)
4. Frontend 구현 (5→6→7→8 순서)
5. 통합 테스트 (quality_gate_enabled ON → search_qa 호출 → 신뢰도 뱃지 확인)
6. 커밋
```

---

## 핵심 설계 원칙

1. **QualityGate와 독립** — SearchQAEvaluator는 QualityGate 이후 추가 실행. 범용 체크리스트 + search_qa 전용 심층 평가 공존
2. **quality_gate_enabled 재사용** — 별도 설정 불필요, 기존 설정으로 on/off
3. **context_notes 보존** — /chat, /stream 모두 평가 시점에 원본 context 접근 가능해야 함
4. **SSE 순서** — `[DONE]` → `event: quality` → `event: qa_evaluation`
5. **에러 안전** — 평가 실패 시 qa_evaluation=None, 원본 응답 정상 전달
6. **non-search_qa 영향 없음** — insight, writing 등은 기존 동작 그대로
7. **비용** — 평가 호출: `temperature=0.1`, `max_tokens=768` (경량)

---

## 패턴 레퍼런스

### JSON 강제 프롬프트 (참고: `quality_eval.py`, `search_refine.py`)
```python
SYSTEM_PROMPTS = {"ko": "...", "en": "..."}
USER_PROMPT_TEMPLATES = {"ko": "...", "en": "..."}

def build_messages(..., lang="ko") -> list[Message]:
    return [
        Message(role="system", content=SYSTEM_PROMPTS[lang]),
        Message(role="user", content=USER_PROMPT_TEMPLATES[lang].format(...)),
    ]
```

### SSE 이벤트 흐름
```
event: metadata           # 검색 매칭 노트
data: {"chunk": "텍스트"}  # AI 텍스트
data: [DONE]              # 완료
event: quality            # 2-1 범용 품질 평가
event: qa_evaluation      # ← 2-2 추가 (search_qa 전용)
```

### confidence 결정 로직
```python
if correctness >= 0.8 and utility >= 0.7:
    confidence = "high"
elif correctness >= 0.5:
    confidence = "medium"
else:
    confidence = "low"
```

---

## 테스트 방법

1. **Backend 단위 테스트**: SearchQAEvaluator.evaluate() 모킹 테스트
2. **수동 통합 테스트**:
   - Settings에서 quality_gate_enabled 켜기
   - AI 워크벤치에서 search_qa 질문 (insight + search 모드)
   - 응답 하단에 품질 뱃지 + 신뢰도 뱃지 확인
   - 뱃지 클릭 → 소스 커버리지, 근거 이슈 상세 확인
3. **하위 호환**: 다른 feature (insight, writing 등)에서 qa_evaluation 미발생 확인

---

## 코드 스타일

- **Backend**: ruff (lint + format), async/await, 타입 힌트
- **Frontend**: ESLint, shadcn/ui, TailwindCSS, Light mode only
- **커밋**: Conventional Commits — `feat: Search QA 품질 평가 (Correctness + Utility) — Task 2-2`
- **i18n**: 한국어 우선
