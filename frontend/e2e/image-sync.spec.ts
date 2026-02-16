import { test, expect } from '@playwright/test'
import { authHeaders, loginAsAdmin } from './utils/auth-helpers'
import { waitForNetworkIdle } from './utils/wait-helpers'

const API = 'http://localhost:8001/api'

// ─── Image Sync API Tests ───────────────────────────────────────────────────

test.describe('Image Sync - API', () => {
  let authToken: string

  test.beforeAll(async ({ request }) => {
    const { token } = await loginAsAdmin(request)
    authToken = token
  })

  test('GET /nsx/sync-images/status returns valid status', async ({ request }) => {
    const res = await request.get(`${API}/nsx/sync-images/status`, {
      headers: authHeaders(authToken),
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('status')
    expect(['idle', 'syncing', 'completed', 'partial', 'error']).toContain(body.status)
    expect(body).toHaveProperty('total_notes')
    expect(body).toHaveProperty('processed_notes')
    expect(body).toHaveProperty('images_extracted')
    expect(body).toHaveProperty('failed_notes')
  })

  test('POST /nsx/sync-images triggers sync or returns no_work', async ({ request }) => {
    const res = await request.post(`${API}/nsx/sync-images`, {
      headers: authHeaders(authToken),
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('status')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('total_notes')
    expect(['syncing', 'no_work', 'already_syncing']).toContain(body.status)
    expect(typeof body.message).toBe('string')
    expect(body.message.length).toBeGreaterThan(0)
  })

  test('POST /nsx/sync-images finds NAS-proxied notes', async ({ request }) => {
    // Check if there are notes with /api/nas-images/ URLs but no NoteImage records
    const res = await request.post(`${API}/nsx/sync-images`, {
      headers: authHeaders(authToken),
    })

    expect(res.status()).toBe(200)
    const body = await res.json()

    if (body.status === 'syncing') {
      // Sync started — there were notes needing sync
      expect(body.total_notes).toBeGreaterThan(0)
      expect(body.message).toContain('동기화를 시작합니다')

      // Poll until complete (max 5 min)
      for (let i = 0; i < 150; i++) {
        const statusRes = await request.get(`${API}/nsx/sync-images/status`, {
          headers: authHeaders(authToken),
        })
        const status = await statusRes.json()

        if (status.status !== 'syncing') {
          expect(['completed', 'partial']).toContain(status.status)
          expect(status.images_extracted).toBeGreaterThanOrEqual(0)
          break
        }

        await new Promise((r) => setTimeout(r, 2000))
      }
    } else {
      // No work or already syncing
      expect(['no_work', 'already_syncing']).toContain(body.status)
    }
  })
})

// ─── Image Sync UI Tests ────────────────────────────────────────────────────

test.describe('Image Sync - Settings UI', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  test('image sync section visible in Data Analysis tab', async ({ page }) => {
    await page.goto('/settings')
    await waitForNetworkIdle(page)

    // Click Data Analysis tab
    const dataTab = page.getByRole('button', { name: /데이터분석|Data Analysis/i })
    await dataTab.click()
    await page.waitForTimeout(500)

    // Image sync section should be visible
    const heading = page.getByText(/이미지 동기화|Image Sync/i).first()
    await expect(heading).toBeVisible({ timeout: 5000 })

    // Sync button should be visible (idle or syncing state)
    const syncButton = page.getByRole('button', { name: /이미지 동기화|동기화 중|Sync Images|Syncing/i })
    await expect(syncButton).toBeVisible()
  })

  test('clicking sync button shows response feedback', async ({ page }) => {
    await page.goto('/settings')
    await waitForNetworkIdle(page)

    // Click Data Analysis tab
    const dataTab = page.getByRole('button', { name: /데이터분석|Data Analysis/i })
    await dataTab.click()
    await page.waitForTimeout(500)

    // Click the sync button
    const syncButton = page.getByRole('button', { name: /이미지 동기화|Sync Images/i })
    await syncButton.click()

    // Wait for API response and UI update
    await page.waitForTimeout(3000)

    // Should show either:
    // 1. Syncing progress (status === 'syncing')
    // 2. Info message (no_work or already_syncing)
    // 3. Error message
    const progressBar = page.locator('.bg-primary.transition-all')
    const infoMessage = page.locator('.bg-blue-500\\/10')
    const completedMessage = page.locator('.bg-green-500\\/10')
    const syncingButton = page.getByRole('button', { name: /동기화 중|Syncing/i })

    const hasProgress = await progressBar.isVisible({ timeout: 2000 }).catch(() => false)
    const hasInfo = await infoMessage.isVisible({ timeout: 2000 }).catch(() => false)
    const hasCompleted = await completedMessage.isVisible({ timeout: 2000 }).catch(() => false)
    const hasSyncing = await syncingButton.isVisible({ timeout: 2000 }).catch(() => false)

    // At least one feedback element should be visible
    const hasFeedback = hasProgress || hasInfo || hasCompleted || hasSyncing
    expect(hasFeedback).toBe(true)
  })

  test('sync button shows syncing state or info message', async ({ page }) => {
    await page.goto('/settings')
    await waitForNetworkIdle(page)

    // Click Data Analysis tab
    const dataTab = page.getByRole('button', { name: /데이터분석|Data Analysis/i })
    await dataTab.click()
    await page.waitForTimeout(500)

    // Check if sync is already in progress (from previous test run)
    const alreadySyncing = await page.getByRole('button', { name: /동기화 중|Syncing/i }).isVisible({ timeout: 1000 }).catch(() => false)

    if (alreadySyncing) {
      // Sync already running — verify UI reflects it
      const syncingButton = page.getByRole('button', { name: /동기화 중|Syncing/i })
      await expect(syncingButton).toBeDisabled()
      const progressText = page.getByText(/%/)
      await expect(progressText).toBeVisible({ timeout: 5000 })
      return
    }

    // Intercept the API call to observe response
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/nsx/sync-images') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /이미지 동기화|Sync Images/i }).click(),
    ])

    const body = await response.json()

    if (body.status === 'syncing') {
      // Button should be disabled and show "Syncing..."
      const syncingButton = page.getByRole('button', { name: /동기화 중|Syncing/i })
      await expect(syncingButton).toBeVisible({ timeout: 3000 })
      await expect(syncingButton).toBeDisabled()

      // Progress should appear
      const progressText = page.getByText(/%/)
      await expect(progressText).toBeVisible({ timeout: 10000 })
    } else {
      // no_work or already_syncing: info message should be shown
      const infoMessage = page.locator('.bg-blue-500\\/10')
      await expect(infoMessage).toBeVisible({ timeout: 3000 })
    }
  })
})
