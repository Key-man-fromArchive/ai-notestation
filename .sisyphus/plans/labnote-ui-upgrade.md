# LabNote AI UI/UX Upgrade

## TL;DR

> **Quick Summary**: Add multi-user notebooks with sharing, AI-powered discovery library, and document formatting tools to LabNote AI. Extends existing permission system with notebook-level access, public sharing links, on-demand clustering with graph visualization, and LLM-based Korean spell check.
> 
> **Deliverables**:
> - Notebooks entity with Owner/Editor/Viewer permissions
> - Public, email-required, and time-limited sharing links
> - AI clustering with react-force-graph visualization
> - Korean spell check and AI sentence improvement
> 
> **Estimated Effort**: Large (4-5 phases, ~30 tasks)
> **Parallel Execution**: YES - 4 waves per phase
> **Critical Path**: DB Schema → Permissions → Sharing → Discovery → Formatting

---

## Context

### Original Request
LabNote AI UI/UX Upgrade with three major feature areas:
1. Multi-user Lab Notes (notebooks, permissions, sharing)
2. Discovery Library (AI clustering, graph, timeline)
3. Document Formatting (spell check, templates, rewriting)

### Interview Summary
**Key Discussions**:
- Test Strategy: TDD with RED-GREEN-REFACTOR
- Permission Model: Simple 3-tier (Owner/Editor/Viewer) mapped to existing admin/write/read
- Graph Library: react-force-graph for related notes visualization
- Permission Inheritance: Note permissions override notebook (more granular control)

**Research Findings**:
- Existing permission system: Membership (org roles) + NoteAccess (note permissions)
- `Note.notebook_name` is a string field, not FK - migration needed
- AI router with SSE streaming pattern exists - reuse for clustering status
- NoteSharing component exists - extend pattern for notebooks

### Metis Review
**Identified Gaps** (addressed):
- Permission term mismatch: Map Owner→admin, Editor→write, Viewer→read
- Notebook migration: Create Notebook entity from unique notebook_name values
- Orphan notes: Notes with NULL notebook_name go to "Uncategorized" notebook
- Link security: Use cryptographic tokens (secrets.token_urlsafe(32))
- Graph scale: Limit to 50 visible nodes with pagination

---

## Work Objectives

### Core Objective
Transform LabNote AI from single-user note sync to multi-user collaborative platform with AI-powered discovery and document formatting.

### Concrete Deliverables
- `notebooks` table with permissions model
- `notebook_access` table for user/org access grants
- `share_links` table for public/email/time-limited links
- `note_clusters` table for caching clustering results
- 8 new API endpoints (notebooks CRUD, sharing, discovery, formatting)
- 5 new UI pages/components (NotebookList, NotebookDetail, ShareDialog, DiscoveryGraph, FormatToolbar)

### Definition of Done
- [ ] `pytest tests/` passes with 100% new code covered
- [ ] `npm run test` passes for all frontend components
- [ ] `npm run build` succeeds without TypeScript errors
- [ ] All sharing link types work (public, email-required, time-limited)
- [ ] Clustering produces valid graph data for 100+ notes

### Must Have
- Notebook CRUD with permission checks
- 3-tier permission model (Owner/Editor/Viewer)
- Public sharing links with tokens
- On-demand AI clustering button
- Korean spell check via LLM

### Must NOT Have (Guardrails)
- ❌ Nested notebook hierarchies (folders) - flat structure only
- ❌ Real-time collaborative editing - excluded by user
- ❌ Audit logging - excluded by user
- ❌ Role inheritance from organization to notebook
- ❌ Bulk permission changes across notebooks
- ❌ 3D graph visualization - 2D only
- ❌ Grammar correction - spell check only
- ❌ Template marketplace - local templates only
- ❌ Mobile-specific layouts - desktop-first
- ❌ Notification system for sharing

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks are verified by agent-executed commands and tools.
> NO acceptance criteria requires human action.

### Test Decision
- **Infrastructure exists**: YES (pytest for backend, Vitest for frontend)
- **Automated tests**: TDD (RED-GREEN-REFACTOR)
- **Framework**: pytest (backend), Vitest + Testing Library (frontend)

### TDD Pattern for Each Task

**Task Structure:**
1. **RED**: Write failing test first
   - Backend: `pytest tests/test_file.py -v`
   - Frontend: `npm test -- path/to/file.test.tsx`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Same test commands
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green
   - Same test commands
   - Expected: PASS (still)

### Agent-Executed QA Scenarios

All tasks include verification using:
- **API/Backend**: Bash (curl/httpie) with JSON assertions
- **Frontend/UI**: Playwright skill for DOM interactions
- **CLI/Commands**: interactive_bash (tmux) for build verification

---

## Execution Strategy

### Phase Overview

```
Phase 1: Database Foundation (Wave 1-3)
├── Notebook model and migration
├── NotebookAccess model
├── ShareLink model
└── Permission resolution service

Phase 2: Notebooks API + UI (Wave 4-7)
├── Notebooks CRUD endpoints
├── NotebookAccess endpoints
├── NotebookList page
└── NotebookDetail page

Phase 3: Sharing Links (Wave 8-10)
├── ShareLink CRUD endpoints
├── Public link access endpoint
├── ShareDialog component
└── Email/time-limited link flows

Phase 4: Discovery Library (Wave 11-14)
├── Clustering background task
├── Cluster cache management
├── Graph data endpoint
└── DiscoveryGraph component

Phase 5: Document Formatting (Wave 15-17)
├── Korean spell check endpoint
├── AI rewrite endpoint
├── FormatToolbar component
└── Research template system
```

### Parallel Execution Waves

```
PHASE 1 - Foundation:
Wave 1 (Start Immediately):
├── Task 1.1: Notebook model + migration
└── Task 1.2: ShareLink model + migration

Wave 2 (After Wave 1):
├── Task 1.3: NotebookAccess model
└── Task 1.4: Permission resolution service

PHASE 2 - Notebooks:
Wave 3 (After Phase 1):
├── Task 2.1: Notebooks CRUD endpoints
├── Task 2.2: NotebookAccess endpoints
└── Task 2.3: useNotebook hooks

Wave 4 (After Wave 3):
├── Task 2.4: NotebookList page
└── Task 2.5: NotebookDetail page

... (continues for each phase)
```

### Dependency Matrix

| Task | Depends On | Blocks | Parallel With |
|------|------------|--------|---------------|
| 1.1 Notebook model | None | 1.3, 2.1 | 1.2 |
| 1.2 ShareLink model | None | 3.1 | 1.1 |
| 1.3 NotebookAccess | 1.1 | 2.2 | 1.4 |
| 1.4 Permission service | 1.1, 1.3 | 2.1, 2.2 | 1.3 |
| 2.1 Notebooks CRUD | 1.4 | 2.4, 2.5 | 2.2, 2.3 |
| 2.2 Access endpoints | 1.4 | 2.5 | 2.1, 2.3 |
| 2.3 useNotebook hooks | 2.1 | 2.4, 2.5 | 2.1 (after partial) |
| 3.1 ShareLink CRUD | 1.2, 2.1 | 3.2, 3.3 | None |
| 4.1 Clustering task | 2.1 | 4.2, 4.3 | None |

---

## TODOs

### Phase 1: Database Foundation

---

- [ ] 1.1 Create Notebook Model and Migration

  **What to do**:
  - Create `Notebook` SQLAlchemy model with: id, name, description, owner_id (FK to users), org_id (FK to organizations), is_public, public_links_enabled, created_at, updated_at
  - Create Alembic migration that:
    1. Creates `notebooks` table
    2. Populates from unique `Note.notebook_name` values (owner = first note's sync user or org owner)
    3. Adds `notebook_id` FK column to `notes` table
    4. Populates `notebook_id` from matching `notebook_name`
    5. Creates "Uncategorized" notebook for NULL `notebook_name` notes
  - Add indexes on owner_id, org_id, name

  **Must NOT do**:
  - Do NOT drop `notebook_name` column yet (kept for backward compatibility)
  - Do NOT create nested folder structure
  - Do NOT add audit fields (excluded from scope)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Database migration with data transformation requires careful handling
  - **Skills**: [`fastapi-latest`]
    - `fastapi-latest`: SQLAlchemy model patterns and FastAPI integration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1.2)
  - **Blocks**: Tasks 1.3, 2.1, 2.2
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `backend/app/models.py:Note` (lines 45-75) - SQLAlchemy model pattern with Mapped types
  - `backend/app/models.py:Membership` (lines 120-145) - FK relationships and unique constraints
  
  **Migration References**:
  - `backend/migrations/versions/004_org_members.py` - Multi-table migration with data population pattern
  
  **API/Type References**:
  - `backend/app/constants.py:MemberRole` - Enum pattern for permission levels

  **Acceptance Criteria**:

  **TDD (RED-GREEN-REFACTOR):**
  - [ ] Test file created: `backend/tests/test_models_notebook.py`
  - [ ] Tests cover: Notebook creation, FK constraints, unique name per org
  - [ ] `cd backend && pytest tests/test_models_notebook.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Migration creates notebooks from existing note data
    Tool: Bash (pytest + psql)
    Preconditions: Database has notes with various notebook_name values
    Steps:
      1. Run: alembic upgrade head
      2. Query: SELECT COUNT(*) FROM notebooks
      3. Assert: Count matches unique notebook_name values + 1 (Uncategorized)
      4. Query: SELECT COUNT(*) FROM notes WHERE notebook_id IS NULL
      5. Assert: Count is 0 (all notes assigned)
    Expected Result: All notes migrated to notebook FKs
    Evidence: Migration output log

  Scenario: Notebook model enforces unique name per org
    Tool: Bash (pytest)
    Preconditions: Test database with org
    Steps:
      1. Create notebook with name "Research" in org 1
      2. Attempt to create another notebook with name "Research" in org 1
      3. Assert: IntegrityError raised
      4. Create notebook with name "Research" in org 2
      5. Assert: Success (different org allows same name)
    Expected Result: Unique constraint works per-org
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(db): add Notebook model and migration from notebook_name`
  - Files: `backend/app/models.py`, `backend/migrations/versions/XXX_add_notebooks.py`
  - Pre-commit: `cd backend && pytest tests/test_models_notebook.py -v`

---

- [ ] 1.2 Create ShareLink Model and Migration

  **What to do**:
  - Create `ShareLink` SQLAlchemy model with: id, token (unique, indexed), notebook_id (FK), note_id (FK, nullable), link_type (enum: public, email_required, time_limited), created_by (FK to users), email_restriction (nullable), expires_at (nullable), access_count, is_active, created_at
  - Token generation: `secrets.token_urlsafe(32)` (43 chars)
  - Create Alembic migration for `share_links` table
  - Add check constraint: at least one of notebook_id or note_id must be set
  - Add index on token for fast lookup

  **Must NOT do**:
  - Do NOT create infinite time-limited links (max 90 days enforced in service)
  - Do NOT expose internal IDs in public URLs

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security-sensitive token handling and constraint design
  - **Skills**: [`fastapi-latest`]
    - `fastapi-latest`: SQLAlchemy patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1.1)
  - **Blocks**: Task 3.1
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `backend/app/models.py:Membership.invite_token` (line 135) - Token field pattern
  - `backend/app/services/user_service.py:create_invite()` (lines 89-110) - Token generation pattern

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `backend/tests/test_models_sharelink.py`
  - [ ] Tests: Token uniqueness, expiry validation, link_type enum
  - [ ] `cd backend && pytest tests/test_models_sharelink.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: ShareLink token is cryptographically random
    Tool: Bash (python)
    Steps:
      1. Generate 1000 tokens using secrets.token_urlsafe(32)
      2. Assert: All tokens are unique
      3. Assert: Token length is 43 characters
      4. Assert: Token matches regex ^[A-Za-z0-9_-]{43}$
    Expected Result: Secure random tokens generated
    Evidence: Test output

  Scenario: Expired link is rejected
    Tool: Bash (pytest)
    Steps:
      1. Create ShareLink with expires_at = now - 1 hour
      2. Query link by token
      3. Check is_expired property
      4. Assert: is_expired returns True
    Expected Result: Expiry check works
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(db): add ShareLink model for public/email/time-limited sharing`
  - Files: `backend/app/models.py`, `backend/migrations/versions/XXX_add_share_links.py`
  - Pre-commit: `cd backend && pytest tests/test_models_sharelink.py -v`

---

- [ ] 1.3 Create NotebookAccess Model

  **What to do**:
  - Create `NotebookAccess` SQLAlchemy model with: id, notebook_id (FK), user_id (FK, nullable), org_id (FK, nullable), permission (enum: read, write, admin), granted_by (FK to users), created_at
  - Follow exact pattern from existing `NoteAccess` model
  - Add unique constraint on (notebook_id, user_id) and (notebook_id, org_id)
  - Add check constraint: exactly one of user_id or org_id must be set

  **Must NOT do**:
  - Do NOT add new permission levels beyond read/write/admin
  - Do NOT modify existing NoteAccess model

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple model following existing pattern
  - **Skills**: [`fastapi-latest`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 1.4)
  - **Blocks**: Task 2.2
  - **Blocked By**: Task 1.1

  **References**:

  **Pattern References**:
  - `backend/app/models.py:NoteAccess` (lines 180-210) - Exact pattern to follow

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `backend/tests/test_models_notebook_access.py`
  - [ ] Tests: CRUD, unique constraints, permission validation
  - [ ] `cd backend && pytest tests/test_models_notebook_access.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: NotebookAccess prevents duplicate grants
    Tool: Bash (pytest)
    Steps:
      1. Grant user_id=1 read access to notebook_id=1
      2. Attempt to grant user_id=1 write access to notebook_id=1
      3. Assert: Upsert updates existing record (not creates new)
      4. Query: SELECT permission FROM notebook_access WHERE user_id=1 AND notebook_id=1
      5. Assert: permission = 'write'
    Expected Result: Upsert pattern works correctly
    Evidence: Test output
  ```

  **Commit**: YES (group with 1.4)
  - Message: `feat(db): add NotebookAccess model for notebook-level permissions`
  - Files: `backend/app/models.py`, `backend/migrations/versions/XXX_add_notebook_access.py`

---

- [ ] 1.4 Create Unified Permission Resolution Service

  **What to do**:
  - Create `backend/app/services/notebook_access_control.py` with functions:
    - `check_notebook_access(user_id, notebook_id, required_permission)` → bool
    - `get_effective_note_permission(user_id, note_id)` → str|None
      - Logic: Check NoteAccess first; if no explicit grant, fall back to NotebookAccess
      - Note permission OVERRIDES notebook (user chose this)
    - `get_accessible_notebooks(user_id, min_permission)` → list[int]
    - `grant_notebook_access(...)`, `revoke_notebook_access(...)`
  - Permission hierarchy: read < write < admin (reuse existing PERMISSION_HIERARCHY)
  - Handle edge case: Note has Viewer restriction but notebook has Editor → Note wins (Viewer)

  **Must NOT do**:
  - Do NOT modify existing access_control.py (keep it for notes)
  - Do NOT create circular dependencies

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core permission logic, affects all subsequent features
  - **Skills**: [`fastapi-latest`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 1.3)
  - **Blocks**: Tasks 2.1, 2.2, 3.1
  - **Blocked By**: Tasks 1.1, 1.3

  **References**:

  **Pattern References**:
  - `backend/app/services/access_control.py` (entire file) - Pattern to follow and extend
  - `backend/app/services/access_control.py:PERMISSION_HIERARCHY` - Permission ordering (lines 15-20)

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `backend/tests/test_notebook_access_control.py`
  - [ ] Tests: check_notebook_access, get_effective_note_permission with override logic
  - [ ] `cd backend && pytest tests/test_notebook_access_control.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Note permission overrides notebook permission
    Tool: Bash (pytest)
    Preconditions: 
      - Notebook 1 grants user 1 "write" access
      - Note 5 (in Notebook 1) grants user 1 "read" access explicitly
    Steps:
      1. Call get_effective_note_permission(user_id=1, note_id=5)
      2. Assert: Returns "read" (not "write")
    Expected Result: Note-level restriction honored
    Evidence: Test output

  Scenario: Notebook permission used when no note-level grant
    Tool: Bash (pytest)
    Preconditions:
      - Notebook 1 grants user 1 "write" access
      - Note 6 (in Notebook 1) has no NoteAccess record for user 1
    Steps:
      1. Call get_effective_note_permission(user_id=1, note_id=6)
      2. Assert: Returns "write" (inherited from notebook)
    Expected Result: Falls back to notebook permission
    Evidence: Test output
  ```

  **Commit**: YES (group with 1.3)
  - Message: `feat(permissions): add unified notebook access control service`
  - Files: `backend/app/services/notebook_access_control.py`, `backend/tests/test_notebook_access_control.py`

---

### Phase 2: Notebooks API + UI

---

- [ ] 2.1 Create Notebooks CRUD API Endpoints

  **What to do**:
  - Create `backend/app/api/notebooks.py` with endpoints:
    - `GET /notebooks` - List user's accessible notebooks with note_count
    - `POST /notebooks` - Create notebook (user becomes Owner)
    - `GET /notebooks/{id}` - Get notebook details (requires read permission)
    - `PUT /notebooks/{id}` - Update notebook (requires write permission)
    - `DELETE /notebooks/{id}` - Delete notebook (requires admin/owner permission)
  - Include Pydantic schemas: NotebookCreate, NotebookUpdate, NotebookResponse, NotebooksListResponse
  - Register router in main.py with prefix `/notebooks`
  - **IMPORTANT**: Existing `GET /api/notebooks` in `notes.py` returns notebook names from Note.notebook_name. This new endpoint REPLACES it. Either:
    - Remove old endpoint from notes.py and update frontend `useNotebooks.ts` to use new response shape, OR
    - Keep old endpoint as `/notebooks/legacy` during migration

  **Must NOT do**:
  - Do NOT allow deleting notebooks with notes (must move/delete notes first)
  - Do NOT expose internal owner_id in public responses

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core CRUD with permission checks
  - **Skills**: [`fastapi-latest`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 2.2, 2.3)
  - **Blocks**: Tasks 2.4, 2.5, 3.1
  - **Blocked By**: Task 1.4

  **References**:

  **Pattern References**:
  - `backend/app/api/notes.py` (lines 30-120) - CRUD endpoint pattern
  - `backend/app/api/sharing.py` (lines 50-100) - Permission check pattern

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `backend/tests/test_api_notebooks.py`
  - [ ] Tests: CRUD operations, permission checks, error cases
  - [ ] `cd backend && pytest tests/test_api_notebooks.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Create notebook and verify ownership
    Tool: Bash (curl)
    Preconditions: User authenticated with valid JWT
    Steps:
      1. curl -X POST http://localhost:8000/api/notebooks \
           -H "Authorization: Bearer $TOKEN" \
           -H "Content-Type: application/json" \
           -d '{"name": "Research 2026", "description": "My research notes"}'
      2. Assert: HTTP 201
      3. Assert: response.id is integer
      4. Assert: response.name == "Research 2026"
      5. curl http://localhost:8000/api/notebooks/$ID/access \
           -H "Authorization: Bearer $TOKEN"
      6. Assert: User has "admin" permission (owner)
    Expected Result: Notebook created with owner access
    Evidence: Response JSON saved to .sisyphus/evidence/task-2.1-create.json

  Scenario: Unauthorized user cannot access notebook
    Tool: Bash (curl)
    Preconditions: Notebook 1 owned by user 1, user 2 has no access
    Steps:
      1. curl http://localhost:8000/api/notebooks/1 \
           -H "Authorization: Bearer $USER2_TOKEN"
      2. Assert: HTTP 403
      3. Assert: response.detail contains "permission"
    Expected Result: Access denied for unauthorized user
    Evidence: Response status code
  ```

  **Commit**: YES
  - Message: `feat(api): add notebooks CRUD endpoints with permission checks`
  - Files: `backend/app/api/notebooks.py`, `backend/app/main.py`
  - Pre-commit: `cd backend && pytest tests/test_api_notebooks.py -v`

---

- [ ] 2.2 Create NotebookAccess API Endpoints

  **What to do**:
  - Add to `backend/app/api/notebooks.py`:
    - `GET /notebooks/{id}/access` - List who has access
    - `POST /notebooks/{id}/access` - Grant access by email
    - `PUT /notebooks/{id}/access/{access_id}` - Update permission level
    - `DELETE /notebooks/{id}/access/{access_id}` - Revoke access
    - `POST /notebooks/{id}/access/org` - Grant org-wide access
  - Only users with admin permission can manage access
  - Cannot demote/remove the last Owner

  **Must NOT do**:
  - Do NOT allow Viewers to see access list (only Editors+)
  - Do NOT allow removing notebook owner

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Permission management logic
  - **Skills**: [`fastapi-latest`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 2.1, 2.3)
  - **Blocks**: Task 2.5
  - **Blocked By**: Task 1.4

  **References**:

  **Pattern References**:
  - `backend/app/api/sharing.py` (entire file) - Exact pattern for note sharing

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `backend/tests/test_api_notebook_access.py`
  - [ ] Tests: Grant, update, revoke, last-owner protection
  - [ ] `cd backend && pytest tests/test_api_notebook_access.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Grant and revoke notebook access
    Tool: Bash (curl)
    Steps:
      1. POST /notebooks/1/access with {"email": "editor@example.com", "permission": "write"}
      2. Assert: HTTP 201, response.id exists
      3. GET /notebooks/1/access
      4. Assert: response.accesses contains editor@example.com with permission "write"
      5. DELETE /notebooks/1/access/{access_id}
      6. Assert: HTTP 204
      7. GET /notebooks/1/access
      8. Assert: editor@example.com no longer in list
    Expected Result: Full access lifecycle works
    Evidence: Response JSONs

  Scenario: Cannot remove last owner
    Tool: Bash (curl)
    Preconditions: Notebook 1 has only one owner (user 1)
    Steps:
      1. Attempt DELETE /notebooks/1/access/{owner_access_id}
      2. Assert: HTTP 400
      3. Assert: response.detail contains "last owner"
    Expected Result: Protection works
    Evidence: Error response
  ```

  **Commit**: YES (group with 2.1)
  - Message: `feat(api): add notebook access management endpoints`
  - Files: `backend/app/api/notebooks.py`

---

- [ ] 2.3 Update Frontend useNotebook Hooks

  **What to do**:
  - **UPDATE** existing `frontend/src/hooks/useNotebooks.ts`:
    - Currently returns simple `{name, note_count}[]` - extend for new Notebook entity
    - Add `useNotebook(id)` - Single notebook detail
    - Add `useCreateNotebook()` - Mutation for creation
    - Add `useUpdateNotebook()` - Mutation for update
    - Add `useDeleteNotebook()` - Mutation for deletion
    - Update response types to match new NotebookResponse schema
  - Create `frontend/src/hooks/useNotebookAccess.ts`:
    - `useNotebookAccess(id)` - List access grants
    - `useGrantAccess()`, `useRevokeAccess()` - Mutations
  - Follow existing useNotes.ts and useNoteSharing.ts patterns
  - Query keys: `['notebooks']`, `['notebook', id]`, `['notebook-access', id]`

  **Must NOT do**:
  - Do NOT create duplicate query clients
  - Do NOT skip cache invalidation on mutations

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Frontend hooks with TanStack Query patterns
  - **Skills**: [`react-19`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (starts after 2.1 partial, needs API running)
  - **Blocks**: Tasks 2.4, 2.5
  - **Blocked By**: Task 2.1 (API must exist)

  **References**:

  **Pattern References**:
  - `frontend/src/hooks/useNotes.ts` - Query pattern
  - `frontend/src/hooks/useNoteSharing.ts` - Mutation pattern with invalidation
  - `frontend/src/lib/api.ts` - API client usage

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `frontend/src/__tests__/hooks/useNotebooks.test.ts`
  - [ ] Tests: Query fetching, mutation side effects, cache invalidation
  - [ ] `cd frontend && npm test -- src/__tests__/hooks/useNotebooks.test.ts` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: useNotebooks fetches and caches data
    Tool: Vitest
    Steps:
      1. Mock API response for GET /notebooks
      2. Render hook with renderHook()
      3. Assert: isLoading is true initially
      4. Wait for query to settle
      5. Assert: data.notebooks is array
      6. Assert: queryClient.getQueryData(['notebooks']) is cached
    Expected Result: Query works with caching
    Evidence: Test output

  Scenario: useCreateNotebook invalidates list cache
    Tool: Vitest
    Steps:
      1. Pre-populate cache with notebooks list
      2. Call createNotebook mutation
      3. Assert: invalidateQueries called with ['notebooks']
      4. Assert: Cache is invalidated (refetch triggered)
    Expected Result: Cache invalidation works
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(hooks): add useNotebooks and useNotebookAccess hooks`
  - Files: `frontend/src/hooks/useNotebooks.ts`, `frontend/src/hooks/useNotebookAccess.ts`
  - Pre-commit: `cd frontend && npm test -- --run`

---

- [ ] 2.4 Create NotebookList Page

  **What to do**:
  - Create `frontend/src/pages/Notebooks.tsx`:
    - Grid/list view of notebooks with note_count
    - Create notebook button with modal form
    - Notebook card with name, description, permission badge, note count
    - Click to navigate to `/notebooks/{id}`
    - Empty state when no notebooks
  - Add route to App.tsx: `/notebooks`
  - Add sidebar navigation link

  **Must NOT do**:
  - Do NOT implement drag-and-drop reordering
  - Do NOT add dark mode styles

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI page with components
  - **Skills**: [`react-19`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 2.5)
  - **Blocks**: None
  - **Blocked By**: Tasks 2.1, 2.3

  **References**:

  **Pattern References**:
  - `frontend/src/pages/Notes.tsx` - List page pattern
  - `frontend/src/components/NoteCard.tsx` - Card component pattern
  - `frontend/src/components/EmptyState.tsx` - Empty state usage

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `frontend/src/__tests__/pages/Notebooks.test.tsx`
  - [ ] Tests: Render notebooks, create modal, empty state
  - [ ] `cd frontend && npm test -- src/__tests__/pages/Notebooks.test.tsx` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Notebooks page displays list and handles empty state
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user logged in
    Steps:
      1. Navigate to: http://localhost:5173/notebooks
      2. Wait for: .notebook-grid OR .empty-state visible (timeout: 5s)
      3. If notebooks exist:
         - Assert: .notebook-card elements count > 0
         - Assert: Each card shows name and note count
      4. If empty:
         - Assert: .empty-state contains "No notebooks"
         - Assert: "Create Notebook" button visible
      5. Screenshot: .sisyphus/evidence/task-2.4-list.png
    Expected Result: Page renders correctly for both states
    Evidence: .sisyphus/evidence/task-2.4-list.png

  Scenario: Create notebook modal works
    Tool: Playwright
    Steps:
      1. Navigate to /notebooks
      2. Click: button containing "Create"
      3. Wait for: dialog[role="dialog"] visible
      4. Fill: input[name="name"] → "Test Notebook"
      5. Fill: textarea[name="description"] → "Test description"
      6. Click: button[type="submit"]
      7. Wait for: dialog closed
      8. Assert: .notebook-card containing "Test Notebook" visible
      9. Screenshot: .sisyphus/evidence/task-2.4-create.png
    Expected Result: Notebook created and appears in list
    Evidence: .sisyphus/evidence/task-2.4-create.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add NotebookList page with create modal`
  - Files: `frontend/src/pages/Notebooks.tsx`, `frontend/src/App.tsx`, `frontend/src/components/Sidebar.tsx`
  - Pre-commit: `cd frontend && npm run build`

---

- [ ] 2.5 Create NotebookDetail Page

  **What to do**:
  - Create `frontend/src/pages/NotebookDetail.tsx`:
    - Header with notebook name, edit button (for Editors+)
    - Notes list filtered by notebook_id (reuse NoteList component)
    - Access management panel (for Admins) - reuse NoteSharing pattern
    - Share button that opens ShareDialog
  - Add route: `/notebooks/:id`
  - Show permission badge for current user

  **Must NOT do**:
  - Do NOT duplicate NoteList logic (import and filter)
  - Do NOT show access panel to Viewers

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex UI page with multiple sections
  - **Skills**: [`react-19`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 2.4)
  - **Blocks**: None
  - **Blocked By**: Tasks 2.1, 2.2, 2.3

  **References**:

  **Pattern References**:
  - `frontend/src/pages/NoteDetail.tsx` - Detail page pattern
  - `frontend/src/components/NoteSharing.tsx` - Access management UI pattern
  - `frontend/src/components/NoteList.tsx` - Virtualized list component

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `frontend/src/__tests__/pages/NotebookDetail.test.tsx`
  - [ ] Tests: Render details, notes list, access panel visibility by permission
  - [ ] `cd frontend && npm test -- src/__tests__/pages/NotebookDetail.test.tsx` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: NotebookDetail shows notes filtered by notebook
    Tool: Playwright
    Preconditions: Notebook 1 has 5 notes, user has read access
    Steps:
      1. Navigate to: http://localhost:5173/notebooks/1
      2. Wait for: h1 containing notebook name visible
      3. Assert: .note-list visible
      4. Assert: Note count matches expected (or "No notes" if empty)
      5. Screenshot: .sisyphus/evidence/task-2.5-detail.png
    Expected Result: Notebook detail with notes shown
    Evidence: .sisyphus/evidence/task-2.5-detail.png

  Scenario: Access panel hidden for Viewers
    Tool: Playwright
    Preconditions: User has "read" permission on notebook 1
    Steps:
      1. Navigate to: http://localhost:5173/notebooks/1
      2. Assert: [data-testid="access-panel"] NOT visible
      3. Assert: "Share" button NOT visible
    Expected Result: Viewer cannot see access controls
    Evidence: Screenshot
  ```

  **Commit**: YES
  - Message: `feat(ui): add NotebookDetail page with notes and access panel`
  - Files: `frontend/src/pages/NotebookDetail.tsx`, `frontend/src/App.tsx`
  - Pre-commit: `cd frontend && npm run build`

---

### Phase 3: Sharing Links

---

- [ ] 3.1 Create ShareLink CRUD API Endpoints

  **What to do**:
  - Create `backend/app/api/share_links.py` with endpoints:
    - `POST /notebooks/{id}/links` - Create share link (public/email/time-limited)
    - `GET /notebooks/{id}/links` - List active links
    - `DELETE /notebooks/{id}/links/{link_id}` - Revoke link
    - `POST /notes/{id}/links` - Create note-specific link
  - Request schema: `{type: "public"|"email_required"|"time_limited", expires_in_days?: int, email_restriction?: str}`
  - Enforce max 10 active links per notebook per user
  - Enforce max 90 days for time-limited links

  **Must NOT do**:
  - Do NOT allow links on private notebooks without explicit flag
  - Do NOT create links without checking user has admin permission

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security-critical sharing logic
  - **Skills**: [`fastapi-latest`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (sequential - depends on 1.2 and 2.1)
  - **Blocks**: Tasks 3.2, 3.3
  - **Blocked By**: Tasks 1.2, 2.1

  **References**:

  **Pattern References**:
  - `backend/app/services/user_service.py:create_invite()` - Token generation
  - `backend/app/api/sharing.py` - Permission check patterns

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `backend/tests/test_api_share_links.py`
  - [ ] Tests: Create all link types, rate limiting, expiry enforcement
  - [ ] `cd backend && pytest tests/test_api_share_links.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Create and use public share link
    Tool: Bash (curl)
    Steps:
      1. POST /notebooks/1/links with {"type": "public"}
      2. Assert: HTTP 201
      3. Assert: response.token matches ^[A-Za-z0-9_-]{43}$
      4. Assert: response.link_type == "public"
      5. Save token to $SHARE_TOKEN
      6. GET /shared/$SHARE_TOKEN (no auth header)
      7. Assert: HTTP 200
      8. Assert: response.notebook.name exists
    Expected Result: Public link works without auth
    Evidence: Response JSONs

  Scenario: Time-limited link expires correctly
    Tool: Bash (curl + pytest)
    Steps:
      1. POST /notebooks/1/links with {"type": "time_limited", "expires_in_days": 0}
      2. Assert: HTTP 400 (min 1 day)
      3. POST with {"type": "time_limited", "expires_in_days": 1}
      4. Assert: HTTP 201
      5. Mock time forward 2 days (in test)
      6. GET /shared/$TOKEN
      7. Assert: HTTP 410 Gone
    Expected Result: Expiry enforced
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(api): add share links CRUD with public/email/time-limited types`
  - Files: `backend/app/api/share_links.py`, `backend/app/main.py`
  - Pre-commit: `cd backend && pytest tests/test_api_share_links.py -v`

---

- [ ] 3.2 Create Public Link Access Endpoint

  **What to do**:
  - Create `backend/app/api/shared.py` with endpoint:
    - `GET /shared/{token}` - Access shared content via token
  - Logic:
    1. Look up ShareLink by token
    2. Check is_active and not expired
    3. If email_required, check email cookie/header matches
    4. Increment access_count
    5. Return notebook/note content (read-only view)
  - Rate limit: 100 requests/minute/IP

  **Must NOT do**:
  - Do NOT allow write operations via shared links
  - Do NOT expose internal IDs in response

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security-critical public access
  - **Skills**: [`fastapi-latest`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Task 3.3)
  - **Blocks**: None
  - **Blocked By**: Task 3.1

  **References**:

  **Pattern References**:
  - `backend/app/api/members.py:accept_invite()` - Token lookup pattern

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `backend/tests/test_api_shared.py`
  - [ ] Tests: Valid access, expired link, email mismatch, rate limiting
  - [ ] `cd backend && pytest tests/test_api_shared.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Email-required link validates email
    Tool: Bash (curl)
    Preconditions: Link created with email_restriction="allowed@test.com"
    Steps:
      1. GET /shared/$TOKEN (no email header)
      2. Assert: HTTP 403 with "email required"
      3. GET /shared/$TOKEN with X-Email: wrong@test.com
      4. Assert: HTTP 403 with "email mismatch"
      5. GET /shared/$TOKEN with X-Email: allowed@test.com
      6. Assert: HTTP 200
    Expected Result: Email restriction enforced
    Evidence: Response status codes

  Scenario: Access count increments
    Tool: Bash (curl + psql)
    Steps:
      1. Query: SELECT access_count FROM share_links WHERE token = '$TOKEN'
      2. Note initial count
      3. GET /shared/$TOKEN
      4. Query again
      5. Assert: access_count incremented by 1
    Expected Result: Tracking works
    Evidence: Query results
  ```

  **Commit**: YES
  - Message: `feat(api): add public shared content access endpoint`
  - Files: `backend/app/api/shared.py`, `backend/app/main.py`
  - Pre-commit: `cd backend && pytest tests/test_api_shared.py -v`

---

- [ ] 3.3 Create ShareDialog Frontend Component

  **What to do**:
  - Create `frontend/src/components/ShareDialog.tsx`:
    - Modal dialog for creating/managing share links
    - Radio buttons for link type (public, email-required, time-limited)
    - Input for email restriction and expiry days
    - List of existing links with copy/revoke buttons
    - Copy link to clipboard functionality
  - Create `frontend/src/hooks/useShareLinks.ts`:
    - Query and mutation hooks for share links API
  - Integrate into NotebookDetail page

  **Must NOT do**:
  - Do NOT show share option to Viewers

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex modal UI with form logic
  - **Skills**: [`react-19`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Task 3.2)
  - **Blocks**: None
  - **Blocked By**: Task 3.1

  **References**:

  **Pattern References**:
  - `frontend/src/components/NoteSharing.tsx` - Modal pattern
  - `frontend/src/pages/Members.tsx:InviteModal` - Form in modal pattern

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `frontend/src/__tests__/components/ShareDialog.test.tsx`
  - [ ] Tests: Create links, copy functionality, revoke
  - [ ] `cd frontend && npm test -- src/__tests__/components/ShareDialog.test.tsx` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Create public share link and copy
    Tool: Playwright
    Preconditions: User is admin of notebook 1
    Steps:
      1. Navigate to /notebooks/1
      2. Click: button containing "Share"
      3. Wait for: dialog visible
      4. Select: radio[value="public"]
      5. Click: button containing "Create Link"
      6. Wait for: .link-url visible
      7. Assert: Link URL contains "/shared/"
      8. Click: button containing "Copy"
      9. Assert: Toast "Copied to clipboard" visible
      10. Screenshot: .sisyphus/evidence/task-3.3-share.png
    Expected Result: Link created and copyable
    Evidence: .sisyphus/evidence/task-3.3-share.png

  Scenario: Time-limited link shows expiry date
    Tool: Playwright
    Steps:
      1. Open ShareDialog
      2. Select: radio[value="time_limited"]
      3. Fill: input[name="expires_in_days"] → "7"
      4. Click: Create Link
      5. Assert: Link row shows expiry date (7 days from now)
    Expected Result: Expiry displayed correctly
    Evidence: Screenshot
  ```

  **Commit**: YES
  - Message: `feat(ui): add ShareDialog component for share link management`
  - Files: `frontend/src/components/ShareDialog.tsx`, `frontend/src/hooks/useShareLinks.ts`
  - Pre-commit: `cd frontend && npm run build`

---

- [ ] 3.4 Create Shared Content View Page

  **What to do**:
  - Create `frontend/src/pages/SharedView.tsx`:
    - Public page for viewing shared content (no auth required)
    - Route: `/shared/:token`
    - Email input modal for email-required links
    - Read-only notebook/note display
    - "Expires in X days" warning for time-limited links
    - Branding footer with "Powered by LabNote AI"
  - Handle error states: expired, revoked, email mismatch

  **Must NOT do**:
  - Do NOT show edit buttons
  - Do NOT require login

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Public-facing UI
  - **Skills**: [`react-19`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 7 (after 3.2, 3.3)
  - **Blocks**: None
  - **Blocked By**: Tasks 3.2, 3.3

  **References**:

  **Pattern References**:
  - `frontend/src/pages/NoteDetail.tsx` - Read-only content display

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `frontend/src/__tests__/pages/SharedView.test.tsx`
  - [ ] Tests: Valid link, expired link, email modal
  - [ ] `cd frontend && npm test -- src/__tests__/pages/SharedView.test.tsx` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Public shared link displays content
    Tool: Playwright
    Preconditions: Valid public share link token exists
    Steps:
      1. Navigate to: http://localhost:5173/shared/$TOKEN (not logged in)
      2. Wait for: .shared-content visible (timeout: 5s)
      3. Assert: Notebook name displayed
      4. Assert: Notes list visible
      5. Assert: No edit buttons visible
      6. Screenshot: .sisyphus/evidence/task-3.4-public.png
    Expected Result: Read-only view works
    Evidence: .sisyphus/evidence/task-3.4-public.png

  Scenario: Expired link shows error
    Tool: Playwright
    Preconditions: Expired share link token
    Steps:
      1. Navigate to: /shared/$EXPIRED_TOKEN
      2. Wait for: .error-state visible
      3. Assert: Text contains "expired" or "no longer available"
      4. Screenshot: .sisyphus/evidence/task-3.4-expired.png
    Expected Result: Clear error message
    Evidence: .sisyphus/evidence/task-3.4-expired.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add SharedView page for public link access`
  - Files: `frontend/src/pages/SharedView.tsx`, `frontend/src/App.tsx`
  - Pre-commit: `cd frontend && npm run build`

---

### Phase 4: Discovery Library

---

- [ ] 4.1 Create Clustering Background Task

  **What to do**:
  - Create `backend/app/services/clustering.py`:
    - `cluster_notes(notebook_id, num_clusters)` - Main clustering function
    - Use existing embeddings from NoteEmbedding
    - Algorithm: K-means on embeddings, then AI-generated cluster summaries
    - Return: list of clusters with note_ids and summary
  - Create `backend/app/tasks/clustering.py`:
    - Background task wrapper using asyncio
    - Task status tracking (pending, processing, completed, failed)
    - Timeout after 60 seconds
  - Create `NoteCluster` model for caching results (5 minute TTL)

  **Must NOT do**:
  - Do NOT run synchronously (always background)
  - Do NOT cluster notes user cannot access
  - Do NOT include notes without embeddings (mark as "unclustered")

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Complex ML algorithm integration
  - **Skills**: [`fastapi-latest`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 8 (Phase 4 start)
  - **Blocks**: Tasks 4.2, 4.3
  - **Blocked By**: Phase 2 (needs notebooks)

  **References**:

  **Pattern References**:
  - `backend/app/search/embeddings.py` - Embedding retrieval pattern
  - `backend/app/ai_router/router.py:stream()` - AI provider usage

  **Documentation References**:
  - sklearn K-means: https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `backend/tests/test_clustering.py`
  - [ ] Tests: Cluster formation, summary generation, timeout handling
  - [ ] `cd backend && pytest tests/test_clustering.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Clustering produces valid clusters
    Tool: Bash (pytest)
    Preconditions: Notebook with 20 notes, all with embeddings
    Steps:
      1. Call cluster_notes(notebook_id=1, num_clusters=3)
      2. Assert: Returns list of 3 clusters
      3. Assert: Each cluster has note_ids array (non-empty)
      4. Assert: Each cluster has summary string (non-empty)
      5. Assert: Union of all note_ids equals input notes
    Expected Result: All notes assigned to clusters
    Evidence: Test output

  Scenario: Notes without embeddings marked as unclustered
    Tool: Bash (pytest)
    Preconditions: 10 notes, 2 without embeddings
    Steps:
      1. Call cluster_notes(notebook_id=1, num_clusters=2)
      2. Assert: Returns clusters + unclustered list
      3. Assert: unclustered contains 2 note_ids
    Expected Result: Graceful handling of missing embeddings
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(discovery): add note clustering service with K-means and AI summaries`
  - Files: `backend/app/services/clustering.py`, `backend/app/tasks/clustering.py`, `backend/app/models.py`
  - Pre-commit: `cd backend && pytest tests/test_clustering.py -v`

---

- [ ] 4.2 Create Discovery API Endpoints

  **What to do**:
  - Create `backend/app/api/discovery.py` with endpoints:
    - `POST /discovery/cluster` - Trigger clustering (returns task_id)
    - `GET /discovery/cluster/{task_id}` - Poll task status/results
    - `GET /discovery/graph?notebook_id=X` - Get graph data (nodes + edges)
    - `GET /discovery/timeline?notebook_id=X` - Get activity timeline
  - Graph data format: `{nodes: [{id, label, cluster_id}], links: [{source, target, weight}]}`
  - Limit graph to 50 nodes, pagination for rest

  **Must NOT do**:
  - Do NOT run clustering synchronously
  - Do NOT return more than 50 nodes at once

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex data transformation
  - **Skills**: [`fastapi-latest`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 9 (with Task 4.3)
  - **Blocks**: Task 4.4
  - **Blocked By**: Task 4.1

  **References**:

  **Pattern References**:
  - `backend/app/api/ai.py:ai_stream()` - Async task pattern

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `backend/tests/test_api_discovery.py`
  - [ ] Tests: Trigger clustering, poll status, graph format
  - [ ] `cd backend && pytest tests/test_api_discovery.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Clustering workflow via API
    Tool: Bash (curl)
    Steps:
      1. POST /discovery/cluster with {"notebook_id": 1}
      2. Assert: HTTP 202 Accepted
      3. Assert: response.task_id exists
      4. Poll GET /discovery/cluster/$TASK_ID every 2s
      5. Assert: Eventually status = "completed"
      6. Assert: response.clusters is array
    Expected Result: Async clustering works
    Evidence: Response JSONs

  Scenario: Graph endpoint returns valid format
    Tool: Bash (curl + jq)
    Steps:
      1. Ensure clustering completed for notebook 1
      2. GET /discovery/graph?notebook_id=1
      3. Assert: response.nodes is array
      4. Assert: response.links is array
      5. Assert: Each node has id, label, cluster_id
      6. Assert: Each link has source, target (valid node ids)
      7. Assert: nodes.length <= 50
    Expected Result: Graph data valid for react-force-graph
    Evidence: Response JSON
  ```

  **Commit**: YES
  - Message: `feat(api): add discovery endpoints for clustering and graph data`
  - Files: `backend/app/api/discovery.py`, `backend/app/main.py`
  - Pre-commit: `cd backend && pytest tests/test_api_discovery.py -v`

---

- [ ] 4.3 Create useDiscovery Hooks

  **What to do**:
  - Create `frontend/src/hooks/useDiscovery.ts`:
    - `useTriggerClustering()` - Mutation to start clustering
    - `useClusteringStatus(taskId)` - Poll for task completion
    - `useGraphData(notebookId)` - Fetch graph nodes/links
    - `useTimeline(notebookId)` - Fetch activity timeline
  - Implement polling with 2s interval until completed/failed
  - Transform data for react-force-graph format

  **Must NOT do**:
  - Do NOT poll infinitely (max 60 polls = 2 minutes)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Frontend data hooks with polling
  - **Skills**: [`react-19`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 9 (with Task 4.2)
  - **Blocks**: Task 4.4
  - **Blocked By**: Task 4.2 (API must exist)

  **References**:

  **Pattern References**:
  - `frontend/src/hooks/useSearch.ts` - Query with parameters
  - TanStack Query refetchInterval for polling

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `frontend/src/__tests__/hooks/useDiscovery.test.ts`
  - [ ] Tests: Trigger, polling, data transformation
  - [ ] `cd frontend && npm test -- src/__tests__/hooks/useDiscovery.test.ts` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Polling stops on completion
    Tool: Vitest
    Steps:
      1. Mock API to return status="processing" twice, then "completed"
      2. Render useClusteringStatus hook
      3. Assert: refetch called 3 times
      4. Assert: After "completed", no more refetches
    Expected Result: Polling terminates correctly
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(hooks): add useDiscovery hooks for clustering and graph`
  - Files: `frontend/src/hooks/useDiscovery.ts`
  - Pre-commit: `cd frontend && npm test -- --run`

---

- [ ] 4.4 Create DiscoveryGraph Component

  **What to do**:
  - Create `frontend/src/components/DiscoveryGraph.tsx`:
    - Use react-force-graph-2d for visualization
    - Color nodes by cluster_id
    - Click node to highlight connected nodes and show note preview
    - Cluster legend with toggle visibility
    - "Analyze" button to trigger clustering
    - Loading state during clustering
  - Create `frontend/src/pages/Discovery.tsx`:
    - Graph view + cluster list sidebar
    - Timeline toggle (optional chart)
    - Route: `/notebooks/:id/discover`

  **Must NOT do**:
  - Do NOT use 3D visualization
  - Do NOT auto-cluster on page load (user clicks "Analyze")

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex interactive visualization
  - **Skills**: [`react-19`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 10 (after 4.2, 4.3)
  - **Blocks**: None
  - **Blocked By**: Tasks 4.2, 4.3

  **References**:

  **External References**:
  - react-force-graph: https://github.com/vasturiano/react-force-graph

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `frontend/src/__tests__/components/DiscoveryGraph.test.tsx`
  - [ ] Tests: Render graph, node click, analyze button
  - [ ] `cd frontend && npm test -- src/__tests__/components/DiscoveryGraph.test.tsx` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Graph visualization with clustering
    Tool: Playwright
    Preconditions: Notebook 1 has clustered data
    Steps:
      1. Navigate to /notebooks/1/discover
      2. Click: button containing "Analyze"
      3. Wait for: .clustering-status shows "Processing" then "Complete"
      4. Assert: svg.force-graph visible
      5. Assert: Multiple colored node groups visible
      6. Click: Any graph node
      7. Assert: .note-preview panel appears with note title
      8. Screenshot: .sisyphus/evidence/task-4.4-graph.png
    Expected Result: Interactive graph works
    Evidence: .sisyphus/evidence/task-4.4-graph.png

  Scenario: Cluster legend toggles visibility
    Tool: Playwright
    Steps:
      1. Navigate to discovery page with clustered data
      2. Assert: Legend shows cluster colors
      3. Click: First cluster legend item (toggle)
      4. Assert: Nodes of that cluster hidden/faded
      5. Click again
      6. Assert: Nodes restored
    Expected Result: Filter by cluster works
    Evidence: Screenshot
  ```

  **Commit**: YES
  - Message: `feat(ui): add DiscoveryGraph component with react-force-graph`
  - Files: `frontend/src/components/DiscoveryGraph.tsx`, `frontend/src/pages/Discovery.tsx`, `frontend/src/App.tsx`
  - Pre-commit: `cd frontend && npm run build`

---

### Phase 5: Document Formatting

---

- [ ] 5.1 Create Korean Spell Check Endpoint

  **What to do**:
  - Create `backend/app/api/formatting.py` with endpoint:
    - `POST /ai/spellcheck` - Check Korean spelling via LLM
  - Create `backend/app/ai_router/prompts/spellcheck.py`:
    - System prompt for Korean spell checking
    - Handle mixed Korean/English text
    - Return: `{corrections: [{original, suggestion, position}], checked_text}`
  - Add to FeatureType literal in ai.py

  **Must NOT do**:
  - Do NOT include grammar correction (spell check only)
  - Do NOT modify original text (return suggestions only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: AI integration with prompt engineering
  - **Skills**: [`fastapi-latest`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 11 (with Task 5.2)
  - **Blocks**: Task 5.3
  - **Blocked By**: None (uses existing AI router)

  **References**:

  **Pattern References**:
  - `backend/app/ai_router/prompts/` - Prompt module pattern
  - `backend/app/api/ai.py:ai_chat()` - Feature dispatch pattern

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `backend/tests/test_api_spellcheck.py`
  - [ ] Tests: Korean corrections, mixed text, no false positives
  - [ ] `cd backend && pytest tests/test_api_spellcheck.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Korean spell check identifies errors
    Tool: Bash (curl)
    Steps:
      1. POST /ai/spellcheck with {"text": "안녕하세요 반값습니다"}
      2. Assert: HTTP 200
      3. Assert: response.corrections[0].original == "반값습니다"
      4. Assert: response.corrections[0].suggestion == "반갑습니다"
    Expected Result: Typo detected and corrected
    Evidence: Response JSON

  Scenario: Mixed Korean/English handled correctly
    Tool: Bash (curl)
    Steps:
      1. POST /ai/spellcheck with {"text": "오늘 meetig이 있습니다"}
      2. Assert: HTTP 200
      3. Assert: Correction for "meetig" → "meeting" (if English checked) OR no correction (Korean-only mode)
    Expected Result: Mixed text doesn't crash
    Evidence: Response JSON
  ```

  **Commit**: YES
  - Message: `feat(ai): add Korean spell check endpoint with LLM`
  - Files: `backend/app/api/formatting.py`, `backend/app/ai_router/prompts/spellcheck.py`
  - Pre-commit: `cd backend && pytest tests/test_api_spellcheck.py -v`

---

- [ ] 5.2 Create AI Rewrite Endpoint

  **What to do**:
  - Add to `backend/app/api/formatting.py`:
    - `POST /ai/rewrite` - Rewrite for clarity (streaming SSE)
  - Create `backend/app/ai_router/prompts/rewrite.py`:
    - System prompt for clarity improvement
    - Preserve formatting (bold, lists) in markdown
    - Options: concise, detailed, formal, casual
  - Use existing SSE streaming pattern

  **Must NOT do**:
  - Do NOT change meaning (clarity only)
  - Do NOT strip formatting

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: AI streaming with formatting preservation
  - **Skills**: [`fastapi-latest`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 11 (with Task 5.1)
  - **Blocks**: Task 5.3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `backend/app/api/ai.py:ai_stream()` - SSE streaming pattern

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `backend/tests/test_api_rewrite.py`
  - [ ] Tests: Streaming response, formatting preservation
  - [ ] `cd backend && pytest tests/test_api_rewrite.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Rewrite streams improved text
    Tool: Bash (curl -N for streaming)
    Steps:
      1. curl -N -X POST http://localhost:8000/api/ai/rewrite \
           -H "Authorization: Bearer $TOKEN" \
           -d '{"text": "이것은 매우 긴 문장입니다 그리고 읽기가 어렵습니다"}'
      2. Assert: Receives SSE events (data: {...})
      3. Assert: Final event is data: [DONE]
      4. Assert: Combined chunks form coherent rewritten text
    Expected Result: Streaming rewrite works
    Evidence: SSE output log
  ```

  **Commit**: YES (group with 5.1)
  - Message: `feat(ai): add AI sentence rewrite endpoint with SSE streaming`
  - Files: `backend/app/api/formatting.py`, `backend/app/ai_router/prompts/rewrite.py`

---

- [ ] 5.3 Create FormatToolbar Component

  **What to do**:
  - Create `frontend/src/components/FormatToolbar.tsx`:
    - Spell check button with error highlighting
    - Rewrite button with style options dropdown
    - Apply suggestion inline with diff preview
    - Integrate with TipTap editor
  - Create `frontend/src/hooks/useFormatting.ts`:
    - `useSpellCheck()` - Mutation for checking
    - `useRewrite()` - Mutation with SSE handling
  - Add toolbar to NoteDetail edit mode

  **Must NOT do**:
  - Do NOT auto-apply suggestions (user confirms each)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Rich text toolbar integration
  - **Skills**: [`react-19`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 12 (after 5.1, 5.2)
  - **Blocks**: None
  - **Blocked By**: Tasks 5.1, 5.2

  **References**:

  **Pattern References**:
  - TipTap editor integration patterns
  - `frontend/src/hooks/useAIChat.ts` - SSE handling (if exists)

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `frontend/src/__tests__/components/FormatToolbar.test.tsx`
  - [ ] Tests: Spell check highlight, rewrite streaming
  - [ ] `cd frontend && npm test -- src/__tests__/components/FormatToolbar.test.tsx` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Spell check highlights errors
    Tool: Playwright
    Preconditions: Note with Korean text containing typos
    Steps:
      1. Navigate to note edit mode
      2. Click: .format-toolbar button[title="Spell Check"]
      3. Wait for: Spell check completion
      4. Assert: .spelling-error elements visible (red underline)
      5. Click: First .spelling-error
      6. Assert: Suggestion popup appears
      7. Click: Suggestion
      8. Assert: Text replaced with correct spelling
      9. Screenshot: .sisyphus/evidence/task-5.3-spell.png
    Expected Result: Full spell check workflow
    Evidence: .sisyphus/evidence/task-5.3-spell.png

  Scenario: Rewrite shows streaming result
    Tool: Playwright
    Steps:
      1. Select text in editor
      2. Click: Rewrite button
      3. Select: "Concise" style option
      4. Wait for: .rewrite-preview visible
      5. Assert: Text appearing progressively (streaming)
      6. Click: "Apply" button
      7. Assert: Selected text replaced with rewritten version
    Expected Result: Streaming rewrite works
    Evidence: Screenshot
  ```

  **Commit**: YES
  - Message: `feat(ui): add FormatToolbar with spell check and AI rewrite`
  - Files: `frontend/src/components/FormatToolbar.tsx`, `frontend/src/hooks/useFormatting.ts`
  - Pre-commit: `cd frontend && npm run build`

---

- [ ] 5.4 Create Research Note Template System

  **What to do**:
  - Create `backend/app/templates/research_note.py`:
    - Standard lab note template with sections: Objective, Method, Results, Conclusion
    - Template variables: `{date}`, `{author}`, `{project}`
  - Add API endpoint:
    - `GET /templates` - List available templates
    - `POST /templates/apply` - Apply template to new note
  - Create `frontend/src/components/TemplateSelector.tsx`:
    - Template preview modal
    - Insert template into editor

  **Must NOT do**:
  - Do NOT create template marketplace
  - Do NOT allow custom template creation (local only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Simple template system
  - **Skills**: [`fastapi-latest`, `react-19`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 12 (with Task 5.3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - Standard lab notebook formats

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `backend/tests/test_api_templates.py`
  - [ ] Tests: List templates, apply template
  - [ ] `cd backend && pytest tests/test_api_templates.py -v` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Insert research note template
    Tool: Playwright
    Steps:
      1. Create new note
      2. Click: "Templates" button
      3. Select: "Research Note" template
      4. Assert: Template preview shows sections
      5. Click: "Insert"
      6. Assert: Editor contains template headers
      7. Assert: {date} replaced with current date
    Expected Result: Template applied correctly
    Evidence: Screenshot
  ```

  **Commit**: YES
  - Message: `feat(templates): add research note template system`
  - Files: `backend/app/templates/`, `frontend/src/components/TemplateSelector.tsx`
  - Pre-commit: `cd backend && pytest tests/test_api_templates.py -v`

---

## Commit Strategy

| Phase | After Task | Message | Verification |
|-------|------------|---------|--------------|
| 1 | 1.1 | `feat(db): add Notebook model and migration` | pytest tests/test_models_notebook.py |
| 1 | 1.2 | `feat(db): add ShareLink model` | pytest tests/test_models_sharelink.py |
| 1 | 1.3+1.4 | `feat(permissions): add NotebookAccess and resolution service` | pytest tests/test_notebook_access_control.py |
| 2 | 2.1+2.2 | `feat(api): add notebooks and access endpoints` | pytest tests/test_api_notebooks.py |
| 2 | 2.3 | `feat(hooks): add useNotebooks hooks` | npm test |
| 2 | 2.4+2.5 | `feat(ui): add Notebooks pages` | npm run build |
| 3 | 3.1+3.2 | `feat(api): add share links system` | pytest tests/test_api_share_links.py |
| 3 | 3.3+3.4 | `feat(ui): add sharing UI components` | npm run build |
| 4 | 4.1+4.2 | `feat(discovery): add clustering service and API` | pytest tests/test_api_discovery.py |
| 4 | 4.3+4.4 | `feat(ui): add Discovery graph visualization` | npm run build |
| 5 | 5.1+5.2 | `feat(ai): add formatting endpoints` | pytest tests/test_api_spellcheck.py |
| 5 | 5.3+5.4 | `feat(ui): add FormatToolbar and templates` | npm run build |

---

## Success Criteria

### Verification Commands
```bash
# Backend tests
cd backend && pytest tests/ -v --tb=short
# Expected: All tests pass

# Frontend tests
cd frontend && npm test -- --run
# Expected: All tests pass

# Build verification
cd frontend && npm run build
# Expected: Build succeeds with no TypeScript errors

# Lint verification
cd backend && ruff check .
cd frontend && npm run lint
# Expected: No errors
```

### Final Checklist
- [ ] All "Must Have" features implemented and tested
- [ ] All "Must NOT Have" guardrails respected
- [ ] Permission resolution works (note overrides notebook)
- [ ] All 3 share link types functional
- [ ] Clustering produces valid graph data
- [ ] Korean spell check identifies common errors
- [ ] All TDD tests passing
- [ ] No TypeScript errors in frontend build
