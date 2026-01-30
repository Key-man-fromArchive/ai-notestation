# LabNote AI

Synology NoteStation을 AI로 강화하는 웹 애플리케이션입니다.
검색, 인사이트 도출, 연구노트 작성, 맞춤법 교정, 템플릿 생성 기능을 제공합니다.

## 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | FastAPI (Python 3.12+), SQLAlchemy 2.0, Alembic |
| Frontend | React 19, Vite, TailwindCSS, shadcn/ui |
| Database | PostgreSQL 16 + pgvector |
| AI | OpenAI, Anthropic, Google Gemini, ZhipuAI GLM |
| 인증 | JWT + OAuth 2.0 (Google, OpenAI PKCE) |
| 인프라 | Docker Compose |

## 주요 기능

- **하이브리드 검색** - 전문검색(FTS) + 의미검색(pgvector)을 RRF로 병합
- **AI 워크벤치** - 멀티 프로바이더 AI 채팅 (SSE 스트리밍)
- **NAS 동기화** - Synology NoteStation/FileStation API 연동
- **OAuth 인증** - Google/OpenAI 계정으로 AI API 사용
- **대시보드** - 노트 통계, 최근 활동, 검색 트렌드

## 빠른 시작

### Docker Compose (권장)

```bash
# 1. 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 Synology NAS 정보와 AI API 키를 입력하세요

# 2. 전체 스택 실행
docker compose up -d

# 3. 접속
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000/docs
```

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

### DB 마이그레이션

```bash
cd backend
alembic upgrade head
```

## 프로젝트 구조

```
labnote-ai/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 엔트리포인트
│   │   ├── config.py            # pydantic-settings 설정
│   │   ├── database.py          # SQLAlchemy async engine
│   │   ├── models.py            # ORM 모델 (Note, OAuthToken, ...)
│   │   ├── api/                 # REST API 라우터
│   │   │   ├── auth.py          # JWT 인증
│   │   │   ├── notes.py         # 노트 CRUD
│   │   │   ├── search.py        # 하이브리드 검색
│   │   │   ├── ai.py            # AI 채팅 (SSE)
│   │   │   ├── settings.py      # 설정 관리
│   │   │   ├── sync.py          # NAS 동기화
│   │   │   └── oauth.py         # OAuth 인증
│   │   ├── services/            # 비즈니스 로직
│   │   ├── ai_router/           # AI 프로바이더 통합
│   │   │   ├── router.py        # 멀티 프로바이더 라우터
│   │   │   └── providers/       # OpenAI, Anthropic, Google, ZhipuAI
│   │   ├── search/              # 검색 엔진
│   │   └── synology_gateway/    # Synology NAS API 래퍼
│   ├── alembic/                 # DB 마이그레이션
│   └── tests/                   # pytest 테스트
├── frontend/
│   ├── src/
│   │   ├── pages/               # 페이지 (React.lazy 코드 스플리팅)
│   │   ├── components/          # 공용 컴포넌트
│   │   ├── hooks/               # 커스텀 훅 (TanStack Query, SSE, OAuth)
│   │   └── lib/                 # API 클라이언트, 유틸리티
│   └── public/
└── docs/
    └── plans/                   # 설계 문서
```

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 연결 URL | `postgresql+asyncpg://labnote:labnote@db:5432/labnote` |
| `SYNOLOGY_URL` | Synology NAS 주소 | `http://localhost:5000` |
| `SYNOLOGY_USER` | NAS 사용자명 | `admin` |
| `SYNOLOGY_PASSWORD` | NAS 비밀번호 | - |
| `JWT_SECRET` | JWT 서명 키 | `change-this-secret-key` |
| `OPENAI_API_KEY` | OpenAI API 키 (선택) | - |
| `ANTHROPIC_API_KEY` | Anthropic API 키 (선택) | - |
| `GOOGLE_API_KEY` | Google Gemini API 키 (선택) | - |
| `ZHIPUAI_API_KEY` | ZhipuAI API 키 (선택) | - |
| `OAUTH_ENCRYPTION_KEY` | OAuth 토큰 암호화 키 (Fernet) | - |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth 클라이언트 ID | - |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth 클라이언트 시크릿 | - |

## 테스트

```bash
# Backend 테스트
cd backend
pytest --tb=short

# Frontend 테스트
cd frontend
npm test

# Backend 린트
cd backend
ruff check .

# Frontend 린트
cd frontend
npm run lint
```

## API 문서

Backend 실행 후 아래 URL에서 자동 생성된 API 문서를 확인할 수 있습니다:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 라이선스

MIT
