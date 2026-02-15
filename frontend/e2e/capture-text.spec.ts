import { test, expect } from '@playwright/test'
import { authHeaders, createTestUser } from './utils/auth-helpers'
import { createTestNotebook, cleanupTestData } from './utils/data-helpers'
import { waitForNetworkIdle, waitForApiResponse } from './utils/wait-helpers'

const API = 'http://localhost:8001/api'

test.describe('Text Capture - Librarian', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  let notebookId: number
  let authToken: string
  const createdNoteIds: number[] = []

  test.beforeAll(async ({ request }) => {
    // Create test user
    const { token } = await createTestUser(request, 'capture-text')
    authToken = token

    // Create test notebook
    const notebook = await createTestNotebook(
      request,
      authToken,
      'Text Capture Test Notebook',
    )
    notebookId = notebook.id
  })

  test.afterAll(async ({ request }) => {
    // Cleanup
    await cleanupTestData(request, authToken, {
      noteIds: createdNoteIds,
      notebookIds: [notebookId],
    })
  })

  test('text capture section visible', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // Look for text capture UI elements
    const textHeading = page.getByRole('heading', { name: /텍스트|Text|메모|Note/i })
    const textArea = page.locator('textarea').or(
      page.getByPlaceholder(/내용|Content|텍스트|Text/i),
    )

    // Either heading or textarea should be visible
    const hasTextSection = await textHeading.isVisible({ timeout: 5000 }).catch(() => false) ||
                            await textArea.first().isVisible({ timeout: 5000 }).catch(() => false)

    expect(hasTextSection).toBe(true)
  })

  test('enter text content', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const textArea = page.locator('textarea').or(
      page.getByPlaceholder(/내용|Content|텍스트|Text/i),
    ).first()

    await expect(textArea).toBeVisible({ timeout: 10000 })

    await textArea.fill('This is a test note captured from text input.')
  })

  test('optional title input', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // Look for title input field
    const titleInput = page.getByPlaceholder(/제목|Title/i).or(
      page.getByLabel(/제목|Title/i),
    ).first()

    await expect(titleInput).toBeVisible({ timeout: 10000 })
    await titleInput.fill('Test Quick Note Title')
  })

  test('select notebook dropdown', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const notebookSelect = page.getByLabel(/노트북|Notebook/i).or(
      page.locator('select').filter({ hasText: /노트북|Notebook/i }),
    ).first()

    await expect(notebookSelect).toBeVisible({ timeout: 10000 })
  })

  test('add tags', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const tagsInput = page.getByPlaceholder(/태그|Tags|tag/i).or(
      page.getByLabel(/태그|Tags/i),
    ).first()

    await expect(tagsInput).toBeVisible({ timeout: 10000 })
    await tagsInput.fill('quick-note, text-capture')
  })

  test('save text capture creates note', async ({ page, request }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // Fill in text content
    const textArea = page.locator('textarea').first()
    await textArea.fill('E2E test note content. This should be saved successfully.')

    // Optional: add title
    const titleInput = page.getByPlaceholder(/제목|Title/i).first()
    if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await titleInput.fill('E2E Test Quick Note')
    }

    // Select notebook
    const notebookSelect = page.locator('select').first()
    if (await notebookSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      const options = await notebookSelect.locator('option').allTextContents()
      if (options.length > 0) {
        await notebookSelect.selectOption({ index: 0 })
      }
    }

    // Save
    const saveBtn = page.getByRole('button', { name: /저장|Save|생성|Create/i })
    await saveBtn.click()

    // Wait for save response
    const response = await waitForApiResponse(page, /\/api\/notes/)
    expect([200, 201]).toContain(response.status())

    if (response.status() === 201 || response.status() === 200) {
      const body = await response.json()
      if (body.id) {
        createdNoteIds.push(body.id)
      }
    }
  })

  test('note appears in list', async ({ page }) => {
    test.skip(createdNoteIds.length === 0, 'No notes created yet')

    await page.goto('/notes')
    await waitForNetworkIdle(page)

    // Search for created note
    const searchInput = page.getByPlaceholder(/검색|Search/i)
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('E2E Test Quick Note')
      await page.waitForTimeout(1000)
    }

    // Note should appear
    const noteLink = page.getByRole('link', { name: /E2E Test Quick Note/i })
    await expect(noteLink.first()).toBeVisible({ timeout: 10000 })
  })

  test('empty text shows validation error', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const textArea = page.locator('textarea').first()
    await textArea.fill('')

    const saveBtn = page.getByRole('button', { name: /저장|Save|생성|Create/i })
    await saveBtn.click()

    // Should show validation error
    const errorMsg = page.getByText(/필수|Required|입력|Enter/i)
    await expect(errorMsg).toBeVisible({ timeout: 5000 })
  })

  test('long text (10k+ chars) OK', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // Generate long text (10000 chars)
    const longText = 'Lorem ipsum dolor sit amet. '.repeat(400) // ~11200 chars

    const textArea = page.locator('textarea').first()
    await textArea.fill(longText)

    const saveBtn = page.getByRole('button', { name: /저장|Save|생성|Create/i })
    await saveBtn.click()

    // Should not error on long text
    const response = await waitForApiResponse(page, /\/api\/notes/)
    expect([200, 201]).toContain(response.status())

    if (response.status() === 201 || response.status() === 200) {
      const body = await response.json()
      if (body.id) {
        createdNoteIds.push(body.id)
      }
    }
  })

  test('rich text/HTML content capture', async ({ page }) => {
    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    const textArea = page.locator('textarea').first()

    // Try to paste HTML content
    const htmlContent = '<h1>Rich Text</h1><p>This is <strong>bold</strong> and <em>italic</em>.</p>'
    await textArea.fill(htmlContent)

    const saveBtn = page.getByRole('button', { name: /저장|Save|생성|Create/i })
    await saveBtn.click()

    // Should handle HTML content
    const response = await waitForApiResponse(page, /\/api\/notes/)
    expect([200, 201]).toContain(response.status())

    if (response.status() === 201 || response.status() === 200) {
      const body = await response.json()
      if (body.id) {
        createdNoteIds.push(body.id)
      }
    }
  })

  test('quick note shortcut', async ({ page }) => {
    test.skip(true, 'Requires quick note shortcut implementation')

    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // Press keyboard shortcut (e.g., Cmd+N or Ctrl+N)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+N' : 'Control+N')

    // Quick note modal or section should appear
    const quickNoteModal = page.locator('[role="dialog"]').or(
      page.getByText(/빠른 메모|Quick Note/i),
    )
    await expect(quickNoteModal.first()).toBeVisible({ timeout: 3000 })
  })

  test('screenshot capture via file upload', async ({ page }) => {
    test.skip(true, 'Requires file upload and screenshot processing')

    await page.goto('/librarian')
    await waitForNetworkIdle(page)

    // Find file upload input
    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput.first()).toBeVisible({ timeout: 10000 })

    // Upload a test image file
    // Note: In real test, you'd need to provide a valid image file path
    // await fileInput.setInputFiles('path/to/test-screenshot.png')

    // Wait for upload to complete
    await page.waitForTimeout(3000)

    // Preview should appear
    const preview = page.locator('[class*="preview"]').or(page.locator('img'))
    await expect(preview.first()).toBeVisible({ timeout: 10000 })
  })
})

// ─── API-Only Tests ─────────────────────────────────────────────────────────

test.describe('Text Capture API', () => {
  test('POST /api/notes with text content', async ({ request }) => {
    const res = await request.post(`${API}/notes`, {
      headers: authHeaders(authToken),
      data: {
        title: 'API Text Capture Test',
        content: '<p>This is a test note created via API.</p>',
        tags: ['api-test', 'text-capture'],
      },
    })

    expect([200, 201]).toContain(res.status())

    if (res.status() === 201 || res.status() === 200) {
      const body = await res.json()
      expect(body).toHaveProperty('id')
      expect(body.title).toBe('API Text Capture Test')
    }
  })

  test('POST /api/notes without title uses default', async ({ request }) => {
    const res = await request.post(`${API}/notes`, {
      headers: authHeaders(authToken),
      data: {
        content: '<p>Note without explicit title</p>',
      },
    })

    expect([200, 201]).toContain(res.status())

    if (res.status() === 201 || res.status() === 200) {
      const body = await res.json()
      expect(body).toHaveProperty('title')
      expect(body.title.length).toBeGreaterThan(0)
    }
  })

  test('POST /api/notes with empty content returns error', async ({ request }) => {
    const res = await request.post(`${API}/notes`, {
      headers: authHeaders(authToken),
      data: {
        title: 'Empty Note',
        content: '',
      },
    })

    // Should return validation error
    expect([400, 422]).toContain(res.status())
  })
})
