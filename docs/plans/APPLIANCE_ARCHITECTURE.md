# LabNote AI Appliance — Hardware/Software Architecture Plan

**Date**: 2026-02-18
**Target**: ODROID H4 Plus/Ultra (Intel N305/i3-N305)
**Price**: $299 (Lite) / $499 (Pro) / 견적 (Lab)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    LabNote AI Box                            │
│                                                             │
│  ┌─── Hardware ──────────────────────────────────────────┐  │
│  │  ODROID H4 Plus/Ultra                                 │  │
│  │  Intel N305 (8 E-core) / DDR5 듀얼채널 / NVMe SSD    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── OS Layer ──────────────────────────────────────────┐  │
│  │  Ubuntu 24.04 LTS (Minimal Server)                    │  │
│  │  systemd → labnote.service (boot entrypoint)          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── Container Layer (Docker Compose) ──────────────────┐  │
│  │                                                       │  │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐            │  │
│  │  │ Traefik │  │ Frontend │  │ Backend  │            │  │
│  │  │ :80/:443│  │ React    │  │ FastAPI  │            │  │
│  │  └────┬────┘  └──────────┘  └─────┬────┘            │  │
│  │       │                           │                   │  │
│  │  ┌────┴───────────────────────────┴──────────────┐   │  │
│  │  │              Internal Network                  │   │  │
│  │  └──┬──────────┬──────────┬──────────┬───────────┘   │  │
│  │     │          │          │          │               │  │
│  │  ┌──┴───┐  ┌──┴───┐  ┌──┴───┐  ┌──┴──────────┐   │  │
│  │  │ PG16 │  │Ollama│  │Embed │  │ PaddleOCR   │   │  │
│  │  │pgvec │  │ LLM  │  │ ONNX │  │ OpenVINO    │   │  │
│  │  └──────┘  └──────┘  └──────┘  └─────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── Data Layer (/DATA) ────────────────────────────────┐  │
│  │  postgres/  notes/  models/  backups/  uploads/       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── Management Layer ──────────────────────────────────┐  │
│  │  Setup Wizard │ OTA Updater │ Health Monitor │ Backup │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Hardware Spec (BOM)

### Lite ($299)
| Component | Spec | Cost |
|-----------|------|------|
| ODROID H4 Plus | Intel N305, 8 E-core | $99 |
| DDR5 SO-DIMM | 16GB (8GB×2 듀얼채널) | $40 |
| NVMe SSD | 256GB (2280) | $25 |
| 케이스 + 전원 | Hardkernel Type-7 + 15V/4A | $25 |
| **합계** | | **$189** |

### Pro ($499)
| Component | Spec | Cost |
|-----------|------|------|
| ODROID H4 Ultra | Intel i3-N305 | $140 |
| DDR5 SO-DIMM | 32GB (16GB×2 듀얼채널) | $70 |
| NVMe SSD | 512GB (2280) | $40 |
| 케이스 + 전원 | Hardkernel Type-7 + 19V/4.74A | $30 |
| **합계** | | **$280** |

### 공통 중요사항
- **DDR5 듀얼채널 필수** — LLM 추론 성능 ~70% 향상
- NVMe: 벡터 인덱스 + 모델 로딩 속도에 직접 영향

---

## 3. Software Stack

### 3.1 OS Layer

```
Ubuntu 24.04 LTS (Minimal Server)
├── systemd
│   ├── labnote-startup.service    # 부팅 시 초기화
│   ├── labnote-watchdog.service   # 헬스 모니터링
│   └── labnote-updater.timer      # OTA 체크 (1일 1회)
├── Docker Engine 27+
├── Docker Compose V2
└── avahi-daemon                    # mDNS (labnote.local)
```

**왜 Ubuntu 24.04?**
- ODROID H4 공식 지원
- Docker/ONNX/OpenVINO 패키지 호환성
- LTS 10년 보안 업데이트
- 커뮤니티/문서 풍부

### 3.2 Container Architecture

```yaml
# docker-compose.appliance.yml — 7 services
services:
  # === Network Gateway ===
  traefik:        # 리버스 프록시 + HTTPS + 서비스 디스커버리

  # === Core Application ===
  frontend:       # React 19 + Vite (nginx로 정적 빌드 서빙)
  backend:        # FastAPI (uvicorn, workers=2)
  postgres:       # PostgreSQL 16 + pgvector

  # === AI Services ===
  ollama:         # LLM 추론 (Qwen2.5-3B / Gemma2-9B)
  embedding:      # ONNX Runtime 임베딩 (all-MiniLM / Nomic)
  ocr:            # PaddleOCR + OpenVINO (한국어)
```

### 3.3 Resource Allocation (16GB Lite 기준)

```
Total: 16GB RAM, 8 CPU cores
┌──────────────┬─────┬──────┬─────────────────────────┐
│ Service      │ CPU │ RAM  │ Notes                   │
├──────────────┼─────┼──────┼─────────────────────────┤
│ OS + systemd │ -   │ 1GB  │ Ubuntu minimal          │
│ Traefik      │ 0.2 │ 128M │ 항상 실행               │
│ PostgreSQL   │ 1   │ 2GB  │ shared_buffers=512MB    │
│ Backend      │ 1   │ 1GB  │ uvicorn workers=2       │
│ Frontend     │ 0.2 │ 128M │ nginx 정적 서빙          │
│ Embedding    │ 2   │ 1GB  │ ONNX all-MiniLM         │
│ PaddleOCR    │ 2   │ 2GB  │ 요청 시에만 활성          │
│ Ollama       │ 6   │ 4GB  │ Qwen2.5-3B (Q4_K_M)    │
├──────────────┼─────┼──────┼─────────────────────────┤
│ 여유         │ -   │ ~5GB │ 파일캐시 + 버스트용       │
└──────────────┴─────┴──────┴─────────────────────────┘
```

> **CPU는 공유**: Ollama가 6코어를 "요청할 때만" 사용.
> 유휴 시 다른 서비스가 자유롭게 사용.

---

## 4. AI Hybrid Strategy

### 4.1 Provider Priority (폴백 체인)

```
사용자 요청 → AIRouter
  │
  ├─ [1] Cloud API (사용자 API 키 존재?)
  │      ├─ OpenAI GPT-4o
  │      ├─ Anthropic Claude
  │      ├─ Google Gemini
  │      └─ ZhipuAI GLM
  │
  └─ [2] On-Device (API 키 없음 또는 오프라인)
         ├─ Ollama → Qwen2.5-3B / Gemma2-9B
         └─ 폴백: 기능 제한 모드 (검색만 가능)
```

> **참고**: 3B급 로컬 LLM은 해석/통찰력/사고력이 연구자 수준에 미달.
> 클라우드 AI(GPT-4o, Claude)가 품질의 핵심이며,
> 로컬 LLM은 오프라인 폴백 및 기본 작업용.

### 4.2 기능별 AI 매핑

| 기능 | Cloud | On-Device | 폴백 |
|------|-------|-----------|------|
| **검색** (임베딩) | - | all-MiniLM (항상 로컬) | FTS만 |
| **요약** | GPT-4o/Claude | Qwen2.5-3B | 미제공 |
| **인사이트** | GPT-4o/Claude | Qwen2.5-3B | 미제공 |
| **OCR** | GLM-4.6v-flash | PaddleOCR (항상 로컬) | Tesseract |
| **태그 생성** | GPT-4o-mini | Qwen2.5-3B | 키워드 추출 |
| **템플릿** | Claude | Qwen2.5-3B | 미제공 |

### 4.3 Notebook Security Level (AI 접근 제어)

노트북 단위로 AI가 데이터에 접근할 수 있는 범위를 5단계로 제어.

```
Level 1  OPEN        — 모든 AI 자유 사용
Level 2  STANDARD    — 클라우드 AI + 접근 범위 제어
  ├─ Low Privacy     — AI 자유 접근, 자동 기능 전부
  ├─ Mid Privacy     — 현재 노트만, 자동 일부         ← 기본값
  └─ High Privacy    — 선택 텍스트만, 모두 수동
Level 3  SENSITIVE   — 클라우드 AI + 익명화 파이프라인
Level 4  RESTRICTED  — 로컬 LLM만 (데이터 박스 밖 안 나감)
Level 5  AIR-GAPPED  — AI 비활성화 (수동만)
```

#### Level 2 AI Accessibility Presets

| | **2-Low Privacy** | **2-Mid Privacy** (기본) | **2-High Privacy** |
|---|---|---|---|
| **의미** | AI 자유 접근 | AI 선택적 접근 | AI 최소 접근 |
| **프로바이더** | 모든 클라우드 | 사용자 지정만 | 1개 지정만 |
| **전송 범위** | 전체 노트 | 현재 노트 | 선택한 단락만 |
| **자동 기능** | 전부 허용 | 일부 허용 | 전부 수동 |
| **백그라운드 AI** | 허용 | 제한적 | 차단 |
| **AI 품질** | ~100% | ~98% | ~90% |

#### 기능별 AI Accessibility 매트릭스

| AI 기능 | 2-Low | 2-Mid | 2-High |
|---|---|---|---|
| **검색 임베딩** | 클라우드+로컬 | 로컬만 | 로컬만 |
| **AI 요약** | 자동 (노트 저장 시) | 수동 (버튼 클릭) | 수동 + 확인 팝업 |
| **AI 인사이트** | 자동 제안 | 수동 요청 | 수동 + 확인 팝업 |
| **AI 태그 생성** | 자동 | 자동 | 수동 |
| **관련 노트 추천** | 자동 | 자동 | 차단 |
| **AI 템플릿** | 허용 | 허용 | 차단 |
| **AI QA (채팅)** | 전체 노트북 맥락 | 현재 노트만 | 선택한 텍스트만 |
| **감사 로그** | 선택 | 켜짐 | 켜짐 + 전송 내용 기록 |

#### 전송 범위 시각화

```
2-Low:  "이 노트북의 모든 노트를 분석해줘" → 전체 전송 OK
        ┌─────────────────────────────┐
        │ Note 1 ──────────────┐      │
        │ Note 2 ──────────────┤ →→→  │ → Cloud AI
        │ Note 3 ──────────────┘      │
        └─────────────────────────────┘

2-Mid:  "이 노트를 요약해줘" → 현재 노트만 전송
        ┌─────────────────────────────┐
        │ Note 1                      │
        │ Note 2 ────────────────→→→  │ → Cloud AI
        │ Note 3                      │
        └─────────────────────────────┘

2-High: "이 부분을 분석해줘" → 드래그한 텍스트만 전송
        ┌─────────────────────────────┐
        │ Note 2                      │
        │  ├─ paragraph 1             │
        │  ├─ ██████████████ ──→→→    │ → Cloud AI
        │  └─ paragraph 3             │
        └─────────────────────────────┘
```

#### Level 3 익명화 파이프라인

Level 3 (Sensitive)에서는 전송 전 자동 익명화:

```
원문 → NER 감지(로컬) → 엔티티 치환 → 클라우드 AI → 역치환 → 사용자
```

| 치환 대상 | 예시 |
|---|---|
| 인명 | "김철수 박사" → "[PERSON_A]" |
| 기관 | "삼성전자" → "[ORG_A]" |
| 프로젝트 | "Project Aurora" → "[PROJECT_1]" |
| 코드명/화합물 | "LNT-2847" → "[COMPOUND_X]" |
| 연락처 | 이메일, 전화번호 → "[EMAIL]", "[PHONE]" |

치환 매핑은 메모리에만 존재, AI 응답 역치환 후 즉시 파기.
사용자 커스텀 엔티티 사전 추가 가능.

#### Level별 사용 시나리오

| Level | 시나리오 | 사용자 |
|---|---|---|
| 1 Open | 공개 논문 리뷰 | 대학원생 |
| 2-Low | 개인 연구 일지 | 개인 연구자 |
| 2-Mid | 기업 연구 노트 | 기업 연구원 |
| 2-High | 특허 준비 자료 | R&D 팀장 |
| 3 Sensitive | 신약 후보물질 연구 | 제약 R&D |
| 4 Restricted | 방산/의료 보안 연구 | 국방/의료 |
| 5 Air-Gapped | 국가기밀급 | 정부기관 |

#### AIRouter 확장 (코드 변경)

```python
class AIRouter:
    async def chat(self, prompt, notebook_id=None):
        level = get_security_level(notebook_id)

        if level == 5:
            raise AIDisabledError("Air-Gapped mode")
        if level == 4:
            provider = self.get_provider("ollama")
        if level == 3:
            prompt, mapping = anonymize(prompt)

        # Level 2 presets: 전송 범위 제어
        preset = get_privacy_preset(notebook_id)  # low/mid/high
        prompt = apply_scope_filter(prompt, preset)

        response = await provider.chat(prompt)

        if mapping:
            response = de_anonymize(response, mapping)
        audit_log(notebook_id, level, provider)
        return response
```

```python
_PROVIDER_REGISTRY = {
    "openai": ...,
    "anthropic": ...,
    "google": ...,
    "zhipuai": ...,
    "ollama": OllamaProvider,    # NEW: on-device
}

# 자동 감지: Ollama 컨테이너가 실행중이면 등록
# OLLAMA_BASE_URL=http://ollama:11434
```

---

## 5. Data Architecture

### 5.1 Storage Layout

```
/DATA/                          # NVMe SSD 마운트 포인트
├── postgres/                   # PostgreSQL 데이터
│   └── (pgdata)
├── notes/                      # 노트 원본 (HTML)
│   └── {user_id}/{note_id}/
├── uploads/                    # 첨부파일
│   └── {user_id}/{file_hash}
├── models/                     # AI 모델 캐시
│   ├── ollama/                 # Ollama 모델 (~2-10GB)
│   ├── embedding/              # ONNX 모델 (~100MB)
│   └── ocr/                    # PaddleOCR 모델 (~200MB)
├── backups/                    # 자동 백업 (7일 보존)
│   └── {YYYY-MM-DD}/
├── config/                     # 앱 설정
│   ├── .env
│   └── docker-compose.override.yml
└── logs/                       # 로그 (30일 보존)
    └── {service}/{date}.log
```

### 5.2 백업 전략

```
자동 (매일 03:00)
├── pg_dump → /DATA/backups/{date}/db.sql.gz
├── /DATA/notes/ → tar.gz
└── /DATA/config/ → tar.gz

보존: 7일 (Lite), 30일 (Pro), 무제한 (Lab)
외부: USB 드라이브 자동 감지 → 복사
```

---

## 6. Networking

### 6.1 Zero-Config Discovery

```
┌──────────────────────────────────┐
│  사용자 브라우저                    │
│  http://labnote.local            │
│  (avahi/mDNS 자동 발견)            │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Traefik (:80 → :443 리다이렉트)   │
│  ├─ /          → frontend:3000   │
│  ├─ /api/*     → backend:8000    │
│  ├─ /ollama/*  → ollama:11434    │
│  └─ /setup     → wizard:5000     │
└──────────────────────────────────┘
```

### 6.2 외부 접근 (선택)

```
방법 1: Cloudflare Tunnel (추천)
  → 도메인 없이도 HTTPS 접근 가능
  → Zero Trust, 무료 플랜 사용 가능

방법 2: Tailscale / WireGuard
  → VPN 기반, 완전한 사설 네트워크

방법 3: 포트포워딩 + Let's Encrypt
  → 전통적 방식, 사용자가 직접 설정
```

---

## 7. Plug & Play Experience

### 7.1 First Boot Sequence

```
전원 ON
  │
  ├─ [1] systemd → labnote-startup.service
  │      ├─ 하드웨어 체크 (RAM, CPU, SSD)
  │      ├─ /DATA 파티션 마운트/포맷
  │      └─ Docker Compose up
  │
  ├─ [2] 첫 실행 감지 (/DATA/config/.initialized 없음)
  │      └─ Setup Wizard 모드 진입
  │
  ├─ [3] 사용자: 브라우저에서 http://labnote.local 접속
  │
  └─ [4] Setup Wizard (5단계)
         ├─ ① 언어 선택 (한국어/English)
         ├─ ② 관리자 계정 생성
         ├─ ③ AI 설정
         │    ├─ "클라우드 AI 사용" → API 키 입력
         │    └─ "로컬 AI만 사용" → 모델 다운로드 시작
         ├─ ④ 데이터 소스 연결 (선택)
         │    ├─ Synology NoteStation 동기화
         │    └─ NSX 파일 가져오기
         └─ ⑤ 완료 → /DATA/config/.initialized 생성
              → 메인 앱으로 리다이렉트
```

### 7.2 Setup Wizard UI

```
┌───────────────────────────────────────────┐
│  LabNote AI                     Step 3/5  │
│                                           │
│  🧠 AI 설정                               │
│                                           │
│  시스템 정보:                               │
│  ┌─────────────────────────────────────┐  │
│  │  CPU: Intel N305 (8 cores)         │  │
│  │  RAM: 16GB DDR5                    │  │
│  │  SSD: 256GB NVMe                   │  │
│  │  AI 추천: Lite 모드                 │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  ○ 클라우드 AI (GPT/Claude/Gemini)        │
│    └─ API 키 입력: [____________]         │
│                                           │
│  ● 로컬 AI (프라이버시 우선)               │
│    └─ Qwen 2.5 3B 다운로드 (~2GB)         │
│       [████████░░░░] 67% - 2분 남음       │
│                                           │
│  ☑ 하이브리드 (로컬 기본 + 클라우드 보조)    │
│                                           │
│           [이전]            [다음 →]       │
└───────────────────────────────────────────┘
```

---

## 8. OTA Update System

### 8.1 Update Flow

```
labnote-updater.timer (매일 09:00)
  │
  ├─ GET https://update.labnote.ai/v1/manifest
  │   { "version": "2.1.0",
  │     "images": {
  │       "backend": "labnote/backend:2.1.0",
  │       "frontend": "labnote/frontend:2.1.0"
  │     },
  │     "migrations": true,
  │     "changelog": "..." }
  │
  ├─ 현재 버전과 비교
  │
  ├─ 사용자 알림 (WebSocket → 프론트엔드 배너)
  │   "LabNote AI 2.1.0 업데이트가 있습니다. [지금 설치]"
  │
  └─ 사용자 승인 시:
     ├─ [1] 자동 백업 생성
     ├─ [2] docker pull (새 이미지)
     ├─ [3] docker compose up -d (무중단 교체)
     ├─ [4] alembic upgrade head (DB 마이그레이션)
     ├─ [5] 헬스체크 통과 확인
     └─ [6] 실패 시 → 자동 롤백 (이전 이미지 태그)
```

### 8.2 Rollback

```python
# 업데이트 실패 시 자동 롤백
1. 이전 이미지 태그 보존 (docker tag)
2. 헬스체크 3회 실패 → 롤백 트리거
3. DB 마이그레이션 실패 → alembic downgrade
4. 롤백 후 사용자에게 에러 리포트 표시
```

---

## 9. Synology 독립 전략

### 9.1 현재 (v2.x) → 어플라이언스 (v3.x)

```
현재 아키텍처:
  NoteStation ←sync→ LabNote AI ←→ PostgreSQL

어플라이언스 아키텍처:
  LabNote AI ←→ PostgreSQL + 로컬 파일시스템
       │
       └── (선택) Synology 동기화 플러그인
       └── (선택) NSX 가져오기
       └── (선택) WebDAV / S3 외부 스토리지
```

### 9.2 필요한 코드 변경

| 영역 | 현재 | 변경 |
|------|------|------|
| 노트 저장 | Synology → DB 동기화 | DB가 마스터 (로컬 파일시스템) |
| 인증 | Synology OAuth | 자체 인증 (이미 존재) |
| 첨부파일 | Synology FileStation | 로컬 `/DATA/uploads/` |
| 노트북 | Synology 폴더 매핑 | 자체 노트북 CRUD (이미 존재) |
| 이미지 | NAS 경로 참조 | 로컬 서빙 (`/DATA/notes/`) |

**핵심**: 대부분의 코드가 이미 독립적으로 동작.
`sync_service.py`만 "선택적 플러그인"으로 분리하면 됨.

---

## 10. 보안

```
┌─ Network ─────────────────────────────────┐
│ • Traefik HTTPS 강제 (Let's Encrypt)      │
│ • 내부 서비스는 외부 노출 안 됨              │
│ • Cloudflare Tunnel (Zero Trust)          │
├─ Application ─────────────────────────────┤
│ • JWT 인증 (현재와 동일)                    │
│ • API 키는 로컬 저장 (암호화)               │
│ • CORS: labnote.local + 사용자 도메인만     │
├─ Data ────────────────────────────────────┤
│ • NVMe 전체 디스크 암호화 (LUKS, 선택)      │
│ • 백업 암호화 (AES-256)                    │
│ • API 키는 절대 외부 전송 안 됨              │
├─ AI ──────────────────────────────────────┤
│ • 온디바이스 = 데이터가 박스 밖으로 안 나감    │
│ • 클라우드 사용 시 사용자에게 명시적 동의      │
│ • 모델 무결성 검증 (SHA256 체크섬)           │
└───────────────────────────────────────────┘
```

---

## 11. Implementation Roadmap

### Phase 1: Core Independence (4주)
- [ ] Synology 의존성 분리 (sync → 플러그인)
- [ ] 자체 노트 CRUD (로컬 파일시스템)
- [ ] 첨부파일 로컬 관리
- [ ] Setup Wizard API + UI

### Phase 2: On-Device AI (4주)
- [ ] OllamaProvider 구현 (AIRouter 확장)
- [ ] ONNX 임베딩 서비스 (all-MiniLM)
- [ ] PaddleOCR 컨테이너 최적화 (OpenVINO)
- [ ] AI 폴백 체인 구현

### Phase 3: Appliance OS (4주)
- [ ] docker-compose.appliance.yml
- [ ] systemd 서비스 (startup, watchdog, updater)
- [ ] Traefik 설정 + mDNS
- [ ] 자동 백업 시스템

### Phase 4: Production (4주)
- [ ] OTA 업데이트 시스템
- [ ] ODROID H4 실기 테스트
- [ ] 성능 벤치마크 (LLM, 임베딩, OCR)
- [ ] 하드웨어 조립 가이드
- [ ] 사용자 문서

---

## 12. Key Decisions Summary

| 결정 | 선택 | 이유 |
|------|------|------|
| OS | Ubuntu 24.04 LTS | ODROID 공식 지원, Docker 호환 |
| 리버스 프록시 | Traefik v3 | Docker 라벨 자동 디스커버리 |
| LLM 서빙 | Ollama | API 간단, 모델 전환 쉬움 |
| 임베딩 | ONNX Runtime | CPU에서 2-3x 빠름 |
| OCR | PaddleOCR + OpenVINO | 한국어 최고, Intel 최적화 |
| 업데이트 | Docker 이미지 교체 | A/B보다 단순, 롤백 용이 |
| 디스커버리 | avahi (mDNS) | labnote.local 자동 |
| 외부 접근 | Cloudflare Tunnel | 무료, Zero Trust |
| 데이터 | /DATA/ 단일 마운트 | 백업/복원 단순화 |
| 프론트엔드 서빙 | nginx (빌드 결과물) | 개발모드 제거, 메모리 절약 |

---

## Related Documents
- [Hardware Appliance OS Research](../research/hardware-appliance-os-architecture-research.md)
- [Quick Reference (Docker Compose 예시)](../research/appliance-quick-reference.md)
- [비즈니스 전략](../../ROADMAP.md)
- [Product Vision](../roadmap/VISION.md)
