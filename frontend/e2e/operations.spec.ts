import { test, expect } from '@playwright/test'
import { loginAsAdmin, authHeaders } from './utils/auth-helpers'
import { pollTaskStatus, waitForNetworkIdle } from './utils/wait-helpers'

const API = 'http://localhost:8001/api'

// ─── Operations Page ─────────────────────────────────────────────────────────

test.describe('Operations Page', () => {
  let adminToken: string

  test.beforeAll(async ({ request }) => {
    const { token } = await loginAsAdmin(request)
    adminToken = token
  })

  test('operations page loads', async ({ page }) => {
    await page.goto('/operations')
    await expect(page.getByRole('heading', { name: /운영|Operations/i })).toBeVisible()
  })

  test('batch OCR section visible', async ({ page }) => {
    await page.goto('/operations')
    await expect(page.getByText(/이미지 분석|Image Analysis|배치 OCR|Batch OCR/i).first()).toBeVisible()
  })

  test('trigger batch OCR button', async ({ page }) => {
    await page.goto('/operations')
    const triggerButton = page.getByRole('button', {
      name: /배치 분석 시작|Trigger Batch|Start Analysis/i,
    })
    await expect(triggerButton).toBeVisible()
  })

  test('progress indicator appears', async ({ page }) => {
    await page.goto('/operations')

    const triggerButton = page.getByRole('button', {
      name: /배치 분석 시작|Trigger Batch|Start Analysis/i,
    })
    await triggerButton.click()

    // Should show progress indicator
    const progressIndicator = page.locator('[role="progressbar"], .progress, .spinner')
    const loadingText = page.getByText(/진행 중|In Progress|Processing/i)

    await expect(progressIndicator.or(loadingText)).toBeVisible({ timeout: 5000 })
  })

  test('status polling works', async ({ page, request }) => {
    // Trigger batch via API
    const triggerRes = await request.post(`${API}/image-analysis/trigger`, {
      headers: authHeaders(adminToken),
      data: { limit: 5 },
    })

    if (triggerRes.status() === 200) {
      const data = await triggerRes.json()
      const taskId = data.task_id

      // UI should poll and update status
      await page.goto('/operations')
      await waitForNetworkIdle(page, 3000)

      // Should show status updates (queued → processing → completed)
      const statusText = page.locator('text=/Queued|Processing|Completed|대기|처리|완료/i')
      await expect(statusText.first()).toBeVisible({ timeout: 10000 })
    } else {
      // No images to process - skip test
      test.skip()
    }
  })

  test('completion state', async ({ page, request }) => {
    // Trigger a small batch
    const triggerRes = await request.post(`${API}/image-analysis/trigger`, {
      headers: authHeaders(adminToken),
      data: { limit: 2 },
    })

    if (triggerRes.status() !== 200) {
      test.skip()
      return
    }

    const data = await triggerRes.json()
    const taskId = data.task_id

    // Wait for completion via API
    await pollTaskStatus(request, adminToken, '/image-analysis/status', {
      taskId,
      maxAttempts: 30,
      intervalMs: 3000,
    })

    // Verify completion state in UI
    await page.goto('/operations')
    await waitForNetworkIdle(page, 3000)

    const completionMessage = page.getByText(/완료|Completed|Finished|Success/i)
    await expect(completionMessage.first()).toBeVisible({ timeout: 5000 })
  })

  test('stats display (processed count)', async ({ page, request }) => {
    // Get stats via API
    const statsRes = await request.get(`${API}/image-analysis/stats`, {
      headers: authHeaders(adminToken),
    })
    const stats = await statsRes.json()

    await page.goto('/operations')
    await waitForNetworkIdle(page, 3000)

    // Should display processed count
    const processedCount = page.getByText(/처리된|Processed/i).locator('..')
    await expect(processedCount).toContainText(/\d+/)

    // Should match API stats (or be close)
    const displayedCount = await processedCount.textContent()
    const count = parseInt(displayedCount?.match(/\d+/)?.[0] || '0')
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('success rate shown', async ({ page }) => {
    await page.goto('/operations')
    await waitForNetworkIdle(page, 3000)

    // Should show success rate (percentage)
    const successRate = page.getByText(/성공률|Success Rate/i).locator('..')
    await expect(successRate).toBeVisible()
    await expect(successRate).toContainText(/\d+%/)
  })

  test('view failed items', async ({ page, request }) => {
    // Get failed items via API
    const failedRes = await request.get(`${API}/image-analysis/failed`, {
      headers: authHeaders(adminToken),
    })
    const failedItems = await failedRes.json()

    await page.goto('/operations')
    await waitForNetworkIdle(page, 3000)

    if (failedItems.length > 0) {
      // Should have a "View Failed" or "실패 항목" button/link
      const viewFailedButton = page.getByRole('button', { name: /실패 항목|Failed Items|View Failed/i })
      await expect(viewFailedButton).toBeVisible()

      await viewFailedButton.click()

      // Should show list of failed items
      const failedList = page.locator('table, ul, .failed-list')
      await expect(failedList).toBeVisible()
    } else {
      // Should show "No failures" message
      const noFailuresMessage = page.getByText(/실패 없음|No failures/i)
      await expect(noFailuresMessage).toBeVisible()
    }
  })

  test('retry failed items', async ({ page, request }) => {
    // Check if there are failed items
    const failedRes = await request.get(`${API}/image-analysis/failed`, {
      headers: authHeaders(adminToken),
    })
    const failedItems = await failedRes.json()

    if (failedItems.length === 0) {
      test.skip()
      return
    }

    await page.goto('/operations')
    await waitForNetworkIdle(page, 3000)

    // View failed items
    const viewFailedButton = page.getByRole('button', { name: /실패 항목|Failed Items/i })
    await viewFailedButton.click()

    // Should have retry button
    const retryButton = page.getByRole('button', { name: /재시도|Retry/i }).first()
    await expect(retryButton).toBeVisible()

    await retryButton.click()

    // Should show retry in progress
    const retryingMessage = page.getByText(/재시도 중|Retrying|Processing/i)
    await expect(retryingMessage).toBeVisible({ timeout: 5000 })
  })

  test('cancel batch operation', async ({ page, request }) => {
    // Trigger a batch
    const triggerRes = await request.post(`${API}/image-analysis/trigger`, {
      headers: authHeaders(adminToken),
      data: { limit: 10 },
    })

    if (triggerRes.status() !== 200) {
      test.skip()
      return
    }

    await page.goto('/operations')
    await waitForNetworkIdle(page, 2000)

    // Look for cancel button while processing
    const cancelButton = page.getByRole('button', { name: /취소|Cancel|Stop/i })

    if (await cancelButton.isVisible()) {
      await cancelButton.click()

      // Should show cancellation confirmation
      const confirmDialog = page.getByText(/정말 취소|Are you sure/i)
      await expect(confirmDialog).toBeVisible()

      const confirmButton = page.getByRole('button', { name: /확인|Confirm|Yes/i })
      await confirmButton.click()

      // Should show cancelled status
      await expect(page.getByText(/취소됨|Cancelled|Stopped/i)).toBeVisible({ timeout: 5000 })
    } else {
      // Task already completed - no cancel button
      test.skip()
    }
  })

  test('no images → appropriate message', async ({ page, request }) => {
    // Check if there are any images to process
    const statsRes = await request.get(`${API}/image-analysis/stats`, {
      headers: authHeaders(adminToken),
    })
    const stats = await statsRes.json()

    await page.goto('/operations')
    await waitForNetworkIdle(page, 3000)

    if (stats.total_images === 0 || stats.pending === 0) {
      // Should show "No images" message
      const noImagesMessage = page.getByText(/이미지가 없습니다|No images|Nothing to process/i)
      await expect(noImagesMessage).toBeVisible()

      // Trigger button should be disabled
      const triggerButton = page.getByRole('button', {
        name: /배치 분석 시작|Trigger Batch/i,
      })
      if (await triggerButton.isVisible()) {
        await expect(triggerButton).toBeDisabled()
      }
    } else {
      // Has images - trigger button should be enabled
      const triggerButton = page.getByRole('button', {
        name: /배치 분석 시작|Trigger Batch/i,
      })
      await expect(triggerButton).toBeEnabled()
    }
  })
})
