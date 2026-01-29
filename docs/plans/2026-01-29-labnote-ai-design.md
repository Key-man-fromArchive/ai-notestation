# LabNote AI - System Design Document

## 1. Overview

LabNote AI is a web application that enhances Synology NoteStation with AI-powered search, insight generation, research note writing assistance, spell checking, and template generation. It integrates multiple cloud AI services (Gemini, GPT, Claude, GLM4.7) through a unified router and provides hybrid search (full-text + semantic) over NoteStation notes.

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TailwindCSS + shadcn/ui (Light mode only) + TanStack Query + react-router |
| Backend | FastAPI (Python 3.12+) |
| Database | PostgreSQL 16 + pgvector |
| AI Integration | Unified router (OpenAI, Anthropic, Google GenAI, ZhipuAI SDKs) |
| Synology API | `synology-api` Python library |
| Deployment | Docker Compose on Synology NAS |

---

## 2. System Architecture

```
+-----------------------------------------------------+
|                  React Web App                       |
|          (Vite + TailwindCSS + shadcn/ui)           |
+------------------------+----------------------------+
                         | REST / SSE (streaming)
+------------------------v----------------------------+
|                 FastAPI Backend                       |
|  +----------+ +----------+ +----------------------+ |
|  | Synology | | AI       | | Search               | |
|  | Gateway  | | Router   | | Engine               | |
|  |          | |          | | (FTS + Vector)       | |
|  +----+-----+ +----+-----+ +----------+-----------+ |
+-------|-----------|--------------------|-------------+
        |           |                    |
   +----v----+  +---v----+   +-----------v--+
   |Synology |  |Cloud AI|   |PostgreSQL    |
   |NAS API  |  |Services|   |+ pgvector    |
   |(Note    |  |GPT     |   |              |
   | Station |  |Claude  |   |              |
   | File    |  |Gemini  |   |              |
   | Station)|  |GLM     |   |              |
   +---------+  +--------+   +--------------+
```

### Core Components

1. **Synology Gateway** - Wraps `synology-api` library to expose NoteStation/FileStation as FastAPI endpoints. Handles authentication, session management, and note synchronization.

2. **AI Router** - Abstracts all AI requests through a single interface. Users can select models manually or let the system auto-route based on task type. Each provider's SDK is called internally.

3. **Search Engine** - PostgreSQL `tsvector` for full-text search, `pgvector` for semantic search. Notes fetched from NoteStation are periodically indexed for searchability.

---

## 3. Synology Gateway

### Directory Structure

```
synology_gateway/
├── client.py          # Synology connection management (auth, session)
├── notestation.py     # NoteStation API wrapper
└── filestation.py     # FileStation API wrapper (for attachments)
```

### NoteStation API Endpoints

| API Endpoint | Role | Synology API Call |
|---|---|---|
| `GET /api/notes?offset=0&limit=50` | List notes (paginated) | `note_list()` |
| `GET /api/notes/{id}` | Get specific note | `specific_note_id(id)` |
| `GET /api/notebooks` | List notebooks | `notebooks_info()` |
| `GET /api/tags` | List tags | `tags_info()` |
| `GET /api/todos` | List todo items | `todo()` |
| `GET /api/shortcuts` | List shortcuts | `shortcuts()` |
| `GET /api/smart` | Smart notes | `smart()` |

### Authentication Flow

- FastAPI server authenticates to Synology NAS at startup using `synology-api` library
- Session is maintained and automatically re-authenticated on expiry
- Synology credentials are managed via environment variables (`.env`)
- Web app user authentication is handled separately via JWT (can be decoupled from NAS accounts)

### Note Synchronization

- Notes are fetched from NoteStation and cached in PostgreSQL
- Periodic sync (change detection) or manual trigger
- Note body (HTML) is parsed to extract plain text and structure
- Extracted text is stored as full-text index + vector embeddings

---

## 4. AI Router

### Directory Structure

```
ai_router/
├── router.py          # Unified routing logic
├── providers/
│   ├── base.py        # Abstract Provider interface
│   ├── openai.py      # GPT-4o, GPT-4o-mini
│   ├── anthropic.py   # Claude 3.5 Sonnet, Claude 3 Haiku
│   ├── google.py      # Gemini 2.0 Flash, Gemini Pro
│   └── zhipuai.py     # GLM-4, GLM-4-Flash
├── prompts/
│   ├── insight.py     # Insight extraction prompts
│   ├── search_qa.py   # Search Q&A prompts
│   ├── writing.py     # Research note writing assistance
│   ├── spellcheck.py  # Spell/grammar checking
│   └── template.py    # Template generation
└── schemas.py         # Request/response schemas
```

### Unified Provider Interface

```python
class AIProvider(ABC):
    @abstractmethod
    async def chat(self, messages: list[Message], model: str, **kwargs) -> AIResponse:
        ...

    @abstractmethod
    async def stream(self, messages: list[Message], model: str, **kwargs) -> AsyncIterator[str]:
        ...

    @abstractmethod
    def available_models(self) -> list[ModelInfo]:
        ...
```

### AI Features (5 Core Functions)

| Feature | Description | Input | Output |
|---|---|---|---|
| **Insight Extraction** | Analyze note content, summarize key points, discover patterns, suggest related note connections | One or multiple notes | Structured insights |
| **AI Search (RAG)** | Natural language question -> find related notes + generate answer | Question text | Answer + source notes |
| **Research Note Writing** | Generate drafts based on topic/keywords, expand from existing notes | Topic/keywords/existing notes | Markdown draft |
| **Spell Checking** | Korean/English spelling, grammar, expression correction | Note text | Corrected text + diff |
| **Template Generation** | Structured templates for experiment logs, paper reviews, meeting notes | Template type | Markdown template |

### Streaming Strategy

- AI responses use **SSE (Server-Sent Events)** via FastAPI `StreamingResponse`
- Frontend consumes via `fetch()` + `ReadableStream` (not EventSource, for better control)
- Each stream request includes an `AbortController` signal for cleanup on page navigation
- Backend endpoint: `POST /api/ai/stream` returns `text/event-stream`
- Non-streaming fallback: `POST /api/ai/chat` for short tasks (spell check, template)

### Routing Strategy

- **Manual**: User selects model in UI
- **Auto mode**: Routes based on task type and language (e.g., Korean spell check -> GPT or GLM, fast responses -> Flash models)
- **Settings page**: Register/manage API keys for each provider

---

## 5. Search Engine & Database

### PostgreSQL Schema

```sql
-- Note cache (synced from NoteStation)
CREATE TABLE notes (
    id           SERIAL PRIMARY KEY,
    synology_id  VARCHAR(255) UNIQUE NOT NULL,
    notebook_id  VARCHAR(255),
    title        TEXT NOT NULL,
    content_html TEXT,
    content_text TEXT,
    tags         TEXT[],
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    synced_at    TIMESTAMPTZ DEFAULT NOW(),

    -- Full-text search index
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(content_text, '')), 'B')
    ) STORED
);

-- Vector embeddings (for semantic search)
CREATE TABLE note_embeddings (
    id         SERIAL PRIMARY KEY,
    note_id    INT REFERENCES notes(id) ON DELETE CASCADE,
    chunk_idx  INT,
    chunk_text TEXT,
    embedding  VECTOR(1536)
);

-- Indexes
CREATE INDEX idx_notes_fts ON notes USING GIN(search_vector);
CREATE INDEX idx_embeddings_vector ON note_embeddings
    USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);

-- User settings
CREATE TABLE settings (
    key   VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL
);
```

### Search Pipeline

```
User Query (debounced 300ms from frontend)
    |
    +-> [Phase 1: Instant] Full-text Search (tsvector, keyword matching)
    |       -> Return top N results immediately to frontend
    |
    +-> [Phase 2: Async] Query embedding -> pgvector cosine similarity
    |       -> Return top N results as they become available
    |
    +-> [Phase 3: Merge] RRF (Reciprocal Rank Fusion)
            -> Re-rank combined results -> Update frontend
```

Progressive search: full-text results appear instantly, semantic results merge in asynchronously. This avoids waterfall where both searches block each other.

### Embedding Strategy

- Embeddings are auto-generated when notes are synced
- Long notes are split into ~500-token chunks with 50-token overlap
- Default embedding model: OpenAI `text-embedding-3-small` (1536 dimensions), configurable in settings

---

## 6. Frontend UI

### Design Principles

- **Light mode only** - Clean, bright note-taking interface. No dark mode.
- **Accessibility first** - Semantic HTML, ARIA attributes, keyboard navigation, focus management
- **Motion respectful** - All animations honor `prefers-reduced-motion: reduce` via TailwindCSS `motion-reduce:` variants

### Page Structure

```
src/
├── pages/                          # Code-split via React.lazy() + Suspense
│   ├── Dashboard.tsx               # Main dashboard (recent notes, quick actions)
│   ├── Notes.tsx                   # Note list + search (filter by notebook)
│   ├── NoteDetail.tsx              # Individual note view + AI side panel
│   ├── Search.tsx                  # Unified search (FTS + semantic + AI Q&A)
│   ├── AIWorkbench.tsx             # AI workspace (insights, writing, spell check)
│   └── Settings.tsx                # API key management, sync settings, model selection
├── components/
│   ├── NoteCard.tsx                # Note card component
│   ├── NoteList.tsx                # Virtualized note list (@tanstack/react-virtual)
│   ├── AIChat.tsx                  # AI chat/streaming response UI (SSE consumer)
│   ├── SearchBar.tsx               # Global search bar (Cmd+K, debounced 300ms)
│   ├── MarkdownEditor.tsx          # Markdown editor (dynamic import, ~100KB+)
│   ├── MarkdownRenderer.tsx        # Safe render (react-markdown + rehype-sanitize)
│   ├── ModelSelector.tsx           # AI model selection dropdown
│   ├── ErrorBoundary.tsx           # Error boundary with fallback UI
│   └── EmptyState.tsx              # Reusable empty/error/loading states
├── hooks/
│   ├── useNotes.ts                 # TanStack Query: note list (paginated, cached)
│   ├── useNote.ts                  # TanStack Query: single note
│   ├── useSearch.ts                # TanStack Query: search with debounce
│   ├── useAIStream.ts              # SSE streaming hook (fetch + ReadableStream + AbortController)
│   └── useSync.ts                  # TanStack Query: sync status
├── lib/
│   ├── api.ts                      # API client (fetch wrapper)
│   └── queryClient.ts             # TanStack Query client config
└── types/
```

### Code Splitting Strategy

All pages are lazy-loaded. Heavy components are dynamically imported:

```tsx
// Pages: React.lazy + Suspense
const AIWorkbench = lazy(() => import('./pages/AIWorkbench'));
const NoteDetail = lazy(() => import('./pages/NoteDetail'));

// Heavy components: dynamic import
const MarkdownEditor = lazy(() => import('./components/MarkdownEditor'));
```

### Data Fetching (TanStack Query)

```tsx
// Paginated note list with caching
const { data, fetchNextPage } = useInfiniteQuery({
  queryKey: ['notes', notebookId],
  queryFn: ({ pageParam = 0 }) => fetchNotes({ offset: pageParam, limit: 50 }),
  getNextPageParam: (lastPage) => lastPage.nextOffset,
  staleTime: 5 * 60 * 1000,  // 5 min cache
});
```

### Note List Virtualization

Notes.tsx uses `@tanstack/react-virtual` for rendering large lists:
- Only visible items are rendered in the DOM
- Infinite scroll triggers `fetchNextPage` at scroll threshold
- Supports 1000+ notes without performance degradation

### URL State & Routing (react-router)

| URL | Page | State in URL |
|---|---|---|
| `/` | Dashboard | - |
| `/notes` | Notes | `?notebook={id}&q={query}` |
| `/notes/:id` | NoteDetail | - |
| `/search` | Search | `?q={query}&type=hybrid\|fts\|semantic` |
| `/ai` | AIWorkbench | `?notes={id1,id2}&action={insight\|write\|spell\|template}` |
| `/settings` | Settings | - |

All search queries and filters are reflected in URL for deep linking and browser back/forward support.

### Cmd+K Search Flow

1. User presses Cmd+K → modal opens (`role="dialog"`, `aria-modal="true"`, focus trap)
2. Input debounced at 300ms
3. Phase 1: full-text results appear instantly
4. Phase 2: semantic results merge in asynchronously, re-ranking shown results
5. Escape or click outside closes modal, returns focus to previous element

### AI Streaming UI

- `useAIStream` hook wraps `fetch()` + `ReadableStream` for SSE consumption
- `AbortController` cancels stream on unmount or page navigation
- Streaming tokens rendered progressively in `AIChat.tsx`
- AI-generated markdown rendered via `react-markdown` + `rehype-sanitize` (XSS prevention)
- Code blocks use `rehype-highlight` (lazy loaded)
- `aria-live="polite"` on the streaming response container for screen reader updates

### Accessibility (a11y)

- shadcn/ui (Radix-based) provides accessible primitives for dialogs, dropdowns, tooltips
- Custom components must include:
  - `aria-label` on all icon-only buttons
  - `role="dialog"` + `aria-modal` + focus trap on modals (Cmd+K, confirmations)
  - `aria-live="polite"` on AI streaming responses
  - Full keyboard navigation (Tab, Escape, Enter, Arrow keys)
- All animations use TailwindCSS `motion-reduce:transition-none` for users with `prefers-reduced-motion`

### Error & Empty States

Each page handles 4 states: loading, error, empty, success.

| Scenario | UI Response |
|---|---|
| NAS connection failed | Error banner + "Check connection" link to Settings |
| AI API key not set | CTA banner → Settings page to configure keys |
| Sync failed | Toast notification + retry button |
| Search: no results | Suggestions to refine query + try semantic search |
| Note list empty | "No notes yet" + link to NoteStation |
| AI stream error | Inline error message + retry button |

### Key UI Flows

- **Cmd+K Search**: Global search from anywhere. Debounced progressive hybrid search (FTS instant, semantic async)
- **Note Detail View**: Left side shows note content, right side shows AI panel (insights, corrections, related notes)
- **AI Workbench**: Select notes -> choose AI function (insight/writing/spell check/template) -> SSE streaming result -> save to NoteStation

---

## 7. Docker Compose Deployment

```yaml
services:
  frontend:
    build: ./frontend
    ports: ["3000:80"]
    restart: unless-stopped

  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: .env
    depends_on: [db]
    restart: unless-stopped

  db:
    image: pgvector/pgvector:pg16
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      POSTGRES_DB: labnote
      POSTGRES_USER: labnote
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    restart: unless-stopped

volumes:
  pgdata:
```

### Environment Variables (.env)

```
# Synology NAS
SYNOLOGY_HOST=192.168.x.x
SYNOLOGY_PORT=5001
SYNOLOGY_USERNAME=admin
SYNOLOGY_PASSWORD=****
SYNOLOGY_SECURE=true

# Database
DB_PASSWORD=****
DATABASE_URL=postgresql://labnote:${DB_PASSWORD}@db:5432/labnote

# AI API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
ZHIPUAI_API_KEY=...

# JWT
JWT_SECRET=****
```

---

## 8. Project Directory Structure

```
labnote-ai/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Settings (pydantic-settings)
│   │   ├── database.py          # DB connection, session
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── synology_gateway/
│   │   │   ├── client.py
│   │   │   ├── notestation.py
│   │   │   └── filestation.py
│   │   ├── ai_router/
│   │   │   ├── router.py
│   │   │   ├── providers/
│   │   │   │   ├── base.py
│   │   │   │   ├── openai.py
│   │   │   │   ├── anthropic.py
│   │   │   │   ├── google.py
│   │   │   │   └── zhipuai.py
│   │   │   ├── prompts/
│   │   │   │   ├── insight.py
│   │   │   │   ├── search_qa.py
│   │   │   │   ├── writing.py
│   │   │   │   ├── spellcheck.py
│   │   │   │   └── template.py
│   │   │   └── schemas.py
│   │   ├── search/
│   │   │   ├── engine.py        # Hybrid search logic
│   │   │   ├── indexer.py       # Note indexing + embedding
│   │   │   └── embeddings.py    # Embedding generation
│   │   ├── api/
│   │   │   ├── notes.py         # /api/notes endpoints
│   │   │   ├── search.py        # /api/search endpoints
│   │   │   ├── ai.py            # /api/ai endpoints
│   │   │   ├── sync.py          # /api/sync endpoints
│   │   │   └── settings.py      # /api/settings endpoints
│   │   └── services/
│   │       ├── sync_service.py  # Note synchronization logic
│   │       └── auth_service.py  # JWT authentication
│   └── tests/
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                    # React.lazy page imports + Suspense
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Notes.tsx
│   │   │   ├── NoteDetail.tsx
│   │   │   ├── Search.tsx
│   │   │   ├── AIWorkbench.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/
│   │   │   ├── NoteCard.tsx
│   │   │   ├── NoteList.tsx           # Virtualized (@tanstack/react-virtual)
│   │   │   ├── AIChat.tsx             # SSE streaming consumer
│   │   │   ├── SearchBar.tsx          # Cmd+K, debounced, a11y modal
│   │   │   ├── MarkdownEditor.tsx     # Dynamic import (heavy)
│   │   │   ├── MarkdownRenderer.tsx   # react-markdown + rehype-sanitize
│   │   │   ├── ModelSelector.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   └── EmptyState.tsx
│   │   ├── hooks/
│   │   │   ├── useNotes.ts            # TanStack Query (paginated)
│   │   │   ├── useNote.ts
│   │   │   ├── useSearch.ts           # Debounced progressive search
│   │   │   ├── useAIStream.ts         # SSE + AbortController
│   │   │   └── useSync.ts
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── queryClient.ts
│   │   └── types/
│   └── public/
└── docs/
    ├── plans/
    └── Synology_File_Station_API_Guide.md
```
