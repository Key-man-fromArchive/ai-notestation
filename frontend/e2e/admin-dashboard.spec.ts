import { test, expect } from '@playwright/test'

// ─── Admin Dashboard ─────────────────────────────────────────────────────────

test.describe('Admin Dashboard', () => {
  test('admin page loads with heading', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await expect(main.getByRole('heading', { name: /관리자 대시보드/i })).toBeVisible()
  })

  test('all tabs visible', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await expect(main.getByRole('button', { name: /개요/i })).toBeVisible()
    await expect(main.getByRole('button', { name: /데이터베이스/i })).toBeVisible()
    await expect(main.getByRole('button', { name: /사용자/i })).toBeVisible()
    await expect(main.getByRole('button', { name: /^NAS$/i })).toBeVisible()
    await expect(main.getByRole('button', { name: /LLM/i })).toBeVisible()
  })

  test('overview: active users count', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByText(/활성 사용자/i)).toBeVisible()
    // Check that a number is displayed
    const userCountCard = page.locator('text=/활성 사용자/i').locator('..')
    await expect(userCountCard).toContainText(/\d+/)
  })

  test('overview: total notes count', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByText(/전체 노트/i).first()).toBeVisible()
    const notesCard = page.locator('text=/전체 노트/i').first().locator('..')
    await expect(notesCard).toContainText(/\d+/)
  })

  test('overview: total notebooks count', async ({ page }) => {
    await page.goto('/admin')
    // "전체 노트북" or similar metric
    const notebooksText = page.getByText(/노트북/i).filter({ hasText: /전체|총|Total/i })
    await expect(notebooksText.or(page.getByText(/노트북/i)).first()).toBeVisible()
  })

  test('overview: storage usage', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByText(/스토리지 사용량/i)).toBeVisible()
    const storageCard = page.locator('text=/스토리지 사용량/i').locator('..')
    // Should show size (bytes/KB/MB/GB)
    await expect(storageCard).toContainText(/\d+/)
  })

  test('overview: sync status', async ({ page }) => {
    await page.goto('/admin')
    // Sync status might show "최근 동기화", "마지막 동기화" or "동기화 상태"
    const syncStatus = page.getByText(/동기화/i)
    await expect(syncStatus.first()).toBeVisible()
  })

  test('db: database size', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()
    await expect(page.getByText(/데이터베이스 크기/i)).toBeVisible()
  })

  test('db: active connections', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()
    await expect(page.getByText(/활성 연결/i)).toBeVisible()
  })

  test('db: table stats table', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()
    await expect(page.getByText(/테이블별 통계/i)).toBeVisible()
    // Should have a table with headers
    const statsSection = page.locator('text=/테이블별 통계/i').locator('..')
    await expect(statsSection.locator('table, .table-container')).toBeVisible()
  })

  test('users: user list', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()
    // Admin user should be in the list
    await expect(page.getByText(/ceo@invirustech.com/i)).toBeVisible()
  })

  test('users: shows roles', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()
    // Should show role (Owner, Admin, Member, etc.)
    await expect(page.getByText(/Owner|Admin|Member/i).first()).toBeVisible()
  })

  test('nas: connection status', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /^NAS$/i }).click()
    // Either connected or not configured
    const connected = page.getByText(/NAS 연결됨|연결됨|Connected/i)
    const notConfigured = page.getByText(/NAS 미설정|미설정|Not Configured/i)
    await expect(connected.or(notConfigured)).toBeVisible()
  })

  test('nas: last sync time', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /^NAS$/i }).click()
    // Should show "마지막 동기화" or "Last Sync"
    const lastSync = page.getByText(/마지막 동기화|Last Sync/i)
    await expect(lastSync.first()).toBeVisible()
  })

  test('llm: active providers', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /LLM/i }).click()
    await expect(page.getByText(/활성 프로바이더/i)).toBeVisible()
  })

  test('llm: available models count', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /LLM/i }).click()
    await expect(page.getByText(/사용 가능 모델/i)).toBeVisible()
    // Should display a count
    const modelsCard = page.locator('text=/사용 가능 모델/i').locator('..')
    await expect(modelsCard).toContainText(/\d+/)
  })
})
