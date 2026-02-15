import { test, expect } from '@playwright/test'
import { loginAsAdmin, authHeaders } from './utils/auth-helpers'
import { createTestNotebook, createTestNote, cleanupTestData } from './utils/data-helpers'

const API = 'http://localhost:8001/api'

test.describe('Share Links', () => {
  let adminToken: string

  test.beforeAll(async ({ request }) => {
    const admin = await loginAsAdmin(request)
    adminToken = admin.token
  })

  test('generate share link for notebook', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Share Link Notebook')

    await page.goto(`/notebooks/${notebook.id}`)

    // Find share link section or button
    const shareTab = page.getByRole('tab', { name: /공유 링크|Share Link|공유/i })
    if (await shareTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await shareTab.click()
    }

    // Generate share link - may be a direct button
    const generateBtn = page.getByRole('button', { name: /Generate|생성|Create|링크 생성/i })
    if (await generateBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await generateBtn.click()
      // Verify link generated
      await expect(page.getByText(/\/shared\/|http/i)).toBeVisible({ timeout: 5000 })
    } else {
      // If no UI exists, create via API to verify endpoint works
      const res = await request.post(`${API}/notebooks/${notebook.id}/links`, {
        headers: authHeaders(adminToken),
        data: { link_type: 'notebook', expires_in_days: 7 },
      })
      expect(res.status()).toBe(201)
    }

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('link has token URL', async ({ request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Token Test Notebook')

    // Create share link via API
    const res = await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { link_type: 'notebook', expires_in_days: 7 },
    })

    expect(res.status()).toBe(201)
    const link = await res.json()

    // Verify token structure
    expect(link.token).toBeTruthy()
    expect(link.token).toMatch(/^[a-zA-Z0-9-_]+$/)

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('open share link (no auth) - content visible', async ({ page, request, browser }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Public Share Notebook')
    const note = await createTestNote(request, adminToken, {
      title: 'Public Note',
      content: '<p>This is public shared content</p>',
      notebook_id: notebook.id,
    })

    // Create share link
    const linkRes = await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { link_type: 'notebook', expires_in_days: 7 },
    })
    const link = await linkRes.json()

    // Open in unauthenticated context
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const publicPage = await context.newPage()

    await publicPage.goto(`/shared/${link.token}`)

    // Verify content visible
    await expect(publicPage.getByText(notebook.title)).toBeVisible({ timeout: 10000 })
    await expect(publicPage.getByText(note.title)).toBeVisible({ timeout: 5000 })

    await context.close()

    // Cleanup
    await cleanupTestData(request, adminToken, { noteIds: [note.note_id], notebookIds: [notebook.id] })
  })

  test('public view shows content', async ({ page, request, browser }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Content View Notebook')
    const note = await createTestNote(request, adminToken, {
      title: 'Content Note',
      content: '<p>Detailed shared content for viewing</p>',
      notebook_id: notebook.id,
    })

    // Create share link
    const linkRes = await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { link_type: 'notebook' },
    })
    const link = await linkRes.json()

    // Open in unauthenticated context
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const publicPage = await context.newPage()

    await publicPage.goto(`/shared/${link.token}`)

    // Verify content displayed
    await expect(publicPage.getByText(/Detailed shared content/i)).toBeVisible({ timeout: 5000 })

    await context.close()

    // Cleanup
    await cleanupTestData(request, adminToken, { noteIds: [note.note_id], notebookIds: [notebook.id] })
  })

  test('public view shows metadata', async ({ page, request, browser }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Metadata Notebook')
    const note = await createTestNote(request, adminToken, {
      title: 'Metadata Note',
      tags: ['public', 'shared'],
      notebook_id: notebook.id,
    })

    // Create share link
    const linkRes = await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { link_type: 'notebook' },
    })
    const link = await linkRes.json()

    // Open in unauthenticated context
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const publicPage = await context.newPage()

    await publicPage.goto(`/shared/${link.token}`)

    // Verify metadata visible (tags, created date, etc.)
    await expect(publicPage.getByText(/public/i)).toBeVisible({ timeout: 5000 })
    await expect(publicPage.getByText(/shared/i)).toBeVisible({ timeout: 5000 })

    await context.close()

    // Cleanup
    await cleanupTestData(request, adminToken, { noteIds: [note.note_id], notebookIds: [notebook.id] })
  })

  test('public view hides edit controls', async ({ page, request, browser }) => {
    const notebook = await createTestNotebook(request, adminToken, 'No Edit Notebook')
    const note = await createTestNote(request, adminToken, {
      title: 'Read Only Note',
      notebook_id: notebook.id,
    })

    // Create share link
    const linkRes = await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { link_type: 'notebook' },
    })
    const link = await linkRes.json()

    // Open in unauthenticated context
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const publicPage = await context.newPage()

    await publicPage.goto(`/shared/${link.token}`)

    // Verify edit controls not present
    await expect(publicPage.getByRole('button', { name: /Edit|수정/i })).not.toBeVisible({ timeout: 2000 })
    await expect(publicPage.getByRole('button', { name: /Delete|삭제/i })).not.toBeVisible({ timeout: 2000 })

    await context.close()

    // Cleanup
    await cleanupTestData(request, adminToken, { noteIds: [note.note_id], notebookIds: [notebook.id] })
  })

  test('share link expires after TTL', async ({ request, browser }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Expiring Notebook')

    // Create link with 0 day expiry (immediate expiry for testing)
    const linkRes = await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { link_type: 'notebook', expires_in_days: 0 },
    })
    const link = await linkRes.json()

    // Wait a moment for expiry
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Try to access expired link
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const publicPage = await context.newPage()

    await publicPage.goto(`/shared/${link.token}`)

    // Should show error or expired message
    const hasError = await publicPage.getByText(/Expired|만료|Error/i).isVisible({ timeout: 5000 }).catch(() => false)
    expect(hasError).toBeTruthy()

    await context.close()

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('expired link shows error page', async ({ page, request, browser }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Error Test Notebook')

    // Create and delete link to simulate expired/invalid
    const linkRes = await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { link_type: 'notebook' },
    })
    const link = await linkRes.json()

    // Delete the link
    await request.delete(`${API}/notebooks/${notebook.id}/links/${link.id}`, {
      headers: authHeaders(adminToken),
    })

    // Try to access deleted link
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const publicPage = await context.newPage()

    await publicPage.goto(`/shared/${link.token}`)

    // Verify error message
    await expect(publicPage.getByText(/Not Found|찾을 수 없음|Invalid|유효하지 않음/i)).toBeVisible({ timeout: 5000 })

    await context.close()

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('revoke share link', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Revoke Link Notebook')

    // Create link
    const linkRes = await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { link_type: 'notebook' },
    })
    const link = await linkRes.json()

    await page.goto(`/notebooks/${notebook.id}`)
    await page.getByRole('tab', { name: /공유 링크|Share Link/i }).click()

    // Find and revoke link
    const linkRow = page.getByText(link.token).locator('..')
    await linkRow.getByRole('button', { name: /Revoke|Delete|삭제/i }).click()

    // Confirm if needed
    const confirmBtn = page.getByRole('button', { name: /확인|Confirm/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Verify link removed
    await expect(page.getByText(link.token)).not.toBeVisible({ timeout: 5000 })

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('revoked link shows error', async ({ page, request, browser }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Revoked Link Notebook')

    // Create and revoke link
    const linkRes = await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { link_type: 'notebook' },
    })
    const link = await linkRes.json()

    await request.delete(`${API}/notebooks/${notebook.id}/links/${link.id}`, {
      headers: authHeaders(adminToken),
    })

    // Try to access revoked link
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const publicPage = await context.newPage()

    await publicPage.goto(`/shared/${link.token}`)

    // Verify error
    await expect(publicPage.getByText(/Not Found|Invalid|찾을 수 없음/i)).toBeVisible({ timeout: 5000 })

    await context.close()

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('link list shows active links', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Link List Notebook')

    // Create multiple links
    const link1 = await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { expires_in_days: 7 },
    })
    const link2 = await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { link_type: 'notebook', expires_in_days: 30 },
    })

    const l1 = await link1.json()
    const l2 = await link2.json()

    await page.goto(`/notebooks/${notebook.id}`)
    await page.getByRole('tab', { name: /공유 링크|Share Link/i }).click()

    // Verify both links listed
    await expect(page.getByText(l1.token).first()).toBeVisible()
    await expect(page.getByText(l2.token).first()).toBeVisible()

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('shows expiration date', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Expiry Display Notebook')

    // Create link with expiry
    await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { expires_in_days: 7 },
    })

    await page.goto(`/notebooks/${notebook.id}`)
    await page.getByRole('tab', { name: /공유 링크|Share Link/i }).click()

    // Verify expiration date shown
    await expect(page.getByText(/Expires|만료|7.*day/i)).toBeVisible({ timeout: 5000 })

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('multiple links per notebook', async ({ request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Multi Link Notebook')

    // Create multiple links
    const links = await Promise.all([
      request.post(`${API}/notebooks/${notebook.id}/links`, {
        headers: authHeaders(adminToken),
        data: { link_type: 'notebook', expires_in_days: 1 },
      }),
      request.post(`${API}/notebooks/${notebook.id}/links`, {
        headers: authHeaders(adminToken),
        data: { link_type: 'notebook', expires_in_days: 7 },
      }),
      request.post(`${API}/notebooks/${notebook.id}/links`, {
        headers: authHeaders(adminToken),
        data: { link_type: 'notebook', expires_in_days: 30 },
      }),
    ])

    // Verify all created successfully
    for (const res of links) {
      expect(res.status()).toBe(201)
      const link = await res.json()
      expect(link.token).toBeTruthy()
    }

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('delete notebook invalidates link', async ({ request, browser }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Delete Test Notebook')

    // Create share link
    const linkRes = await request.post(`${API}/notebooks/${notebook.id}/links`, {
      headers: authHeaders(adminToken),
      data: { link_type: 'notebook' },
    })
    const link = await linkRes.json()

    // Delete notebook
    await request.delete(`${API}/notebooks/${notebook.id}`, {
      headers: authHeaders(adminToken),
    })

    // Try to access link
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const publicPage = await context.newPage()

    await publicPage.goto(`/shared/${link.token}`)

    // Should show error
    await expect(publicPage.getByText(/Not Found|Invalid|찾을 수 없음/i)).toBeVisible({ timeout: 5000 })

    await context.close()
  })
})
