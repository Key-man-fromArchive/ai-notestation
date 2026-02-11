# Playwright Full Suite E2E Test Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build comprehensive Playwright E2E tests covering all pages and critical user flows in LabNote AI using a real admin account.

**Architecture:** Single `fullsuite.spec.ts` file organized by test.describe blocks per page. Uses `storageState` for shared auth (login once, reuse across all tests). Tests verify page load, key elements visibility, and critical interactions. Runs against the local Docker dev environment (frontend :3000, backend :8001).

**Tech Stack:** Playwright Test, TypeScript, chromium browser

**Test Account:** `ai-note@labnote.ai` / `invirus0682!` (owner role)

---

## Phase 1: Auth Setup & Login Tests

### Task 1: Create shared auth setup and login tests

**Files:**
- Create: `frontend/e2e/fullsuite.spec.ts`
- Create: `frontend/e2e/auth.setup.ts`
- Modify: `frontend/playwright.config.ts` (add setup project)

**Step 1: Create auth setup file that logs in and saves state**

```typescript
// frontend/e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/이메일|email/i).fill('ai-note@labnote.ai')
  await page.getByLabel(/비밀번호|password/i).fill('invirus0682!')
  await page.getByRole('button', { name: /로그인/i }).click()

  // Wait for redirect to dashboard
  await page.waitForURL('/', { timeout: 15000 })
  await expect(page.getByRole('heading', { name: /대시보드/i })).toBeVisible({ timeout: 10000 })

  // Save auth state
  await page.context().storageState({ path: AUTH_FILE })
})
```

**Step 2: Update playwright.config.ts to add setup project**

Add `setup` project and `authenticated` project to `playwright.config.ts`:

```typescript
// Add to projects array in playwright.config.ts
projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  {
    name: 'authenticated',
    testMatch: /fullsuite\.spec\.ts/,
    dependencies: ['setup'],
    use: { storageState: 'e2e/.auth/user.json' },
  },
],
```

Also add to the top-level config:
```typescript
outputDir: 'e2e/test-results',
```

**Step 3: Create fullsuite.spec.ts with login/logout tests**

```typescript
// frontend/e2e/fullsuite.spec.ts
import { test, expect } from '@playwright/test'

// ─── Auth ────────────────────────────────────────────────────────────────────

test.describe('Auth', () => {
  test('login page rejects wrong password', async ({ browser }) => {
    const context = await browser.newContext() // fresh context, no auth
    const page = await context.newPage()
    await page.goto('/login')

    await page.getByLabel(/이메일|email/i).fill('ai-note@labnote.ai')
    await page.getByLabel(/비밀번호|password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /로그인/i }).click()

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 })
    await context.close()
  })

  test('unauthenticated user is redirected to login', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('/settings')

    await expect(page).toHaveURL(/\/login/)
    await context.close()
  })
})
```

**Step 4: Run to verify auth setup works**

Run: `cd frontend && npx playwright test e2e/auth.setup.ts --project=setup`
Expected: PASS - auth state saved to e2e/.auth/user.json

**Step 5: Run login tests**

Run: `cd frontend && npx playwright test e2e/fullsuite.spec.ts -g "Auth"`
Expected: PASS - both auth tests pass

**Step 6: Commit**

```bash
git add frontend/e2e/auth.setup.ts frontend/e2e/fullsuite.spec.ts frontend/playwright.config.ts
git commit -m "test(e2e): add auth setup and login tests"
```

---

## Phase 2: Dashboard & Navigation Tests

### Task 2: Add dashboard and sidebar navigation tests

**Files:**
- Modify: `frontend/e2e/fullsuite.spec.ts`

**Step 1: Append dashboard tests**

```typescript
// ─── Dashboard ───────────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
  test('displays page heading and stats cards', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /대시보드/i })).toBeVisible()

    // Stats cards should be visible
    await expect(page.getByText(/전체 노트/i)).toBeVisible()
    await expect(page.getByText(/전체 노트북/i)).toBeVisible()
  })

  test('quick action links are present', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /노트 검색/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /AI/i })).toBeVisible()
  })

  test('sync button is visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /동기화/i })).toBeVisible()
  })
})

// ─── Sidebar Navigation ─────────────────────────────────────────────────────

test.describe('Sidebar Navigation', () => {
  test('all nav links are visible for admin user', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.locator('aside')

    await expect(sidebar.getByText('대시보드')).toBeVisible()
    await expect(sidebar.getByText('노트')).toBeVisible()
    await expect(sidebar.getByText('노트북')).toBeVisible()
    await expect(sidebar.getByText('검색')).toBeVisible()
    await expect(sidebar.getByText('AI 분석')).toBeVisible()
    await expect(sidebar.getByText('그래프')).toBeVisible()
    await expect(sidebar.getByText('멤버')).toBeVisible()
    await expect(sidebar.getByText('설정')).toBeVisible()
    await expect(sidebar.getByText('관리자')).toBeVisible()
  })

  test('clicking nav link navigates to correct page', async ({ page }) => {
    await page.goto('/')
    await page.locator('aside').getByText('검색').click()
    await expect(page).toHaveURL(/\/search/)
    await expect(page.getByRole('heading', { name: /검색/i })).toBeVisible()
  })
})
```

**Step 2: Run tests**

Run: `cd frontend && npx playwright test e2e/fullsuite.spec.ts -g "Dashboard|Sidebar"`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/e2e/fullsuite.spec.ts
git commit -m "test(e2e): add dashboard and sidebar navigation tests"
```

---

## Phase 3: Notes & Notebooks Tests

### Task 3: Add notes and notebooks page tests

**Files:**
- Modify: `frontend/e2e/fullsuite.spec.ts`

**Step 1: Append notes and notebooks tests**

```typescript
// ─── Notes ───────────────────────────────────────────────────────────────────

test.describe('Notes Page', () => {
  test('loads page with notebook sidebar', async ({ page }) => {
    await page.goto('/notes')
    await expect(page.getByText(/전체 노트/i)).toBeVisible()
  })

  test('shows empty state when no notes', async ({ page }) => {
    await page.goto('/notes')
    // Either shows notes or empty state
    const hasNotes = await page.getByRole('link', { name: /notes\/\d+/ }).count() > 0
    if (!hasNotes) {
      await expect(page.getByText(/노트가 없습니다/i)).toBeVisible()
    }
  })
})

// ─── Notebooks ───────────────────────────────────────────────────────────────

test.describe('Notebooks Page', () => {
  test('loads notebooks page', async ({ page }) => {
    await page.goto('/notebooks')
    await expect(page.getByRole('heading', { name: /노트북/i })).toBeVisible()
  })
})
```

**Step 2: Run tests**

Run: `cd frontend && npx playwright test e2e/fullsuite.spec.ts -g "Notes|Notebooks"`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/e2e/fullsuite.spec.ts
git commit -m "test(e2e): add notes and notebooks page tests"
```

---

## Phase 4: Search Page Tests

### Task 4: Add search page tests

**Files:**
- Modify: `frontend/e2e/fullsuite.spec.ts`

**Step 1: Append search tests**

```typescript
// ─── Search ──────────────────────────────────────────────────────────────────

test.describe('Search Page', () => {
  test('loads with search input and type selector', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByRole('heading', { name: /검색/i })).toBeVisible()
    await expect(page.getByPlaceholder(/검색/i)).toBeVisible()
  })

  test('search type buttons are present', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByText(/하이브리드/i)).toBeVisible()
    await expect(page.getByText(/전문 검색/i)).toBeVisible()
    await expect(page.getByText(/의미 검색/i)).toBeVisible()
  })

  test('empty search shows initial state', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByText(/검색어를 입력/i)).toBeVisible()
  })

  test('performing a search updates URL', async ({ page }) => {
    await page.goto('/search')
    await page.getByPlaceholder(/검색/i).fill('test query')
    await page.getByPlaceholder(/검색/i).press('Enter')
    await expect(page).toHaveURL(/[?&]q=test/)
  })
})
```

**Step 2: Run tests**

Run: `cd frontend && npx playwright test e2e/fullsuite.spec.ts -g "Search"`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/e2e/fullsuite.spec.ts
git commit -m "test(e2e): add search page tests"
```

---

## Phase 5: AI Workbench Tests

### Task 5: Add AI workbench tests

**Files:**
- Modify: `frontend/e2e/fullsuite.spec.ts`

**Step 1: Append AI workbench tests**

```typescript
// ─── AI Workbench ────────────────────────────────────────────────────────────

test.describe('AI Workbench', () => {
  test('loads page with heading', async ({ page }) => {
    await page.goto('/ai')
    await expect(page.getByRole('heading', { name: /AI Workbench/i })).toBeVisible()
  })

  test('feature tabs are visible', async ({ page }) => {
    await page.goto('/ai')
    await expect(page.getByText('인사이트')).toBeVisible()
    await expect(page.getByText('검색 QA')).toBeVisible()
    await expect(page.getByText('작성')).toBeVisible()
    await expect(page.getByText('교정')).toBeVisible()
    await expect(page.getByText('템플릿')).toBeVisible()
  })

  test('clicking feature tab switches content', async ({ page }) => {
    await page.goto('/ai')
    await page.getByText('작성').click()
    // Tab should be highlighted (has primary color class)
    await expect(page.getByText('작성').locator('..')).toHaveClass(/border-primary|bg-primary/)
  })
})
```

**Step 2: Run tests**

Run: `cd frontend && npx playwright test e2e/fullsuite.spec.ts -g "AI Workbench"`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/e2e/fullsuite.spec.ts
git commit -m "test(e2e): add AI workbench tests"
```

---

## Phase 6: Settings Page Tests

### Task 6: Add settings page tests

**Files:**
- Modify: `frontend/e2e/fullsuite.spec.ts`

**Step 1: Append settings tests**

```typescript
// ─── Settings ────────────────────────────────────────────────────────────────

test.describe('Settings Page', () => {
  test('loads page with heading', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /설정/i })).toBeVisible()
  })

  test('admin sees NAS connection section', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/Synology NAS/i)).toBeVisible()
  })

  test('API keys section is visible', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/API/i).first()).toBeVisible()
  })

  test('search indexing section is visible', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/검색 인덱싱|인덱스/i)).toBeVisible()
  })
})
```

**Step 2: Run tests**

Run: `cd frontend && npx playwright test e2e/fullsuite.spec.ts -g "Settings"`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/e2e/fullsuite.spec.ts
git commit -m "test(e2e): add settings page tests"
```

---

## Phase 7: Members Page Tests

### Task 7: Add members page tests

**Files:**
- Modify: `frontend/e2e/fullsuite.spec.ts`

**Step 1: Append members tests**

```typescript
// ─── Members ─────────────────────────────────────────────────────────────────

test.describe('Members Page', () => {
  test('loads page with heading', async ({ page }) => {
    await page.goto('/members')
    await expect(page.getByRole('heading', { name: /멤버/i })).toBeVisible()
  })

  test('invite button is visible', async ({ page }) => {
    await page.goto('/members')
    await expect(page.getByRole('button', { name: /Invite/i })).toBeVisible()
  })

  test('current user is listed as owner', async ({ page }) => {
    await page.goto('/members')
    await expect(page.getByText('ai-note@labnote.ai')).toBeVisible()
    await expect(page.getByText('Owner')).toBeVisible()
  })

  test('invite modal opens and closes', async ({ page }) => {
    await page.goto('/members')
    await page.getByRole('button', { name: /Invite/i }).click()
    await expect(page.locator('#invite-email')).toBeVisible()
    await page.getByRole('button', { name: /Cancel|Close|취소/i }).click()
    await expect(page.locator('#invite-email')).not.toBeVisible()
  })
})
```

**Step 2: Run tests**

Run: `cd frontend && npx playwright test e2e/fullsuite.spec.ts -g "Members"`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/e2e/fullsuite.spec.ts
git commit -m "test(e2e): add members page tests"
```

---

## Phase 8: Admin Dashboard Tests

### Task 8: Add admin dashboard tests

**Files:**
- Modify: `frontend/e2e/fullsuite.spec.ts`

**Step 1: Append admin dashboard tests**

```typescript
// ─── Admin Dashboard ─────────────────────────────────────────────────────────

test.describe('Admin Dashboard', () => {
  test('loads page with heading and tabs', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: /관리자 대시보드/i })).toBeVisible()

    // All tabs visible
    await expect(page.getByRole('button', { name: /개요/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /데이터베이스/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /사용자/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /NAS/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /LLM/i })).toBeVisible()
  })

  test('overview tab shows metrics', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByText(/활성 사용자/i)).toBeVisible()
    await expect(page.getByText(/전체 노트/i)).toBeVisible()
    await expect(page.getByText(/스토리지 사용량/i)).toBeVisible()
  })

  test('database tab shows table stats', async ({ page }) => {
    await page.goto('/admin')
    await page.getByRole('button', { name: /데이터베이스/i }).click()
    await expect(page.getByText(/데이터베이스 크기/i)).toBeVisible()
    await expect(page.getByText(/활성 연결/i)).toBeVisible()
    // Table should appear
    await expect(page.getByText(/테이블별 통계/i)).toBeVisible()
  })

  test('users tab shows user list', async ({ page }) => {
    await page.goto('/admin')
    await page.getByRole('button', { name: /사용자/i }).click()
    await expect(page.getByText(/ai-note@labnote.ai/i)).toBeVisible()
    await expect(page.getByText(/Owner/)).toBeVisible()
  })

  test('NAS tab shows status', async ({ page }) => {
    await page.goto('/admin')
    await page.getByRole('button', { name: /NAS/i }).click()
    // Either "NAS 연결됨" or "NAS 미설정"
    await expect(page.getByText(/NAS (연결됨|미설정)/i)).toBeVisible()
  })

  test('providers tab shows provider info', async ({ page }) => {
    await page.goto('/admin')
    await page.getByRole('button', { name: /LLM/i }).click()
    await expect(page.getByText(/활성 프로바이더/i)).toBeVisible()
    await expect(page.getByText(/사용 가능 모델/i)).toBeVisible()
  })
})
```

**Step 2: Run tests**

Run: `cd frontend && npx playwright test e2e/fullsuite.spec.ts -g "Admin"`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/e2e/fullsuite.spec.ts
git commit -m "test(e2e): add admin dashboard tests"
```

---

## Phase 9: Graph Page & Final Run

### Task 9: Add graph page tests and run full suite

**Files:**
- Modify: `frontend/e2e/fullsuite.spec.ts`

**Step 1: Append graph test**

```typescript
// ─── Graph ───────────────────────────────────────────────────────────────────

test.describe('Graph Page', () => {
  test('loads page with heading', async ({ page }) => {
    await page.goto('/graph')
    await expect(page.getByText(/그래프 뷰/i)).toBeVisible()
  })
})
```

**Step 2: Run the complete full suite**

Run: `cd frontend && npx playwright test e2e/fullsuite.spec.ts e2e/auth.setup.ts --reporter=list`
Expected: All tests PASS (approx 25-30 tests)

**Step 3: Commit**

```bash
git add frontend/e2e/fullsuite.spec.ts
git commit -m "test(e2e): add graph page test, complete fullsuite"
```

---

## Summary of Test Coverage

| Page | Tests | What's Covered |
|------|-------|----------------|
| Auth | 2 | Wrong password rejection, unauthenticated redirect |
| Dashboard | 3 | Heading, stats cards, quick actions, sync button |
| Sidebar | 2 | All nav links visible (admin), navigation works |
| Notes | 2 | Page load, empty state handling |
| Notebooks | 1 | Page load |
| Search | 4 | Input/type selector visible, initial state, URL update on search |
| AI Workbench | 3 | Heading, feature tabs visible, tab switching |
| Settings | 4 | Heading, NAS section, API keys, search indexing |
| Members | 4 | Heading, invite button, owner listed, invite modal open/close |
| Admin | 6 | All 5 tabs content, metrics, table stats, user list |
| Graph | 1 | Page load |
| **Total** | **32** | |

**New Files:**
- `frontend/e2e/auth.setup.ts` (~20 lines)
- `frontend/e2e/fullsuite.spec.ts` (~250 lines)

**Modified Files:**
- `frontend/playwright.config.ts` (add projects config)
