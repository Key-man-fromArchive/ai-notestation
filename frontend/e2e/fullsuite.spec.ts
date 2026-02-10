import { test, expect } from '@playwright/test'

// ─── Auth ────────────────────────────────────────────────────────────────────

test.describe('Auth', () => {
  // Use empty state (no auth) for these tests
  test.use({ storageState: { cookies: [], origins: [] } })

  test('login page rejects wrong password', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel(/이메일|email/i).fill('ai-note@labnote.ai')
    await page.getByLabel(/비밀번호|password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /로그인/i }).click()

    await expect(page.locator('.text-destructive')).toBeVisible({ timeout: 15000 })
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 })
  })
})

// ─── Dashboard ───────────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
  test('displays page heading and stats cards', async ({ page }) => {
    await page.goto('/')
    const main = page.locator('main')
    await expect(main.getByRole('heading', { name: /대시보드/i })).toBeVisible()

    // Stats cards should be visible
    await expect(main.getByText(/전체 노트/i)).toBeVisible()
  })

  test('quick action links are present', async ({ page }) => {
    await page.goto('/')
    const main = page.locator('main')
    await expect(main.getByRole('link', { name: /노트 검색/i })).toBeVisible()
    await expect(main.getByRole('link', { name: /AI 분석/i }).first()).toBeVisible()
  })

  test('sync button is visible', async ({ page }) => {
    await page.goto('/')
    const main = page.locator('main')
    await expect(main.getByRole('button', { name: /NAS 동기화/i })).toBeVisible()
  })
})

// ─── Sidebar Navigation ─────────────────────────────────────────────────────

test.describe('Sidebar Navigation', () => {
  test('all nav links are visible for admin user', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.locator('aside')

    await expect(sidebar.getByText('대시보드')).toBeVisible()
    await expect(sidebar.getByText('노트', { exact: true })).toBeVisible()
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
    await expect(page.getByRole('heading', { name: '노트 검색' })).toBeVisible()
  })
})

// ─── Notes ───────────────────────────────────────────────────────────────────

test.describe('Notes Page', () => {
  test('loads notes page', async ({ page }) => {
    await page.goto('/notes')
    // Either shows notebook sidebar (when notes exist) or empty state
    const notebookSidebar = page.getByRole('button', { name: /전체 노트/i })
    const emptyState = page.getByText(/노트가 없습니다/i)
    await expect(notebookSidebar.or(emptyState)).toBeVisible({ timeout: 10000 })
  })
})

// ─── Notebooks ───────────────────────────────────────────────────────────────

test.describe('Notebooks Page', () => {
  test('loads notebooks page', async ({ page }) => {
    await page.goto('/notebooks')
    const main = page.locator('main')
    await expect(main.getByRole('heading', { name: '노트북', exact: true })).toBeVisible({ timeout: 10000 })
  })
})

// ─── Search ──────────────────────────────────────────────────────────────────

test.describe('Search Page', () => {
  test('loads with search input and type selector', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByRole('heading', { name: '노트 검색' })).toBeVisible()
    await expect(page.getByPlaceholder(/노트 검색/i)).toBeVisible()
  })

  test('search type buttons are present', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByRole('radio', { name: /하이브리드/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: /전문 검색/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: /의미 검색/i })).toBeVisible()
  })

  test('empty search shows initial state', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByText(/검색어를 입력/i)).toBeVisible()
  })

  test('performing a search updates URL', async ({ page }) => {
    await page.goto('/search')
    await page.getByPlaceholder(/노트 검색/i).fill('test query')
    await page.getByPlaceholder(/노트 검색/i).press('Enter')
    await expect(page).toHaveURL(/[?&]q=test/)
  })
})

// ─── AI Workbench ────────────────────────────────────────────────────────────

test.describe('AI Workbench', () => {
  test('loads page with heading', async ({ page }) => {
    await page.goto('/ai')
    await expect(page.getByRole('heading', { name: /AI Workbench/i })).toBeVisible()
  })

  test('feature tabs are visible', async ({ page }) => {
    await page.goto('/ai')
    await expect(page.getByRole('tab', { name: /인사이트/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /검색 QA/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /작성/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /교정/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /템플릿/i })).toBeVisible()
  })

  test('clicking feature tab switches selection', async ({ page }) => {
    await page.goto('/ai')
    const writingTab = page.getByRole('tab', { name: /작성/i })
    await writingTab.click()
    await expect(writingTab).toHaveAttribute('aria-selected', 'true')
  })
})

// ─── Settings ────────────────────────────────────────────────────────────────

test.describe('Settings Page', () => {
  test('loads page with heading', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /설정/i })).toBeVisible()
  })

  test('admin sees NAS connection section', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/Synology NAS 연결/i)).toBeVisible()
  })

  test('API keys section is visible', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/API 키 관리/i)).toBeVisible()
  })

  test('search indexing section is visible', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/검색 인덱싱/i)).toBeVisible()
  })
})

// ─── Members ─────────────────────────────────────────────────────────────────

test.describe('Members Page', () => {
  test('loads page with heading', async ({ page }) => {
    await page.goto('/members')
    await expect(page.getByRole('heading', { name: /멤버/i })).toBeVisible()
  })

  test('invite button is visible', async ({ page }) => {
    await page.goto('/members')
    await expect(page.getByRole('button', { name: /Invite Member/i })).toBeVisible()
  })

  test('current user is listed as owner', async ({ page }) => {
    await page.goto('/members')
    await expect(page.getByText('ai-note@labnote.ai')).toBeVisible()
    await expect(page.getByText('Owner')).toBeVisible()
  })

  test('invite modal opens and closes', async ({ page }) => {
    await page.goto('/members')
    await page.getByRole('button', { name: /Invite Member/i }).click()
    await expect(page.locator('#invite-email')).toBeVisible()
    await page.getByRole('button', { name: /Cancel/i }).click()
    await expect(page.locator('#invite-email')).not.toBeVisible()
  })
})

// ─── Admin Dashboard ─────────────────────────────────────────────────────────

test.describe('Admin Dashboard', () => {
  test('loads page with heading and tabs', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await expect(main.getByRole('heading', { name: /관리자 대시보드/i })).toBeVisible()

    // All tabs visible
    await expect(main.getByRole('button', { name: /개요/i })).toBeVisible()
    await expect(main.getByRole('button', { name: /데이터베이스/i })).toBeVisible()
    await expect(main.getByRole('button', { name: /사용자/i })).toBeVisible()
    await expect(main.getByRole('button', { name: /^NAS$/i })).toBeVisible()
    await expect(main.getByRole('button', { name: /LLM/i })).toBeVisible()
  })

  test('overview tab shows metrics', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByText(/활성 사용자/i)).toBeVisible()
    await expect(page.getByText(/전체 노트/i).first()).toBeVisible()
    await expect(page.getByText(/스토리지 사용량/i)).toBeVisible()
  })

  test('database tab shows table stats', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()
    await expect(page.getByText(/데이터베이스 크기/i)).toBeVisible()
    await expect(page.getByText(/활성 연결/i)).toBeVisible()
    await expect(page.getByText(/테이블별 통계/i)).toBeVisible()
  })

  test('users tab shows user list', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()
    await expect(page.getByText(/ai-note@labnote.ai/i)).toBeVisible()
    await expect(page.getByText(/Owner/).first()).toBeVisible()
  })

  test('NAS tab shows status', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /^NAS$/i }).click()
    // Either "NAS 연결됨" or "NAS 미설정"
    const connected = page.getByText(/NAS 연결됨/i)
    const notConfigured = page.getByText(/NAS 미설정/i)
    await expect(connected.or(notConfigured)).toBeVisible()
  })

  test('providers tab shows provider info', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /LLM/i }).click()
    await expect(page.getByText(/활성 프로바이더/i)).toBeVisible()
    await expect(page.getByText(/사용 가능 모델/i)).toBeVisible()
  })
})

// ─── Graph ───────────────────────────────────────────────────────────────────

test.describe('Graph Page', () => {
  test('loads page with heading', async ({ page }) => {
    await page.goto('/graph')
    await expect(page.getByText(/그래프 뷰/i)).toBeVisible()
  })
})
