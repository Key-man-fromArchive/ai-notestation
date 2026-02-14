<p align="right">
  <a href="README.en.md"><img src="https://img.shields.io/badge/English-blue?style=flat-square" alt="English" /></a>
</p>

# LabNote AI

**NAS에 쌓인 수천 개의 연구노트, 다시 찾을 수 있게.**

<p align="left">
  <img src="https://img.shields.io/badge/version-1.3.1-blue?style=flat-square" alt="v1.3.1" />
  <img src="https://img.shields.io/badge/license-AGPL--3.0-green?style=flat-square" alt="AGPL-3.0" />
  <img src="https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/self--hosted-black?style=flat-square" alt="Self-hosted" />
</p>

<p align="center">
  <img src="docs/screenshots/graph.png" alt="Knowledge Graph — 2,300개 노트의 관계를 시각화" width="720" />
</p>

Synology NoteStation에 노트가 수천 개 넘어가면 검색이 안 됩니다. 키워드 하나 틀리면 못 찾고, 비슷한 주제로 묶어 보는 건 불가능합니다. 분명 어딘가 적어뒀는데 어디에 있는지 모릅니다.

LabNote AI는 NAS의 기존 노트를 그대로 두고, 위에 AI 검색과 지식 발견 기능을 얹습니다. 클라우드 없이, 내 서버에서.

```bash
git clone https://github.com/Key-man-fromArchive/ai-notestation.git && cd ai-notestation
bash install.sh        # 대화형 설치. NAS 주소와 AI 키 입력 (Enter로 스킵 가능)
# → http://localhost:3000
```

---

## 이런 걸 합니다

<table>
<tr>
<td width="50%">

<img src="docs/screenshots/search.png" alt="하이브리드 검색" width="100%" />

**검색이 진짜로 됩니다**
FTS + 퍼지 + 시맨틱 검색을 하나의 PostgreSQL에서 돌립니다. 키워드가 틀려도 찾고, 의미가 비슷하면 찾습니다. 왜 이 결과가 나왔는지도 보여줍니다.

</td>
<td width="50%">

<img src="docs/screenshots/librarian.png" alt="AI 사서" width="100%" />

**자연어로 질문합니다**
"온도에 따른 효소 활성 변화" — 키워드가 아니라 질문으로 검색합니다. AI 사서가 2,000개 노트에서 관련도 순으로 찾아줍니다.

</td>
</tr>
<tr>
<td width="50%">

<img src="docs/screenshots/note-detail.png" alt="노트 상세 — 이미지 첨부, 리치 에디터" width="100%" />

**이미지도, 표도, 수식도**
TipTap 에디터로 연구 노트를 작성합니다. 이미지 첨부, 표, 코드 블록을 지원하고, 첨부 이미지는 OCR/Vision으로 자동 분석됩니다.

</td>
<td width="50%">

<img src="docs/screenshots/note-ai-panel.png" alt="AI 자동 태깅 + 구조화된 노트" width="100%" />

**AI가 노트를 분석합니다**
인사이트 추출, 자동 태깅, 관련 노트 추천, 잊혀진 노트 재발견. 맞춤법 교정과 연구노트 초안 작성도 도와줍니다.

</td>
</tr>
</table>

---

## 핵심 기능

**하이브리드 검색** — tsvector(BM25) + pg_trgm(퍼지) + pgvector(시맨틱)를 Reciprocal Rank Fusion으로 병합합니다. 별도 벡터 DB 없이 PostgreSQL 하나로 끝납니다. 결과가 충분하면 임베딩 호출을 자동으로 건너뜁니다(Adaptive Search).

**AI 프로바이더 4종** — OpenAI, Anthropic, Google, ZhipuAI. 환경 변수에 API 키를 넣으면 자동 감지합니다. 원하는 모델로 자유 전환. SSE 스트리밍. ChatGPT/Gemini 구독이 있으면 OAuth로 연동해서 별도 키 없이 쓸 수도 있습니다.

**AI 품질 보증** — 생성 결과를 체크리스트로 자가 검증하고, 미달이면 재생성합니다. 검색 QA는 정확성과 유용성을 분리 평가합니다. 스트리밍 중에도 반복/이탈을 실시간 감지합니다.

**콘텐츠 인텔리전스** — 자동 태깅, 관련 노트 발견, 잊혀진 노트 재발견. 노트 간 관계를 AI가 자동으로 파악합니다.

**멀티모달 이미지 분석** — PDF 텍스트 추출(PyMuPDF). 3엔진 하이브리드 OCR(GLM-OCR → PaddleOCR-VL → AI Vision)이 자동 폴백으로 동작합니다. 배치 처리 시 OCR과 Vision 설명 생성이 독립 파이프라인으로 병렬 실행됩니다. 추출된 텍스트와 이미지 설명이 검색 인덱스에 자동 반영되어 이미지 내용으로도 검색됩니다.

**Synology 연동** — NoteStation과 양방향 동기화. 이미지 첨부파일 표시. NSX 파일 직접 임포트. NAS 없이도 로컬 노트 생성이 가능합니다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | FastAPI + SQLAlchemy 2.0 (async) + Alembic |
| Frontend | React 19 + Vite + TailwindCSS + shadcn/ui |
| Database | PostgreSQL 16 + pgvector |
| Search | tsvector + pg_trgm + pgvector + RRF |
| AI | OpenAI, Anthropic, Google, ZhipuAI (자동 감지) |
| OCR/Vision | GLM-OCR, PaddleOCR-VL, AI Vision (자동 폴백) |
| Auth | JWT + OAuth 2.0 (Google, OpenAI PKCE) |
| Deploy | Docker Compose (3 containers) |

---

## 빠른 시작

Docker만 있으면 됩니다. NAS와 AI 키는 선택사항입니다.

```bash
git clone https://github.com/Key-man-fromArchive/ai-notestation.git
cd ai-notestation
bash install.sh
```

설치 스크립트가 환경 설정, 컨테이너 실행, DB 마이그레이션을 자동으로 처리합니다. 완료 후 http://localhost:3000 에서 회원가입하세요.

> 비대화형: `bash install.sh -y` — 기본값으로 바로 설치됩니다. 나중에 웹 UI 설정에서 키를 추가할 수 있습니다.

<details>
<summary>수동 설치</summary>

```bash
cp .env.example .env

# 보안 키 생성
JWT_SECRET=$(openssl rand -base64 32)
OAUTH_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || openssl rand -base64 32)
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
sed -i "s|^OAUTH_ENCRYPTION_KEY=.*|OAUTH_ENCRYPTION_KEY=${OAUTH_KEY}|" .env

# NAS 주소, AI 키는 .env에서 직접 편집

docker compose up -d --build
docker compose exec backend alembic upgrade head
# Frontend → http://localhost:3000
# API Docs → http://localhost:8001/docs
```

</details>

<details>
<summary>로컬 개발</summary>

```bash
# Backend
cd backend && pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

</details>

---

<details>
<summary><strong>아키텍처</strong></summary>

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React 19)                  │
│  ┌──────────┬──────────┬───────────┬──────────┬──────────┐  │
│  │Dashboard │  Notes   │  Search   │    AI    │  Graph   │  │
│  │          │ Notebooks│ Librarian │  분석    │Discovery │  │
│  └──────────┴──────────┴───────────┴──────────┴──────────┘  │
│         TanStack Query  ·  SSE Streaming  ·  shadcn/ui      │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API + SSE
┌─────────────────────────┴───────────────────────────────────┐
│                      Backend (FastAPI)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  API Layer: auth · notes · search · ai · sync · ...  │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  AI Router ─── OpenAI │ Anthropic │ Google │ ZhipuAI │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Search Engine ─── FTS + Trigram + Semantic (RRF)    │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Quality Gate ─── Checklist │ QA Eval │ Stream Mon   │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Image Analysis ─── 3-Engine OCR │ Vision │ Batch    │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Synology Gateway ─── NoteStation + FileStation API  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ PostgreSQL   │ │ Synology NAS │ │  AI Provider │
│ 16 + pgvec  │ │ NoteStation  │ │  APIs (4종)  │
└──────────────┘ └──────────────┘ └──────────────┘
```

</details>

<details>
<summary><strong>환경 변수</strong></summary>

| 변수 | 설명 | 필수 |
|------|------|:----:|
| `DATABASE_URL` | PostgreSQL 연결 URL | 자동 |
| `JWT_SECRET` | JWT 서명 키 | O |
| `SYNOLOGY_URL` / `_USER` / `_PASSWORD` | NAS 접속 정보 | - |
| `OPENAI_API_KEY` | OpenAI API 키 | - |
| `ANTHROPIC_API_KEY` | Anthropic API 키 | - |
| `GOOGLE_API_KEY` | Google Gemini API 키 | - |
| `ZHIPUAI_API_KEY` | ZhipuAI API 키 | - |
| `OAUTH_ENCRYPTION_KEY` | OAuth 토큰 암호화 키 (Fernet) | - |
| `PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK` | PaddleOCR 외부 모델 소스 체크 비활성화 (Docker 기본값: True) | - |

NAS 없이도 NSX 임포트나 로컬 노트 생성으로 사용할 수 있습니다. AI 키 없이도 검색과 노트 관리는 동작합니다.

</details>

<details>
<summary><strong>프로젝트 구조</strong></summary>

```
labnote-ai/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI 엔트리포인트
│       ├── api/                 # REST API 라우터
│       ├── ai_router/           # 멀티 프로바이더 AI (프로바이더, 프롬프트, 품질 게이트)
│       ├── search/              # 하이브리드 검색 (FTS, 시맨틱, RRF, JUDGE)
│       ├── services/            # 비즈니스 로직 (OCR, Vision, 태깅, 관련노트, PDF)
│       └── synology_gateway/    # NAS API 래퍼
├── frontend/src/
│   ├── pages/                   # 페이지 (코드 스플리팅)
│   ├── components/              # shadcn/ui + 커스텀
│   └── hooks/                   # TanStack Query, SSE
└── docker-compose.yml           # 3-container 배포
```

</details>

<details>
<summary><strong>테스트 & 린트</strong></summary>

```bash
cd backend && pytest --tb=short                              # 백엔드 테스트
cd backend && pytest --cov=app --cov-report=term-missing     # 커버리지
cd frontend && npm test                                       # 프론트엔드
cd frontend && npm run test:e2e                               # E2E (Playwright)
cd backend && ruff check . && ruff format --check .           # 린트
```

</details>

---

## 로드맵

- [x] Phase 1 — 검색 고도화 (Why matched, Adaptive Search, Multi-turn Refinement)
- [x] Phase 2 — AI 품질 게이트 (Checklist, QA Evaluation, Stream Monitor)
- [x] Phase 3 — 콘텐츠 인텔리전스 (Auto-Tagging, Related Notes, Rediscovery)
- [x] Phase 4 — 멀티모달 (PDF 추출, 3엔진 하이브리드 OCR, 듀얼 파이프라인 Vision)
- [ ] Phase 5 — 평가 인프라 (A/B 프레임워크, 메트릭 대시보드, 피드백 루프)

상세: [ROADMAP.md](ROADMAP.md) · 변경 이력: [CHANGELOG.md](CHANGELOG.md)

---

## 라이선스

[AGPL-3.0](LICENSE) — 네트워크 서비스 제공 시에도 소스 공개 의무가 적용됩니다.
