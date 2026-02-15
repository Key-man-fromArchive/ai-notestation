import { test, expect } from '@playwright/test'
import { createTestUser, loginAsAdmin, authHeaders, injectAuth } from './utils/auth-helpers'
import { createTestNotebook, cleanupTestData } from './utils/data-helpers'

const API = 'http://localhost:8001/api'

test.describe('Notebook Sharing', () => {
  let adminToken: string
  let adminEmail: string
  let testUser: { token: string; email: string }

  test.beforeAll(async ({ request }) => {
    const admin = await loginAsAdmin(request)
    adminToken = admin.token
    adminEmail = admin.email

    // Create a test user for sharing tests
    testUser = await createTestUser(request, 'sharing')
  })

  test('create private notebook - only creator sees it', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Private Notebook')

    await injectAuth(page, adminToken)
    await page.goto('/notebooks')
    await expect(page.getByText(notebook.name)).toBeVisible()

    // Switch to test user context
    const testPage = await page.context().newPage()
    await injectAuth(testPage, testUser.token)
    await testPage.goto('/notebooks')

    // Test user should not see private notebook
    await expect(testPage.getByText(notebook.name)).not.toBeVisible({ timeout: 5000 })

    await testPage.close()

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('grant read access to another user', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Share Read Test')

    await injectAuth(page, adminToken)
    // Navigate to notebook access settings
    await page.goto(`/notebooks/${notebook.id}`)

    // Find and click access/share tab
    const accessTab = page.getByRole('tab', { name: /접근 권한|Access|Share/i })
    await accessTab.click()

    // Add user with read access
    await page.getByRole('button', { name: /Add.*User|사용자 추가/i }).click()
    await page.getByPlaceholder(/Email|이메일/i).fill(testUser.email)
    await page.getByRole('combobox', { name: /Permission|권한/i }).click()
    await page.getByRole('option', { name: /Read|읽기/i }).click()
    await page.getByRole('button', { name: /Grant|부여|Add/i }).click()

    // Verify user added to access list
    await expect(page.getByText(testUser.email)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/Read|읽기/)).toBeVisible()

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('user with read access sees notebook', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Shared Notebook')

    // Grant read access via API
    await request.post(`${API}/notebooks/${notebook.id}/access`, {
      headers: authHeaders(adminToken),
      data: { email: testUser.email, access_level: 'read' },
    })

    // Login as test user
    await injectAuth(page, testUser.token)
    await page.goto('/notebooks')

    // Verify notebook visible
    await expect(page.getByText(notebook.name)).toBeVisible({ timeout: 10000 })

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('user can view notes in shared notebook', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'View Notes Test')

    // Grant read access
    await request.post(`${API}/notebooks/${notebook.id}/access`, {
      headers: authHeaders(adminToken),
      data: { email: testUser.email, access_level: 'read' },
    })

    // Login as test user
    await injectAuth(page, testUser.token)
    await page.goto(`/notebooks/${notebook.id}`)

    // Verify notebook is accessible (check page title or content)
    await expect(page.getByText(notebook.name)).toBeVisible({ timeout: 10000 })

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('user cannot edit with read-only access', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Read Only Test')

    // Grant read access
    await request.post(`${API}/notebooks/${notebook.id}/access`, {
      headers: authHeaders(adminToken),
      data: { email: testUser.email, access_level: 'read' },
    })

    // Login as test user
    await injectAuth(page, testUser.token)
    await page.goto(`/notebooks/${notebook.id}`)

    // Edit/Add note button should be disabled or hidden for read-only users
    const addNoteBtn = page.getByRole('button', { name: /Add.*Note|새 노트/i })
    if (await addNoteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(addNoteBtn).toBeDisabled()
    }

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('grant write access', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Write Access Test')

    await injectAuth(page, adminToken)
    await page.goto(`/notebooks/${notebook.id}`)
    await page.getByRole('tab', { name: /접근 권한|Access|Share/i }).click()

    // Add user with write access
    await page.getByRole('button', { name: /Add.*User|사용자 추가/i }).click()
    await page.getByPlaceholder(/Email|이메일/i).fill(testUser.email)
    await page.getByRole('combobox', { name: /Permission|권한/i }).click()
    await page.getByRole('option', { name: /Write|쓰기/i }).click()
    await page.getByRole('button', { name: /Grant|부여|Add/i }).click()

    // Verify write access granted
    const userRow = page.getByText(testUser.email).locator('..')
    await expect(userRow.getByText(/Write|쓰기/)).toBeVisible({ timeout: 5000 })

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('user can edit with write access', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Edit Test')

    // Grant write access
    await request.post(`${API}/notebooks/${notebook.id}/access`, {
      headers: authHeaders(adminToken),
      data: { email: testUser.email, access_level: 'write' },
    })

    // Login as test user
    await injectAuth(page, testUser.token)
    await page.goto(`/notebooks/${notebook.id}`)

    // Add note button should be enabled for write access
    const addNoteBtn = page.getByRole('button', { name: /Add.*Note|새 노트/i })
    await expect(addNoteBtn).toBeVisible()
    await expect(addNoteBtn).toBeEnabled()

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('grant admin access', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Admin Access Test')

    await injectAuth(page, adminToken)
    await page.goto(`/notebooks/${notebook.id}`)
    await page.getByRole('tab', { name: /접근 권한|Access|Share/i }).click()

    // Add user with admin access
    await page.getByRole('button', { name: /Add.*User|사용자 추가/i }).click()
    await page.getByPlaceholder(/Email|이메일/i).fill(testUser.email)
    await page.getByRole('combobox', { name: /Permission|권한/i }).click()
    await page.getByRole('option', { name: /Admin|관리자/i }).click()
    await page.getByRole('button', { name: /Grant|부여|Add/i }).click()

    // Verify admin access granted
    const userRow = page.getByText(testUser.email).locator('..')
    await expect(userRow.getByText(/Admin|관리자/)).toBeVisible({ timeout: 5000 })

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('user with admin can manage permissions', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Manage Perms Test')

    // Grant admin access
    await request.post(`${API}/notebooks/${notebook.id}/access`, {
      headers: authHeaders(adminToken),
      data: { email: testUser.email, access_level: 'admin' },
    })

    // Login as test user
    await injectAuth(page, testUser.token)
    await page.goto(`/notebooks/${notebook.id}`)
    await page.getByRole('tab', { name: /접근 권한|Access|Share/i }).click()

    // Verify can add users
    await expect(page.getByRole('button', { name: /Add.*User|사용자 추가/i })).toBeEnabled()

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('revoke access', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Revoke Test')

    // Grant read access
    const accessRes = await request.post(`${API}/notebooks/${notebook.id}/access`, {
      headers: authHeaders(adminToken),
      data: { email: testUser.email, access_level: 'read' },
    })
    const access = await accessRes.json()

    await injectAuth(page, adminToken)
    await page.goto(`/notebooks/${notebook.id}`)
    await page.getByRole('tab', { name: /접근 권한|Access|Share/i }).click()

    // Find and revoke access
    const userRow = page.getByText(testUser.email).locator('..')
    await userRow.getByRole('button', { name: /Revoke|제거|Remove/i }).click()

    // Confirm if needed
    const confirmBtn = page.getByRole('button', { name: /확인|Confirm/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Verify access removed
    await expect(page.getByText(testUser.email)).not.toBeVisible({ timeout: 5000 })

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('user no longer sees notebook after revocation', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Post Revoke Test')

    // Grant and revoke access via API
    const accessRes = await request.post(`${API}/notebooks/${notebook.id}/access`, {
      headers: authHeaders(adminToken),
      data: { email: testUser.email, access_level: 'read' },
    })
    const access = await accessRes.json()

    await request.delete(`${API}/notebooks/${notebook.id}/access/${access.id}`, {
      headers: authHeaders(adminToken),
    })

    // Login as test user
    await injectAuth(page, testUser.token)
    await page.goto('/notebooks')

    // Verify notebook not visible
    await expect(page.getByText(notebook.name)).not.toBeVisible({ timeout: 5000 })

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('access list shows users with access', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Access List Test')

    // Grant access to test user
    await request.post(`${API}/notebooks/${notebook.id}/access`, {
      headers: authHeaders(adminToken),
      data: { email: testUser.email, access_level: 'read' },
    })

    await injectAuth(page, adminToken)
    await page.goto(`/notebooks/${notebook.id}`)
    await page.getByRole('tab', { name: /접근 권한|Access|Share/i }).click()

    // Verify both owner and shared user listed
    await expect(page.getByText(adminEmail)).toBeVisible()
    await expect(page.getByText(testUser.email)).toBeVisible()

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('access list shows access levels', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Access Levels Test')

    // Grant read access
    await request.post(`${API}/notebooks/${notebook.id}/access`, {
      headers: authHeaders(adminToken),
      data: { email: testUser.email, access_level: 'read' },
    })

    await injectAuth(page, adminToken)
    await page.goto(`/notebooks/${notebook.id}`)
    await page.getByRole('tab', { name: /접근 권한|Access|Share/i }).click()

    // Verify access levels displayed
    const userRow = page.getByText(testUser.email).locator('..')
    await expect(userRow.getByText(/Read|읽기/)).toBeVisible()

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('only admin can manage access', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Admin Only Test')

    // Grant read access (not admin)
    await request.post(`${API}/notebooks/${notebook.id}/access`, {
      headers: authHeaders(adminToken),
      data: { email: testUser.email, access_level: 'read' },
    })

    // Login as test user
    await injectAuth(page, testUser.token)
    await page.goto(`/notebooks/${notebook.id}`)

    // Access tab may be hidden or disabled
    const accessTab = page.getByRole('tab', { name: /접근 권한|Access|Share/i })
    if (await accessTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await accessTab.click()
      // Add user button should be disabled or hidden
      const addBtn = page.getByRole('button', { name: /Add.*User|사용자 추가/i })
      if (await addBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await expect(addBtn).toBeDisabled()
      }
    }

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })

  test('public notebook visible to all members', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, adminToken, 'Public Notebook')

    // Set notebook to public via API (if supported)
    await request.put(`${API}/notebooks/${notebook.id}`, {
      headers: authHeaders(adminToken),
      data: { is_public: true },
    }).catch(() => {
      // Skip test if public notebooks not supported
      test.skip()
    })

    // Login as test user
    await injectAuth(page, testUser.token)
    await page.goto('/notebooks')

    // Verify public notebook visible
    await expect(page.getByText(notebook.name)).toBeVisible({ timeout: 10000 })

    // Cleanup
    await cleanupTestData(request, adminToken, { notebookIds: [notebook.id] })
  })
})
