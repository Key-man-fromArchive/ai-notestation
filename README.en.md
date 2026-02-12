<p align="right">
  <a href="README.md"><img src="https://img.shields.io/badge/🌐_한국어-여기_클릭-blue?style=for-the-badge&logoColor=white" alt="Korean Version" /></a>
</p>

<p align="center">
  <h1 align="center">LabNote AI</h1>
  <p align="center">
    <strong>An AI research platform that brings your Synology NAS notes to life</strong>

  AI-powered note-taking for Synology Note Station, Synology NAS, Note Station, LLM integration synology, note-station, nas, llm, ai-notes, note-taking, obsidian-like
  </p>
  <p align="center">
    <a href="#quickstart">Quick Start</a> · <a href="#features">Features</a> · <a href="#architecture">Architecture</a> · <a href="#api">API Docs</a>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.0-blue?style=for-the-badge" alt="v1.2.0" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/PostgreSQL_16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/pgvector-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="pgvector" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/TailwindCSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
</p>

---

## Why LabNote AI?

Synology NoteStation is a great note-taking tool. But once you've accumulated hundreds or thousands of notes, have you ever thought **"I know I wrote it down somewhere..."** and just couldn't find it?

LabNote AI imports your NoteStation notes and adds **AI-powered search**, **insight extraction**, **research note writing**, and **knowledge graph visualization**. Your dormant notes finally become **living, actionable knowledge**.

> Get started with a single command: `docker compose up -d`

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="800" />
</p>

---

## What's New in v1.2.0

### Always-Editable Notes with Auto-Save
Notes now feel like a real notebook, not a bulletin board. No more clicking "Edit" — just open and start writing.

- **Always editable**: Editor is active the moment you open a note
- **Auto-save**: Saves automatically 3 seconds after you stop typing
- **Periodic save**: Saves every 30 seconds during continuous editing
- **Save on navigate**: Auto-saves when leaving the page
- **Ctrl+S**: Manual save still works
- **Status indicator**: Subtle "Saved" / "Saving..." / "Save failed" in the footer

### Note Editor UX Improvements
- Real-time word/character count updates
- Toolbar active state reflects current formatting
- New "Create Note" UI with notebook selection
- Local-only notes can now be synced to NAS
- Login page language selector

---

## What's New in v1.1.0

### Internationalization (i18n)
- **Korean / English** UI switching — full frontend + backend i18n via react-i18next
- 15+ files, ~150 translation keys applied

### Search Parameter Tuning UI
- **12 search algorithm parameters** adjustable directly from the UI (weights, thresholds, RRF k, etc.)
- Search parameter help modal — visual guide for each parameter's role and recommended values

### NAS Image Sync Stabilization
- Editor display + push round-trip stabilization
- Automatic extraction fix for large data URI images (365KB+)

### Other Fixes
- i18n TypeScript build error fixes
- Settings.tsx missing useEffect import fix

---

<h2 id="features">Features</h2>

### 1. Search — Keyword Search & AI Semantic Search

| Mode | Engine | Description |
|------|--------|-------------|
| **Full-Text Search (FTS)** | PostgreSQL tsvector + BM25 | Precise keyword matching with Korean morphological analysis |
| **Fuzzy Search (Trigram)** | pg_trgm | Typo-tolerant string similarity matching |
| **Semantic Search** | pgvector + OpenAI Embeddings | Finds notes with similar meaning and context (AI Librarian) |

The main search merges FTS + Trigram results using RRF (Reciprocal Rank Fusion) for fast, accurate keyword search. Semantic search is available on the AI Librarian page for natural language queries.

**New in v1.1.0**: 12-parameter search algorithm tuning UI with a help modal. Adjust weights, thresholds, and RRF k values directly to optimize search quality.

<p align="center">
  <img src="docs/screenshots/search.png" alt="Search" width="800" />
</p>

### 2. AI Analysis — 4 AI Providers, One Interface

```
OpenAI · Anthropic · Google · ZhipuAI
```

Register a single API key and start using AI instantly. Register multiple providers simultaneously and **switch models freely**. Responses stream in real time via SSE. Anthropic supports OAuth integration with 8 models (Claude Opus 4.6 through Claude 3 Haiku).

**5 AI Features** — available on the AI Analysis page and directly from the **Note Detail page**:

| Feature | Description |
|---------|-------------|
| **Insight** | Automatically extract key insights from notes |
| **Search QA** | Question-answering based on search results |
| **Writing Assist** | Research note draft writing assistance |
| **Proofreading** | Spelling and grammar correction |
| **Templates** | Generate note templates for specific purposes |

Also supports multimodal image analysis and automatic title/tag generation.

<p align="center">
  <img src="docs/screenshots/note-ai-panel.png" alt="Note AI Analysis Panel" width="800" />
</p>

### 3. AI Librarian — Ask in Natural Language, Get Answers from Your Notes

Instead of keywords, **ask a question** in the search bar.

> *"What was the migration schedule we discussed in last month's meeting?"*

The AI Librarian uses semantic search to find relevant notes and displays results with relevance scores. Monitor indexing status in real time, and trigger re-indexing directly from the UI when needed.

<p align="center">
  <img src="docs/screenshots/librarian.png" alt="AI Librarian" width="800" />
</p>

### 4. Knowledge Graph — Discover Hidden Connections Between Notes

A **force-directed graph** visually reveals similarity between notes. Connection lines are computed using pgvector-based cosine similarity, letting you see your knowledge network at a glance.

- **Global Graph**: A map of all note relationships (Obsidian-style)
- **Discovery**: AI clustering by notebook — automatically groups similar notes, with AI cluster insights
- Adjustable similarity threshold (30%–95%) and note count (50–500)
- Auto-refresh after indexing completes

<p align="center">
  <img src="docs/screenshots/graph.png" alt="Knowledge Graph" width="800" />
</p>

### 5. Full Synology NAS Integration

- **Bidirectional Sync**: Import note/notebook structure directly from NoteStation (Pull & Push)
- **Image Sync**: Extract and display attached images from FileStation, with stabilized NAS image round-trip
- **NSX Import**: Directly import NoteStation export files (.nsx)
- Sync status tracking with detailed change logging (added/modified/deleted)

### 6. Note Sharing — Share with a Single Link

Generate token-based public links. Set expiration (1 day / 7 days / 30 days / unlimited) and revoke anytime. Provides a public view accessible to anyone without login.

### 7. OAuth Integration — Use Your Existing Subscriptions

| Provider | Method | Benefit |
|----------|--------|---------|
| **Google** | OAuth 2.0 | Use Gemini with your own Google API quota |
| **OpenAI** | PKCE Flow | Make API calls with your ChatGPT Plus/Pro subscription |

No separate API keys needed — leverage **subscriptions you're already paying for**. Tokens are securely stored with Fernet encryption.

### 8. Admin Dashboard & Operations Console

**Admin Dashboard** — System status at a glance:

- User count, note count, embedding count, storage usage
- Per-table database statistics (row count, size, indexes)
- User management (roles: Owner / Admin / Member / Viewer)
- NAS connection status and LLM provider monitoring

**Operations Console** — Real-time operational management:

- One-click trigger for NAS sync and embedding indexing
- Search engine availability monitoring (FTS / Semantic / Hybrid)
- Activity logs across 10 categories (sync, embedding, auth, note, etc.)

### 9. Team Collaboration

- **Multi-role system**: Owner → Admin → Member → Viewer
- Email invitation-based member management
- Role-based permission separation (settings changes require Admin or above)
- Signup approval and account activation/deactivation

### 10. Internationalization (i18n)

- **Korean / English** UI switching — automatic browser language detection
- react-i18next-based frontend + backend message internationalization
- Language can be changed from the settings page

---

## Tech Stack

| Area | Technology | Rationale |
|------|-----------|-----------|
| **Backend** | FastAPI + SQLAlchemy 2.0 (async) | High-performance async, automatic OpenAPI docs |
| **Frontend** | React 19 + Vite + TailwindCSS + shadcn/ui | Latest React, fast builds, consistent design |
| **Database** | PostgreSQL 16 + pgvector | Native vector search — no separate vector DB needed |
| **AI** | OpenAI, Anthropic, Google, ZhipuAI | Multi-provider — no vendor lock-in |
| **Auth** | JWT + OAuth 2.0 (Google, OpenAI PKCE) | Token-based auth + external AI subscription reuse |
| **Search** | tsvector + pgvector + RRF | Keyword and semantic search in a single database |
| **Infra** | Docker Compose (3 containers) | Full stack deployment with a single command |
| **Visualization** | react-force-graph-2d | Interactive knowledge graph |
| **i18n** | react-i18next | Frontend multilingual support |

---

<h2 id="quickstart">Quick Start</h2>

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

Follow the prompts to enter your NAS address and AI API keys (press Enter to skip). After completion, sign up at http://localhost:3000 to start using the app.

> **Non-interactive mode**: `bash install.sh -y` — installs with defaults, no prompts. You can add NAS and AI keys later by editing the `.env` file or through the web UI settings.

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

<h2 id="architecture">Architecture</h2>

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
│ 16 + pgvec  │ │ NoteStation  │ │   APIs (4)   │
└──────────────┘ └──────────────┘ └──────────────┘
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
│   │   ├── api/                # REST API routers (18 endpoint modules)
│   │   ├── ai_router/          # Multi-provider AI integration
│   │   │   ├── router.py       # Provider auto-detection & routing
│   │   │   ├── providers/      # OpenAI, Anthropic, Google, ZhipuAI
│   │   │   └── prompts/        # Task-specific prompt templates
│   │   ├── search/             # Hybrid search engine
│   │   │   ├── engine.py       # FTS + Semantic + RRF fusion
│   │   │   ├── embeddings.py   # Text → vector conversion
│   │   │   └── indexer.py      # Batch indexing + progress tracking
│   │   ├── synology_gateway/   # Synology NAS API wrappers
│   │   └── services/           # Business logic (sync, auth, OAuth)
│   ├── alembic/                # DB migrations
│   └── tests/                  # pytest tests
│
├── frontend/
│   ├── src/
│   │   ├── pages/              # Pages (with code splitting)
│   │   ├── components/         # shadcn/ui + custom components
│   │   ├── hooks/              # TanStack Query, SSE, OAuth hooks
│   │   ├── lib/                # API client, utilities
│   │   └── i18n/               # Translation resources (ko, en)
│   └── e2e/                    # Playwright E2E tests
│
└── docs/
    ├── screenshots/            # Feature screenshots
    └── plans/                  # Design documents
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

> NAS and AI keys are optional. Without NAS, you can still import notes via NSX files. Without AI keys, search and note management features remain fully functional.

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

<h2 id="api">API Docs</h2>

After launching the backend, access the auto-generated API documentation:

- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

---

## Roadmap

- [x] Anthropic OAuth integration (leverage Claude Pro/Max subscriptions) — 8 models supported
- [x] Multilingual UI (Korean / English) — react-i18next-based full frontend + backend i18n
- [x] Search algorithm parameter tuning UI — 12 parameters adjustable
- [x] NAS image sync stabilization — editor display + push round-trip
- [ ] Note version history
- [ ] Mobile-optimized PWA
- [ ] Plugin system
- [ ] Note export (Markdown / PDF)

---

## License

MIT License — free to use and modify.
