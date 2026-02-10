import { test, expect } from '@playwright/test'

const API = 'http://localhost:8001/api'

async function createTestUser(
  request: import('@playwright/test').APIRequestContext,
) {
  const uniqueId = Date.now()
  const email = `oauth-live-${uniqueId}@example.com`
  const orgSlug = `oauth-live-${uniqueId}`

  const res = await request.post(`${API}/members/signup`, {
    data: {
      email,
      password: 'TestPassword123!',
      name: 'OAuth Live Test User',
      org_name: 'OAuth Live Test Org',
      org_slug: orgSlug,
    },
  })

  if (res.status() !== 201) {
    throw new Error(`Failed to create test user: ${res.status()}`)
  }

  const body = await res.json()
  return { token: body.access_token, email }
}

async function injectAuth(
  page: import('@playwright/test').Page,
  token: string,
) {
  await page.goto('/login')
  await page.evaluate(t => {
    localStorage.setItem('auth_token', t)
  }, token)
}

test.describe('OAuth Live Browser Tests', () => {
  test('Settings page loads for authenticated user', async ({
    page,
    request,
  }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)
    await page.goto('/settings')

    await expect(
      page.getByRole('heading', { name: '설정', exact: true }),
    ).toBeVisible({ timeout: 10000 })
  })

  test('Settings page shows NAS configuration section', async ({
    page,
    request,
  }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)
    await page.goto('/settings')

    await expect(page.getByText(/NAS|Synology|서버/i).first()).toBeVisible({
      timeout: 10000,
    })
  })
})
