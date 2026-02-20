<p align="center">
  <a href="README.en.md"><img src="https://img.shields.io/badge/English-blue?style=for-the-badge" alt="English" height="120" /></a>
</p>

# LabNote AI

**NAS에 묻혀 있던 수천 개의 연구노트, 로컬 AI로 되살립니다.**

<p align="left">
  <img src="https://img.shields.io/badge/version-2.1.0-blue?style=flat-square" alt="v2.1.0" />
  <img src="https://img.shields.io/badge/license-AGPL--3.0-green?style=flat-square" alt="AGPL-3.0" />
  <img src="https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/self--hosted-black?style=flat-square" alt="Self-hosted" />
  <img src="https://img.shields.io/badge/Python-3.12+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.12+" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.7" />
</p>

<p align="center">
  <img src="docs/screenshots/graph.png" alt="Knowledge Graph — 수천 개 연구노트의 관계를 시각화" width="720" />
</p>

Synology NoteStation에 노트가 2,000개 넘게 쌓이면 검색이 안 됩니다. 오타 하나면 못 찾고, 주제별 탐색은 불가능합니다. LabNote AI는 텍스트, 이미지, PDF, HWP까지 전부 내 서버의 하이브리드 검색 엔진에 인덱싱합니다. 시맨틱 검색, AI 질의응답, OCR, 지식 그래프, PubMed/arXiv 논문 캡처 — SaaS 없이, 내 서버에서.

```bash
git clone https://github.com/Key-man-fromArchive/ai-notestation.git && cd ai-notestation
bash install.sh        # 대화형 설치. NAS 주소와 AI 키 입력 (Enter로 스킵 가능)
# → http://localhost:3000
```

---

## 핵심 기능 요약

**하이브리드 검색 엔진** — BM25(English stemming 포함) + 시맨틱 검색을 Reciprocal Rank Fusion으로 통합. JUDGE 적응형 전략으로 불필요한 시맨틱 호출 절감. PostgreSQL 하나, 별도 DB 불필요.

**멀티 AI 프로바이더** — OpenAI, Anthropic, Google, ZhipuAI를 환경 변수에서 자동 감지. 모델 자유 전환, SSE 스트리밍.

**AI 품질 게이트** — 체크리스트 기반 자가 검증. 품질 기준 미달 시 자동 재생성.

**3엔진 하이브리드 OCR** — GLM-OCR → Tesseract(로컬) → AI Vision 자동 폴백 체인. 수천 장 이미지를 듀얼 파이프라인으로 배치 처리. HWP/HWPX 내장 이미지도 OCR.

**지식 그래프** — 노트 간 관계를 포스 레이아웃으로 시각화. AI 클러스터링이 숨겨진 연결을 발견.

**리치 에디터** — TipTap + KaTeX 수식, 표, 코드 블록. 드래그앤드롭 업로드. 3초 자동 저장. 참고문헌 삽입.

**학술 논문 캡처** — PubMed (PMC 전문 + Unpaywall OA), arXiv, URL 캡처. 기존 노트에 참고문헌 삽입.

**Synology 연동** — NoteStation 양방향 동기화. NSX 임포트. NAS 없이도 사용 가능.

**팀 RBAC** — Owner → Admin → Member → Viewer 역할. 멤버 그룹, 이메일 초대, 토큰 기반 공유.

**평가 인프라** — A/B 평가 프레임워크, 검색 품질 메트릭, 사용자 피드백 루프 (검색/AI).

**다국어** — 한국어 / 영어 UI. 브라우저 언어 자동 감지.

---

## 이런 걸 합니다

<table>
<tr>
<td width="50%">

<img src="docs/screenshots/search.png" alt="하이브리드 검색" width="100%" />

**하이브리드 검색 엔진**
PostgreSQL `tsvector`(BM25 + English stemming) + `pgvector`(시맨틱)를 Reciprocal Rank Fusion으로 통합합니다. JUDGE가 FTS 품질을 판단하여 시맨틱 검색을 조건부 실행. 각 결과에 왜 매칭되었는지 엔진별 뱃지로 표시합니다.

</td>
<td width="50%">

<img src="docs/screenshots/librarian.png" alt="AI 사서" width="100%" />

**AI 사서**
전체 노트 컬렉션에 자연어로 질문합니다. 관련도 점수와 출처를 함께 반환합니다. 대화 히스토리를 유지해 반복적으로 연구를 심화할 수 있습니다.

</td>
</tr>
<tr>
<td width="50%">

<img src="docs/screenshots/note-detail.png" alt="노트 에디터 — 표, 이미지, 리치 텍스트" width="100%" />

**노트 에디터**
TipTap 리치 에디터에 KaTeX 수식, 표, 코드 블록, 이미지 첨부를 지원합니다. 항상 편집 가능하며 3초 자동 저장. AI 자동 태깅으로 노트별 구조화된 메타데이터를 생성합니다.

</td>
<td width="50%">

<img src="docs/screenshots/note-ai-panel.png" alt="AI 분석 — 5가지 작업과 품질 게이트" width="100%" />

**AI 분석**
6가지 AI 작업(인사이트, 요약, 맞춤법, 글쓰기, 검색 QA, 템플릿)을 4개 프로바이더에서 모델 선택하여 실행합니다. 체크리스트 기반 품질 게이트가 결과를 검증합니다.

</td>
</tr>
<tr>
<td width="50%">

<img src="docs/screenshots/dashboard.png" alt="대시보드 — 통계, 이미지 분석, 재발견" width="100%" />

**대시보드**
노트, 노트북, 동기화 상태, 이미지 분석 진행률을 한눈에 파악합니다. 수천 장의 이미지 OCR/Vision 파이프라인 현황. 잊혀진 노트 재발견 카드.

</td>
<td width="50%">

<img src="docs/screenshots/admin.png" alt="관리 — DB 통계, 사용자, 스토리지" width="100%" />

**관리**
7탭 설정 패널(General, AI 모델, 검색 엔진, 데이터 분석, 카테고리, 연결, Admin). DB 백업/복원, 검색 메트릭, 피드백 요약, 평가 대시보드.

</td>
</tr>
</table>

---

## 핵심 기능

### 검색 & 탐색
- **하이브리드 검색** — `tsvector`(BM25) + `pg_trgm`(퍼지) + `pgvector`(시맨틱)를 Reciprocal Rank Fusion으로 병합. PostgreSQL 하나로, 별도 벡터 DB 불필요.
- **적응형 검색** — JUDGE 모듈이 FTS 커버리지를 평가하고, 키워드 결과가 충분하면 시맨틱 검색을 건너뜁니다. 비용과 지연 절감.
- **결과 설명** — 각 결과에 엔진 뱃지(Keyword #1, Fuzzy #5, Semantic)로 왜 매칭되었는지 표시.
- **다중 턴 리파인** — AI 기반 쿼리 확장/축소와 리파인 히스토리.
- **지식 그래프** — 포스 레이아웃 시각화, AI 클러스터링, 인사이트 DB 영속화.

### AI 통합
- **4개 프로바이더** — OpenAI, Anthropic, Google, ZhipuAI. 환경 변수에서 자동 감지. 모델 자유 전환.
- **6가지 AI 작업** — 인사이트 추출, 요약, 맞춤법 교정, 글쓰기 보조, 검색 QA, 템플릿 생성.
- **품질 게이트** — 체크리스트 기반 자가 검증. 미달 시 자동 재생성.
- **스트림 모니터** — SSE 스트리밍 중 반복, 언어 불일치, 형식 이탈을 실시간 감지. 자동 재시도.
- **OAuth** — Google OAuth 2.0(Gemini 쿼터), OpenAI PKCE(ChatGPT 구독 재사용).
- **AI 사서** — 자연어 질의응답, 히스토리 추적, 관련도 점수.

### 멀티모달
- **PDF 추출** — PyMuPDF + GLM-OCR 네이티브 PDF 50페이지 청크 처리. 하이브리드 폴백.
- **HWP/HWPX 추출** — OpenHWP(Rust) 기반 텍스트 추출 + 내장 이미지 OCR.
- **3엔진 하이브리드 OCR** — GLM-OCR → Tesseract(로컬 CPU, 한/영/일/중) → AI Vision(클라우드). 자동 폴백 체인.
- **듀얼 파이프라인 배치** — OCR(동시성=1)과 Vision 설명 생성(동시성=8)이 독립 병렬 파이프라인으로 실행. 한쪽 실패해도 다른 쪽 계속.
- **이미지 내용 검색** — 추출된 텍스트와 이미지 설명이 자동 인덱싱. 이미지 내용으로 검색 가능.

### 외부 캡처 & 학술 통합
- **URL 캡처** — readability-lxml + html2text로 콘텐츠 자동 추출.
- **PubMed 전문 체인** — PMID → PMC ID Converter → PMC 전문 (JATS XML) → Unpaywall OA PDF 링크 폴백.
- **arXiv 캡처** — Atom API로 메타데이터 + 초록 자동 파싱.
- **참고문헌 삽입** — 노트 에디터에서 PubMed/arXiv/URL 캡처 결과를 기존 노트에 추가.

### 에디터 & 노트
- **리치 에디터** — TipTap + KaTeX 수식, 표, 코드 블록. 너비 4단계 조절.
- **드래그앤드롭** — 복수 파일 병렬 업로드 + 클립보드 붙여넣기.
- **자동 저장** — 3초 디바운스, 30초 주기, 이동 시 저장, Ctrl+S 수동 저장.
- **AI 자동 태깅** — 개별 노트 또는 노트북 전체 배치 태깅.
- **노트 목록** — 가상화 리스트 + 무한 스크롤, 수정일/생성일 정렬, 달력 스타일 썸네일.
- **관련 노트** — pgvector 코사인 유사도로 노트 간 연결 발견.
- **재발견** — 대시보드에서 현재 작업과 관련 있는 오래된 노트를 다시 보여줍니다.
- **NAS 동기화** — NoteStation 양방향 동기화. NSX 임포트. NAS 없이도 사용 가능.

### 평가 & 품질
- **A/B 평가** — 합성 테스트 데이터(FictionalHot)로 모델 비교. 자동 채점.
- **검색 메트릭** — 일별 검색량, 소요 시간, 0-result 비율, 클릭률 추이.
- **사용자 피드백** — 검색 결과 관련성 투표, AI 응답 별점 평가. Admin 요약 뷰.

### 관리 & 협업
- **팀 RBAC** — Owner → Admin → Member → Viewer. 이메일 초대, 가입 승인.
- **멤버 그룹** — 그룹별 노트북 접근 제어 (read/write/admin). 배치 역할 변경/삭제.
- **노트북 카테고리** — 12종 프리셋 (연구 6 + 라이프스타일 6). AI 프롬프트/힌트/부스트 자동 주입.
- **노트 공유** — 토큰 기반 공개 링크, 만료 기간 설정(1일 / 7일 / 30일 / 무제한).
- **백업/복원** — DB + 네이티브 병렬 백업, 설정 백업, 서버 직접 복원.
- **i18n** — 한국어/영어 UI. 브라우저 언어 자동 감지.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | FastAPI + SQLAlchemy 2.0 (async) + Alembic |
| Frontend | React 19 + Vite + TailwindCSS + shadcn/ui |
| Database | PostgreSQL 16 + pgvector |
| Search | tsvector + pg_trgm + pgvector + RRF |
| AI | OpenAI, Anthropic, Google, ZhipuAI (자동 감지) |
| OCR/Vision | GLM-OCR, Tesseract, AI Vision (자동 폴백) |
| Auth | JWT + OAuth 2.0 (Google, OpenAI PKCE) |
| Deploy | Docker Compose (3 containers) |

**수치로 보기:** API 엔드포인트 177개 · DB 마이그레이션 25개 · 페이지 18개 · 훅 37개 · i18n 키 1,071개

---

<details>
<summary><strong>아키텍처</strong></summary>

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React 19)                  │
│  ┌──────────┬──────────┬───────────┬──────────┬──────────┐  │
│  │대시보드  │  노트    │  검색     │   AI     │  그래프  │  │
│  │          │ 노트북   │ AI 사서   │  분석    │  탐색    │  │
│  └──────────┴──────────┴───────────┴──────────┴──────────┘  │
│         TanStack Query  ·  SSE Streaming  ·  shadcn/ui      │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API + SSE
┌─────────────────────────┴───────────────────────────────────┐
│                      Backend (FastAPI)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  API Layer (177 엔드포인트)                           │   │
│  │  auth · notes · search · ai · sync · files · admin    │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  AI Router ─── OpenAI │ Anthropic │ Google │ ZhipuAI │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Search Engine ─── FTS + Trigram + Semantic (RRF)    │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Quality Gate ─── Checklist │ QA Eval │ Stream Mon   │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Image Analysis ─── 3엔진 OCR │ Vision │ Batch       │   │
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

<details>
<summary>환경 변수</summary>

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

NAS 없이도 NSX 임포트나 로컬 노트 생성으로 사용할 수 있습니다. AI 키 없이도 검색과 노트 관리는 동작합니다.

</details>

<details>
<summary>프로젝트 구조</summary>

```
labnote-ai/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI 엔트리포인트
│       ├── api/                 # REST API 엔드포인트 177개
│       ├── ai_router/           # 멀티 프로바이더 AI (프로바이더, 프롬프트, 품질 게이트)
│       ├── search/              # 하이브리드 검색 (FTS, 시맨틱, RRF, JUDGE)
│       ├── services/            # OCR, Vision, 태깅, 관련노트, PDF, HWP, 캡처, 백업, 평가
│       └── synology_gateway/    # NAS API 래퍼
├── frontend/src/
│   ├── pages/                   # 18개 페이지 (코드 스플리팅)
│   ├── components/              # shadcn/ui + 커스텀
│   └── hooks/                   # 37개 훅 (TanStack Query, SSE)
└── docker-compose.yml           # 3-container 배포
```

</details>

<details>
<summary>테스트 & 린트</summary>

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

- [x] Phase 1 — 검색 고도화 (Why matched, Adaptive Search, Multi-turn Refinement) `v1.1.0`
- [x] Phase 2 — AI 품질 게이트 (Checklist, QA Evaluation, Stream Monitor) `v1.2.0`
- [x] Phase 3 — 콘텐츠 인텔리전스 (Auto-Tagging, Related Notes, Rediscovery, Graph Insights) `v1.3.1`
- [x] Phase 4 — 멀티모달 (PDF, HWP, 3엔진 OCR, 듀얼 파이프라인, PubMed 전문 캡처) `v1.6.0 → v2.1.0`
- [x] Phase 5 — 평가 인프라 (A/B 프레임워크, 메트릭 대시보드, 피드백 루프) `v2.0.0`
- [ ] Phase UI-1 — Foundation UX (사이드바, 커맨드 팔레트, 다크 모드) `v3.0.0 예정`

상세: [ROADMAP.md](ROADMAP.md) · 변경 이력: [CHANGELOG.md](CHANGELOG.md)

---

## 라이선스

[AGPL-3.0](LICENSE) — 네트워크 서비스 제공 시에도 소스 공개 의무가 적용됩니다.
