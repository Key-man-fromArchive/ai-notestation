# Task 4-2 OCR 브라우저 UI 테스트 세션 프롬프트

## 상황 요약

Task 4-2 OCR 파이프라인 구현이 완료되었고, API 레벨 테스트도 통과했습니다.
브라우저에서 UI가 정상 동작하는지 확인해야 합니다.

## 완료된 작업

- OCR 서비스 (`backend/app/services/ocr_service.py`) — AI Vision 기반, 모델 폴백 지원
- ZhipuAI 프로바이더 이미지 지원 (`zhipuai.py`)
- PDFExtractor OCR 폴백 (`pdf_extractor.py`)
- NoteImage 모델 + 마이그레이션 (`018_add_ocr_fields.py`) — 적용 완료
- API 엔드포인트: `POST /files/{id}/extract` (이미지 OCR 확장), `POST /images/{id}/extract`, `GET /images/{id}/text`
- NoteIndexer에 OCR 텍스트 포함
- Frontend: NoteDetail.tsx에 이미지 OCR 버튼/상태 UI + NoteImage OCR 섹션
- i18n: `ocr.*` 키 추가 (ko.json, en.json)

## API 테스트 결과 (통과)

- `POST /api/files/test_ocr.png/extract` → `{"status":"pending"}` 성공
- GLM-5 크레딧 부족 → GPT-4o 자동 폴백 → OCR 성공
- DB에 `extraction_status=completed`, qPCR 실험 데이터 테이블 텍스트 정확 추출

## 테스트 DB 데이터

```sql
-- 테스트용 이미지 첨부파일 (note_id=3에 연결)
SELECT * FROM note_attachments WHERE file_id = 'test_ocr.png';
-- extraction_status = 'completed', extracted_text에 qPCR 데이터 있음

-- NoteImage 테이블은 현재 비어있음 (NSX 이미지 동기화 미수행)
-- /data/nsx_images/ 에 실제 이미지 파일은 수백개 존재
```

## 브라우저 UI 테스트 항목

### 1. 노트 상세 페이지에서 이미지 첨부파일 OCR UI 확인
- http://localhost:3000 접속
- 로그인: `ai-note@labnote.ai` / `test1234`
- note_id=3에 해당하는 노트로 이동
- 첨부파일 섹션에서 `test_ocr.png` 확인
- "추출된 텍스트 보기" 버튼이 표시되는지 확인 (extraction_status=completed이므로)
- 클릭 시 텍스트 미리보기가 나타나는지 확인

### 2. 다른 이미지 첨부파일에서 OCR 트리거 확인
- 아직 추출 안 된 이미지 첨부파일에서 "텍스트 인식(OCR)" 버튼 표시 확인
- 클릭 시 "텍스트 인식 중..." 상태로 변경 확인

### 3. NoteImage 섹션 (NSX 이미지)
- note_images 테이블이 비어있으므로 이 섹션은 아직 안 보임 (정상)
- 필요시 NSX 이미지 동기화 후 테스트 가능

## 테스트 방법

MEMORY.md 규칙: Playwright MCP 도구 사용 금지. `npx playwright` CLI 사용.

```bash
# 간단한 스크린샷 테스트
cd /mnt/docker/labnote-ai/frontend
npx playwright screenshot --browser chromium http://localhost:3000 /tmp/home.png

# 또는 Puppeteer MCP (sandbox 이슈 있을 수 있음)
# 또는 curl로 API 테스트 + 수동 브라우저 확인 안내
```

## 알려진 이슈

1. **EmbeddingService API 키 미설정**: OCR 후 리인덱싱 시 `TypeError: EmbeddingService.__init__() missing 1 required positional argument: 'api_key'` — OCR과 무관, 임베딩 서비스 설정 문제
2. **ZhipuAI GLM-5 크레딧 부족**: 429 에러 → GPT-4o로 자동 폴백 정상 동작

## 관련 커밋

- `9dd68f4` feat: OCR 파이프라인 (이미지 → 텍스트) — Task 4-2
- `9d62276` fix: OCR 서비스 AIRouter.chat() 호출 수정 + 모델 폴백
