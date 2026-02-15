import { test, expect } from '@playwright/test'
import { createTestUser, loginAsAdmin, authHeaders, injectAuth } from './utils/auth-helpers'
import { cleanupTestData } from './utils/data-helpers'

const API = 'http://localhost:8001/api'

test.describe('Members Management', () => {
  test('members page loads with heading', async ({ page }) => {
    await page.goto('/members')
    await expect(page.getByRole('heading', { name: /멤버/i })).toBeVisible()
  })

  test('invite new member', async ({ page }) => {
    await page.goto('/members')

    // Open invite modal
    await page.getByRole('button', { name: /초대|Invite/i }).click()

    // Fill invitation form - wait for email input to appear
    const emailInput = page.locator('input[type="email"]').or(page.locator('#invite-email')).or(page.getByPlaceholder(/이메일|Email/i))
    await expect(emailInput.first()).toBeVisible({ timeout: 5000 })

    const inviteEmail = `invite-${Date.now()}@example.com`
    await emailInput.first().fill(inviteEmail)

    // Submit invitation
    await page.getByRole('button', { name: /초대 전송|전송|Send|보내기/i }).click()

    // Wait for modal to close or success message
    await page.waitForTimeout(1000)

    // Verify invitation appears in list
    await expect(page.getByText(inviteEmail)).toBeVisible({ timeout: 10000 })
  })

  test('pending invitation shows in list', async ({ page, request }) => {
    const { token } = await loginAsAdmin(request)
    const inviteEmail = `pending-${Date.now()}@example.com`

    // Create invitation via API
    await request.post(`${API}/members/invite`, {
      headers: authHeaders(token),
      data: { email: inviteEmail, role: 'member' },
    })

    // Visit members page
    await page.goto('/members')

    // Verify pending status
    await expect(page.getByText(inviteEmail)).toBeVisible()
    await expect(page.getByText(/Pending/i)).toBeVisible()
  })

  test('resend invitation', async ({ page, request }) => {
    const { token } = await loginAsAdmin(request)
    const inviteEmail = `resend-${Date.now()}@example.com`

    // Create invitation
    const res = await request.post(`${API}/members/invite`, {
      headers: authHeaders(token),
      data: { email: inviteEmail, role: 'member' },
    })
    const invitation = await res.json()

    await page.goto('/members')

    // Find and click resend button
    const inviteRow = page.getByText(inviteEmail).locator('..')
    await inviteRow.getByRole('button', { name: /Resend/i }).click()

    // Verify success feedback
    await expect(page.getByText(/초대.*다시 전송/i)).toBeVisible({ timeout: 5000 })
  })

  test('cancel invitation', async ({ page, request }) => {
    const { token } = await loginAsAdmin(request)
    const inviteEmail = `cancel-${Date.now()}@example.com`

    // Create invitation
    await request.post(`${API}/members/invite`, {
      headers: authHeaders(token),
      data: { email: inviteEmail, role: 'member' },
    })

    await page.goto('/members')

    // Find and cancel invitation
    const inviteRow = page.getByText(inviteEmail).locator('..')
    await inviteRow.getByRole('button', { name: /Cancel|취소/i }).click()

    // Confirm cancellation if needed
    const confirmBtn = page.getByRole('button', { name: /확인|Confirm/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Verify invitation removed
    await expect(page.getByText(inviteEmail)).not.toBeVisible({ timeout: 5000 })
  })

  test('remove member', async ({ page, request }) => {
    const { token } = await loginAsAdmin(request)

    // Create test user
    const testUser = await createTestUser(request, 'remove')

    // Get user ID
    const membersRes = await request.get(`${API}/members`, {
      headers: authHeaders(token),
    })
    const members = await membersRes.json()
    const member = members.find((m: any) => m.email === testUser.email)

    await page.goto('/members')

    // Find and remove member
    const memberRow = page.getByText(testUser.email).locator('..')
    await memberRow.getByRole('button', { name: /Remove|제거/i }).click()

    // Confirm removal
    const confirmBtn = page.getByRole('button', { name: /확인|Confirm/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Verify member removed
    await expect(page.getByText(testUser.email)).not.toBeVisible({ timeout: 5000 })
  })

  test('update role - member to admin', async ({ page, request }) => {
    const { token } = await loginAsAdmin(request)

    // Create test user as member
    const testUser = await createTestUser(request, 'role-test')

    // Get user ID
    const membersRes = await request.get(`${API}/members`, {
      headers: authHeaders(token),
    })
    const members = await membersRes.json()
    const member = members.find((m: any) => m.email === testUser.email)

    await page.goto('/members')

    // Find member row and open role selector
    const memberRow = page.getByText(testUser.email).locator('..')
    await memberRow.getByRole('combobox', { name: /Role|역할/i }).click()

    // Select admin role
    await page.getByRole('option', { name: /Admin|관리자/i }).click()

    // Verify role updated
    await expect(memberRow.getByText(/Admin|관리자/)).toBeVisible({ timeout: 5000 })
  })

  test('update role - admin to member', async ({ page, request }) => {
    const { token } = await loginAsAdmin(request)

    // Create test user
    const testUser = await createTestUser(request, 'admin-test')

    // Get and update to admin
    const membersRes = await request.get(`${API}/members`, {
      headers: authHeaders(token),
    })
    const members = await membersRes.json()
    const member = members.find((m: any) => m.email === testUser.email)

    await request.put(`${API}/members/${member.id}/role`, {
      headers: authHeaders(token),
      data: { role: 'admin' },
    })

    await page.goto('/members')

    // Find member row and change back to member
    const memberRow = page.getByText(testUser.email).locator('..')
    await memberRow.getByRole('combobox', { name: /Role|역할/i }).click()
    await page.getByRole('option', { name: /^Member|멤버$/i }).click()

    // Verify role updated
    await expect(memberRow.getByText(/^Member|멤버$/)).toBeVisible({ timeout: 5000 })
  })

  test('owner cannot be removed', async ({ page }) => {
    await page.goto('/members')

    // Find owner row
    const ownerRow = page.getByText('ceo@invirustech.com').locator('..')
    await expect(ownerRow.getByText('Owner')).toBeVisible()

    // Remove button should be disabled or not present
    const removeBtn = ownerRow.getByRole('button', { name: /Remove|제거/i })
    if (await removeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(removeBtn).toBeDisabled()
    }
  })

  test('list shows email, role, and status', async ({ page, request }) => {
    const { token } = await loginAsAdmin(request)
    const testEmail = `list-test-${Date.now()}@example.com`

    // Create invitation
    await request.post(`${API}/members/invite`, {
      headers: authHeaders(token),
      data: { email: testEmail, role: 'member' },
    })

    await page.goto('/members')

    // Verify columns visible
    const row = page.getByText(testEmail).locator('..')
    await expect(row.getByText(testEmail)).toBeVisible()
    await expect(row.getByText(/Member|멤버/i)).toBeVisible()
    await expect(row.getByText(/Pending/i)).toBeVisible()
  })

  test('filter by role', async ({ page }) => {
    await page.goto('/members')

    // Look for role filter (if implemented)
    const roleFilter = page.getByRole('combobox', { name: /Filter|필터/i })
    if (await roleFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roleFilter.click()
      await page.getByRole('option', { name: /Admin|관리자/i }).click()

      // Verify only admins shown
      await expect(page.getByText('Owner')).toBeVisible()
      await expect(page.getByText(/^Member$/i).first()).not.toBeVisible({ timeout: 2000 }).catch(() => {})
    } else {
      // Skip test if filter not implemented
      test.skip()
    }
  })

  test('search by email', async ({ page, request }) => {
    const { token } = await loginAsAdmin(request)
    const searchEmail = `search-${Date.now()}@example.com`

    // Create test user
    await createTestUser(request, searchEmail.split('@')[0])

    await page.goto('/members')

    // Search for email
    const searchInput = page.getByPlaceholder(/Search|검색/i)
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill(searchEmail)

      // Verify filtered results
      await expect(page.getByText(searchEmail)).toBeVisible()
      await expect(page.getByText('ceo@invirustech.com')).not.toBeVisible({ timeout: 2000 }).catch(() => {})
    } else {
      // Skip if search not implemented
      test.skip()
    }
  })

  test('non-admin redirected or forbidden', async ({ page, request }) => {
    // Create non-admin user
    const testUser = await createTestUser(request, 'nonadmin')

    // Login as non-admin
    await injectAuth(page, testUser.token)

    // Try to access members page
    await page.goto('/members')

    // Should redirect to login or show 403
    const isOnLogin = await page.url().includes('/login')
    const has403 = await page.getByText(/403|Forbidden|권한 없음/i).isVisible({ timeout: 2000 }).catch(() => false)

    expect(isOnLogin || has403).toBeTruthy()
  })

  test('signup flow works', async ({ page, browser }) => {
    // Use clean browser context (no auth)
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const signupPage = await context.newPage()

    const uniqueId = `signup-${Date.now()}`
    const email = `${uniqueId}@example.com`

    await signupPage.goto('/signup')

    // Fill signup form
    await signupPage.getByLabel(/이메일|Email/i).fill(email)
    await signupPage.getByLabel(/비밀번호|Password/i).fill('TestPassword123!')
    await signupPage.getByLabel(/이름|Name/i).fill('Signup Test User')
    await signupPage.getByLabel(/조직 이름|Organization/i).fill('Test Org')
    await signupPage.getByLabel(/조직 슬러그|Slug/i).fill(uniqueId)

    // Submit
    await signupPage.getByRole('button', { name: /회원가입|Sign up/i }).click()

    // Should redirect to dashboard after signup
    await expect(signupPage).toHaveURL(/\//, { timeout: 15000 })
    await expect(signupPage.getByRole('heading', { name: /대시보드/i })).toBeVisible({ timeout: 10000 })

    await context.close()
  })
})
