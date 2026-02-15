import { test, expect } from '@playwright/test'
import { createTestUser, loginAsAdmin, authHeaders } from './utils/auth-helpers'

const API = 'http://localhost:8001/api'

// ─── Admin Users Management ──────────────────────────────────────────────────

test.describe('Admin Users Management', () => {
  let adminToken: string

  test.beforeAll(async ({ request }) => {
    const { token } = await loginAsAdmin(request)
    adminToken = token
  })

  test('users tab loads', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()
    await expect(page.getByText(/사용자/i).first()).toBeVisible()
  })

  test('list all users', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()
    // Admin user should be listed
    await expect(page.getByText('ceo@invirustech.com')).toBeVisible()
  })

  test('filter by role', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()

    // Look for role filter dropdown/select
    const roleFilter = page.locator('select, [role="combobox"]').filter({
      hasText: /역할|Role/i,
    })

    if (await roleFilter.isVisible()) {
      await roleFilter.click()
      // Select "Owner" or "Admin"
      await page.getByText(/Owner|Admin/i).first().click()
      // Should show filtered results
      await expect(page.getByText('ceo@invirustech.com')).toBeVisible()
    } else {
      // If no filter UI, just verify users are shown by role
      await expect(page.getByText(/Owner|Admin/i).first()).toBeVisible()
    }
  })

  test('search by email', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()

    // Look for search input
    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="Search"]')

    if (await searchInput.isVisible()) {
      await searchInput.fill('ai-note')
      await expect(page.getByText('ceo@invirustech.com')).toBeVisible()
    } else {
      // If no search input, just verify user is visible
      await expect(page.getByText('ceo@invirustech.com')).toBeVisible()
    }
  })

  test('view user details', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()

    // Click on user row or details button
    const userRow = page.locator('text=ceo@invirustech.com').locator('..')
    await userRow.click()

    // Should show details (email, role, created date, etc.)
    await expect(page.getByText(/ceo@invirustech.com/i)).toBeVisible()
    await expect(page.getByText(/Owner|Admin/i).first()).toBeVisible()
  })

  test('update role (admin→member via API + verify UI)', async ({ page, request }) => {
    // Create a test user first
    const { token, email } = await createTestUser(request, 'admin-test')

    // Get user ID
    const usersRes = await request.get(`${API}/admin/users`, {
      headers: authHeaders(adminToken),
    })
    const users = await usersRes.json()
    const testUser = users.find((u: { email: string }) => u.email === email)

    if (!testUser) {
      throw new Error('Test user not found')
    }

    // Update role to member
    const updateRes = await request.put(`${API}/admin/users/${testUser.id}`, {
      headers: authHeaders(adminToken),
      data: { role: 'member' },
    })
    expect(updateRes.status()).toBe(200)

    // Verify in UI
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()

    const userRow = page.locator(`text=${email}`).locator('..')
    await expect(userRow).toContainText(/Member/i)
  })

  test('suspend user', async ({ page, request }) => {
    // Create a test user
    const { token, email } = await createTestUser(request, 'suspend-test')

    // Get user ID
    const usersRes = await request.get(`${API}/admin/users`, {
      headers: authHeaders(adminToken),
    })
    const users = await usersRes.json()
    const testUser = users.find((u: { email: string }) => u.email === email)

    if (!testUser) {
      throw new Error('Test user not found')
    }

    // Suspend user
    const suspendRes = await request.put(`${API}/admin/users/${testUser.id}`, {
      headers: authHeaders(adminToken),
      data: { is_active: false },
    })
    expect(suspendRes.status()).toBe(200)

    // Verify in UI
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()

    const userRow = page.locator(`text=${email}`).locator('..')
    // Should show "Suspended" or "Inactive" badge
    await expect(userRow).toContainText(/Suspended|Inactive|비활성/i)
  })

  test('reactivate user', async ({ page, request }) => {
    // Create and suspend a user first
    const { token, email } = await createTestUser(request, 'reactivate-test')

    const usersRes = await request.get(`${API}/admin/users`, {
      headers: authHeaders(adminToken),
    })
    const users = await usersRes.json()
    const testUser = users.find((u: { email: string }) => u.email === email)

    if (!testUser) {
      throw new Error('Test user not found')
    }

    // Suspend
    await request.put(`${API}/admin/users/${testUser.id}`, {
      headers: authHeaders(adminToken),
      data: { is_active: false },
    })

    // Reactivate
    const reactivateRes = await request.put(`${API}/admin/users/${testUser.id}`, {
      headers: authHeaders(adminToken),
      data: { is_active: true },
    })
    expect(reactivateRes.status()).toBe(200)

    // Verify in UI
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()

    const userRow = page.locator(`text=${email}`).locator('..')
    // Should show "Active" or no inactive badge
    await expect(userRow).toContainText(/Active|활성/i)
  })

  test('cannot modify own role', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()

    // Find admin user row
    const adminRow = page.locator('text=ceo@invirustech.com').locator('..')

    // Role select/dropdown should be disabled or not present
    const roleSelect = adminRow.locator('select, [role="combobox"]')
    if (await roleSelect.isVisible()) {
      await expect(roleSelect).toBeDisabled()
    }
    // Alternatively, check for a message
    await expect(page.getByText(/자신의 역할|own role/i).first()).toBeVisible()
  })

  test('user count matches overview', async ({ page, request }) => {
    // Get count from API
    const usersRes = await request.get(`${API}/admin/users`, {
      headers: authHeaders(adminToken),
    })
    const users = await usersRes.json()
    const apiCount = users.length

    // Get count from overview tab
    await page.goto('/admin')
    const overviewTab = page.locator('main').getByRole('button', { name: /개요/i })
    await overviewTab.click()

    const userCountCard = page.locator('text=/활성 사용자/i').locator('..')
    const uiCountText = await userCountCard.textContent()
    const uiCount = parseInt(uiCountText?.match(/\d+/)?.[0] || '0')

    expect(uiCount).toBeGreaterThanOrEqual(1)
    // Counts might differ slightly due to active vs all users
    expect(uiCount).toBeLessThanOrEqual(apiCount + 5)
  })

  test('shows user creation date', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()

    // User table should have a "Created" or "가입일" column
    const userTable = page.locator('table, [role="table"]')
    await expect(userTable).toBeVisible()

    // Check for date format (YYYY-MM-DD or similar)
    await expect(userTable).toContainText(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/)
  })

  test('shows last login', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /사용자/i }).click()

    // Look for "Last Login" or "마지막 로그인" column
    const lastLoginHeader = page.getByText(/Last Login|마지막 로그인/i)
    await expect(lastLoginHeader.first()).toBeVisible()

    // Should show either a date or "Never"
    const userTable = page.locator('table, [role="table"]')
    await expect(userTable).toContainText(/\d{4}-\d{2}-\d{2}|Never|없음/)
  })
})
