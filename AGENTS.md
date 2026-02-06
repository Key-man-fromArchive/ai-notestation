# AGENTS.md

This file is for agentic coding assistants operating in this repo.
It summarizes how to build, test, lint, and follow repo conventions.

Repository: LabNote AI (FastAPI + React 19 monorepo)
Root: /mnt/docker/labnote-ai

-----------------------------------------------------------------------
Quick Commands
-----------------------------------------------------------------------

Docker (full stack)
- docker compose up -d

Backend (FastAPI)
- cd backend
- pip install -e ".[dev]"
- uvicorn app.main:app --reload --port 8000

Frontend (React + Vite)
- cd frontend
- npm install
- npm run dev

-----------------------------------------------------------------------
Build / Lint / Test
-----------------------------------------------------------------------

Backend (Python)
- Tests: cd backend && pytest --tb=short
- Lint:  cd backend && ruff check .
- Coverage config: pyproject.toml (fail_under=70, omit app/main.py)

Run a single backend test (pytest conventions)
- cd backend && pytest tests/test_file.py
- cd backend && pytest tests/test_file.py::test_name
- cd backend && pytest -k "partial_name"

Frontend (TypeScript)
- Build: cd frontend && npm run build
- Tests: cd frontend && npm test
- Watch: cd frontend && npm run test:watch
- Coverage: cd frontend && npm run test:coverage
- Lint: cd frontend && npm run lint
- Format: cd frontend && npm run format

Run a single frontend test (Vitest conventions)
- cd frontend && npm test -- -t "test name"
- cd frontend && npm test -- path/to/file.test.tsx
- cd frontend && npm run test:watch -- -t "test name"

-----------------------------------------------------------------------
Project Structure
-----------------------------------------------------------------------

backend/
- app/           FastAPI app, routers, services
- alembic/       DB migrations
- tests/         Pytest tests

frontend/
- src/pages/     Page-level components (React.lazy split)
- src/components/ Shared UI components
- src/hooks/     Custom hooks (TanStack Query, SSE, OAuth)
- src/lib/       API client and utilities
- src/__tests__/ Component tests (see @TEST headers)

docs/
- plans/         Design docs and task plans

-----------------------------------------------------------------------
Code Style: Backend (Python)
-----------------------------------------------------------------------

Tooling
- Ruff is the linter (pyproject.toml). Line length: 120.
- Target Python: 3.12 (use modern typing).

Imports
- Order: standard library, third-party, local app.
- isort config sets known-first-party = app.

Typing
- Prefer built-in generics (dict[str, str], list[str])
- Use from __future__ import annotations where needed.
- SQLAlchemy models use Mapped[...] and mapped_column.

Naming
- Modules: snake_case
- Classes: PascalCase
- Functions/vars: snake_case

API Conventions
- Routers use FastAPI APIRouter with prefix and tags.
- Request/response schemas use Pydantic BaseModel.
- Use HTTPException with status code + detail.

Error Handling
- Raise explicit HTTPException for API errors.
- Avoid empty catch blocks.
- Log via logging.getLogger(__name__) and logger.warning/info.

Comments & Headers
- Files often start with @TASK and @SPEC metadata.
- Keep or update @TEST headers when adding tests.

Database
- Use SQLAlchemy 2.0 style with async engine.
- Models in app/models.py; migrations in alembic/.

-----------------------------------------------------------------------
Code Style: Frontend (TypeScript / React)
-----------------------------------------------------------------------

Tooling
- TypeScript strict mode is enabled (tsconfig.app.json).
- ESLint config: frontend/eslint.config.js
- Prettier config: frontend/.prettierrc

Formatting (Prettier)
- semi: false
- singleQuote: true
- trailingComma: all
- printWidth: 80
- arrowParens: avoid

Imports
- Use path alias @/ for src (see tsconfig).
- Keep imports grouped by origin (react, third-party, local).

Components
- Prefer function components with typed props.
- Use forwardRef only when needed.
- Use Tailwind utility classes; merge conditionals via cn().

State/Data
- Use TanStack Query for server state (staleTime 5m, gcTime 30m).
- Use SSE streaming hooks where provided.

Styling & Theme
- Light mode only; do not add dark mode styles.
- Use shadcn/ui components when available.

Testing
- Vitest + Testing Library.
- Use user-centric queries and include accessibility checks.

Comments & Headers
- Files often include @TASK / @SPEC / @TEST headers. Preserve them.

-----------------------------------------------------------------------
Architecture Notes
-----------------------------------------------------------------------

- AI streaming is SSE via FastAPI StreamingResponse.
- Search is hybrid: FTS + pgvector with RRF merge.
- Note list uses @tanstack/react-virtual for large lists.

-----------------------------------------------------------------------
Git & Branching
-----------------------------------------------------------------------

- Commit messages: Conventional Commits (Korean allowed).
- Branch strategy: main, phase/{N}-{feature} (Git Worktree).

-----------------------------------------------------------------------
Cursor / Copilot Rules
-----------------------------------------------------------------------

- No .cursor/rules, .cursorrules, or .github/copilot-instructions.md found.
- If these appear later, mirror their guidance here.

-----------------------------------------------------------------------
Agent Hygiene
-----------------------------------------------------------------------

- Prefer small, focused changes.
- Do not introduce new dependencies unless explicitly requested.
- Avoid type-safety escapes (no ts-ignore / as any).
- Keep outputs consistent with existing code patterns.
