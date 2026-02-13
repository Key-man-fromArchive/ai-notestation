# Task 4-1: PDF 텍스트 추출 구현

## 프로젝트 컨텍스트

LabNote AI는 Synology NoteStation에 AI 기능을 추가하는 프로젝트입니다.
- **Tech Stack**: FastAPI (Python 3.12+) + React 19 + Vite + TailwindCSS + shadcn/ui + PostgreSQL 16 + pgvector
- **현재 버전**: v2.0.0-dev (Phase 4 진행 중)
- **Phase 4 (멀티모달 확장)** 중 **4-1(PDF 텍스트 추출)만 구현**. Phase 1~3 완료.

## 구현 목표

연구 논문, eBook 등 PDF 첨부 파일에서 **텍스트를 추출**하여 하이브리드 검색(FTS + Semantic)에 포함시킨다.
추출된 텍스트는 별도 DB 컬럼에 저장하고, 기존 임베딩 파이프라인과 통합한다.

**설계 근거 (Reseek 제품 분석)**: PDF 내부 텍스트가 검색 불가한 것은 연구 노트 관리에서 큰 gap.
텍스트 추출 → 인덱싱으로 PDF 콘텐츠도 동일한 검색 경험 제공.

---

## 현재 파일/첨부 인프라 (이미 구현됨)

### NoteAttachment 모델 (`backend/app/models.py`)

```python
class NoteAttachment(Base):
    __tablename__ = "note_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    file_id: Mapped[str] = mapped_column(String(255), index=True)
    name: Mapped[str] = mapped_column(String(512))
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

### Files API (`backend/app/api/files.py`)

```python
# 업로드: POST /api/files → 파일을 /data/uploads/{uuid_hex}{suffix}에 저장
# 다운로드: GET /api/files/{file_id} → FileResponse
# 삭제: DELETE /api/notes/{note_id}/attachments/{file_id}
```

- 파일 저장 경로: `/data/uploads/{file_id}` (Docker volume `uploads`)
- `file_id` = `{uuid4_hex}{원본_확장자}` (예: `abc123def456.pdf`)

### 검색 인덱싱 파이프라인 (`backend/app/search/`)

```python
# indexer.py — NoteIndexer
# 1. Note.content_text에서 텍스트 읽기
# 2. 500 토큰 단위 + 50 오버랩으로 청크 분할 (tiktoken)
# 3. OpenAI text-embedding-3-small로 임베딩 생성
# 4. NoteEmbedding 테이블에 저장

# embeddings.py — EmbeddingService
# chunk_text() → 텍스트 청크 분할
# embed_chunks() → 청크별 임베딩 생성
```

### 프론트엔드 첨부파일 UI (`frontend/src/pages/NoteDetail.tsx`)

```tsx
{note.attachments?.map((attachment, index) => {
  const ext = attachment.name.split('.').pop()?.toLowerCase() ?? ''
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)
  const Icon = isImage ? Image : File
  return (
    <div key={index} className="flex items-center gap-3 ...">
      <Icon className="h-4 w-4 ..." />
      <span>{attachment.name}</span>
      <span>{ext}</span>
      {/* 삭제 버튼만 있음 — 추출 버튼 없음 */}
    </div>
  )
})}
```

### Docker 볼륨 (`docker-compose.yml`)

```yaml
volumes:
  uploads: /data/uploads  # 사용자 업로드 파일
```

### 의존성 (`backend/pyproject.toml`)

현재 PDF 관련 라이브러리 없음. `pymupdf` 추가 필요.

---

## 구현할 내용

### 1. Backend: 의존성 추가

**파일**: `backend/pyproject.toml`

```toml
dependencies = [
    ...
    "pymupdf>=1.25.0",   # PyMuPDF — PDF 텍스트 추출
]
```

**선택 근거**: PyMuPDF는 가장 빠르고 정확한 PDF 파서. C 바인딩. 순수 Python pdfplumber보다 5-10배 빠름.

### 2. Backend: NoteAttachment 모델 확장 + 마이그레이션

**파일**: `backend/app/models.py`

NoteAttachment에 3개 필드 추가:

```python
class NoteAttachment(Base):
    __tablename__ = "note_attachments"

    # ... 기존 필드 ...

    # PDF 텍스트 추출 관련 (신규)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extraction_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # None | "pending" | "completed" | "failed"
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

**설계 결정**: 별도 테이블(`NoteAttachmentText`) 대신 NoteAttachment에 직접 추가.
- 단순 JOIN 불필요, 관리 용이
- `extracted_text`는 nullable이므로 PDF 아닌 파일에 영향 없음
- 대용량 텍스트 로드가 우려되면 쿼리에서 deferred loading 활용

**마이그레이션**: `backend/alembic/versions/xxx_add_pdf_extraction_fields.py`

```python
def upgrade() -> None:
    op.add_column("note_attachments", sa.Column("extracted_text", sa.Text(), nullable=True))
    op.add_column("note_attachments", sa.Column("extraction_status", sa.String(20), nullable=True))
    op.add_column("note_attachments", sa.Column("page_count", sa.Integer(), nullable=True))

def downgrade() -> None:
    op.drop_column("note_attachments", "page_count")
    op.drop_column("note_attachments", "extraction_status")
    op.drop_column("note_attachments", "extracted_text")
```

### 3. Backend: PDFExtractor 서비스 (신규 파일)

**파일**: `backend/app/services/pdf_extractor.py`

```python
from __future__ import annotations

import logging
from pathlib import Path

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class PDFExtractionResult(BaseModel):
    """PDF 텍스트 추출 결과"""
    text: str
    page_count: int
    metadata: dict  # title, author, subject, keywords 등


class PDFExtractor:
    """PDF → 텍스트 추출 서비스.

    PyMuPDF(fitz) 기반. 순수 텍스트 추출만 수행.
    """

    async def extract(self, file_path: str | Path) -> PDFExtractionResult:
        """
        PDF 파일에서 텍스트를 추출한다.

        Args:
            file_path: PDF 파일 경로

        Returns:
            PDFExtractionResult (text, page_count, metadata)

        Raises:
            FileNotFoundError: 파일 없음
            ValueError: PDF 아님 또는 파싱 실패
        """
        import fitz  # pymupdf

        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"PDF file not found: {path}")

        try:
            doc = fitz.open(str(path))
        except Exception as exc:
            raise ValueError(f"Failed to open PDF: {exc}") from exc

        pages_text: list[str] = []
        for page in doc:
            text = page.get_text("text")
            if text.strip():
                pages_text.append(text.strip())

        metadata = {}
        if doc.metadata:
            for key in ("title", "author", "subject", "keywords", "creator"):
                val = doc.metadata.get(key)
                if val:
                    metadata[key] = val

        page_count = doc.page_count
        doc.close()

        combined_text = "\n\n".join(pages_text)

        if not combined_text.strip():
            raise ValueError("PDF contains no extractable text (may be image-only)")

        return PDFExtractionResult(
            text=combined_text,
            page_count=page_count,
            metadata=metadata,
        )
```

**핵심 설계**:
- `fitz` (pymupdf) lazy import — 의존성 없으면 에러 메시지
- `page.get_text("text")` — 순수 텍스트 모드 (레이아웃 보존 안 함, 가장 빠름)
- 이미지 전용 PDF는 ValueError로 실패 (4-2 OCR에서 처리)
- 메타데이터(제목, 저자 등)도 추출

### 4. Backend: API 엔드포인트 추가

**파일**: `backend/app/api/files.py` (기존 파일 수정)

#### `POST /api/files/{file_id}/extract` — 텍스트 추출 트리거

```python
@router.post("/files/{file_id}/extract")
async def extract_file_text(
    file_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """PDF 텍스트 추출을 트리거한다.

    추출은 백그라운드에서 실행되며, 상태는 GET /files/{file_id}/text로 확인.
    """
    # 1. 파일 존재 확인
    uploads_dir = Path(settings.UPLOADS_PATH)
    file_path = uploads_dir / file_id
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # 2. PDF 여부 확인
    if not file_id.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files can be extracted")

    # 3. NoteAttachment 조회
    from sqlalchemy import select
    stmt = select(NoteAttachment).where(NoteAttachment.file_id == file_id)
    result = await db.execute(stmt)
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # 4. 이미 추출 완료 확인
    if attachment.extraction_status == "completed":
        return {"status": "already_completed", "page_count": attachment.page_count}

    # 5. 상태를 pending으로 변경
    attachment.extraction_status = "pending"
    await db.commit()

    # 6. 백그라운드 태스크로 추출 실행
    background_tasks.add_task(
        _run_pdf_extraction, file_id, str(file_path)
    )

    return {"status": "pending"}
```

#### `GET /api/files/{file_id}/text` — 추출된 텍스트 조회

```python
@router.get("/files/{file_id}/text")
async def get_file_text(
    file_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """추출된 PDF 텍스트를 반환한다."""
    from sqlalchemy import select
    stmt = select(NoteAttachment).where(NoteAttachment.file_id == file_id)
    result = await db.execute(stmt)
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    return {
        "file_id": file_id,
        "name": attachment.name,
        "extraction_status": attachment.extraction_status,
        "page_count": attachment.page_count,
        "text": attachment.extracted_text,  # None if not extracted
    }
```

#### 백그라운드 추출 함수

```python
async def _run_pdf_extraction(file_id: str, file_path: str) -> None:
    """백그라운드에서 PDF 텍스트 추출 + 임베딩 인덱싱."""
    from app.database import async_session_factory
    from app.services.pdf_extractor import PDFExtractor

    async with async_session_factory() as db:
        try:
            stmt = select(NoteAttachment).where(NoteAttachment.file_id == file_id)
            result = await db.execute(stmt)
            attachment = result.scalar_one_or_none()
            if not attachment:
                return

            # 추출
            extractor = PDFExtractor()
            extraction = await extractor.extract(file_path)

            # DB 업데이트
            attachment.extracted_text = extraction.text
            attachment.extraction_status = "completed"
            attachment.page_count = extraction.page_count
            await db.commit()

            # 임베딩 재인덱싱 (해당 노트)
            await _reindex_note_with_pdf(attachment.note_id, db)

        except Exception as exc:
            logger.exception("PDF extraction failed for %s", file_id)
            attachment.extraction_status = "failed"
            await db.commit()
```

#### 노트 재인덱싱 헬퍼

```python
async def _reindex_note_with_pdf(note_id: int, db: AsyncSession) -> None:
    """PDF 추출 텍스트를 포함하여 노트를 재인덱싱한다.

    Note.content_text에 PDF 텍스트를 append하지 않는다 (원본 보존).
    대신 NoteIndexer에서 attachment_text도 합쳐서 임베딩 생성.
    """
    from app.search.indexer import NoteIndexer
    from app.search.embeddings import EmbeddingService

    embedding_service = EmbeddingService()
    indexer = NoteIndexer(session=db, embedding_service=embedding_service)

    # 기존 임베딩 삭제 후 재생성
    await indexer.delete_embeddings(note_id)
    await indexer.index_note(note_id)
```

### 5. Backend: NoteIndexer 확장 — PDF 텍스트 포함

**파일**: `backend/app/search/indexer.py` (기존 파일 수정)

`index_note()` 메서드에서 PDF 추출 텍스트를 content_text에 합산:

```python
async def index_note(self, note_id: int) -> int:
    note = await self._get_note(note_id)

    text = (note.content_text or "").strip()
    if not text:
        text = (note.title or "").strip()

    # PDF 추출 텍스트 추가 (있으면)
    pdf_text = await self._get_attachment_texts(note_id)
    if pdf_text:
        text = f"{text}\n\n---\n\n{pdf_text}" if text else pdf_text

    if not text:
        return 0

    chunks = await self._embedding_service.embed_chunks(text)
    # ... 기존 저장 로직 ...
```

새 헬퍼 메서드:

```python
async def _get_attachment_texts(self, note_id: int) -> str:
    """노트의 PDF 추출 텍스트를 모아서 반환."""
    from sqlalchemy import select
    from app.models import NoteAttachment

    # note_id가 Note.id (int PK)인데, NoteAttachment.note_id도 동일
    stmt = select(NoteAttachment.extracted_text, NoteAttachment.name).where(
        NoteAttachment.note_id == note_id,
        NoteAttachment.extraction_status == "completed",
        NoteAttachment.extracted_text.isnot(None),
    )
    result = await self._session.execute(stmt)
    rows = result.fetchall()

    if not rows:
        return ""

    parts = []
    for text, name in rows:
        if text and text.strip():
            parts.append(f"[PDF: {name}]\n{text.strip()}")

    return "\n\n---\n\n".join(parts)
```

### 6. Frontend: PDF 추출 UI

**파일**: `frontend/src/pages/NoteDetail.tsx` (기존 파일 수정)

첨부파일 목록에서 PDF 파일에 "텍스트 추출" 버튼 및 상태 표시 추가:

```tsx
{note.attachments?.map((attachment, index) => {
  const ext = attachment.name.split('.').pop()?.toLowerCase() ?? ''
  const isPdf = ext === 'pdf'
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)
  const Icon = isPdf ? FileText : isImage ? Image : File

  return (
    <div key={index} className="flex items-center gap-3 ...">
      <Icon className="h-4 w-4 ..." />
      <span>{attachment.name}</span>
      <span>{ext}</span>

      {/* PDF 추출 버튼/상태 */}
      {isPdf && (
        <>
          {attachment.extraction_status === 'completed' && (
            <button
              onClick={() => handleShowPdfText(attachment.file_id)}
              className="text-xs text-primary hover:underline"
            >
              {t('files.viewExtractedText')}
              <span className="text-muted-foreground ml-1">
                ({attachment.page_count}{t('files.pages')})
              </span>
            </button>
          )}
          {attachment.extraction_status === 'pending' && (
            <span className="text-xs text-amber-600 animate-pulse">
              {t('files.extracting')}
            </span>
          )}
          {attachment.extraction_status === 'failed' && (
            <span className="text-xs text-destructive">
              {t('files.extractionFailed')}
            </span>
          )}
          {!attachment.extraction_status && (
            <button
              onClick={() => handleExtractPdf(attachment.file_id)}
              className="text-xs text-primary hover:underline"
            >
              {t('files.extractText')}
            </button>
          )}
        </>
      )}

      {/* 기존 삭제 버튼 */}
    </div>
  )
})}
```

**추출 트리거 핸들러**:

```tsx
const [pdfText, setPdfText] = useState<{text: string, pageCount: number} | null>(null)
const [extractingFileId, setExtractingFileId] = useState<string | null>(null)

const handleExtractPdf = async (fileId: string) => {
  setExtractingFileId(fileId)
  try {
    await apiClient.post(`/files/${fileId}/extract`)
    // 폴링으로 상태 확인 (간단한 구현)
    const poll = setInterval(async () => {
      const result = await apiClient.get(`/files/${fileId}/text`)
      if (result.extraction_status === 'completed' || result.extraction_status === 'failed') {
        clearInterval(poll)
        setExtractingFileId(null)
        window.location.reload()  // 상태 갱신
      }
    }, 2000)
  } catch {
    setExtractingFileId(null)
  }
}

const handleShowPdfText = async (fileId: string) => {
  const result = await apiClient.get(`/files/${fileId}/text`)
  setPdfText({ text: result.text, pageCount: result.page_count })
}
```

**추출된 텍스트 미리보기 모달/섹션**:

```tsx
{pdfText && (
  <div className="mt-4 border border-border rounded-lg p-4 bg-muted/20">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-medium">
        {t('files.extractedText')} ({pdfText.pageCount} {t('files.pages')})
      </h3>
      <button onClick={() => setPdfText(null)} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
    <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-[300px] overflow-y-auto">
      {pdfText.text}
    </pre>
  </div>
)}
```

### 7. Frontend: i18n 키 추가

**파일**: `frontend/src/locales/ko.json`

```json
"files": {
    ...
    "extractText": "텍스트 추출",
    "extracting": "추출 중...",
    "extractionFailed": "추출 실패",
    "viewExtractedText": "추출된 텍스트 보기",
    "extractedText": "추출된 텍스트",
    "pages": "페이지"
}
```

**파일**: `frontend/src/locales/en.json`

```json
"files": {
    ...
    "extractText": "Extract text",
    "extracting": "Extracting...",
    "extractionFailed": "Extraction failed",
    "viewExtractedText": "View extracted text",
    "extractedText": "Extracted text",
    "pages": "pages"
}
```

---

## 파일 변경 목록

| 파일 | 유형 | 내용 |
|------|------|------|
| `backend/pyproject.toml` | 수정 | pymupdf 의존성 추가 |
| `backend/app/models.py` | 수정 | NoteAttachment에 extracted_text, extraction_status, page_count 추가 |
| `backend/alembic/versions/xxx_add_pdf_extraction.py` | **신규** | 마이그레이션 |
| `backend/app/services/pdf_extractor.py` | **신규** | PDFExtractor 서비스 |
| `backend/app/api/files.py` | 수정 | POST /files/{id}/extract, GET /files/{id}/text, 백그라운드 추출 |
| `backend/app/search/indexer.py` | 수정 | PDF 추출 텍스트를 임베딩에 포함 |
| `frontend/src/pages/NoteDetail.tsx` | 수정 | PDF 추출 버튼 + 상태 표시 + 텍스트 미리보기 |
| `frontend/src/locales/ko.json` | 수정 | PDF 추출 i18n 키 |
| `frontend/src/locales/en.json` | 수정 | PDF 추출 i18n 키 |

---

## 구현 순서 (권장)

1. **의존성 추가** — `pyproject.toml`에 pymupdf
2. **DB 모델 확장 + 마이그레이션** — NoteAttachment 필드 추가
3. **PDFExtractor 서비스** — `services/pdf_extractor.py`
4. **API 엔드포인트** — `files.py` (extract + text)
5. **NoteIndexer 확장** — PDF 텍스트를 임베딩에 포함
6. **프론트엔드 UI** — NoteDetail.tsx (추출 버튼 + 미리보기)
7. **i18n** — ko.json, en.json
8. **테스트** — 백엔드 단위 + Docker에서 pymupdf 설치 확인
9. **커밋**

---

## 코드 스타일 & 규칙

- **Backend**: ruff (lint + format), async/await, 타입 힌트 필수
- **Frontend**: ESLint + Prettier, shadcn/ui, TailwindCSS, Light mode only
- **커밋**: Conventional Commits — `feat: PDF 텍스트 추출 (PDF Text Extraction) — Task 4-1`
- **i18n**: 한국어 우선
- **Docker**: pymupdf는 C 바인딩이지만 pip으로 바이너리 휠 설치 가능 (별도 시스템 패키지 불필요)

---

## 주의사항

1. **Note.content_text 변경하지 않음** — PDF 텍스트는 `NoteAttachment.extracted_text`에만 저장. 원본 노트 텍스트 보존. 인덱서에서만 합산.
2. **이미지 전용 PDF** — 텍스트 없는 PDF는 `extraction_status = "failed"` + 에러 메시지. 4-2 OCR에서 처리 예정.
3. **대용량 PDF** — pymupdf는 수백 페이지도 초 단위 처리. 백그라운드 태스크로 비동기 실행.
4. **임베딩 비용** — PDF 텍스트가 긴 경우 청크 수가 많아짐. 기존 500토큰/청크 전략 그대로 적용.
5. **중복 추출 방지** — `extraction_status == "completed"` 시 재추출 방지. 강제 재추출이 필요하면 status를 None으로 리셋.
6. **마이그레이션 순서** — 모델 변경 → `alembic revision --autogenerate` → `alembic upgrade head`
7. **기존 첨부파일 하위 호환** — 새 필드는 모두 nullable이므로 기존 데이터에 영향 없음.
8. **BackgroundTasks vs Celery** — 현재 프로젝트에 별도 태스크 큐 없음. FastAPI BackgroundTasks 사용 (단일 워커 내 asyncio).
9. **pymupdf 설치** — Docker 컨테이너에서 `pip install pymupdf`로 자동 설치 (wheels 제공). 시스템 패키지 불필요.
10. **FTS 자동 적용** — Note.content_text에 직접 추가하지 않으므로 FTS(tsvector)에는 PDF 텍스트 미포함. Semantic search(임베딩)만 적용. FTS 포함이 필요하면 search_vector 업데이트 별도 논의.

---

## 테스트 전략

### Backend 단위 테스트

1. **PDFExtractor 텍스트 추출**
   - 입력: 텍스트 기반 PDF
   - 예상: 텍스트 + 페이지 수 + 메타데이터 반환

2. **PDFExtractor 이미지 전용 PDF**
   - 입력: 이미지만 있는 PDF
   - 예상: ValueError 발생

3. **PDFExtractor 파일 없음**
   - 입력: 존재하지 않는 경로
   - 예상: FileNotFoundError

4. **API extract 엔드포인트**
   - PDF 파일 업로드 → extract 호출 → status pending
   - 비PDF 파일 → 400 에러

5. **API text 엔드포인트**
   - 추출 완료 → 텍스트 반환
   - 미추출 → text: None

### Integration 테스트

1. **추출 → 인덱싱 파이프라인**
   - PDF 업로드 → 추출 → 임베딩 생성 확인
   - 시맨틱 검색에서 PDF 텍스트 매칭 확인

2. **Docker 환경**
   - pymupdf 설치 확인
   - /data/uploads 볼륨 접근 확인

---

## 설계 원칙

1. **기존 검색 파이프라인 재활용** — NoteIndexer에 최소 수정으로 PDF 텍스트 통합
2. **비동기 추출** — 사용자 경험 차단 없음 (BackgroundTasks)
3. **원본 보존** — Note.content_text 변경 안 함, 인덱싱 시에만 합산
4. **점진적 기능** — 추출 안 해도 기존 검색 동작에 영향 없음
5. **4-2 OCR과 연계** — 텍스트 없는 PDF는 나중에 OCR 파이프라인으로 처리
