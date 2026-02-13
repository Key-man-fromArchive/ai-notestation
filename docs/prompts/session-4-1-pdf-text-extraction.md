# Session Prompt: Task 4-1 PDF 텍스트 추출

## 지시사항

아래 계획 문서를 읽고 **Task 4-1: PDF 텍스트 추출**을 구현하세요.

**계획 문서**: `docs/prompts/task-4-1-pdf-text-extraction.md` — 이 파일에 모든 설계, 스키마, 코드 구조, 파일 목록, 구현 순서, 주의사항이 포함되어 있습니다. **반드시 먼저 읽으세요.**

---

## 프로젝트 상태

- **현재 버전**: v2.0.0-dev (Phase 4 시작)
- **현재 브랜치**: `main`
- **이번 태스크**: Phase 4 (멀티모달 확장)의 첫 번째 태스크

### 완료된 항목
- Phase 1: 검색 고도화 ✅ (Why matched, Adaptive Search, Multi-turn Refinement)
- Phase 2: AI 품질 게이트 ✅ (Checklist QG, Search QA Quality, Stream Monitor)
- Phase 3: 콘텐츠 인텔리전스 ✅ (Auto-Tagging, Related Notes, Rediscovery)

### 이번에 구현할 것
PDF 첨부 파일에서 텍스트를 추출하여 하이브리드 검색(FTS + Semantic)에 포함. 연구 논문, eBook PDF 내부 텍스트가 검색 가능해짐.

---

## 핵심 구현 항목 (9개)

| # | 파일 | 유형 | 내용 |
|---|------|------|------|
| 1 | `backend/pyproject.toml` | 수정 | pymupdf 의존성 추가 |
| 2 | `backend/app/models.py` | 수정 | NoteAttachment에 extracted_text, extraction_status, page_count |
| 3 | `backend/alembic/versions/xxx_...py` | **신규** | 마이그레이션 |
| 4 | `backend/app/services/pdf_extractor.py` | **신규** | PDFExtractor 서비스 |
| 5 | `backend/app/api/files.py` | 수정 | POST /files/{id}/extract, GET /files/{id}/text |
| 6 | `backend/app/search/indexer.py` | 수정 | PDF 텍스트를 임베딩에 포함 |
| 7 | `frontend/src/pages/NoteDetail.tsx` | 수정 | PDF 추출 버튼 + 상태 + 텍스트 미리보기 |
| 8 | `frontend/src/locales/ko.json` | 수정 | PDF 추출 i18n 키 |
| 9 | `frontend/src/locales/en.json` | 수정 | PDF 추출 i18n 키 |

---

## 구현 순서 (권장)

```
1. 계획 문서 읽기 → docs/prompts/task-4-1-pdf-text-extraction.md
2. 기존 코드 구조 파악:
   - backend/app/models.py (NoteAttachment 모델)
   - backend/app/api/files.py (파일 업로드/다운로드)
   - backend/app/search/indexer.py (NoteIndexer.index_note())
   - backend/app/search/embeddings.py (EmbeddingService.chunk_text())
3. Backend 구현 (1→2→3→4→5→6 순서)
4. Frontend 구현 (7→8→9 순서)
5. Docker에서 pymupdf 설치 확인
6. 통합 테스트 (PDF 업로드 → 추출 → 검색)
7. 커밋
```

---

## 핵심 설계 원칙

1. **Note.content_text 변경 안 함** — 원본 보존. PDF 텍스트는 NoteAttachment.extracted_text에만 저장. NoteIndexer에서 합산하여 임베딩 생성.
2. **비동기 추출** — FastAPI BackgroundTasks로 비동기 실행. 사용자 차단 없음.
3. **pymupdf 단일 라이브러리** — 가장 빠르고 정확. 시스템 패키지 불필요 (wheels 제공).
4. **기존 파이프라인 재활용** — NoteIndexer의 chunk/embed 로직 그대로 사용.
5. **하위 호환** — 새 필드 모두 nullable. 기존 첨부파일/검색에 영향 없음.
6. **이미지 전용 PDF** — 텍스트 없으면 extraction_status="failed". 4-2 OCR에서 처리 예정.

---

## 패턴 레퍼런스

### 기존 파일 업로드 흐름
```
POST /api/files → /data/uploads/{uuid}.pdf
→ NoteAttachment 레코드 생성 (file_id, name, mime_type, size)
```

### 새로 추가될 추출 흐름
```
POST /api/files/{file_id}/extract → BackgroundTasks
→ PDFExtractor.extract(file_path) → text, page_count, metadata
→ NoteAttachment.extracted_text 업데이트
→ NoteIndexer.index_note(note_id) 재인덱싱
```

### NoteIndexer 확장
```python
# 기존: Note.content_text만 임베딩
# 변경: Note.content_text + NoteAttachment.extracted_text (있으면) 합산 후 임베딩
text = f"{note_text}\n\n---\n\n[PDF: filename.pdf]\n{pdf_text}"
```

---

## 테스트 방법

1. **Backend 단위 테스트**: PDFExtractor.extract() — 텍스트 PDF, 이미지 PDF, 파일 없음
2. **API 테스트**: POST /files/{id}/extract → pending → completed, GET /files/{id}/text
3. **통합 테스트**:
   - PDF 업로드 → 추출 → 시맨틱 검색에서 PDF 내용 검색 가능 확인
   - pymupdf Docker 설치 확인
4. **UI 테스트**: NoteDetail에서 PDF 첨부 파일 옆 "텍스트 추출" 버튼 → 추출 → 미리보기

---

## 코드 스타일

- **Backend**: ruff (lint + format), async/await, 타입 힌트
- **Frontend**: ESLint, shadcn/ui, TailwindCSS, Light mode only
- **커밋**: Conventional Commits — `feat: PDF 텍스트 추출 (PDF Text Extraction) — Task 4-1`
- **마이그레이션**: `alembic revision --autogenerate -m "add pdf extraction fields"`
- **i18n**: 한국어 우선
