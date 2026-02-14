# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## NotebookLM
Project notebook alias: `labnote`

## Project Overview

LabNote AI enhances Synology NoteStation with AI capabilities: hybrid search (FTS + semantic), AI-powered insights, research note generation, spell checking, and template creation.

**Tech Stack**: FastAPI (Python 3.12+) + React 19 + Vite + TailwindCSS + shadcn/ui + PostgreSQL 16 + pgvector

## Development Commands

```bash
# Full stack (Docker)
docker compose up -d

# Backend development
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# Frontend development
cd frontend
npm install
npm run dev

# Run all backend tests
cd backend && pytest --tb=short

# Run single backend test file
cd backend && pytest tests/test_ai_router.py -v

# Run tests matching pattern
cd backend && pytest -k "test_hybrid" -v

# Backend with coverage
cd backend && pytest --cov=app --cov-report=term-missing

# Frontend tests
cd frontend && npm test           # run once
cd frontend && npm run test:watch # watch mode
cd frontend && npm run test:e2e   # Playwright e2e

# Linting
cd backend && ruff check .
cd backend && ruff format .
cd frontend && npm run lint

# DB migrations
cd backend && alembic upgrade head           # apply all
cd backend && alembic revision --autogenerate -m "description"  # create new
```

## Architecture

### Backend (`backend/app/`)

**Entry point**: `main.py` - FastAPI app with lifespan, CORS, and router includes for all API endpoints under `/api`.

**Key Modules**:

- `ai_router/` - Multi-provider AI integration with unified interface
  - `router.py` - `AIRouter` class auto-detects providers from env vars, routes requests to correct provider
  - `providers/base.py` - `AIProvider` ABC defining `chat()`, `stream()`, `available_models()`
  - `providers/` - OpenAI, Anthropic, Google, ZhipuAI implementations
  - `prompts/` - Task-specific prompt templates (insight, writing, spellcheck, search_qa, template)

- `search/` - Hybrid search engine
  - `engine.py` - `FullTextSearchEngine` (tsvector), `SemanticSearchEngine` (pgvector), `HybridSearchEngine` (RRF merge)
  - `embeddings.py` - `EmbeddingService` for text→vector conversion
  - `indexer.py` - `NoteIndexer` for indexing notes

- `synology_gateway/` - Synology NAS API wrappers (NoteStation, FileStation)

- `services/` - Business logic (sync, auth, OAuth)

- `api/` - REST endpoints: auth, notes, notebooks, search, ai, sync, settings, oauth, files, nsx, members, sharing

**Database**: SQLAlchemy 2.0 async with asyncpg. Models in `models.py`. Migrations via Alembic.

### Frontend (`frontend/src/`)

- `pages/` - Route components with React.lazy code splitting
- `components/` - shadcn/ui based, includes virtualized list for 1000+ notes
- `hooks/` - TanStack Query for data fetching, SSE streaming hooks
- `lib/` - API client, query configuration

### Key Patterns

**AI Streaming**: SSE via FastAPI `StreamingResponse`. Router yields `data: {json}\n\n` chunks, ends with `data: [DONE]\n\n`.

**Progressive Search**: FTS returns instantly (Phase 1), semantic search runs async, results merged via RRF (Phase 2).

**Provider Auto-detection**: `AIRouter` checks env vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) and registers available providers.

## Conventions

- Commits: Conventional Commits (Korean allowed)
- Branches: `main`, `phase/{N}-{feature}` (Git Worktree)
- Backend: ruff (lint + format)
- Frontend: ESLint + Prettier
- UI: Light mode only
