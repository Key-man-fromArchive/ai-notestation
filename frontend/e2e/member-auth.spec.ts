import { test, expect } from '@playwright/test'

const API = 'http://localhost:8001/api'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

test.describe('Member Auth Flow', () => {
  const testPassword = 'TestPassword123!'
  const testOrgName = 'Test Organization'

  test('1. Signup page renders correctly', async ({ page }) => {
    await page.goto('/signup')

    await expect(
      page.getByRole('heading', { name: /Create your account/i }),
    ).toBeVisible()
    await expect(page.locator('input#email')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Create account/i }),
    ).toBeVisible()
  })

  test('2. Signup form accepts input and submits', async ({ page }) => {
    const testEmail = `ui-signup-${Date.now()}@example.com`
    await page.goto('/signup')

    await page.locator('input#email').fill(testEmail)
    await page.locator('input#password').fill(testPassword)
    await page.locator('input#name').fill('Test User')
    await page.locator('input#org-name').fill(testOrgName)
    await page.locator('input#org-slug').fill(slugify(testOrgName))

    const submitButton = page.getByRole('button', { name: /Create account/i })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    await expect(
      page.getByRole('button', { name: /Creating account/i }),
    ).toBeVisible({ timeout: 5000 })
  })

  test('3. API: Signup endpoint works', async ({ request }) => {
    const uniqueEmail = `api-test-${Date.now()}@example.com`
    const orgSlug = `api-test-${Date.now()}`

    const res = await request.post(`${API}/members/signup`, {
      data: {
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'API Test User',
        org_name: 'API Test Org',
        org_slug: orgSlug,
      },
    })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('access_token')
    expect(body).toHaveProperty('refresh_token')
    expect(body).toHaveProperty('email')
    expect(body.email).toBe(uniqueEmail)
  })

  test('4. API: Login after signup works', async ({ request }) => {
    const uniqueEmail = `login-test-${Date.now()}@example.com`
    const password = 'TestPassword123!'
    const orgSlug = `login-test-${Date.now()}`

    await request.post(`${API}/members/signup`, {
      data: {
        email: uniqueEmail,
        password: password,
        name: 'Login Test User',
        org_name: 'Login Test Org',
        org_slug: orgSlug,
      },
    })

    const res = await request.post(`${API}/auth/login`, {
      data: {
        email: uniqueEmail,
        password: password,
      },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('access_token')
    expect(body).toHaveProperty('email')
  })

  test('5. API: Login with wrong password returns 401', async ({ request }) => {
    const uniqueEmail = `wrong-pass-${Date.now()}@example.com`
    const orgSlug = `wrong-pass-${Date.now()}`

    await request.post(`${API}/members/signup`, {
      data: {
        email: uniqueEmail,
        password: 'CorrectPassword123!',
        name: 'Wrong Pass User',
        org_name: 'Wrong Pass Org',
        org_slug: orgSlug,
      },
    })

    const res = await request.post(`${API}/auth/login`, {
      data: {
        email: uniqueEmail,
        password: 'WrongPassword123!',
      },
    })

    expect(res.status()).toBe(401)
  })

  test('6. API: Token refresh works', async ({ request }) => {
    const uniqueEmail = `refresh-test-${Date.now()}@example.com`
    const orgSlug = `refresh-test-${Date.now()}`

    const signupRes = await request.post(`${API}/members/signup`, {
      data: {
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Refresh Test User',
        org_name: 'Refresh Test Org',
        org_slug: orgSlug,
      },
    })

    const { refresh_token } = await signupRes.json()

    const res = await request.post(`${API}/auth/token/refresh`, {
      data: { refresh_token },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('access_token')
  })

  test('7. Member login page shows email/password form', async ({ page }) => {
    await page.goto('/member-login')

    await expect(page.locator('input#email, input[type="email"]')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Sign in|로그인/i }),
    ).toBeVisible()
  })

  test('8. Protected route redirects unauthenticated user', async ({
    page,
  }) => {
    await page.goto('/member-login')
    await page.evaluate(() => localStorage.clear())

    await page.goto('/members')

    await page.waitForURL(/\/(login|member-login)/, { timeout: 5000 })
  })
})
