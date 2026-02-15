import { test, expect } from '@playwright/test'

// ─── Auth ────────────────────────────────────────────────────────────────────

test.describe('Auth', () => {
  // Use empty state (no auth) for these tests
  test.use({ storageState: { cookies: [], origins: [] } })

  test('login page rejects wrong password', async ({ page }) => {
    await page.goto('/login')

    // Wait for page to load
    await page.waitForLoadState('networkidle')

    // Fill in credentials using textbox role
    await page.getByRole('textbox', { name: /email/i }).fill('ceo@invirustech.com')
    await page.getByLabel(/password/i).fill('wrongpassword')

    // Click login button
    await page.getByRole('button', { name: /login|로그인/i }).click()

    // Wait for error message to appear
    await expect(page.getByText(/이메일 또는 비밀번호가 올바르지 않|Invalid email or password/i)).toBeVisible({ timeout: 10000 })
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
    await expect(main.getByText(/전체 노트|모든 노트/i)).toBeVisible()
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
    await expect(sidebar.getByText('AI 사서')).toBeVisible()
    await expect(sidebar.getByText('AI 분석')).toBeVisible()
    await expect(sidebar.getByText('그래프')).toBeVisible()
    await expect(sidebar.getByText('멤버')).toBeVisible()
    await expect(sidebar.getByText('설정')).toBeVisible()
    await expect(sidebar.getByText('운영 현황')).toBeVisible()
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
    const notebookSidebar = page.getByRole('button', { name: /모든 노트/i })
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
    await expect(page.getByRole('searchbox')).toBeVisible()
  })

  test('search type buttons are present', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByRole('button', { name: /하이브리드/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /키워드 검색/i }).first()).toBeVisible()
  })

  test('empty search shows initial state', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByText(/검색어를 입력/i)).toBeVisible()
  })

  test('performing a search updates URL', async ({ page }) => {
    await page.goto('/search')
    await page.getByRole('searchbox').fill('test query')
    await page.getByRole('searchbox').press('Enter')
    await expect(page).toHaveURL(/[?&]q=test/)
  })
})

// ─── AI Workbench ────────────────────────────────────────────────────────────

test.describe('AI Workbench', () => {
  test('loads page with heading', async ({ page }) => {
    await page.goto('/ai')
    await expect(page.getByRole('heading', { name: /AI 워크벤치|AI 분석|AI Workbench/i })).toBeVisible()
  })

  test('feature tabs are visible', async ({ page }) => {
    await page.goto('/ai')
    await expect(page.getByRole('tab', { name: /인사이트 생성/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /검색 질문하기/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /작성 지원/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /맞춤법 검사/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /템플릿 생성/i })).toBeVisible()
  })

  test('clicking feature tab switches selection', async ({ page }) => {
    await page.goto('/ai')
    const writingTab = page.getByRole('tab', { name: /작성 지원/i })
    await writingTab.click()
    await expect(writingTab).toHaveAttribute('aria-selected', 'true')
  })
})

// ─── Settings ────────────────────────────────────────────────────────────────

test.describe('Settings Page', () => {
  test('loads page with heading', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('main').getByRole('heading', { name: /설정/i }).first()).toBeVisible()
  })

  test('admin sees NAS connection section', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await expect(page.getByText(/Synology NAS 연결/i)).toBeVisible()
  })

  test('API keys section is visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await expect(page.getByText(/API 키 관리/i)).toBeVisible()
  })

  test('search indexing section is visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
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
    await expect(page.getByRole('button', { name: /멤버 초대|Invite/i })).toBeVisible()
  })

  test('current user is listed as owner', async ({ page }) => {
    await page.goto('/members')
    await expect(page.getByText('ceo@invirustech.com')).toBeVisible()
    await expect(page.getByText(/Owner|소유자/i)).toBeVisible()
  })

  test('invite modal opens and closes', async ({ page }) => {
    await page.goto('/members')
    await page.getByRole('button', { name: /멤버 초대|Invite/i }).click()
    const emailInput = page.locator('input[type="email"]').or(page.locator('#invite-email'))
    await expect(emailInput.first()).toBeVisible()
    await page.getByRole('button', { name: /취소|Cancel|닫기|Close/i }).click()
    await expect(emailInput.first()).not.toBeVisible()
  })
})

// ─── Admin Dashboard ─────────────────────────────────────────────────────────

test.describe('Admin Dashboard', () => {
  test('loads page with heading and tabs', async ({ page }) => {
    // Admin is now accessed via Settings > 관리자 tab
    await page.goto('/settings')
    const main = page.locator('main')
    await page.getByRole('button', { name: '관리자' }).click()
    await page.waitForTimeout(300)

    // Admin tab content should be visible - look for data management or org settings
    await expect(main.getByText(/조직 설정|데이터 관리|관리자/i)).toBeVisible()
  })

  test('overview shows org info', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '관리자' }).click()
    await page.waitForTimeout(300)
    // Look for org info or data summary
    await expect(page.getByText(/조직|노트 수|멤버 수/i).first()).toBeVisible()
  })
})

// ─── Graph ───────────────────────────────────────────────────────────────────

test.describe('Graph Page', () => {
  test('loads page with heading', async ({ page }) => {
    await page.goto('/graph')
    await expect(page.getByText(/지식 그래프|그래프/i)).toBeVisible()
  })
})
