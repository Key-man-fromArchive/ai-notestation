import { test, expect } from '@playwright/test'

const API = 'http://localhost:8001/api'

async function createTestUser(request: import('@playwright/test').APIRequestContext) {
  const uniqueId = Date.now()
  const email = `oauth-test-${uniqueId}@example.com`
  const orgSlug = `oauth-test-${uniqueId}`

  const res = await request.post(`${API}/members/signup`, {
    data: {
      email,
      password: 'TestPassword123!',
      name: 'OAuth Test User',
      org_name: 'OAuth Test Org',
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

test.describe('OAuth Flow', () => {
  test('1. API: OpenAI OAuth authorize requires authentication', async ({
    request,
  }) => {
    const res = await request.get(`${API}/oauth/openai/authorize`)
    expect(res.status()).toBe(401)
  })

  test('2. API: OpenAI OAuth authorize with auth returns URL', async ({
    request,
  }) => {
    const { token } = await createTestUser(request)
    const res = await request.get(`${API}/oauth/openai/authorize`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.authorization_url).toContain('auth.openai.com')
  })

  test('3. UI: Settings page accessible with auth', async ({
    page,
    request,
  }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)
    await page.goto('/settings')

    await expect(
      page.getByRole('heading', { name: /설정|Settings/i }).or(
        page.getByText(/NAS 설정|API Key|OAuth/i),
      ),
    ).toBeVisible({ timeout: 10000 })
  })

  test('4. UI: Settings page shows OAuth section when configured', async ({
    page,
    request,
  }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)
    await page.goto('/settings')

    const oauthSection = page
      .getByText(/연결|Connect|OAuth/i)
      .or(page.getByText(/API Key/i))
    await expect(oauthSection.first()).toBeVisible({ timeout: 10000 })
  })

  test('5. API: Google callback without auth returns 401', async ({
    request,
  }) => {
    const res = await request.post(`${API}/oauth/google/callback`, {
      data: { code: 'fake-code', state: 'invalid-state' },
    })
    expect(res.status()).toBe(401)
  })

  test('6. API: OpenAI callback without auth returns 401', async ({
    request,
  }) => {
    const res = await request.post(`${API}/oauth/openai/callback`, {
      data: { code: 'fake-code', state: 'invalid-state' },
    })
    expect(res.status()).toBe(401)
  })

  test('7. API: Google callback with auth but invalid state returns 400', async ({
    request,
  }) => {
    const { token } = await createTestUser(request)
    const res = await request.post(`${API}/oauth/google/callback`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { code: 'fake-code', state: 'invalid-state' },
    })
    expect(res.status()).toBe(400)
  })

  test('8. API: OpenAI callback with auth but invalid state returns 400', async ({
    request,
  }) => {
    const { token } = await createTestUser(request)
    const res = await request.post(`${API}/oauth/openai/callback`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { code: 'fake-code', state: 'invalid-state' },
    })
    expect(res.status()).toBe(400)
  })
})
