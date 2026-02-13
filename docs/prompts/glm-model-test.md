# GLM 모델 종합 테스트 프롬프트

## 배경

Z.ai Coding Plan 기반 GLM 모델 사용 중. 이전 세션에서 확인된 사항:
- **Chat API 엔드포인트**: `https://api.z.ai/api/coding/paas/v4` (ZhipuAI SDK `base_url`)
- **Layout Parsing API** (GLM-OCR 전용): `https://api.z.ai/api/paas/v4/layout_parsing`
- **환경변수**: `ZHIPUAI_API_KEY` (`.env`), `ZHIPUAI_BASE_URL` (선택)
- **Provider 파일**: `backend/app/ai_router/providers/zhipuai.py`
- **OCR 서비스 파일**: `backend/app/services/ocr_service.py`

---

## Z.ai 전체 모델 현황 (Rate Limits 페이지 기준)

### 텍스트 모델

| 모델 | 동시성 | 가격 (입/출, $/M tok) | 이전 테스트 | 등록 상태 |
|------|--------|----------------------|------------|----------|
| `glm-5` | 1 | $1 / $3.2 | OK | 등록됨 |
| `glm-4.7` | 3 | $0.6 / $2.2 | OK | 등록됨 |
| `glm-4.7-flash` | 1 | **무료** | OK | 등록됨 |
| `glm-4.7-flashx` | 3 | $0.07 / $0.4 | 미테스트 | 미등록 |
| `glm-4.6` | 3 | $0.6 / $2.2 | OK | **미등록** |
| `glm-4.5` | 10 | $0.6 / $2.2 | OK | **미등록** |
| `glm-4.5-air` | 5 | $0.2 / $1.1 | 미테스트 | 미등록 |
| `glm-4.5-airx` | 5 | $1.1 / $4.5 | 미테스트 | 미등록 |
| `glm-4.5-flash` | 2 | **무료** | 미테스트 | 미등록 |
| `glm-4-plus` | 20 | N/A | ~~1113 quota~~ 재테스트 필요 | 등록됨 (제거 예정?) |
| `glm-4-32b-0414-128k` | 15 | $0.1 / $0.1 | ~~1113 quota~~ 재테스트 필요 | 미등록 |

### Vision 모델

| 모델 | 동시성 | 가격 (입/출, $/M tok) | 이전 테스트 | 등록 상태 |
|------|--------|----------------------|------------|----------|
| `glm-4.5v` | 10 | $0.6 / $1.8 | OK (904자 추출) | 등록됨 |
| `glm-4.6v` | 10 | $0.3 / $0.9 | OK (빈 응답 1회) | **미등록** |
| `glm-4.6v-flashx` | 3 | $0.04 / $0.4 | 미테스트 | 미등록 |
| `glm-4.6v-flash` | 1 | **무료** | 미테스트 | 미등록 |

### 전용 OCR 모델 (별도 API!)

| 모델 | 동시성 | 가격 | API 엔드포인트 | 비고 |
|------|--------|------|---------------|------|
| `glm-ocr` | 1 | $0.03/M tok | `/api/paas/v4/layout_parsing` | 0.9B, OmniDocBench 94.62, 한국어 지원 |

**GLM-OCR 특징:**
- Chat completion이 아닌 전용 Layout Parsing API 사용
- PDF(최대100p)/이미지(최대10MB) → Markdown/HTML/JSON 변환
- 1.86 pages/sec (PDF), 0.67 images/sec
- 별도 SDK 필요 (`zai-sdk`) 또는 직접 HTTP 호출

---

## 수행할 작업

### Phase 1: 사전 준비

1. **Docker 이미지 리빌드** (numpy 핀 영구 적용)
   ```bash
   docker compose build backend
   docker compose up -d backend
   ```

2. **`_AVAILABLE_MODELS` 업데이트** — `backend/app/ai_router/providers/zhipuai.py`

   현재 등록: `glm-5`, `glm-4.7`, `glm-4.7-flash`, `glm-4.5v`, `glm-4-plus`

   변경 계획 (Phase 2~4 테스트 결과에 따라 최종 확정):
   - 추가: `glm-4.6`, `glm-4.6v`, `glm-4.5`, `glm-4.7-flashx`, `glm-4.6v-flashx`, `glm-4.6v-flash`, `glm-4.5-flash`
   - 제거: `glm-4-plus` (재테스트 후 결정)
   - `glm-4-32b-0414-128k`, `glm-4-plus` 재테스트 (이전 오류는 엔드포인트 문제였을 가능성)

### Phase 2: 텍스트 생성 품질 비교

각 모델에 동일한 프롬프트 3종을 보내고 응답 품질/속도를 비교한다.

**테스트 프롬프트 세트:**
1. **한국어 요약**: "다음 텍스트를 3줄로 요약하세요: [실험 노트 본문 500자]"
2. **영어 코드 설명**: "Explain what this Python function does in 2 sentences: [hybrid search RRF merge 코드]"
3. **창의적 작문**: "실험실 안전 수칙을 재미있는 동화 형식으로 5문장으로 작성하세요"

**비교 대상 모델** (Text, 총 10종):
- 플래그십: `glm-5`
- 범용: `glm-4.7`, `glm-4.6`, `glm-4.5`
- 경량: `glm-4.7-flash` (무료), `glm-4.7-flashx`, `glm-4.5-flash` (무료), `glm-4.5-air`
- 재테스트: `glm-4-plus`, `glm-4-32b-0414-128k`

**수행 방법:**
```bash
# 백엔드 컨테이너에서 직접 Python 스크립트 실행
docker exec -it labnote-backend python -c "
import asyncio, time
from app.ai_router.router import AIRouter
from app.ai_router.schemas import AIRequest, Message

router = AIRouter()

models = [
    'glm-5', 'glm-4.7', 'glm-4.7-flash', 'glm-4.7-flashx',
    'glm-4.6', 'glm-4.5', 'glm-4.5-flash', 'glm-4.5-air',
    'glm-4-plus', 'glm-4-32b-0414-128k',
]
prompt = '실험실 안전 수칙을 재미있는 동화 형식으로 5문장으로 작성하세요'

async def test():
    for m in models:
        req = AIRequest(messages=[Message(role='user', content=prompt)], model=m, temperature=0.7)
        t0 = time.time()
        try:
            resp = await router.chat(req)
            elapsed = time.time() - t0
            tokens = resp.usage.total_tokens if resp.usage else 'N/A'
            print(f'\n=== {m} ({elapsed:.1f}s, {tokens} tok) ===')
            print(resp.content[:300])
        except Exception as e:
            print(f'\n=== {m} FAILED: {e} ===')

asyncio.run(test())
"
```

> **참고**: `_AVAILABLE_MODELS`에 미등록된 모델은 AIRouter가 라우팅하지 못하므로,
> 먼저 Phase 1에서 모델을 등록하거나, ZhipuAI SDK를 직접 호출해야 합니다.

**기록할 메트릭:**
- 응답 시간 (초)
- 토큰 수 (prompt + completion + total)
- 응답 품질 (주관적 1-5 점)
- 한국어 자연스러움 (1-5 점)

### Phase 3: Vision/OCR 모델 테스트

Vision 모델 4종의 이미지 인식 능력을 비교한다.

**비교 대상** (가격순):
1. `glm-4.6v-flash` — **무료**
2. `glm-4.6v-flashx` — $0.04/M
3. `glm-4.6v` — $0.3/M
4. `glm-4.5v` — $0.6/M (이전 테스트 904자 성공)

**테스트 이미지 유형:**
1. 실험 노트 필기 이미지 (NAS에서 가져온 실제 이미지)
2. 테이블/차트가 포함된 이미지
3. 한국어 텍스트가 포함된 이미지

**수행 방법:**
```bash
# 1) 기존 NoteImage에서 테스트 이미지 경로 조회
docker exec -it labnote-backend python -c "
import asyncio
from sqlalchemy import text
from app.database import async_session_factory

async def find_images():
    async with async_session_factory() as db:
        result = await db.execute(text(
            \"SELECT id, name, file_path, mime_type, extraction_status, \"
            \"length(extracted_text) as text_len \"
            \"FROM note_images WHERE file_path IS NOT NULL LIMIT 5\"
        ))
        for row in result:
            print(row)

asyncio.run(find_images())
"

# 2) Vision 모델 비교 (이미지 경로를 위 결과로 교체)
docker exec -it labnote-backend python -c "
import asyncio, time, base64
from pathlib import Path
from app.ai_router.router import AIRouter
from app.ai_router.schemas import AIRequest, Message, ImageContent

router = AIRouter()

image_path = '/data/nsx_images/REPLACE_WITH_ACTUAL_PATH'
image_bytes = Path(image_path).read_bytes()
b64 = base64.b64encode(image_bytes).decode()

ocr_prompt = 'Extract all text from this image exactly as written. Preserve layout and line breaks. Return only the extracted text.'

async def test_vision():
    for model in ['glm-4.6v-flash', 'glm-4.6v-flashx', 'glm-4.6v', 'glm-4.5v']:
        msg = Message(role='user', content=ocr_prompt, images=[ImageContent(data=b64, mime_type='image/png')])
        req = AIRequest(messages=[msg], model=model, temperature=0.1)
        t0 = time.time()
        try:
            resp = await router.chat(req)
            elapsed = time.time() - t0
            print(f'\n=== {model} ({elapsed:.1f}s) ===')
            print(f'Text length: {len(resp.content)} chars')
            print(resp.content[:500])
        except Exception as e:
            print(f'\n=== {model} FAILED: {e} ===')

asyncio.run(test_vision())
"
```

**기록할 메트릭:**
- OCR 텍스트 추출 길이 (chars)
- 추출 정확도 (원본 대비)
- 응답 시간 (초)
- 한국어/영어 혼합 처리 능력
- 비용 효율성 (품질 ÷ 가격)

### Phase 4: GLM-OCR 전용 모델 테스트 (중요!)

GLM-OCR은 Chat API가 아닌 **Layout Parsing API**를 사용하므로 별도 통합이 필요.

**API 정보:**
- 엔드포인트: `POST https://api.z.ai/api/paas/v4/layout_parsing`
- 모델명: `glm-ocr`
- 입력: 이미지 URL 또는 base64
- 출력: Markdown/HTML/JSON
- 가격: $0.03/M tokens (Vision 모델 대비 10~20배 저렴)
- 성능: 0.67 images/sec, OmniDocBench V1.5 94.62점

**직접 HTTP 호출 테스트:**
```bash
# base64 인코딩된 이미지로 GLM-OCR 테스트
docker exec -it labnote-backend python -c "
import httpx, base64, time, os, json
from pathlib import Path

api_key = os.environ.get('ZHIPUAI_API_KEY')
image_path = '/data/nsx_images/REPLACE_WITH_ACTUAL_PATH'
image_bytes = Path(image_path).read_bytes()
b64 = base64.b64encode(image_bytes).decode()

# data URI 형식으로 전달
data_uri = f'data:image/png;base64,{b64}'

url = 'https://api.z.ai/api/paas/v4/layout_parsing'
headers = {
    'Authorization': f'Bearer {api_key}',
    'Content-Type': 'application/json',
}
payload = {
    'model': 'glm-ocr',
    'file': data_uri,
}

t0 = time.time()
with httpx.Client(timeout=60) as client:
    resp = client.post(url, headers=headers, json=payload)
elapsed = time.time() - t0

print(f'Status: {resp.status_code} ({elapsed:.1f}s)')
print(json.dumps(resp.json(), ensure_ascii=False, indent=2)[:2000])
"
```

**결정 사항:**
- GLM-OCR을 OCR 파이프라인에 통합할지 여부
- 통합 시 `ocr_service.py`에 별도 엔진 클래스 추가 필요 (`GlmOcrEngine`)
- PaddleOCR-VL (로컬) → GLM-OCR (전용, 저렴) → AI Vision (범용) 폴백 체인 고려

### Phase 5: 스트리밍 검증

등록된 모든 모델의 SSE 스트리밍이 정상 작동하는지 확인한다.

```bash
# API 토큰 먼저 획득
TOKEN=$(curl -s -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_USER","password":"YOUR_PASS"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 각 모델 스트리밍 테스트
for model in glm-5 glm-4.7 glm-4.7-flash glm-4.6 glm-4.5; do
  echo "=== Streaming: $model ==="
  timeout 10 curl -s -N -X POST http://localhost:8001/api/ai/chat \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"안녕하세요\"}],\"model\":\"$model\",\"stream\":true}" \
    | head -5
  echo -e "\n"
done
```

### Phase 6: OCR 파이프라인 최적화

Phase 3, 4 결과를 기반으로 `_VISION_MODELS` 우선순위를 최종 결정.

현재 `ocr_service.py`의 `_VISION_MODELS`:
```python
_VISION_MODELS = [
    "glm-4.5v",       # $0.6/M — 검증 완료
    "gpt-4o",
    "gpt-4o-mini",
    "gemini-2.0-flash",
    "claude-sonnet-4-5",
]
```

**예상 최적 우선순위** (비용/품질 균형, Phase 3-4 결과로 확정):
```python
_VISION_MODELS = [
    "glm-4.6v-flash",   # 무료, 테스트 필요
    "glm-4.6v-flashx",  # $0.04/M, 테스트 필요
    "glm-4.6v",         # $0.3/M, 이전 빈응답 재현 확인
    "glm-4.5v",         # $0.6/M, 검증 완료
    "gpt-4o-mini",
    "gemini-2.0-flash",
    "gpt-4o",
    "claude-sonnet-4-5",
]
```

추가로 GLM-OCR 통합 여부 결정:
- **통합하는 경우**: `ocr_service.py`에 `GlmOcrEngine` 클래스 추가, Settings UI에 3번째 OCR 엔진 옵션
- **통합하지 않는 경우**: Vision 모델 폴백 체인만 최적화

### Phase 7: 결과 정리 및 반영

1. 테스트 결과를 기반으로 `_AVAILABLE_MODELS` 최종 확정
2. `_VISION_MODELS` 우선순위 최종 확정
3. Settings UI에서 모델 선택 시 표시될 모델명/설명 업데이트
4. 메모리에 테스트 결과 기록 (`memory/glm-model-benchmark.md`)
5. GLM-OCR 통합 여부 결정 → 통합 시 별도 태스크 생성

---

## 주의 사항

- `ZHIPUAI_API_KEY`가 `.env`에 설정되어 있어야 함
- Coding Plan 동시성 제한 있음 — `glm-5`와 `glm-4.7-flash`는 동시 1건만
- `glm-4.6v`는 이전 세션에서 빈 응답을 반환한 적 있음 — 재현 여부 확인 필요
- GLM-OCR은 Chat API가 아닌 Layout Parsing API 사용 — 별도 HTTP 호출 필요
- PaddleOCR-VL은 numpy<2.4 핀이 필요 (Dockerfile에 반영 완료, 리빌드 필요)
- `_AVAILABLE_MODELS`에 미등록된 모델은 AIRouter가 인식하지 못함 → 먼저 등록 필요

## 비용 최적화 전략

현재 OCR 비용 구조 (1회 OCR 요청 기준, ~1000 토큰 가정):
| 방식 | 예상 비용 | 비고 |
|------|----------|------|
| PaddleOCR-VL (로컬) | $0 | CPU 전용, 느림 |
| GLM-OCR (전용) | ~$0.00003 | 최고 정확도, 별도 API |
| GLM-4.6V-Flash | $0 | 무료 Vision, 범용 |
| GLM-4.6V-FlashX | ~$0.0004 | 저렴 Vision |
| GLM-4.5V | ~$0.002 | 비쌈 |
| GPT-4o-mini | ~$0.001 | 외부 API |

**추천 폴백 체인**: PaddleOCR-VL → GLM-OCR → GLM-4.6V-Flash → GLM-4.5V → GPT-4o-mini
