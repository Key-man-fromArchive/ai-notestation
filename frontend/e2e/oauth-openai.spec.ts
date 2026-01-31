import { test, expect } from '@playwright/test'

const API = 'http://localhost:8001/api'

// JWT 토큰을 localStorage에 주입하여 인증 우회
async function injectAuth(page: import('@playwright/test').Page, token: string) {
  await page.goto('/login')
  await page.evaluate((t) => {
    localStorage.setItem('auth_token', t)
  }, token)
}

test.describe('OAuth Flow', () => {

  test('1. API: OpenAI OAuth authorize → auth.openai.com URL 반환', async ({ request }) => {
    const token = process.env.TEST_JWT!
    const res = await request.get(`${API}/oauth/openai/authorize`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.authorization_url).toContain('auth.openai.com')
    expect(data.authorization_url).toContain('codex_cli_simplified_flow=true')
    expect(data.authorization_url).toContain('originator=codex_cli_rs')
  })

  test('2. UI: Settings 페이지에 ChatGPT OAuth 버튼 표시', async ({ page }) => {
    const token = process.env.TEST_JWT!
    await injectAuth(page, token)
    await page.goto('/settings')

    // ChatGPT OAuth 버튼이 표시되어야 함
    await expect(page.getByText('ChatGPT (Plus/Pro)로 연결')).toBeVisible({ timeout: 5000 })
    // OpenAI API Key 입력 필드도 존재해야 함
    await expect(page.getByText('OpenAI API Key')).toBeVisible({ timeout: 5000 })
  })

  test('3. UI: Google OAuth 설정 시 연결 버튼 표시', async ({ page }) => {
    const token = process.env.TEST_JWT!
    await injectAuth(page, token)
    await page.goto('/settings')

    await expect(
      page.getByText('Google로 연결')
    ).toBeVisible({ timeout: 5000 })
  })

  test('4. API: callback에 잘못된 state → 400 에러', async ({ request }) => {
    const token = process.env.TEST_JWT!
    const res = await request.post(`${API}/oauth/google/callback`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { code: 'fake-code', state: 'invalid-state' },
    })
    expect(res.status()).toBe(400)
  })

  test('5. API: OpenAI callback에 잘못된 state → 400 에러', async ({ request }) => {
    const token = process.env.TEST_JWT!
    const res = await request.post(`${API}/oauth/openai/callback`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { code: 'fake-code', state: 'invalid-state' },
    })
    expect(res.status()).toBe(400)
  })
})
