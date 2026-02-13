<p align="right">
  <a href="README.md"><img src="https://img.shields.io/badge/한국어-blue?style=flat-square" alt="Korean" /></a>
</p>

# LabNote AI

**A self-hosted research platform that integrates AI search, analysis, and knowledge discovery into Synology NAS notes**

<p align="left">
  <img src="https://img.shields.io/badge/version-1.2.0-blue?style=flat-square" alt="v1.2.0" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/PostgreSQL_16-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/pgvector-336791?style=flat-square&logo=postgresql&logoColor=white" alt="pgvector" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
</p>

---

## Overview

LabNote AI is a web application that combines Synology NoteStation notes with a hybrid search engine, multiple AI providers, and knowledge graph visualization. It operates on existing notes stored on the user's NAS, employing a self-hosted architecture that requires no external cloud dependency.

> Full stack deployment with a single command: `docker compose up -d`

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

## Features

### 1. Hybrid Search Engine

Three search methods are combined within a single PostgreSQL instance, supporting both keyword and semantic search without a separate vector database.

| Method | Engine | Description |
|--------|--------|-------------|
| Full-Text Search (FTS) | tsvector + BM25 | Precise keyword matching with Korean morphological analysis |
| Fuzzy Search | pg_trgm | Typo-tolerant string similarity matching |
| Semantic Search | pgvector + Embeddings | Discovers notes with similar meaning and context |

FTS + Trigram results are merged via **Reciprocal Rank Fusion (RRF)** for the primary search. Semantic search operates on the AI Librarian page through natural language queries.

**Adaptive Search**: A JUDGE module evaluates FTS result coverage and automatically skips unnecessary embedding calls when coverage is sufficient, optimizing both speed and cost.

**Search Result Explanation (Why this matched)**: Each result displays the contributing engine, keyword highlights, and similarity scores, providing transparent justification for rankings.

**Multi-turn Search Refinement**: When initial results are insufficient, the AI automatically expands or narrows queries for additional searches. Supports iterative improvement based on user feedback.

**12-Parameter Search Tuning**: Weights, thresholds, and RRF k values are adjustable directly from the UI, with per-parameter documentation and recommended values.

### 2. Multi-Provider AI Integration

```
OpenAI · Anthropic · Google · ZhipuAI
```

API keys registered via environment variables are auto-detected and corresponding providers are activated. Multiple providers can be used simultaneously with free model switching. Responses are delivered in real time via SSE streaming.

**5 AI Tasks**:

| Task | Description |
|------|-------------|
| Insight | Automatic extraction of key insights from notes |
| Search QA | Question-answering based on search results |
| Writing Assist | Research note draft writing assistance |
| Proofreading | Spelling and grammar correction |
| Templates | Purpose-specific note template generation |

Multimodal image analysis and automatic title/tag generation are also supported.

### 3. AI Quality Assurance System

AI response reliability is verified through three mechanisms.

- **Checklist-Based Quality Gate**: Decomposes each task into verifiable checklist items and performs self-evaluation after generation. Items that fail evaluation trigger automatic regeneration.
- **Search QA Dual Evaluation**: Evaluates QA responses for Correctness and Utility independently, displaying confidence badges (High / Medium / Low).
- **Streaming Quality Monitor**: Detects language mismatches, repetition patterns, and format deviations during SSE streaming in real time, triggering early termination and regeneration.

### 4. Content Intelligence

Automatically discovers relationships between notes and supports classification.

- **AI Auto-Tagging**: AI generates tags automatically upon note creation or synchronization. Supports individual and batch tagging with manual editing. Tag-based filtering is available on Notes and Search pages.
- **Related Notes Discovery**: Recommends related notes based on pgvector cosine similarity. Reflected in the note detail side panel and knowledge graph.
- **Forgotten Note Rediscovery**: Automatically surfaces old but contextually relevant notes on the Dashboard. Combines daily recommendations with context-based suggestions.

### 5. Multimodal Processing

Extracts searchable text from non-text content.

- **PDF Text Extraction**: Extracts text from PDF attachments using pymupdf, feeding results into the embedding pipeline.
- **OCR Pipeline**: Extracts text from images via AI Vision models or the PaddleOCR-VL local engine. Results are automatically indexed for search. Individual image OCR is accessible via right-click context menu, with results displayed in markdown format.

### 6. AI Librarian

Enter natural language questions instead of keywords in the search bar. The AI Librarian uses semantic search to find relevant notes and returns results with relevance scores. Indexing status is monitored in real time, and re-indexing can be triggered directly from the UI.

### 7. Knowledge Graph

A force-directed graph visually represents inter-note similarity.

- **Global Graph**: Relationship map of all notes (Obsidian-style)
- **Discovery**: AI clustering by notebook — automatically groups similar notes with cluster insights
- Adjustable similarity threshold (30%–95%) and note count (50–500)

### 8. Synology NAS Integration

- **Bidirectional Sync**: Pull & Push synchronization of NoteStation note/notebook structures
- **Image Sync**: Extract and display attached images from FileStation
- **NSX Import**: Direct import of NoteStation export files (.nsx)
- Sync status tracking with change logging (added / modified / deleted)

### 9. Note Editor

Provides a Tiptap-based rich text editor.

- Notes are immediately editable upon opening (always-edit mode)
- Auto-save: 3-second debounce, 30-second periodic, save-on-navigate
- Real-time word/character count display
- Local notes can be synced to NAS

### 10. Note Sharing

Generate token-based public links with configurable expiration (1 day / 7 days / 30 days / unlimited), revocable at any time. Provides a public view accessible without authentication.

### 11. OAuth Integration

| Provider | Method | Benefit |
|----------|--------|---------|
| Google | OAuth 2.0 | Use Gemini with your own Google API quota |
| OpenAI | PKCE Flow | Make API calls with your ChatGPT Plus/Pro subscription |

Leverages existing subscriptions without separate API keys. Tokens are stored with Fernet encryption.

### 12. Administration & Collaboration

**Admin Dashboard**: User/note/embedding/storage statistics, per-table DB details, NAS and LLM provider monitoring.

**Operations Console**: One-click NAS sync and embedding indexing, search engine availability monitoring, activity logs across 10 categories.

**Team Collaboration**: 4-tier role system (Owner → Admin → Member → Viewer), email invitation-based member management, signup approval and account management.

### 13. Internationalization

Supports Korean/English UI switching with automatic browser language detection. Manual override is available in the settings page. Frontend and backend messages are internationalized via react-i18next.

---

## Tech Stack

| Area | Technology | Notes |
|------|-----------|-------|
| Backend | FastAPI + SQLAlchemy 2.0 (async) | Async high-performance, auto OpenAPI docs |
| Frontend | React 19 + Vite + TailwindCSS + shadcn/ui | Code splitting, virtualized lists |
| Database | PostgreSQL 16 + pgvector | Native vector search support |
| AI | OpenAI, Anthropic, Google, ZhipuAI | Multi-provider, vendor-agnostic |
| Auth | JWT + OAuth 2.0 (Google, OpenAI PKCE) | Token-based authentication |
| Search | tsvector + pg_trgm + pgvector + RRF | Single-DB hybrid search |
| Infra | Docker Compose (3 containers) | Single-command deployment |
| Visualization | react-force-graph-2d | Interactive knowledge graph |
| i18n | react-i18next | Multilingual support |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React 19)                  │
│  ┌──────────┬──────────┬───────────┬──────────┬──────────┐  │
│  │Dashboard │  Notes   │  Search   │    AI    │  Graph   │  │
│  │          │ Notebooks│ Librarian │ Analysis │Discovery │  │
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
│ 16 + pgvec  │ │ NoteStation  │ │   APIs (4)   │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Synology NAS (with NoteStation installed) — optional
- At least 1 AI API key (OpenAI / Anthropic / Google / ZhipuAI) — optional

### Installation (Recommended)

The interactive install script handles environment setup, container launch, and DB migration automatically.

```bash
git clone https://github.com/your-org/labnote-ai.git
cd labnote-ai
bash install.sh
```

Follow the prompts to enter your NAS address and AI API keys (press Enter to skip). After completion, sign up at http://localhost:3000 to start using the application.

> **Non-interactive mode**: `bash install.sh -y` — installs with defaults, no prompts. NAS and AI keys can be added later by editing `.env` or through the web UI settings.

<details>
<summary><strong>Manual Installation</strong></summary>

```bash
# 1. Clone the repository
git clone https://github.com/your-org/labnote-ai.git
cd labnote-ai

# 2. Configure environment variables
cp .env.example .env
# Edit .env to set JWT_SECRET, NAS info, and API keys

# 3. Launch
docker compose up -d --build

# 4. Run DB migrations
docker compose exec backend alembic upgrade head

# 5. Access
# Frontend: http://localhost:3000
# Backend API: http://localhost:8001
# API Docs: http://localhost:8001/docs
```

</details>

### Local Development

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

## Project Structure

```
labnote-ai/
├── docker-compose.yml          # 3-container orchestration
├── .env.example                # Environment variable template
│
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI entrypoint
│   │   ├── models.py           # SQLAlchemy ORM models
│   │   ├── api/                # REST API routers
│   │   ├── ai_router/          # Multi-provider AI integration
│   │   │   ├── router.py       # Provider auto-detection & routing
│   │   │   ├── providers/      # OpenAI, Anthropic, Google, ZhipuAI
│   │   │   ├── prompts/        # Task-specific prompt templates
│   │   │   ├── quality_gate.py # Checklist-based quality gate
│   │   │   └── stream_monitor.py # Streaming quality monitor
│   │   ├── search/             # Hybrid search engine
│   │   │   ├── engine.py       # FTS + Semantic + RRF fusion
│   │   │   ├── judge.py        # Adaptive search JUDGE
│   │   │   ├── refinement.py   # Multi-turn refinement
│   │   │   ├── embeddings.py   # Text → vector conversion
│   │   │   └── indexer.py      # Batch indexing
│   │   ├── services/           # Business logic
│   │   │   ├── auto_tagger.py  # AI auto-tagging
│   │   │   ├── related_notes.py # Related notes discovery
│   │   │   ├── rediscovery.py  # Note rediscovery
│   │   │   ├── pdf_extractor.py # PDF text extraction
│   │   │   └── ocr_service.py  # OCR pipeline
│   │   └── synology_gateway/   # Synology NAS API wrappers
│   ├── alembic/                # DB migrations
│   └── tests/                  # pytest tests
│
├── frontend/
│   ├── src/
│   │   ├── pages/              # Pages (with code splitting)
│   │   ├── components/         # shadcn/ui + custom components
│   │   ├── hooks/              # TanStack Query, SSE, OAuth hooks
│   │   ├── lib/                # API client, utilities
│   │   └── i18n/               # Translation resources
│   └── e2e/                    # Playwright E2E tests
│
└── docs/
    ├── screenshots/            # Feature screenshots
    ├── plans/                  # Design documents
    └── roadmap/                # Detailed roadmap plans
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|:--------:|
| `DATABASE_URL` | PostgreSQL connection URL | Auto |
| `JWT_SECRET` | JWT signing key | Yes |
| `SYNOLOGY_URL` | Synology NAS address | - |
| `SYNOLOGY_USER` | NAS username | - |
| `SYNOLOGY_PASSWORD` | NAS password | - |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `GOOGLE_API_KEY` | Google Gemini API key | - |
| `ZHIPUAI_API_KEY` | ZhipuAI API key | - |
| `OAUTH_ENCRYPTION_KEY` | OAuth token encryption key (Fernet) | - |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID | - |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret | - |

> NAS and AI keys are optional. Without NAS, notes can still be used via NSX file import. Without AI keys, search and note management features remain fully functional.

---

## Testing

```bash
# Backend — full test suite
cd backend && pytest --tb=short

# Backend — coverage report
cd backend && pytest --cov=app --cov-report=term-missing

# Frontend — unit tests
cd frontend && npm test

# Frontend — Playwright E2E tests
cd frontend && npm run test:e2e

# Linting
cd backend && ruff check . && ruff format --check .
cd frontend && npm run lint
```

---

## API Documentation

After launching the backend, access the auto-generated API documentation:

- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the detailed roadmap.

- [x] Phase 1 — Search Enhancement (Why matched, Adaptive Search, Multi-turn Refinement)
- [x] Phase 2 — AI Quality Gates (Checklist, QA Evaluation, Stream Monitor)
- [x] Phase 3 — Content Intelligence (Auto-Tagging, Related Notes, Rediscovery)
- [ ] Phase 4 — Multimodal (PDF extraction done, OCR done, external content capture pending)
- [ ] Phase 5 — Evaluation Infrastructure (A/B framework, metrics dashboard, feedback loop)

---

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
The obligation to disclose modified source code applies even when the software is offered as a network service.
