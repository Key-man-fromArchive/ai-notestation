# CLAUDE.md

> 이 파일은 Claude Code가 프로젝트 컨텍스트를 빠르게 파악하도록 돕습니다.

## 프로젝트 개요

- **이름**: LabNote AI (ai-notestation)
- **설명**: Synology NoteStation을 AI로 강화하는 웹 앱. 검색, 인사이트 도출, 연구노트 작성, 맞춤법 교정, 템플릿 생성 기능 제공
- **기술 스택**: FastAPI (Python 3.12+) + React 19 + Vite + TailwindCSS + shadcn/ui + PostgreSQL 16 + pgvector
- **Git Remote**: `https://github.com/Key-man-fromArchive/ai-notestation.git`

## 빠른 시작

```bash
# 전체 스택 실행
docker compose up -d

# 백엔드 개발
cd backend && pip install -e ".[dev]" && uvicorn app.main:app --reload

# 프론트엔드 개발
cd frontend && npm install && npm run dev

# 테스트
cd backend && pytest --tb=short
cd frontend && npm test
```

## 프로젝트 구조

```
labnote-ai/
├── docker-compose.yml
├── .env.example
├── CLAUDE.md
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── synology_gateway/    # Synology NAS API 래퍼
│   │   ├── ai_router/           # AI 통합 라우터 (GPT, Claude, Gemini, GLM)
│   │   ├── search/              # 하이브리드 검색 (FTS + pgvector)
│   │   ├── api/                 # REST + SSE 엔드포인트
│   │   └── services/            # 동기화, 인증
│   ├── alembic/                 # DB 마이그레이션
│   └── tests/
├── frontend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── pages/               # React.lazy 코드 스플리팅
│   │   ├── components/          # shadcn/ui 기반, 가상화 리스트
│   │   ├── hooks/               # TanStack Query, SSE 스트리밍
│   │   └── lib/                 # API 클라이언트, 쿼리 설정
│   └── public/
└── docs/
    ├── plans/
    │   ├── 2026-01-29-labnote-ai-design.md  # 설계 문서
    │   └── 06-tasks.md                       # 태스크 목록
    └── Synology_File_Station_API_Guide.md    # API 참조
```

## 컨벤션

- 커밋 메시지: Conventional Commits (한글 허용)
- 브랜치 전략: `main`, `phase/{N}-{feature}` (Git Worktree)
- 백엔드 코드 스타일: ruff (lint + format)
- 프론트엔드 코드 스타일: ESLint + Prettier
- UI 테마: Light mode only (다크 모드 없음)

## 핵심 설계 결정

- **AI 스트리밍**: SSE (Server-Sent Events) via FastAPI StreamingResponse
- **검색**: Progressive search (FTS 즉시 반환 → 의미검색 비동기 병합)
- **노트 목록**: @tanstack/react-virtual 가상화 (1000+ 노트 지원)
- **데이터 페칭**: TanStack Query (캐싱, staleTime, 무한 스크롤)
- **마크다운 렌더링**: react-markdown + rehype-sanitize (XSS 방지)
- **접근성**: Radix 기반 shadcn/ui + 커스텀 ARIA 속성 + motion-reduce 지원

---

## Auto-Orchestrate 진행 상황

> 이 섹션은 `/auto-orchestrate` 실행 시 자동으로 업데이트됩니다.

### 완료된 Phase

| Phase | 태스크 | 완료일 | 주요 내용 |
|-------|--------|--------|----------|
| P0 | 5/5 | 2026-01-29 | 모노레포 구조, Docker Compose, FastAPI, React, DB 스키마 |
| P1 | 4/4 | 2026-01-29 | Synology 클라이언트, NoteStation/FileStation 래퍼, 동기화 서비스 |
| P2 | 5/5 | 2026-01-29 | 임베딩 서비스, 노트 인덱서, 전문검색, 의미검색, 하이브리드검색(RRF) |
| P3 | 7/7 | 2026-01-29 | Provider ABC, OpenAI/Anthropic/Gemini/ZhipuAI Provider, 통합 라우터+SSE, 프롬프트 템플릿 |

### 현재 Phase

- P4: Backend API (대기 중)

### 재개 명령어

```bash
/auto-orchestrate --resume
```

---

## Lessons Learned

> 에이전트가 난관을 극복하며 발견한 교훈을 기록합니다.
