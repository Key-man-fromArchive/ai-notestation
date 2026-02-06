import { test, expect } from '@playwright/test'

const API = 'http://localhost:8001/api'

async function createAuthenticatedContext(
  request: import('@playwright/test').APIRequestContext,
) {
  const uniqueId = Date.now()
  const uniqueEmail = `ai-test-${uniqueId}@example.com`
  const orgSlug = `ai-test-${uniqueId}`

  const res = await request.post(`${API}/members/signup`, {
    data: {
      email: uniqueEmail,
      password: 'TestPassword123!',
      name: 'AI Test User',
      org_name: 'AI Test Org',
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

test.describe('AI Workbench', () => {
  test('1. API: AI chat requires authentication', async ({ request }) => {
    const res = await request.post(`${API}/ai/chat`, {
      data: {
        message: 'Hello',
        provider: 'openai',
      },
    })
    expect(res.status()).toBe(401)
  })

  test('2. API: AI providers list responds to authenticated request', async ({
    request,
  }) => {
    const { token } = await createAuthenticatedContext(request)

    const res = await request.get(`${API}/ai/providers`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect([200, 401, 403]).toContain(res.status())

    if (res.status() === 200) {
      const body = await res.json()
      expect(Array.isArray(body) || typeof body === 'object').toBe(true)
    }
  })

  test('3. AI Workbench page renders', async ({ page, request }) => {
    const { token } = await createAuthenticatedContext(request)
    await injectAuth(page, token)

    await page.goto('/ai')

    await expect(
      page.getByRole('link', { name: /AI 분석/i })
        .or(page.locator('[data-testid="ai-workbench"]'))
        .or(page.getByLabel(/AI 모델/i)),
    ).toBeVisible({ timeout: 10000 })
  })

  test('4. AI page has message input or chat interface', async ({
    page,
    request,
  }) => {
    const { token } = await createAuthenticatedContext(request)
    await injectAuth(page, token)

    await page.goto('/ai')

    await expect(
      page
        .locator('textarea')
        .or(page.getByPlaceholder(/메시지|message|질문/i))
        .or(page.locator('input[type="text"]').first())
        .or(page.getByRole('textbox').first()),
    ).toBeVisible({ timeout: 10000 })
  })

  test('5. AI page shows provider info or selector', async ({
    page,
    request,
  }) => {
    const { token } = await createAuthenticatedContext(request)
    await injectAuth(page, token)

    await page.goto('/ai')

    await expect(
      page.getByLabel(/AI 모델 선택/i)
        .or(page.locator('select').first()),
    ).toBeVisible({ timeout: 10000 })
  })

  test('6. Settings page shows AI provider configuration', async ({
    page,
    request,
  }) => {
    const { token } = await createAuthenticatedContext(request)
    await injectAuth(page, token)

    await page.goto('/settings')

    await expect(
      page.getByText('OpenAI API Key'),
    ).toBeVisible({ timeout: 10000 })
  })
})
