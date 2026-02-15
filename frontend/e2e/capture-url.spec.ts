import { test, expect } from '@playwright/test'
import { authHeaders, createTestUser } from './utils/auth-helpers'
import { createTestNotebook, cleanupTestData } from './utils/data-helpers'
import { waitForNetworkIdle, waitForApiResponse } from './utils/wait-helpers'

const API = 'http://localhost:8001/api'

test.describe('URL Capture - Librarian', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  let notebookId: number
  let authToken: string
  const createdNoteIds: number[] = []

  test.beforeAll(async ({ request }) => {
    // Create test user
    const { token } = await createTestUser(request, 'capture-url')
    authToken = token

    // Create test notebook
    const notebook = await createTestNotebook(
      request,
      authToken,
      'Capture Test Notebook',
    )
    notebookId = notebook.id
  })

  test.afterAll(async ({ request }) => {
    // Cleanup created notes and notebook
    await cleanupTestData(request, authToken, {
      noteIds: createdNoteIds,
      notebookIds: [notebookId],
    })
  })

  test('librarian page loads', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // Page heading should be visible
    const heading = page.getByRole('heading', { name: /라이브러리안|Librarian|캡처|Capture/i })
    await expect(heading).toBeVisible({ timeout: 10000 })
  })

  test('URL input field visible', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // URL input should exist
    const urlInput = page.getByPlaceholder(/URL|url|링크/i).or(
      page.locator('input[type="url"]'),
    ).or(
      page.locator('input[name="url"]'),
    )
    await expect(urlInput.first()).toBeVisible({ timeout: 10000 })
  })

  test('enter URL shows loading indicator', async ({ page }) => {
    test.skip(true, 'Requires live URL and capture API')

    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const urlInput = page.getByPlaceholder(/URL|url|링크/i).or(
      page.locator('input[type="url"]'),
    ).first()

    await urlInput.fill('https://example.com')

    const captureBtn = page.getByRole('button', { name: /캡처|Capture|가져오기|Fetch/i })
    await captureBtn.click()

    // Loading indicator should appear
    const spinner = page.locator('.animate-spin').or(page.getByText(/로딩|Loading/i))
    await expect(spinner.first()).toBeVisible({ timeout: 3000 })
  })

  test('preview shows title', async ({ page }) => {
    test.skip(true, 'Requires live URL and capture API')

    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const urlInput = page.getByPlaceholder(/URL|url/i).or(page.locator('input[type="url"]')).first()
    await urlInput.fill('https://example.com')

    const captureBtn = page.getByRole('button', { name: /캡처|Capture/i })
    await captureBtn.click()

    // Wait for preview to load
    await page.waitForTimeout(3000)

    // Title should be visible in preview
    const previewTitle = page.locator('[class*="preview"]').getByText(/Example Domain/i)
    await expect(previewTitle).toBeVisible({ timeout: 10000 })
  })

  test('preview shows extracted content', async ({ page }) => {
    test.skip(true, 'Requires live URL and capture API')

    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const urlInput = page.getByPlaceholder(/URL|url/i).or(page.locator('input[type="url"]')).first()
    await urlInput.fill('https://example.com')

    const captureBtn = page.getByRole('button', { name: /캡처|Capture/i })
    await captureBtn.click()

    await page.waitForTimeout(3000)

    // Content preview should exist
    const contentPreview = page.locator('[class*="preview"]').or(
      page.locator('[class*="content"]'),
    )
    await expect(contentPreview.first()).toBeVisible({ timeout: 10000 })
  })

  test('select target notebook dropdown', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // Notebook selector should be visible
    const notebookSelect = page.getByLabel(/노트북|Notebook/i).or(
      page.locator('select').filter({ hasText: /노트북|Notebook/i }),
    )
    await expect(notebookSelect.first()).toBeVisible({ timeout: 10000 })
  })

  test('add tags input', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // Tags input should be visible
    const tagsInput = page.getByPlaceholder(/태그|Tags|tag/i).or(
      page.getByLabel(/태그|Tags/i),
    )
    await expect(tagsInput.first()).toBeVisible({ timeout: 10000 })

    await tagsInput.first().fill('test-tag, capture')
  })

  test('save captured note', async ({ page, request }) => {
    test.skip(true, 'Requires live URL and capture API')

    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // Enter URL and capture
    const urlInput = page.getByPlaceholder(/URL|url/i).or(page.locator('input[type="url"]')).first()
    await urlInput.fill('https://example.com')

    const captureBtn = page.getByRole('button', { name: /캡처|Capture/i })
    await captureBtn.click()
    await page.waitForTimeout(3000)

    // Select notebook
    const notebookSelect = page.getByLabel(/노트북|Notebook/i).first()
    await notebookSelect.selectOption({ label: /Capture Test Notebook/i })

    // Save note
    const saveBtn = page.getByRole('button', { name: /저장|Save/i })
    await saveBtn.click()

    // Wait for save response
    const response = await waitForApiResponse(page, /\/api\/capture\/url/)
    expect(response.status()).toBe(201)

    const body = await response.json()
    createdNoteIds.push(body.id)
  })

  test('saved note appears in notes list', async ({ page }) => {
    test.skip(true, 'Requires captured note')

    await page.goto('/notes')
    await waitForNetworkIdle(page)

    // Search for captured note title (e.g., "Example Domain")
    const searchInput = page.getByPlaceholder(/검색|Search/i)
    await searchInput.fill('Example Domain')
    await page.waitForTimeout(1000)

    // Note should appear in results
    const noteLink = page.getByRole('link', { name: /Example Domain/i })
    await expect(noteLink).toBeVisible({ timeout: 10000 })
  })

  test('source URL preserved in note metadata', async ({ page }) => {
    test.skip(true, 'Requires captured note with metadata')

    await page.goto('/notes')
    await waitForNetworkIdle(page)

    // Find captured note
    const noteLink = page.getByRole('link', { name: /Example Domain/i }).first()
    await noteLink.click()
    await waitForNetworkIdle(page)

    // Source URL should be visible in metadata section
    const sourceUrl = page.getByText(/https:\/\/example\.com/i)
    await expect(sourceUrl).toBeVisible({ timeout: 5000 })
  })

  test('arXiv URL capture', async ({ page }) => {
    test.skip(true, 'Requires network access and arXiv API')

    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const urlInput = page.getByPlaceholder(/URL|url/i).or(page.locator('input[type="url"]')).first()
    await urlInput.fill('https://arxiv.org/abs/2301.00000')

    const captureBtn = page.getByRole('button', { name: /캡처|Capture/i })
    await captureBtn.click()

    // Should detect arXiv and show paper metadata
    const titlePreview = page.locator('[class*="preview"]')
    await expect(titlePreview.first()).toBeVisible({ timeout: 15000 })
  })

  test('PubMed URL capture', async ({ page }) => {
    test.skip(true, 'Requires network access and PubMed API')

    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const urlInput = page.getByPlaceholder(/URL|url/i).or(page.locator('input[type="url"]')).first()
    await urlInput.fill('https://pubmed.ncbi.nlm.nih.gov/12345678/')

    const captureBtn = page.getByRole('button', { name: /캡처|Capture/i })
    await captureBtn.click()

    // Should detect PubMed and show article metadata
    const titlePreview = page.locator('[class*="preview"]')
    await expect(titlePreview.first()).toBeVisible({ timeout: 15000 })
  })

  test('invalid URL shows error message', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const urlInput = page.getByPlaceholder(/URL|url/i).or(page.locator('input[type="url"]')).first()
    await urlInput.fill('not-a-valid-url')

    const captureBtn = page.getByRole('button', { name: /캡처|Capture/i })
    await captureBtn.click()

    // Error message should appear
    const errorMsg = page.getByText(/유효하지 않은|Invalid|오류|Error/i)
    await expect(errorMsg).toBeVisible({ timeout: 5000 })
  })

  test('404 URL error handling', async ({ page }) => {
    test.skip(true, 'Requires network access')

    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const urlInput = page.getByPlaceholder(/URL|url/i).or(page.locator('input[type="url"]')).first()
    await urlInput.fill('https://example.com/this-page-does-not-exist-404')

    const captureBtn = page.getByRole('button', { name: /캡처|Capture/i })
    await captureBtn.click()

    // Error message for 404
    const errorMsg = page.getByText(/찾을 수 없습니다|Not found|404/i)
    await expect(errorMsg).toBeVisible({ timeout: 10000 })
  })

  test('duplicate URL detection', async ({ page }) => {
    test.skip(true, 'Requires duplicate URL logic in backend')

    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // Capture URL twice
    const urlInput = page.getByPlaceholder(/URL|url/i).or(page.locator('input[type="url"]')).first()
    await urlInput.fill('https://example.com')

    const captureBtn = page.getByRole('button', { name: /캡처|Capture/i })
    await captureBtn.click()
    await page.waitForTimeout(3000)

    const saveBtn = page.getByRole('button', { name: /저장|Save/i })
    await saveBtn.click()
    await page.waitForTimeout(2000)

    // Try to capture same URL again
    await urlInput.fill('https://example.com')
    await captureBtn.click()
    await page.waitForTimeout(3000)

    // Should show duplicate warning
    const warningMsg = page.getByText(/이미 존재|Already exists|중복|Duplicate/i)
    await expect(warningMsg).toBeVisible({ timeout: 5000 })
  })

  test('capture with long content OK', async ({ page }) => {
    test.skip(true, 'Requires URL with long content')

    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // Use a URL known to have long content (e.g., Wikipedia article)
    const urlInput = page.getByPlaceholder(/URL|url/i).or(page.locator('input[type="url"]')).first()
    await urlInput.fill('https://en.wikipedia.org/wiki/Machine_learning')

    const captureBtn = page.getByRole('button', { name: /캡처|Capture/i })
    await captureBtn.click()

    // Should handle long content without error
    await page.waitForTimeout(5000)

    const contentPreview = page.locator('[class*="preview"]')
    await expect(contentPreview.first()).toBeVisible({ timeout: 15000 })
  })

  test('clear form after successful capture', async ({ page }) => {
    test.skip(true, 'Requires successful capture')

    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const urlInput = page.getByPlaceholder(/URL|url/i).or(page.locator('input[type="url"]')).first()
    await urlInput.fill('https://example.com')

    const captureBtn = page.getByRole('button', { name: /캡처|Capture/i })
    await captureBtn.click()
    await page.waitForTimeout(3000)

    const saveBtn = page.getByRole('button', { name: /저장|Save/i })
    await saveBtn.click()
    await page.waitForTimeout(2000)

    // Form should be cleared
    await expect(urlInput).toHaveValue('')
  })
})

// ─── API-Only Tests ─────────────────────────────────────────────────────────

test.describe('URL Capture API', () => {
  test('POST /api/capture/url returns 200 or validation error', async ({ request }) => {
    const res = await request.post(`${API}/capture/url`, {
      headers: authHeaders(authToken),
      data: {
        url: 'https://example.com',
        notebook_id: 1,
      },
    })

    // Should return 200/201 (success) or 400/422 (validation)
    expect([200, 201, 400, 422]).toContain(res.status())
  })

  test('POST /api/capture/arxiv endpoint exists', async ({ request }) => {
    const res = await request.post(`${API}/capture/arxiv`, {
      headers: authHeaders(authToken),
      data: {
        arxiv_id: '2301.00000',
      },
    })

    // Should not return 404
    expect(res.status()).not.toBe(404)
  })

  test('POST /api/capture/pubmed endpoint exists', async ({ request }) => {
    const res = await request.post(`${API}/capture/pubmed`, {
      headers: authHeaders(authToken),
      data: {
        pubmed_id: '12345678',
      },
    })

    // Should not return 404
    expect(res.status()).not.toBe(404)
  })
})
