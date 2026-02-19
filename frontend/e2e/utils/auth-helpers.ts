import type { APIRequestContext, Page } from '@playwright/test'

const API = 'http://localhost:8001/api'

/**
 * Create a unique test user via signup API.
 * Returns { token, email, refreshToken }.
 */
export async function createTestUser(
  request: APIRequestContext,
  prefix = 'e2e',
) {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const email = `${prefix}-${uniqueId}@example.com`
  const orgSlug = `${prefix}-${uniqueId}`

  const res = await request.post(`${API}/members/signup`, {
    data: {
      email,
      password: 'TestPassword123!',
      name: `${prefix} Test User`,
      org_name: `${prefix} Test Org`,
      org_slug: orgSlug,
    },
  })

  if (res.status() !== 201) {
    const body = await res.text()
    throw new Error(`Failed to create test user (${res.status()}): ${body}`)
  }

  const { access_token, refresh_token } = await res.json()
  return { token: access_token, refreshToken: refresh_token, email }
}

/**
 * Inject auth token into page's localStorage.
 * Must be called before navigating to protected routes.
 */
export async function injectAuth(page: Page, token: string) {
  await page.goto('/login')
  await page.evaluate((t) => {
    localStorage.setItem('auth_token', t)
  }, token)
}

/**
 * Create and login as an admin user (owner role).
 * Returns the auth token and email.
 */
export async function loginAsAdmin(request: APIRequestContext) {
  const { token, email } = await createTestUser(request, 'admin')
  return { token, email }
}

/**
 * Get auth headers for API requests.
 */
export function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` }
}
