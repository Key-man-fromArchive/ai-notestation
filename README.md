<p align="right">
  <a href="README.en.md"><img src="https://img.shields.io/badge/English-blue?style=flat-square" alt="English" /></a>
</p>

# LabNote AI

**Synology NAS 노트에 AI 검색, 분석, 지식 발견 기능을 통합하는 셀프 호스팅 연구 플랫폼**

<p align="left">
  <img src="https://img.shields.io/badge/version-1.2.0-blue?style=flat-square" alt="v1.2.0" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/PostgreSQL_16-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/pgvector-336791?style=flat-square&logo=postgresql&logoColor=white" alt="pgvector" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
</p>

---

## 개요

LabNote AI는 Synology NoteStation의 노트를 하이브리드 검색 엔진, 다중 AI 프로바이더, 지식 그래프 시각화와 결합하는 웹 애플리케이션이다. 사용자의 NAS에 저장된 기존 노트를 그대로 활용하며, 별도 클라우드 서비스에 의존하지 않는 셀프 호스팅 아키텍처를 채택한다.

> `docker compose up -d` 한 줄로 전체 스택 배포 가능

변경 이력은 [CHANGELOG.md](CHANGELOG.md)를 참고한다.

---

## 주요 기능

### 1. 하이브리드 검색 엔진

단일 PostgreSQL 인스턴스에서 세 가지 검색 방식을 결합하여, 별도 벡터 데이터베이스 없이 키워드 검색과 의미 검색을 모두 지원한다.

| 방식 | 엔진 | 설명 |
|------|------|------|
| 전문검색 (FTS) | tsvector + BM25 | 정확한 키워드 매칭. 한국어 형태소 분석 지원 |
| 퍼지검색 | pg_trgm | 오타에 강한 유사 문자열 매칭 |
| 의미검색 | pgvector + Embeddings | 의미적으로 유사한 노트 탐색 |

FTS + Trigram 결과를 **Reciprocal Rank Fusion (RRF)** 으로 병합하여 주 검색을 수행하고, 의미검색은 AI 라이브러리언 페이지에서 자연어 질문 기반으로 동작한다.

**적응형 검색 (Adaptive Search)**: FTS 결과의 커버리지를 JUDGE 모듈이 평가하여, 충분히 높은 경우 불필요한 임베딩 호출을 자동으로 생략한다. 이를 통해 검색 속도와 비용을 최적화한다.

**검색 결과 설명 (Why this matched)**: 각 결과에 매칭 엔진, 키워드 하이라이트, 유사도 점수를 표시하여 결과의 근거를 투명하게 제공한다.

**멀티턴 검색 리파인**: 초기 결과가 부족할 때 AI가 쿼리를 자동으로 확장 또는 축소하여 추가 검색을 수행한다. 사용자 피드백 기반 반복 개선을 지원한다.

**12개 검색 파라미터 튜닝**: 가중치, 임계값, RRF k 등을 UI에서 직접 조절할 수 있으며, 파라미터별 역할과 권장값 도움말을 제공한다.

### 2. 다중 AI 프로바이더 통합

```
OpenAI · Anthropic · Google · ZhipuAI
```

환경 변수에 등록된 API 키를 자동 감지하여 사용 가능한 프로바이더를 등록한다. 여러 프로바이더를 동시에 사용하며 모델을 자유롭게 전환할 수 있다. SSE 스트리밍으로 응답을 실시간 전송한다.

**5가지 AI 태스크**:

| 태스크 | 설명 |
|--------|------|
| 인사이트 | 노트에서 핵심 인사이트 자동 추출 |
| 검색 QA | 검색 결과 기반 질의응답 |
| 보완 제안 | 연구노트 초안 작성 보조 |
| 교정 | 맞춤법 및 문법 교정 |
| 템플릿 | 목적별 노트 템플릿 생성 |

멀티모달 이미지 분석 및 자동 제목/태그 생성도 지원한다.

### 3. AI 품질 보증 시스템

AI 응답의 신뢰성을 세 단계로 검증한다.

- **체크리스트 기반 품질 게이트**: 태스크별로 검증 가능한 체크리스트를 분해하고, 생성 후 자가 평가를 수행한다. 미달 항목이 있으면 자동으로 재생성한다.
- **Search QA 이중 평가**: 검색 QA 응답의 정확성(Correctness)과 유용성(Utility)을 분리 평가하여 신뢰도 뱃지(높음/보통/낮음)로 표시한다.
- **스트리밍 중간 품질 체크**: SSE 스트리밍 도중 언어 불일치, 반복 패턴, 형식 이탈을 실시간 감지하여 조기 중단 및 재생성을 수행한다.

### 4. 콘텐츠 인텔리전스

노트 간의 관계를 자동으로 발견하고, 분류를 지원한다.

- **AI 자동 태깅**: 노트 생성 또는 동기화 시 AI가 태그를 자동 생성한다. 개별 및 배치 태깅을 지원하며, 수동 편집이 가능하다. 태그 기반 필터링을 Notes/Search 페이지에서 제공한다.
- **관련 노트 발견**: pgvector 코사인 유사도 기반으로 현재 노트와 관련된 노트를 추천한다. 노트 상세 페이지 사이드 패널과 지식 그래프에 반영된다.
- **잊혀진 노트 재발견**: 오래되었지만 현재 작업과 관련 있는 노트를 대시보드에서 자동으로 표면화한다. 일일 추천과 컨텍스트 기반 추천을 병행한다.

### 5. 멀티모달 처리

텍스트 외의 콘텐츠에서 검색 가능한 텍스트를 추출한다.

- **PDF 텍스트 추출**: pymupdf를 사용하여 PDF 첨부 파일에서 텍스트를 추출하고, 임베딩 파이프라인에 포함시킨다.
- **OCR 파이프라인**: AI Vision 모델 또는 PaddleOCR-VL 로컬 엔진으로 이미지에서 텍스트를 추출한다. 추출 결과는 검색 인덱싱에 자동 반영된다. 우클릭 컨텍스트 메뉴로 개별 이미지 OCR을 실행하고, 마크다운 형식으로 결과를 확인할 수 있다.

### 6. AI 라이브러리언

검색창에 키워드 대신 자연어 질문을 입력하면, 시맨틱 검색으로 관련 노트를 찾아 관련도 점수와 함께 결과를 반환한다. 색인 상태를 실시간으로 모니터링하며, UI에서 인덱싱을 직접 트리거할 수 있다.

### 7. 지식 그래프

Force-directed 그래프가 노트 간 유사도를 시각적으로 표현한다.

- **글로벌 그래프**: 전체 노트의 관계 지도 (Obsidian 스타일)
- **디스커버리**: 노트북별 AI 클러스터링으로 유사한 노트를 자동 분류하고 클러스터 인사이트를 제공
- 유사도 임계값(30%–95%)과 노트 수(50–500) 조절 가능

### 8. Synology NAS 연동

- **양방향 동기화**: NoteStation의 노트/노트북 구조를 Pull & Push로 동기화
- **이미지 동기화**: FileStation에서 첨부 이미지를 추출하여 표시
- **NSX 가져오기**: NoteStation 내보내기 파일(.nsx) 직접 임포트
- 동기화 상태 추적 및 변경사항(추가/수정/삭제) 로깅

### 9. 노트 편집기

Tiptap 기반 리치텍스트 편집기를 제공한다.

- 노트를 열면 즉시 편집 가능 (항상 편집 모드)
- 자동 저장: 입력 중단 3초 후, 연속 작성 30초마다, 페이지 이탈 시 자동 저장
- 실시간 단어/글자 수 표시
- 로컬 생성 노트의 NAS 동기화 지원

### 10. 노트 공유

토큰 기반 공개 링크를 생성한다. 만료 기간(1일 / 7일 / 30일 / 무제한)을 설정하고, 언제든 철회할 수 있다. 별도 인증 없이 열람 가능한 퍼블릭 뷰를 제공한다.

### 11. OAuth 연동

| 프로바이더 | 방식 | 효과 |
|-----------|------|------|
| Google | OAuth 2.0 | 본인의 Google API 할당량으로 Gemini 사용 |
| OpenAI | PKCE Flow | ChatGPT Plus/Pro 구독 계정으로 API 호출 |

별도 API 키 없이 기존 구독을 활용할 수 있다. 토큰은 Fernet으로 암호화 저장된다.

### 12. 관리 및 협업

**Admin 대시보드**: 사용자/노트/임베딩/스토리지 통계, DB 테이블별 상세 정보, NAS 및 LLM 프로바이더 모니터링

**Operations 콘솔**: NAS 동기화, 임베딩 인덱싱 원클릭 트리거, 검색 엔진 가용성 모니터링, 10개 카테고리 활동 로그

**팀 협업**: Owner → Admin → Member → Viewer 4단계 역할 시스템, 이메일 초대 기반 멤버 관리, 가입 승인 및 계정 관리

### 13. 다국어 지원

한국어/영어 UI 전환을 지원한다. 브라우저 언어를 자동 감지하며, 설정 페이지에서 수동 변경이 가능하다. react-i18next 기반으로 프론트엔드 및 백엔드 메시지를 국제화한다.

---

## 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| Backend | FastAPI + SQLAlchemy 2.0 (async) | 비동기 고성능, 자동 OpenAPI 문서 |
| Frontend | React 19 + Vite + TailwindCSS + shadcn/ui | 코드 스플리팅, 가상화 리스트 |
| Database | PostgreSQL 16 + pgvector | 벡터 검색 네이티브 지원 |
| AI | OpenAI, Anthropic, Google, ZhipuAI | 멀티 프로바이더, 벤더 비종속 |
| Auth | JWT + OAuth 2.0 (Google, OpenAI PKCE) | 토큰 기반 인증 |
| Search | tsvector + pg_trgm + pgvector + RRF | 단일 DB 하이브리드 검색 |
| Infra | Docker Compose (3 containers) | 단일 명령어 배포 |
| Visualization | react-force-graph-2d | 인터랙티브 지식 그래프 |
| i18n | react-i18next | 다국어 지원 |

---

## 아키텍처

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

## 빠른 시작

### 사전 요구사항

- Docker & Docker Compose
- Synology NAS (NoteStation 설치됨) — 선택사항
- AI API 키 1개 이상 (OpenAI / Anthropic / Google / ZhipuAI) — 선택사항

### 설치 (권장)

인터랙티브 설치 스크립트가 환경 설정, 컨테이너 실행, DB 마이그레이션을 자동으로 처리한다.

```bash
git clone https://github.com/your-org/labnote-ai.git
cd labnote-ai
bash install.sh
```

안내에 따라 NAS 주소와 AI API 키를 입력한다 (Enter로 건너뛰기 가능). 완료 후 http://localhost:3000 에서 회원가입하여 사용한다.

> **비대화형 모드**: `bash install.sh -y` — 프롬프트 없이 기본값으로 설치. NAS와 AI 키는 나중에 `.env` 파일 또는 웹 UI 설정에서 추가할 수 있다.

<details>
<summary><strong>수동 설치</strong></summary>

```bash
# 1. 레포지토리 클론
git clone https://github.com/your-org/labnote-ai.git
cd labnote-ai

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 JWT_SECRET, NAS 정보, API 키를 입력

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
│   │   ├── api/                # REST API 라우터
│   │   ├── ai_router/          # 멀티 프로바이더 AI 통합
│   │   │   ├── router.py       # 프로바이더 자동 감지 및 라우팅
│   │   │   ├── providers/      # OpenAI, Anthropic, Google, ZhipuAI
│   │   │   ├── prompts/        # 태스크별 프롬프트 템플릿
│   │   │   ├── quality_gate.py # 체크리스트 기반 품질 게이트
│   │   │   └── stream_monitor.py # 스트리밍 품질 모니터
│   │   ├── search/             # 하이브리드 검색 엔진
│   │   │   ├── engine.py       # FTS + Semantic + RRF 병합
│   │   │   ├── judge.py        # 적응형 검색 JUDGE
│   │   │   ├── refinement.py   # 멀티턴 리파인
│   │   │   ├── embeddings.py   # 텍스트 → 벡터 변환
│   │   │   └── indexer.py      # 배치 인덱싱
│   │   ├── services/           # 비즈니스 로직
│   │   │   ├── auto_tagger.py  # AI 자동 태깅
│   │   │   ├── related_notes.py # 관련 노트 발견
│   │   │   ├── rediscovery.py  # 노트 재발견
│   │   │   ├── pdf_extractor.py # PDF 텍스트 추출
│   │   │   └── ocr_service.py  # OCR 파이프라인
│   │   └── synology_gateway/   # Synology NAS API 래퍼
│   ├── alembic/                # DB 마이그레이션
│   └── tests/                  # pytest 테스트
│
├── frontend/
│   ├── src/
│   │   ├── pages/              # 페이지 (코드 스플리팅)
│   │   ├── components/         # shadcn/ui + 커스텀 컴포넌트
│   │   ├── hooks/              # TanStack Query, SSE, OAuth 훅
│   │   ├── lib/                # API 클라이언트, 유틸리티
│   │   └── i18n/               # 다국어 번역 리소스
│   └── e2e/                    # Playwright E2E 테스트
│
└── docs/
    ├── screenshots/            # 기능 스크린샷
    ├── plans/                  # 설계 문서
    └── roadmap/                # 로드맵 상세 계획
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

> NAS와 AI 키는 선택사항이다. NAS 없이도 NSX 파일 임포트로 노트를 사용할 수 있고, AI 키 없이도 검색과 노트 관리 기능을 이용할 수 있다.

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

## API 문서

Backend 실행 후 자동 생성된 API 문서를 확인한다:

- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

---

## 로드맵

상세 로드맵은 [ROADMAP.md](ROADMAP.md)를 참고한다.

- [x] Phase 1 — 검색 고도화 (Why matched, Adaptive Search, Multi-turn Refinement)
- [x] Phase 2 — AI 품질 게이트 (Checklist, QA Evaluation, Stream Monitor)
- [x] Phase 3 — 콘텐츠 인텔리전스 (Auto-Tagging, Related Notes, Rediscovery)
- [ ] Phase 4 — 멀티모달 확장 (PDF 추출 완료, OCR 완료, 외부 콘텐츠 캡처 미착수)
- [ ] Phase 5 — 평가 인프라 (A/B 프레임워크, 메트릭 대시보드, 피드백 루프)

---

## 라이선스

이 프로젝트는 [GNU Affero General Public License v3.0](LICENSE) 하에 배포된다.
네트워크를 통해 서비스하는 경우에도 수정된 소스 코드의 공개 의무가 적용된다.
