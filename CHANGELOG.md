# Changelog

All notable changes to LabNote AI are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased] — Phase 4 (Multimodal) in progress

### Added
- **GLM Model Benchmark**: 10 ZhipuAI models registered based on Z.ai Coding Plan benchmark results; OCR cost optimization (commit 3b35708)
- **PaddleOCR-VL Local Engine**: Local OCR engine integration with engine selection in settings (commit bb5f244)
- **OCR UI Redesign**: Right-click context menu for OCR trigger + markdown modal for results (commit 1bcf591)
- **OCR Pipeline (Task 4-2)**: Image-to-text extraction via AI Vision models; integrates with search indexing (commit 9dd68f4)
- **PDF Text Extraction (Task 4-1)**: Extract searchable text from PDF attachments via pymupdf (commit 38f9ba6)
- **Streaming Quality Monitor (Task 2-3)**: Mid-stream heuristic checks (language mismatch, repetition, format) with auto-retry (commit fcae196)
- **Search QA Quality Evaluation (Task 2-2)**: Correctness + Utility split scoring for QA responses; confidence badges (commit 45946f1)
- **Checklist-Based AI Quality Gate (Task 2-1)**: Task-specific checklist decomposition + self-evaluation + conditional regeneration (commit aa75c54)
- **Multi-turn Search Refinement (Task 1-3)**: AI-powered query expansion/narrowing with "Refine Search" UI and history (commit cfb39a5)
- **Adaptive Search Strategy (Task 1-2)**: JUDGE module evaluates FTS coverage; skips semantic search when unnecessary (commit 9333016)
- **Related Notes Discovery (Task 3-2)**: pgvector cosine similarity-based related notes panel + graph edges (commit 79301d0)
- **Forgotten Note Rediscovery (Task 3-3)**: Daily + context-based resurfacing of old relevant notes on Dashboard (commit 19f49e3)
- **AI Auto-Tagging (Task 3-1)**: Individual + batch AI tag generation; tag filter UI on Notes/Search pages (commit 94ba748)

### Fixed
- Settings page crash when API omits fields — DEFAULT_PARAMS fallback (commit 8b602c7)
- OCR service AIRouter.chat() call signature + model fallback (commit 9d62276)
- NAS image proxy stability — throttle, placeholder detection, retry (commit c525714)
- NSX import image corruption — self-healing extraction (commit c792734)
- Reranker metadata preservation and TipTap editor list/quote styles (commit 3e3aee6)
- `/tags/local` SQL error with scalar JSONB tags (commit cd8de33)

---

## [1.2.0] — 2026-02-07

### Added
- **Always-Editable Notes**: Editor activates immediately on note open — no explicit "Edit" button required
- **Auto-Save**: 3-second debounce save, 30-second periodic save, save-on-navigate, Ctrl+S manual save
- **Save Status Indicator**: Footer displays "Saved" / "Saving..." / "Save failed" state
- **Real-time Word/Character Count**: Live count updates in the editor
- **Toolbar Active State**: Formatting toolbar reflects current cursor position styles
- **New Note Creation UI**: Notebook selection during note creation
- **Local-to-NAS Sync**: Notes created locally can now be pushed to NAS
- **Login Page Language Selector**: Language dropdown on login screen

---

## [1.1.0] — 2026-01-28

### Added
- **Internationalization (i18n)**: Korean/English UI switching via react-i18next; ~150 translation keys across 15+ files; browser language auto-detection
- **Search Parameter Tuning UI**: 12 search algorithm parameters (weights, thresholds, RRF k) adjustable from the UI
- **Search Parameter Help Modal**: Visual guide for each parameter's role and recommended values

### Fixed
- NAS image sync stabilization — editor display + push round-trip
- Automatic extraction for large data URI images (365KB+)
- i18n TypeScript build errors
- Settings.tsx missing useEffect import

---

## [1.0.1] — 2026-01-20

### Fixed
- Minor bug fixes and stability improvements

---

## [1.0.0] — 2026-01-15

### Added
- **Hybrid Search Engine**: Full-text search (tsvector + BM25), fuzzy search (pg_trgm), semantic search (pgvector + embeddings), Reciprocal Rank Fusion (RRF) merging
- **Multi-Provider AI Integration**: OpenAI, Anthropic, Google, ZhipuAI with auto-detection from environment variables; SSE streaming; 5 AI tasks (insight, search QA, writing assist, proofreading, templates)
- **AI Librarian**: Natural language question-answering over note corpus via semantic search
- **Knowledge Graph**: Force-directed graph visualization with global view + notebook-level AI clustering (Discovery); adjustable similarity threshold and note count
- **Synology NAS Integration**: Bidirectional sync with NoteStation (pull & push), image sync via FileStation, NSX file import, change logging
- **Note Sharing**: Token-based public links with configurable expiration (1d / 7d / 30d / unlimited)
- **OAuth Integration**: Google OAuth 2.0 (Gemini quota), OpenAI PKCE Flow (ChatGPT Plus/Pro subscription reuse); Fernet-encrypted token storage
- **Admin Dashboard**: User/note/embedding/storage statistics, per-table DB stats, user management (Owner/Admin/Member/Viewer roles), NAS/LLM provider monitoring
- **Operations Console**: One-click NAS sync + embedding indexing, search engine availability monitoring, activity logs (10 categories)
- **Team Collaboration**: Multi-role system (Owner → Admin → Member → Viewer), email invitation, role-based permissions, signup approval
- **Tiptap Rich Text Editor**: Full-featured note editor with formatting toolbar
- **Docker Compose Deployment**: 3-container orchestration (frontend, backend, PostgreSQL)
- **Interactive Install Script**: `install.sh` with guided setup and non-interactive mode (`-y`)
