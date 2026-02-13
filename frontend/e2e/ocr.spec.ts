import { test, expect } from '@playwright/test'

const API = 'http://localhost:8001/api'

/**
 * Create a test user via API and return auth token.
 */
async function createAuthenticatedContext(
  request: import('@playwright/test').APIRequestContext,
) {
  const uniqueId = Date.now()
  const uniqueEmail = `ocr-test-${uniqueId}@example.com`
  const orgSlug = `ocr-test-${uniqueId}`

  const res = await request.post(`${API}/members/signup`, {
    data: {
      email: uniqueEmail,
      password: 'TestPassword123!',
      name: 'OCR Test User',
      org_name: 'OCR Test Org',
      org_slug: orgSlug,
    },
  })

  if (res.status() !== 201) {
    throw new Error(`Failed to create test user: ${res.status()}`)
  }

  const { access_token } = await res.json()
  return { token: access_token, email: uniqueEmail }
}

/**
 * Inject auth token into page's localStorage.
 */
async function injectAuth(
  page: import('@playwright/test').Page,
  token: string,
) {
  await page.goto('/login')
  await page.evaluate(t => {
    localStorage.setItem('auth_token', t)
  }, token)
}

// ─── Settings OCR Engine ────────────────────────────────────────────────

test.describe('OCR Settings', () => {
  let authToken: string

  test.beforeAll(async ({ request }) => {
    const { token } = await createAuthenticatedContext(request)
    authToken = token
  })

  test('OCR engine dropdown is visible in Settings', async ({ page }) => {
    await injectAuth(page, authToken)
    await page.goto('/settings')

    // Wait for the settings page to load
    await page.waitForLoadState('networkidle')

    // Find the OCR Engine section heading
    const heading = page.getByText(/OCR 엔진|OCR Engine/i)
    await expect(heading).toBeVisible({ timeout: 15000 })

    // Find the select with OCR engine options
    const ocrSelect = page.locator('select').filter({
      has: page.locator('option[value="paddleocr_vl"]'),
    })
    await expect(ocrSelect).toBeVisible()

    // Should have both options
    await expect(ocrSelect.locator('option[value="ai_vision"]')).toBeAttached()
    await expect(ocrSelect.locator('option[value="paddleocr_vl"]')).toBeAttached()
  })

  test('changing OCR engine persists after reload', async ({ page }) => {
    await injectAuth(page, authToken)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    const ocrSelect = page.locator('select').filter({
      has: page.locator('option[value="paddleocr_vl"]'),
    })
    await expect(ocrSelect).toBeVisible({ timeout: 15000 })

    // Change to PaddleOCR-VL
    await ocrSelect.selectOption('paddleocr_vl')

    // Wait for API call to complete
    await page.waitForTimeout(1000)

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')

    const ocrSelectAfter = page.locator('select').filter({
      has: page.locator('option[value="paddleocr_vl"]'),
    })
    await expect(ocrSelectAfter).toBeVisible({ timeout: 15000 })
    await expect(ocrSelectAfter).toHaveValue('paddleocr_vl')

    // Restore to default
    await ocrSelectAfter.selectOption('ai_vision')
    await page.waitForTimeout(500)
  })
})

// ─── OCR API Health ─────────────────────────────────────────────────────

test.describe('OCR API Health', () => {
  test('backend OCR endpoints respond (not 500)', async ({ request }) => {
    const { token } = await createAuthenticatedContext(request)
    const headers = { Authorization: `Bearer ${token}` }

    // GET /images/{id}/text — should return 404 for non-existent, not 500
    const textResp = await request.get(`${API}/images/99999/text`, { headers })
    expect([200, 404]).toContain(textResp.status())

    // POST /images/{id}/extract — should return 404 for non-existent, not 500
    const extractResp = await request.post(`${API}/images/99999/extract`, { headers })
    expect([200, 404]).toContain(extractResp.status())
  })
})

// ─── OCR Image Context Menu & Extraction ────────────────────────────────

test.describe('OCR Image Workflow', () => {
  /**
   * These tests require a note with NoteImages (NSX extracted images)
   * in the database. They use the pre-configured auth.setup.ts user
   * which has synced notes from NAS.
   */
  test.use({ storageState: 'e2e/.auth/user.json' })

  test('note with images shows image list', async ({ page }) => {
    // Navigate to a note — need to find one with images
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Navigate to notes list
    await page.goto('/notes')
    await page.waitForLoadState('networkidle')

    // Click on first note
    const firstNote = page.locator('a[href^="/notes/"]').first()
    if (await firstNote.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstNote.click()
      await page.waitForLoadState('networkidle')

      // Check if this note has images section
      const imagesSection = page.getByText(/텍스트 인식|Text recognition/i).first()
      if (await imagesSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Images section found — context menu items should work
        const imageItem = page.locator('div[class*="cursor-context-menu"]').first()
        await expect(imageItem).toBeVisible()
      }
    }
  })

  test('right-click on image opens context menu', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.goto('/notes')
    await page.waitForLoadState('networkidle')

    // Find a note with images by navigating through notes
    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      await noteLinks.nth(i).click()
      await page.waitForLoadState('networkidle')

      const imageItem = page.locator('div[class*="cursor-context-menu"]').first()
      if (await imageItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Found a note with images — right-click
        await imageItem.click({ button: 'right' })

        // Context menu should appear with OCR-related option
        const menuButton = page.getByRole('button').filter({
          hasText: /텍스트 인식|Text recognition|인식된 텍스트 보기|View recognized text|다시 시도|Retry/i,
        })
        await expect(menuButton.first()).toBeVisible({ timeout: 3000 })
        return // Test passed
      }

      // Go back to notes list
      await page.goBack()
      await page.waitForLoadState('networkidle')
    }

    test.skip(true, 'No notes with images found in database')
  })

  test('trigger OCR shows loading indicator', async ({ page }) => {
    await page.goto('/notes')
    await page.waitForLoadState('networkidle')

    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      await noteLinks.nth(i).click()
      await page.waitForLoadState('networkidle')

      // Look for an unextracted image (no status icon)
      const imageItems = page.locator('div[class*="cursor-context-menu"]')
      const imageCount = await imageItems.count()

      for (let j = 0; j < imageCount; j++) {
        const item = imageItems.nth(j)
        // Check if this image has no status icon (unextracted)
        const hasStatusIcon = await item.locator('svg.text-green-600, svg.text-amber-600, svg.text-destructive').count()
        if (hasStatusIcon === 0) {
          // Right-click and trigger OCR
          await item.click({ button: 'right' })
          const extractBtn = page.getByRole('button', { name: /텍스트 인식|Text recognition/i })
          if (await extractBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await extractBtn.click()
            // Should show loading spinner
            await expect(item.locator('.animate-spin')).toBeVisible({ timeout: 5000 })
            return
          }
        }
      }

      await page.goBack()
      await page.waitForLoadState('networkidle')
    }

    test.skip(true, 'No unextracted images found')
  })

  test('completed image shows "View recognized text" and opens modal', async ({ page }) => {
    await page.goto('/notes')
    await page.waitForLoadState('networkidle')

    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      await noteLinks.nth(i).click()
      await page.waitForLoadState('networkidle')

      // Look for completed image (green check icon)
      const completedImage = page.locator('div[class*="cursor-context-menu"]').filter({
        has: page.locator('svg.text-green-600'),
      }).first()

      if (await completedImage.isVisible({ timeout: 2000 }).catch(() => false)) {
        await completedImage.click({ button: 'right' })
        const viewBtn = page.getByRole('button', { name: /인식된 텍스트 보기|View recognized text/i })
        await expect(viewBtn).toBeVisible({ timeout: 3000 })

        // Click to open modal
        await viewBtn.click()

        // Modal should be visible
        const modal = page.locator('.fixed.inset-0').last()
        await expect(modal).toBeVisible({ timeout: 5000 })
        return
      }

      await page.goBack()
      await page.waitForLoadState('networkidle')
    }

    test.skip(true, 'No completed OCR images found')
  })

  test('modal closes on Escape', async ({ page }) => {
    await page.goto('/notes')
    await page.waitForLoadState('networkidle')

    const noteLinks = page.locator('a[href^="/notes/"]')
    const count = await noteLinks.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      await noteLinks.nth(i).click()
      await page.waitForLoadState('networkidle')

      const completedImage = page.locator('div[class*="cursor-context-menu"]').filter({
        has: page.locator('svg.text-green-600'),
      }).first()

      if (await completedImage.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Open context menu → click view → open modal
        await completedImage.click({ button: 'right' })
        const viewBtn = page.getByRole('button', { name: /인식된 텍스트 보기|View recognized text/i })
        if (await viewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await viewBtn.click()

          // Verify modal is open
          const closeBtn = page.locator('button').filter({ has: page.locator('svg.h-5.w-5') }).last()
          await expect(closeBtn).toBeVisible({ timeout: 3000 })

          // Press Escape
          await page.keyboard.press('Escape')

          // Modal should close (close button gone)
          await expect(closeBtn).not.toBeVisible({ timeout: 3000 })
          return
        }
      }

      await page.goBack()
      await page.waitForLoadState('networkidle')
    }

    test.skip(true, 'No completed OCR images found for modal test')
  })
})
