import { test, expect } from '@playwright/test'
import { authHeaders, createTestUser } from './utils/auth-helpers'
import { pollTaskStatus, waitForNetworkIdle } from './utils/wait-helpers'

const API = 'http://localhost:8001/api'

// ─── Image Analysis in Note Detail Page ────────────────────────────────────

test.describe('Image Analysis - Note Detail', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  test('note with images shows image section', async ({ page }) => {
    test.skip(true, 'Requires synced notes with images from NAS')

    await page.goto('/notes')
    await waitForNetworkIdle(page)

    // Click on first note
    const firstNote = page.locator('a[href^="/notes/"]').first()
    await firstNote.click()
    await waitForNetworkIdle(page)

    // Check for image section heading
    const imagesHeading = page.getByText(/이미지|Images/i)
    await expect(imagesHeading).toBeVisible({ timeout: 5000 })

    // Check for image list
    const imageItems = page.locator('div[class*="cursor-context-menu"]')
    await expect(imageItems.first()).toBeVisible()
  })

  test('right-click image shows context menu', async ({ page }) => {
    test.skip(true, 'Requires synced notes with images from NAS')

    await page.goto('/notes')
    await waitForNetworkIdle(page)

    // Find a note with images
    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      await noteLinks.nth(i).click()
      await waitForNetworkIdle(page)

      const imageItem = page.locator('div[class*="cursor-context-menu"]').first()
      if (await imageItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Right-click the image
        await imageItem.click({ button: 'right' })

        // Context menu should appear
        const contextMenu = page.getByRole('button').filter({
          hasText: /텍스트 인식|Text recognition|인식된 텍스트|View recognized|다시 시도|Retry|비전 분석|Vision/i,
        })
        await expect(contextMenu.first()).toBeVisible({ timeout: 3000 })
        return
      }

      await page.goBack()
      await waitForNetworkIdle(page)
    }
  })

  test('trigger OCR on image shows loading indicator', async ({ page }) => {
    test.skip(true, 'Requires synced notes with images from NAS')

    await page.goto('/notes')
    await waitForNetworkIdle(page)

    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      await noteLinks.nth(i).click()
      await waitForNetworkIdle(page)

      // Find unextracted image (no status icon)
      const imageItems = page.locator('div[class*="cursor-context-menu"]')
      const imageCount = await imageItems.count()

      for (let j = 0; j < imageCount; j++) {
        const item = imageItems.nth(j)
        const hasStatusIcon = await item.locator('svg.text-green-600, svg.text-amber-600, svg.text-destructive').count()

        if (hasStatusIcon === 0) {
          // Right-click and trigger OCR
          await item.click({ button: 'right' })
          const extractBtn = page.getByRole('button', { name: /텍스트 인식|Text recognition/i })

          if (await extractBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await extractBtn.click()
            // Loading spinner should appear
            await expect(item.locator('.animate-spin')).toBeVisible({ timeout: 5000 })
            return
          }
        }
      }

      await page.goBack()
      await waitForNetworkIdle(page)
    }
  })

  test('OCR completes and text is visible', async ({ page }) => {
    test.skip(true, 'Requires synced notes with images from NAS')

    await page.goto('/notes')
    await waitForNetworkIdle(page)

    // Find a completed OCR image (green check icon)
    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      await noteLinks.nth(i).click()
      await waitForNetworkIdle(page)

      const completedImage = page.locator('div[class*="cursor-context-menu"]').filter({
        has: page.locator('svg.text-green-600'),
      }).first()

      if (await completedImage.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Image has completed OCR
        await expect(completedImage).toBeVisible()
        return
      }

      await page.goBack()
      await waitForNetworkIdle(page)
    }
  })

  test('view recognized text modal opens', async ({ page }) => {
    test.skip(true, 'Requires synced notes with images from NAS')

    await page.goto('/notes')
    await waitForNetworkIdle(page)

    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      await noteLinks.nth(i).click()
      await waitForNetworkIdle(page)

      const completedImage = page.locator('div[class*="cursor-context-menu"]').filter({
        has: page.locator('svg.text-green-600'),
      }).first()

      if (await completedImage.isVisible({ timeout: 2000 }).catch(() => false)) {
        await completedImage.click({ button: 'right' })
        const viewBtn = page.getByRole('button', { name: /인식된 텍스트 보기|View recognized text/i })
        await expect(viewBtn).toBeVisible({ timeout: 3000 })

        await viewBtn.click()

        // Modal should open
        const modal = page.locator('.fixed.inset-0').last()
        await expect(modal).toBeVisible({ timeout: 5000 })

        // Modal should have text content
        const textContent = modal.locator('pre, code, p')
        await expect(textContent.first()).toBeVisible({ timeout: 3000 })
        return
      }

      await page.goBack()
      await waitForNetworkIdle(page)
    }
  })

  test('copy extracted text to clipboard', async ({ page, context }) => {
    test.skip(true, 'Requires synced notes with images from NAS')

    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    await page.goto('/notes')
    await waitForNetworkIdle(page)

    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      await noteLinks.nth(i).click()
      await waitForNetworkIdle(page)

      const completedImage = page.locator('div[class*="cursor-context-menu"]').filter({
        has: page.locator('svg.text-green-600'),
      }).first()

      if (await completedImage.isVisible({ timeout: 2000 }).catch(() => false)) {
        await completedImage.click({ button: 'right' })
        const viewBtn = page.getByRole('button', { name: /인식된 텍스트 보기|View recognized text/i })
        await viewBtn.click()
        await page.waitForTimeout(1000)

        // Find copy button
        const copyBtn = page.getByRole('button', { name: /복사|Copy/i })
        if (await copyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await copyBtn.click()

          // Wait for clipboard
          await page.waitForTimeout(500)
          const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
          expect(clipboardText.length).toBeGreaterThan(0)
          return
        }
      }

      await page.goBack()
      await waitForNetworkIdle(page)
    }
  })

  test('retry OCR on failed image', async ({ page }) => {
    test.skip(true, 'Requires synced notes with images from NAS')

    await page.goto('/notes')
    await waitForNetworkIdle(page)

    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      await noteLinks.nth(i).click()
      await waitForNetworkIdle(page)

      // Find failed image (red X icon)
      const failedImage = page.locator('div[class*="cursor-context-menu"]').filter({
        has: page.locator('svg.text-destructive'),
      }).first()

      if (await failedImage.isVisible({ timeout: 2000 }).catch(() => false)) {
        await failedImage.click({ button: 'right' })
        const retryBtn = page.getByRole('button', { name: /다시 시도|Retry/i })
        await expect(retryBtn).toBeVisible({ timeout: 3000 })

        await retryBtn.click()
        // Loading should start
        await expect(failedImage.locator('.animate-spin')).toBeVisible({ timeout: 5000 })
        return
      }

      await page.goBack()
      await waitForNetworkIdle(page)
    }
  })

  test('vision analysis on image', async ({ page }) => {
    test.skip(true, 'Requires synced notes with images and AI provider')

    await page.goto('/notes')
    await waitForNetworkIdle(page)

    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      await noteLinks.nth(i).click()
      await waitForNetworkIdle(page)

      const imageItem = page.locator('div[class*="cursor-context-menu"]').first()
      if (await imageItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await imageItem.click({ button: 'right' })
        const visionBtn = page.getByRole('button', { name: /비전 분석|Vision analysis/i })

        if (await visionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await visionBtn.click()
          // Loading indicator should appear
          await expect(imageItem.locator('.animate-spin')).toBeVisible({ timeout: 5000 })
          return
        }
      }

      await page.goBack()
      await waitForNetworkIdle(page)
    }
  })

  test('vision text shows analysis result', async ({ page }) => {
    test.skip(true, 'Requires synced notes with completed vision analysis')

    await page.goto('/notes')
    await waitForNetworkIdle(page)

    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      await noteLinks.nth(i).click()
      await waitForNetworkIdle(page)

      // Find image with vision analysis (look for vision text in context menu)
      const imageItem = page.locator('div[class*="cursor-context-menu"]').first()
      if (await imageItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await imageItem.click({ button: 'right' })
        const viewVisionBtn = page.getByRole('button', { name: /비전 텍스트 보기|View vision text/i })

        if (await viewVisionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await viewVisionBtn.click()
          // Modal should open with vision analysis
          const modal = page.locator('.fixed.inset-0').last()
          await expect(modal).toBeVisible({ timeout: 5000 })
          return
        }
      }

      await page.goBack()
      await waitForNetworkIdle(page)
    }
  })
})

// ─── Batch Image Analysis ───────────────────────────────────────────────────

test.describe('Batch Image Analysis', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  let authToken: string

  test.beforeAll(async ({ request }) => {
    const { token } = await createTestUser(request, 'image-analysis')
    authToken = token
  })

  test('batch OCR trigger via API', async ({ request }) => {
    const res = await request.post(`${API}/image-analysis/trigger`, {
      headers: authHeaders(authToken),
    })

    expect([200, 202]).toContain(res.status())

    if (res.status() === 200 || res.status() === 202) {
      const body = await res.json()
      expect(body).toHaveProperty('task_id')
    }
  })

  test('batch OCR status polling', async ({ request }) => {
    // Trigger batch analysis
    const triggerRes = await request.post(`${API}/image-analysis/trigger`, {
      headers: authHeaders(authToken),
    })

    if (triggerRes.status() !== 200 && triggerRes.status() !== 202) {
      test.skip(true, 'Batch trigger failed')
      return
    }

    const { task_id } = await triggerRes.json()

    // Poll status endpoint
    const statusRes = await request.get(`${API}/image-analysis/status`, {
      headers: authHeaders(authToken),
    })

    expect(statusRes.status()).toBe(200)
    const body = await statusRes.json()
    expect(body).toHaveProperty('status')
    expect(['idle', 'running', 'completed', 'failed']).toContain(body.status)
  })

  test('batch OCR completes', async ({ request }) => {
    test.skip(true, 'Long-running test, requires images')

    // Trigger batch analysis
    const triggerRes = await request.post(`${API}/image-analysis/trigger`, {
      headers: authHeaders(authToken),
    })

    if (triggerRes.status() !== 200 && triggerRes.status() !== 202) {
      test.skip(true, 'Batch trigger failed')
      return
    }

    // Poll until completed
    const result = await pollTaskStatus(
      request,
      'dummy-token',
      '/image-analysis/status',
      { maxAttempts: 60, intervalMs: 5000 },
    )

    expect(result.status).toBe('completed')
  })

  test('stats: processed count', async ({ request }) => {
    const res = await request.get(`${API}/image-analysis/stats`, {
      headers: authHeaders(authToken),
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('total_images')
    expect(body).toHaveProperty('processed_images')
    expect(typeof body.total_images).toBe('number')
    expect(typeof body.processed_images).toBe('number')
  })

  test('stats: success rate', async ({ request }) => {
    const res = await request.get(`${API}/image-analysis/stats`, {
      headers: authHeaders(authToken),
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('success_rate')
    expect(typeof body.success_rate).toBe('number')
    expect(body.success_rate).toBeGreaterThanOrEqual(0)
    expect(body.success_rate).toBeLessThanOrEqual(100)
  })

  test('view failed images list', async ({ request }) => {
    const res = await request.get(`${API}/image-analysis/stats`, {
      headers: authHeaders(authToken),
    })

    expect(res.status()).toBe(200)
    const body = await res.json()

    if (body.failed_images) {
      expect(Array.isArray(body.failed_images)).toBe(true)
    }
  })
})

// ─── OCR Engine Settings ────────────────────────────────────────────────────

test.describe('OCR Engine Settings', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  let authToken: string

  test.beforeAll(async ({ request }) => {
    const { token } = await createTestUser(request, 'ocr-settings')
    authToken = token
  })

  test('switch OCR engine in settings', async ({ page }) => {
    await page.goto('/settings')
    await waitForNetworkIdle(page)

    // Find OCR Engine section
    const ocrHeading = page.getByText(/OCR 엔진|OCR Engine/i)
    await expect(ocrHeading).toBeVisible({ timeout: 15000 })

    // Find OCR engine dropdown
    const ocrSelect = page.locator('select').filter({
      has: page.locator('option[value="paddleocr_vl"]'),
    })
    await expect(ocrSelect).toBeVisible()

    // Switch to PaddleOCR-VL
    await ocrSelect.selectOption('paddleocr_vl')
    await page.waitForTimeout(1000)

    // Verify value changed
    await expect(ocrSelect).toHaveValue('paddleocr_vl')

    // Switch back to AI Vision
    await ocrSelect.selectOption('ai_vision')
    await page.waitForTimeout(500)
  })

  test('OCR engine selection persists', async ({ page }) => {
    await page.goto('/settings')
    await waitForNetworkIdle(page)

    const ocrSelect = page.locator('select').filter({
      has: page.locator('option[value="paddleocr_vl"]'),
    })
    await expect(ocrSelect).toBeVisible({ timeout: 15000 })

    // Change to PaddleOCR-VL
    await ocrSelect.selectOption('paddleocr_vl')
    await page.waitForTimeout(1000)

    // Reload page
    await page.reload()
    await waitForNetworkIdle(page)

    // Check persistence
    const ocrSelectAfter = page.locator('select').filter({
      has: page.locator('option[value="paddleocr_vl"]'),
    })
    await expect(ocrSelectAfter).toBeVisible({ timeout: 15000 })
    await expect(ocrSelectAfter).toHaveValue('paddleocr_vl')

    // Restore default
    await ocrSelectAfter.selectOption('ai_vision')
    await page.waitForTimeout(500)
  })
})

// ─── Empty State ────────────────────────────────────────────────────────────

test.describe('Empty State - No Images', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  test('no images shows graceful empty state', async ({ page }) => {
    await page.goto('/notes')
    await waitForNetworkIdle(page)

    // Find a note without images
    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 20); i++) {
      await noteLinks.nth(i).click()
      await waitForNetworkIdle(page)

      // Check if image section exists
      const imagesHeading = page.getByText(/이미지|Images/i)
      const hasImages = await imagesHeading.isVisible({ timeout: 1000 }).catch(() => false)

      if (!hasImages) {
        // No images section → graceful (no error)
        await expect(page.locator('body')).toBeVisible()
        return
      }

      await page.goBack()
      await waitForNetworkIdle(page)
    }
  })
})
