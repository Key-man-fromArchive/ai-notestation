# Phase 4 — 멀티모달 확장

> 근거: Reseek 제품 (OCR, PDF 추출), Web-Shepherd 논문 ("text-only가 더 나을 수도" 주의)
>
> **현재 상태**: 4-1 ✅ (v1.2.0), 4-2 ✅ (v1.2.0 → v1.3.0 → v1.3.1), 4-3 🔲

---

## Task 4-1. PDF 텍스트 추출 ✅ (v1.2.0)

### 구현 완료

- **`services/pdf_extractor.py`** — `PDFExtractor` 클래스
  - PyMuPDF 기반 텍스트 추출 + OCR 폴백 (이미지 PDF)
  - `extract_text()` → `PDFExtractionResult` (pages, metadata, total_chars)
  - `extract_and_index()` → DB 저장 + 임베딩 인덱싱 트리거
- **DB**: `NoteAttachment.extracted_text`, `extraction_status` 필드 + 마이그레이션 017
- **API**: `POST /files/{id}/extract`, `GET /files/{id}/text`
- **검색 통합**: PDF 추출 텍스트가 FTS + 임베딩 대상에 포함
- **Frontend**: PDF 첨부 파일 텍스트 추출 UI

---

## Task 4-2. OCR + Vision 이미지 분석 시스템 ✅ (v1.2.0 → v1.3.0 → v1.3.1)

### 3세대 아키텍처 진화

#### v1.2.0 — 수동 단건 OCR
- 우클릭 → "텍스트 인식" 으로 개별 이미지 OCR
- 3개 엔진 선택 가능 (AI Vision / PaddleOCR-VL / GLM-OCR)
- `NoteImage.extracted_text` 필드 + 마이그레이션 018

#### v1.3.0 — 배치 파이프라인 도입
- `ImageAnalysisService` 신규 — 모든 이미지 일괄 처리
- Vision 설명 생성 (glm-4.6v) + `vision_description` 필드 + 마이그레이션 019
- Vision 설명이 검색 임베딩에 포함 → "그래프가 있는 노트" 같은 시각적 검색
- 캐시된 텍스트로 AI Insight 최적화 (이미지 재전송 불필요)
- 우클릭 개별 Vision 분석 + FIFO 큐 기반 다중 요청 관리

#### v1.3.1 — 듀얼 파이프라인 아키텍처 (현재)
- OCR/Vision을 독립 파이프라인으로 분리 (순차→병렬)
- **Vision 처리량 ~6배 향상**
- Settings UI: DB 기준 전체 통계 상시 표시, 시작/완료 시간, 실패 상세 팝업
- Dashboard: OCR/Vision 미처리 분리 표시

### 핵심 아키텍처 상세

#### OCRService (`services/ocr_service.py`, 307줄)

3엔진 하이브리드 + 자동 폴백 체인:

```
┌─────────────┐     실패     ┌──────────────┐     실패     ┌─────────────────┐
│  GLM-OCR    │ ──────────→ │ PaddleOCR-VL │ ──────────→ │ AI Vision Cloud │
│  (ZhipuAI)  │             │  (로컬 CPU)   │             │  (7모델 우선순위) │
└─────────────┘             └──────────────┘             └─────────────────┘
  마크다운 출력               120초 타임아웃              glm-4.6v-flash → ... → claude-sonnet-4-5
  layout_parsing API          멀티쓰레드 실행              "OCR" 프롬프트로 텍스트 추출
```

- **`GlmOcrEngine`**: ZhipuAI `layout_parsing` API, 마크다운 포맷 출력
- **`PaddleOCRVLEngine`**: 로컬 CPU 실행, 120초 타임아웃, 멀티쓰레드
- **AI Vision 클라우드**: 7개 모델 우선순위 (glm-4.6v-flash, glm-4.6v, gemini-2.0-flash, gpt-4o-mini, gpt-4o, claude-haiku-3-5, claude-sonnet-4-5)
- **`OCRResult`** 모델: text, confidence (0-1), method (엔진/모델 ID)
- `extract_text()` → 설정된 엔진 디스패치, 실패 시 자동 폴백

#### ImageAnalysisService (`services/image_analysis_service.py`, 331줄)

듀얼 파이프라인 배치 프로세서:

```
                        ┌─── OCR Pipeline (concurrency=1) ───┐
  전체 이미지 목록 ──→  │   GLM-OCR rate limit 때문에 직렬    │ ──→ 자동 검색 재인덱싱
  (미처리 필터)    ──→  │                                     │ ──→ (_reindex_affected_notes)
                        ├─── Vision Pipeline (concurrency=8) ─┤
                        │   429 rate limit 방지 세마포어       │
                        │   이미지 설명 텍스트 생성            │
                        └─────────────────────────────────────┘
                          asyncio.gather() 독립 실행
                          한쪽 실패해도 다른 파이프라인 계속
```

- **`run_batch()`**: OCR + Vision 을 `asyncio.gather()` 로 독립 실행
- **`_run_ocr()`**: `OCRService` 에 위임, `OCR_CONCURRENCY=1`
- **`_run_vision()`**: `AIRouter` 사용, 설정 가능한 Vision 모델 (기본: glm-4.6v), `VISION_CONCURRENCY=8`
- **`_reindex_affected_notes()`**: 완료 후 영향받은 노트의 검색 임베딩 자동 갱신
- **`_get_vision_model()`**: Settings store에서 Vision 모델 읽기

#### API (`api/image_analysis.py`, 207줄)

- `POST /api/image-analysis/trigger` — 배치 분석 시작 (Background task)
- `GET /api/image-analysis/status` — 진행 상태 (total, processed, ocr_done, vision_done, failed)
- `GET /api/image-analysis/stats` — DB 기준 전체 통계
- `GET /api/image-analysis/failed` — 실패 이미지 상세 목록
- **`ImageAnalysisState`**: 인메모리 진행 추적 (status, timestamps, progress callback)

### 파일 목록 (실제 구현)
| 파일 | 역할 |
|------|------|
| `backend/app/services/ocr_service.py` | 3엔진 하이브리드 OCR + 폴백 체인 |
| `backend/app/services/image_analysis_service.py` | 듀얼 파이프라인 배치 프로세서 |
| `backend/app/api/image_analysis.py` | trigger/status/stats/failed 엔드포인트 |
| `backend/app/api/files.py` | 개별 Vision 분석 엔드포인트 |
| `backend/app/models.py` | NoteImage.extracted_text, vision_description 필드 |
| `backend/migrations/versions/018_*.py` | OCR 텍스트 필드 마이그레이션 |
| `backend/migrations/versions/019_*.py` | Vision 설명 필드 마이그레이션 |
| `frontend/src/hooks/useBatchImageAnalysis.ts` | 배치 처리 훅 |
| `frontend/src/hooks/useImageAnalysisStats.ts` | 통계 훅 |

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
