# Phase 4 — 멀티모달 확장 (v2.0.0)

> 근거: Reseek 제품 (OCR, PDF 추출), Web-Shepherd 논문 ("text-only가 더 나을 수도" 주의)

## 현재 상태 분석

### 기존 인프라
- **NoteImage** — 모델 존재 (`models.py`), NSX 추출 이미지 저장
- **NoteAttachment** — 모델 존재, 파일 첨부
- **image_utils.py** — `extract_note_images()` 함수, 멀티모달 AI 지원
- **NAS Images API** — `api/nas_images.py`, 이미지 프록시/서빙
- **Files API** — `api/files.py`, 파일 핸들링
- **임베딩 파이프라인** — `search/indexer.py`, `search/embeddings.py`

### 주의사항 (Web-Shepherd 발견)
> "멀티모달 입력이 때때로 성능을 저하시킨다" — 구조화된 작업에서는 텍스트 기반 처리 우선

---

## Task 4-1. PDF 텍스트 추출

### 목표
연구 논문, eBook PDF에서 **텍스트 추출 → 검색 가능하게** 인덱싱

### TODO

#### Backend

- [ ] **PDF 추출 서비스** (`services/pdf_extractor.py` — 신규)
  ```python
  class PDFExtractor:
      """PDF → 텍스트 추출 파이프라인"""

      async def extract_text(
          self,
          file_path: str | Path,
      ) -> PDFExtractionResult:
          """
          추출 전략 (우선순위):
          1. pymupdf (PyMuPDF) — 가장 빠르고 정확
          2. pdfplumber — 테이블 추출에 강함
          3. Fallback: OCR (이미지 기반 PDF)

          결과:
          - pages: list[PageContent]  # 페이지별 텍스트
          - metadata: dict            # 제목, 저자, 날짜 등
          - total_chars: int
          """

      async def extract_and_index(
          self,
          note_id: int,
          attachment_id: int,
          db: AsyncSession,
      ) -> None:
          """
          1. PDF 파일 다운로드/접근
          2. 텍스트 추출
          3. Note에 텍스트 저장 (또는 별도 테이블)
          4. 임베딩 인덱싱 파이프라인 트리거
          """
  ```

- [ ] **DB 스키마 확장** (Alembic 마이그레이션)
  ```python
  class NoteAttachmentText(Base):
      """첨부 파일에서 추출된 텍스트"""
      id: int
      attachment_id: int  # FK → NoteAttachment
      extracted_text: str
      page_count: int
      extraction_method: str  # "pymupdf", "pdfplumber", "ocr"
      extracted_at: datetime
  ```

- [ ] **API 엔드포인트**
  ```python
  POST /api/files/{attachment_id}/extract → {"status": "extracting"}
  GET  /api/files/{attachment_id}/text   → {"text": "...", "pages": 42}
  ```

- [ ] **임베딩 통합** (`search/indexer.py`)
  - PDF 추출 텍스트도 임베딩 대상에 포함
  - 긴 문서는 청크 분할 후 각각 임베딩

- [ ] **의존성 추가** (`pyproject.toml`)
  - `pymupdf` (또는 `PyMuPDF`)
  - `pdfplumber` (보조)

#### Frontend

- [ ] **PDF 뷰어/텍스트 토글** (`pages/NoteDetail.tsx`)
  - PDF 첨부 파일에 "텍스트 추출" 버튼
  - 추출 완료 후 텍스트 미리보기 표시
  - 추출된 텍스트 검색 가능 표시

### 파일 변경 목록
| 파일 | 변경 유형 |
|------|-----------|
| `backend/app/services/pdf_extractor.py` | **신규** |
| `backend/app/models.py` | 수정 — NoteAttachmentText 모델 |
| `backend/alembic/versions/xxx_add_attachment_text.py` | **신규** — 마이그레이션 |
| `backend/app/api/files.py` | 수정 — extract, text 엔드포인트 |
| `backend/app/search/indexer.py` | 수정 — PDF 텍스트 임베딩 |
| `backend/pyproject.toml` | 수정 — pymupdf 의존성 |

### 예상 난이도: ★★★☆☆
라이브러리 의존. 긴 문서 청크 전략이 핵심.

---

## Task 4-2. OCR 파이프라인 (이미지 → 텍스트)

### 목표
실험실 노트의 사진, 다이어그램, 손글씨를 **검색 가능한 텍스트로**

### TODO

#### Backend

- [ ] **OCR 서비스** (`services/ocr_service.py` — 신규)
  ```python
  class OCRService:
      """이미지 → 텍스트 추출"""

      async def extract_text(
          self,
          image_data: bytes,
          language: str = "kor+eng",
      ) -> OCRResult:
          """
          OCR 전략 (선택적):
          A. Tesseract OCR (로컬, 무료, 한글 지원)
          B. AI 프로바이더 Vision API (정확도 높음, 비용 발생)
             - 기존 image_utils.py + multimodal AI 활용
          C. 하이브리드: Tesseract 먼저 → 신뢰도 낮으면 AI Vision

          결과:
          - text: str
          - confidence: float
          - method: str  # "tesseract", "ai_vision"
          """

      async def process_note_images(
          self,
          note_id: int,
          db: AsyncSession,
      ) -> list[OCRResult]:
          """노트의 모든 이미지에 OCR 실행"""
  ```

- [ ] **NoteImage 모델 확장** (`models.py`)
  - `ocr_text: str | None` 필드 추가
  - `ocr_confidence: float | None`

- [ ] **검색 통합**
  - OCR 텍스트를 FTS 인덱싱 대상에 포함
  - 임베딩 생성 시 OCR 텍스트도 포함

- [ ] **의존성** (`pyproject.toml`)
  - `pytesseract` + Tesseract 시스템 패키지
  - 또는 Docker에 tesseract-ocr 포함

#### Frontend

- [ ] **이미지에 OCR 뱃지**
  - OCR 완료된 이미지에 텍스트 아이콘 표시
  - 클릭 시 추출된 텍스트 오버레이

### 예상 난이도: ★★★★☆
외부 의존성 (Tesseract). Docker 설정 변경 필요. 한글 정확도 이슈.

---

## Task 4-3. 외부 콘텐츠 캡처

### 목표
URL 북마크 → **콘텐츠 자동 추출**, 학술 논문 메타데이터 파싱

### TODO

#### Backend

- [ ] **콘텐츠 캡처 서비스** (`services/content_capture.py` — 신규)
  ```python
  class ContentCaptureService:
      async def capture_url(
          self,
          url: str,
          user_id: int,
          notebook_id: int | None = None,
      ) -> Note:
          """
          1. URL 콘텐츠 fetch (httpx + readability)
          2. HTML → 마크다운 변환
          3. 메타데이터 추출 (title, description, author, date)
          4. 노트로 저장
          5. 자동 태깅 트리거 (Phase 3-1 연동)
          """

      async def capture_arxiv(self, arxiv_id: str) -> Note:
          """arXiv 논문 메타데이터 + abstract 캡처"""

      async def capture_pubmed(self, pmid: str) -> Note:
          """PubMed 논문 메타데이터 + abstract 캡처"""
  ```

- [ ] **API 엔드포인트**
  ```python
  POST /api/capture/url    {"url": "..."} → Note
  POST /api/capture/arxiv  {"arxiv_id": "2510.00568"} → Note
  POST /api/capture/pubmed {"pmid": "12345678"} → Note
  ```

- [ ] **의존성** (`pyproject.toml`)
  - `readability-lxml` — HTML 정리
  - `httpx` — 이미 있을 가능성 높음

#### Frontend

- [ ] **캡처 UI**
  - "URL에서 노트 만들기" 버튼
  - URL 입력 → 미리보기 → 저장
  - arXiv/PubMed 자동 감지

### 예상 난이도: ★★★☆☆
HTTP fetch + HTML 파싱은 표준적. 학술 API 연동이 부가적.

---

## 구현 순서 (권장)

```
4-1 (PDF 추출) → 4-3 (URL 캡처) → 4-2 (OCR)
      3일             3일             4일
```

- 4-1이 연구자 니즈 가장 높음
- 4-3은 4-1과 유사한 패턴 (텍스트 추출 → 인덱싱)
- 4-2는 외부 의존성으로 마지막

## 테스트 전략

- [ ] Unit: PDF 추출 — 다양한 PDF 형식 (텍스트, 스캔, 혼합)
- [ ] Unit: OCR — 한글/영문 정확도
- [ ] Unit: URL 캡처 — 다양한 웹사이트 (JS 렌더링 이슈 주의)
- [ ] Integration: 추출 → 인덱싱 → 검색 파이프라인
- [ ] Docker: tesseract, pymupdf 패키지 포함 확인
