import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = 'e2e/.auth/user.json'
const API = 'http://localhost:8001/api'

setup('authenticate', async ({ page, request }) => {
  // Create a fresh test user via API (no pre-existing user needed)
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const email = `e2e-auth-${uniqueId}@example.com`
  const password = 'TestPassword123'

  const signupRes = await request.post(`${API}/members/signup`, {
    data: {
      email,
      password,
      name: 'E2E Test Admin',
      org_name: 'E2E Test Org',
      org_slug: `e2e-${uniqueId}`,
    },
  })

  if (signupRes.status() !== 201) {
    const body = await signupRes.text()
    throw new Error(`Signup failed (${signupRes.status()}): ${body}`)
  }

  const { access_token, refresh_token } = await signupRes.json()

  // Inject auth token into browser localStorage
  await page.goto('/login')
  await page.evaluate(
    ({ token, refresh, userEmail }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('refresh_token', refresh)
      localStorage.setItem('user_email', userEmail)
      localStorage.setItem('language', 'ko')
    },
    { token: access_token, refresh: refresh_token, userEmail: email },
  )

  // Navigate to dashboard to verify auth works
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /대시보드|Dashboard/i })).toBeVisible({ timeout: 15000 })

  // Save auth state (includes localStorage)
  await page.context().storageState({ path: AUTH_FILE })
})
