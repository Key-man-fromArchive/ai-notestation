<p align="center">
  <h1 align="center">LabNote AI</h1>
  <p align="center">
    <strong>당신의 시놀로지 NAS에 잠든 노트를 깨우는 AI 연구 플랫폼</strong>
  </p>
  <p align="center">
    <a href="#quickstart">빠른 시작</a> · <a href="#features">핵심 기능</a> · <a href="#architecture">아키텍처</a> · <a href="#api">API 문서</a>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/PostgreSQL_16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/pgvector-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="pgvector" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/TailwindCSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
</p>

---

## 왜 LabNote AI인가?

Synology NoteStation은 훌륭한 노트 도구입니다. 하지만 수백, 수천 개의 노트가 쌓이면 **"분명히 적어뒀는데..."** 하고 찾지 못한 경험, 한 번쯤 있지 않으셨나요?

LabNote AI는 NoteStation의 노트를 그대로 가져와서 **AI 검색**, **인사이트 추출**, **연구노트 작성**, **지식 그래프 시각화**까지 제공합니다. NAS 안에 잠들어 있던 메모들이 비로소 **살아 움직이는 지식**이 됩니다.

> `docker compose up -d` 한 줄이면 시작됩니다.

---

<h2 id="features">핵심 기능</h2>

### 1. 검색 — 키워드 검색과 AI 의미 검색

| 모드 | 엔진 | 설명 |
|------|------|------|
| **전문검색 (FTS)** | PostgreSQL tsvector + BM25 | 정확한 키워드 매칭. 한국어 형태소 분석 지원 |
| **퍼지검색 (Trigram)** | pg_trgm | 오타에 강한 유사 문자열 매칭 |
| **의미검색 (Semantic)** | pgvector + OpenAI Embeddings | "비슷한 맥락"의 노트까지 찾아냄 (AI 라이브러리언) |

메인 검색은 FTS + Trigram을 RRF로 병합하여 빠르고 정확한 키워드 검색을 제공합니다. 의미 검색은 AI 라이브러리언 페이지에서 자연어 질문 기반으로 동작합니다.

### 2. AI 워크벤치 — 4대 AI 프로바이더, 하나의 인터페이스

```
OpenAI · Anthropic · Google · ZhipuAI
```

API 키 하나만 등록하면 즉시 사용 가능. 여러 프로바이더를 동시에 등록하고 **모델을 자유롭게 전환**하세요. SSE 스트리밍으로 응답이 실시간으로 흘러옵니다.

**5가지 AI 기능**:

| 기능 | 설명 |
|------|------|
| **Insight** | 노트에서 핵심 인사이트를 자동 추출 |
| **Search QA** | 검색 결과 기반 질의응답 |
| **Writing** | 연구노트 초안 작성 보조 |
| **Spellcheck** | 맞춤법·문법 교정 |
| **Template** | 목적에 맞는 노트 템플릿 생성 |

### 3. AI 라이브러리언 — 자연어로 묻고, 노트로 답하다

검색창에 키워드 대신 **질문을 던지세요.**

> *"지난달 미팅에서 논의한 마이그레이션 일정이 뭐였지?"*

AI 라이브러리언이 시맨틱 검색으로 관련 노트를 찾고, 관련도 점수와 함께 결과를 보여줍니다. 색인 상태를 실시간으로 모니터링하며, 인덱싱이 필요하면 UI에서 바로 트리거할 수 있습니다.

### 4. 지식 그래프 — 노트 사이의 숨겨진 연결

**Force-directed 그래프**가 노트 간 유사도를 시각적으로 보여줍니다. pgvector 기반 코사인 유사도로 계산된 연결선이 당신의 지식 네트워크를 한눈에 드러냅니다.

- **글로벌 그래프**: 전체 노트의 관계 지도 (Obsidian 스타일)
- **디스커버리**: 노트북별 AI 클러스터링 — 유사한 노트끼리 자동 분류
- 유사도 임계값(30%\~95%)과 노트 수(50\~500)를 직접 조절

### 5. Synology NAS 완벽 연동

- **양방향 동기화**: NoteStation의 노트/노트북 구조를 그대로 가져옴
- **이미지 동기화**: FileStation에서 첨부 이미지를 추출해 표시
- **NSX 가져오기**: NoteStation 내보내기 파일(.nsx) 직접 임포트
- 동기화 상태 추적, 변경사항(추가/수정/삭제) 상세 로깅

### 6. 노트 공유 — 링크 하나로 세상에 공개

토큰 기반 공개 링크를 생성하세요. 만료 기간(1일 / 7일 / 30일 / 무제한)을 설정하고, 언제든 철회할 수 있습니다. 별도 로그인 없이 누구나 열람 가능한 퍼블릭 뷰를 제공합니다.

### 7. OAuth 연동 — 자신의 구독을 그대로 사용

| 프로바이더 | 방식 | 효과 |
|-----------|------|------|
| **Google** | OAuth 2.0 | 본인의 Google API 할당량으로 Gemini 사용 |
| **OpenAI** | PKCE Flow | ChatGPT Plus/Pro 구독 계정으로 API 호출 |

별도 API 키 없이, **이미 결제한 구독**을 그대로 활용합니다. 토큰은 Fernet으로 암호화되어 안전하게 저장됩니다.

### 8. 관리 대시보드 & 운영 콘솔

**Admin 대시보드** — 전체 시스템 상태를 한눈에:

- 사용자 현황, 노트 수, 임베딩 수, 스토리지 사용량
- 데이터베이스 테이블별 통계 (행 수, 크기, 인덱스)
- 사용자 관리 (역할: Owner / Admin / Member / Viewer)
- NAS 연결 상태 및 LLM 프로바이더 모니터링

**Operations 콘솔** — 실시간 운영 관리:

- NAS 동기화, 임베딩 인덱싱 원클릭 트리거
- 검색 엔진 가용성 모니터링 (FTS / Semantic / Hybrid)
- 10개 카테고리의 활동 로그 (sync, embedding, auth, note 등)

### 9. 팀 협업

- **멀티 역할 시스템**: Owner → Admin → Member → Viewer
- 이메일 초대 기반 멤버 관리
- 역할별 권한 분리 (설정 변경은 Admin 이상)
- 가입 승인 및 계정 활성화/비활성화

---

## 기술 스택

| 영역 | 기술 | 선택 이유 |
|------|------|-----------|
| **Backend** | FastAPI + SQLAlchemy 2.0 (async) | 비동기 고성능, 자동 OpenAPI 문서 |
| **Frontend** | React 19 + Vite + TailwindCSS + shadcn/ui | 최신 React, 빠른 빌드, 일관된 디자인 |
| **Database** | PostgreSQL 16 + pgvector | 벡터 검색 네이티브 지원, 별도 벡터 DB 불필요 |
| **AI** | OpenAI, Anthropic, Google, ZhipuAI | 멀티 프로바이더 — 벤더 종속 없음 |
| **인증** | JWT + OAuth 2.0 (Google, OpenAI PKCE) | 토큰 기반 인증 + 외부 AI 구독 활용 |
| **검색** | tsvector + pgvector + RRF | 키워드와 의미 검색을 하나의 DB에서 해결 |
| **인프라** | Docker Compose (3 containers) | 단일 명령어로 전체 스택 배포 |
| **시각화** | react-force-graph-2d | 인터랙티브 지식 그래프 |

---

<h2 id="quickstart">빠른 시작</h2>

### 사전 요구사항

- Docker & Docker Compose
- Synology NAS (NoteStation 설치됨) — 선택사항
- AI API 키 1개 이상 (OpenAI / Anthropic / Google / ZhipuAI) — 선택사항

### 설치 및 실행 (권장)

인터랙티브 설치 스크립트가 환경 설정부터 컨테이너 실행, DB 마이그레이션까지 자동으로 처리합니다.

```bash
git clone https://github.com/your-org/labnote-ai.git
cd labnote-ai
bash install.sh
```

스크립트가 안내하는 대로 NAS 주소와 AI API 키를 입력하세요 (Enter로 건너뛸 수 있습니다). 완료 후 http://localhost:3000 에서 회원가입하면 바로 사용할 수 있습니다.

> **비대화형 모드**: `bash install.sh -y` — 프롬프트 없이 기본값으로 설치합니다. NAS와 AI 키는 나중에 `.env` 파일을 편집하거나 웹 UI 설정에서 추가할 수 있습니다.

<details>
<summary><strong>수동 설치 (직접 설정)</strong></summary>

```bash
# 1. 레포지토리 클론
git clone https://github.com/your-org/labnote-ai.git
cd labnote-ai

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 JWT_SECRET, NAS 정보, API 키를 입력하세요

# 3. 실행
docker compose up -d --build

# 4. DB 마이그레이션
docker compose exec backend alembic upgrade head

# 5. 접속
# Frontend: http://localhost:3000
# Backend API: http://localhost:8001
# API 문서: http://localhost:8001/docs
```

</details>

### 로컬 개발

```bash
# Backend
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

---

<h2 id="architecture">아키텍처</h2>

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React 19)                  │
│  ┌──────────┬──────────┬───────────┬──────────┬──────────┐  │
│  │Dashboard │  Notes   │  Search   │    AI    │  Graph   │  │
│  │          │ Notebooks│ Librarian │Workbench │Discovery │  │
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
│  │  Search Engine ─── FTS (tsvector) + Semantic (pgvec) │   │
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

---

## 프로젝트 구조

```
labnote-ai/
├── docker-compose.yml          # 3-container 오케스트레이션
├── .env.example                # 환경 변수 템플릿
│
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI 엔트리포인트
│   │   ├── models.py           # SQLAlchemy ORM 모델
│   │   ├── api/                # REST API 라우터 (18개 엔드포인트 모듈)
│   │   ├── ai_router/          # 멀티 프로바이더 AI 통합
│   │   │   ├── router.py       # 프로바이더 자동 감지 & 라우팅
│   │   │   ├── providers/      # OpenAI, Anthropic, Google, ZhipuAI
│   │   │   └── prompts/        # 태스크별 프롬프트 템플릿
│   │   ├── search/             # 하이브리드 검색 엔진
│   │   │   ├── engine.py       # FTS + Semantic + RRF 병합
│   │   │   ├── embeddings.py   # 텍스트 → 벡터 변환
│   │   │   └── indexer.py      # 배치 인덱싱 + 진행률 추적
│   │   ├── synology_gateway/   # Synology NAS API 래퍼
│   │   └── services/           # 비즈니스 로직 (sync, auth, OAuth)
│   ├── alembic/                # DB 마이그레이션
│   └── tests/                  # pytest 테스트
│
├── frontend/
│   ├── src/
│   │   ├── pages/              # 페이지 (코드 스플리팅 적용)
│   │   ├── components/         # shadcn/ui + 커스텀 컴포넌트
│   │   ├── hooks/              # TanStack Query, SSE, OAuth 훅
│   │   └── lib/                # API 클라이언트, 유틸리티
│   └── e2e/                    # Playwright E2E 테스트
│
└── docs/
    └── plans/                  # 설계 문서
```

---

## 환경 변수

| 변수 | 설명 | 필수 |
|------|------|:----:|
| `DATABASE_URL` | PostgreSQL 연결 URL | 자동 |
| `JWT_SECRET` | JWT 서명 키 | O |
| `SYNOLOGY_URL` | Synology NAS 주소 | - |
| `SYNOLOGY_USER` | NAS 사용자명 | - |
| `SYNOLOGY_PASSWORD` | NAS 비밀번호 | - |
| `OPENAI_API_KEY` | OpenAI API 키 | - |
| `ANTHROPIC_API_KEY` | Anthropic API 키 | - |
| `GOOGLE_API_KEY` | Google Gemini API 키 | - |
| `ZHIPUAI_API_KEY` | ZhipuAI API 키 | - |
| `OAUTH_ENCRYPTION_KEY` | OAuth 토큰 암호화 키 (Fernet) | - |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth 클라이언트 ID | - |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth 클라이언트 시크릿 | - |

> NAS와 AI 키는 선택사항입니다. NAS 없이도 NSX 파일 임포트로 노트를 사용할 수 있고, AI 키 없이도 검색과 노트 관리 기능을 이용할 수 있습니다.

---

## 테스트

```bash
# Backend 전체 테스트
cd backend && pytest --tb=short

# 커버리지 리포트
cd backend && pytest --cov=app --cov-report=term-missing

# Frontend 단위 테스트
cd frontend && npm test

# Playwright E2E 테스트
cd frontend && npm run test:e2e

# 린트
cd backend && ruff check . && ruff format --check .
cd frontend && npm run lint
```

---

<h2 id="api">API 문서</h2>

Backend 실행 후 자동 생성된 API 문서를 확인하세요:

- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

---

## 로드맵

- [ ] Anthropic OAuth 연동 (Claude Pro/Max 구독 활용)
- [ ] 노트 버전 관리 및 히스토리
- [ ] 모바일 최적화 PWA
- [ ] 다국어 UI (영어/일본어)
- [ ] 플러그인 시스템

---

## 라이선스

MIT License — 자유롭게 사용하고 수정하세요.
