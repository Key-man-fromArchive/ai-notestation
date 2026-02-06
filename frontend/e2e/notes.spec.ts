import { test, expect } from '@playwright/test'

const API = 'http://localhost:8001/api'

async function createAuthenticatedContext(
  request: import('@playwright/test').APIRequestContext,
) {
  const uniqueId = Date.now()
  const uniqueEmail = `notes-test-${uniqueId}@example.com`
  const orgSlug = `notes-test-${uniqueId}`

  const res = await request.post(`${API}/members/signup`, {
    data: {
      email: uniqueEmail,
      password: 'TestPassword123!',
      name: 'Notes Test User',
      org_name: 'Notes Test Org',
      org_slug: orgSlug,
    },
  })

  if (res.status() !== 201) {
    throw new Error(`Failed to create test user: ${res.status()}`)
  }

  const { access_token } = await res.json()
  return { token: access_token, email: uniqueEmail }
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

test.describe('Notes Flow', () => {
  test('1. API: GET /notes requires authentication', async ({ request }) => {
    const res = await request.get(`${API}/notes`)
    expect(res.status()).toBe(401)
  })

  test('2. API: GET /notes with auth returns list', async ({ request }) => {
    const { token } = await createAuthenticatedContext(request)

    const res = await request.get(`${API}/notes`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('items')
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('3. API: Search endpoint requires authentication', async ({
    request,
  }) => {
    const res = await request.get(`${API}/search?q=test`)
    expect(res.status()).toBe(401)
  })

  test('4. API: Search with auth returns results', async ({ request }) => {
    const { token } = await createAuthenticatedContext(request)

    const res = await request.get(`${API}/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: 'test' },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('results')
  })

  test('5. Notes page renders for authenticated user', async ({
    page,
    request,
  }) => {
    const { token } = await createAuthenticatedContext(request)
    await injectAuth(page, token)

    await page.goto('/notes')

    await expect(
      page.getByRole('heading', { name: '모든 노트' }),
    ).toBeVisible({ timeout: 10000 })
  })

  test('6. Search page renders with search input', async ({ page, request }) => {
    const { token } = await createAuthenticatedContext(request)
    await injectAuth(page, token)

    await page.goto('/search')

    await expect(
      page
        .getByRole('searchbox')
        .or(page.locator('input[type="search"]'))
        .or(page.getByPlaceholder(/검색|Search/i))
        .or(page.locator('input').first()),
    ).toBeVisible({ timeout: 10000 })
  })
})
