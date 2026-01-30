import { test, expect } from '@playwright/test'

const API = 'http://localhost:8001/api'

// JWT 토큰을 localStorage에 주입하여 인증 우회
async function injectAuth(page: import('@playwright/test').Page, token: string) {
  await page.goto('/login')
  await page.evaluate((t) => {
    localStorage.setItem('auth_token', t)
  }, token)
}

// JWT 생성 (backend와 동일한 secret 사용)
async function getTestToken(request: import('@playwright/test').APIRequestContext): Promise<string> {
  // jose 라이브러리 없이 직접 backend에서 토큰 검증 가능한지 확인
  // 대신 python으로 미리 생성한 토큰 사용
  return process.env.TEST_JWT || ''
}

test.describe('OpenAI OAuth Flow', () => {

  test('1. API: authorize 엔드포인트가 유효한 OpenAI URL 반환', async ({ request }) => {
    const token = process.env.TEST_JWT!
    const res = await request.get(`${API}/oauth/openai/authorize`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.authorization_url).toContain('https://auth.openai.com/oauth/authorize')
    expect(body.authorization_url).toContain('client_id=app_EMoamEEZ73f0CkXaXp7hrann')
    expect(body.authorization_url).toContain('code_challenge=')
    expect(body.authorization_url).toContain('code_challenge_method=S256')
    expect(body.authorization_url).toContain('redirect_uri=')
    expect(body.state).toBeTruthy()
  })

  test('2. UI: Settings 페이지에 OpenAI "연결" 버튼 표시', async ({ page }) => {
    const token = process.env.TEST_JWT!
    await injectAuth(page, token)
    await page.goto('/settings')

    // OpenAI OAuth 버튼이 보여야 함
    await expect(page.getByText('OpenAI로 연결')).toBeVisible({ timeout: 5000 })
  })

  test('3. UI: OpenAI 연결 클릭 → OpenAI 로그인 페이지로 리다이렉트', async ({ page }) => {
    const token = process.env.TEST_JWT!
    await injectAuth(page, token)
    await page.goto('/settings')

    // 네비게이션 이벤트 캡처 (외부 리다이렉트)
    const [request] = await Promise.all([
      page.waitForEvent('request', (req) =>
        req.url().includes('auth.openai.com/oauth/authorize')
      ),
      page.getByText('OpenAI로 연결').click(),
    ])

    expect(request.url()).toContain('auth.openai.com/oauth/authorize')
    expect(request.url()).toContain('client_id=app_EMoamEEZ73f0CkXaXp7hrann')
  })

  test('4. UI: Google OAuth 미설정 시 안내 메시지 표시', async ({ page }) => {
    const token = process.env.TEST_JWT!
    await injectAuth(page, token)
    await page.goto('/settings')

    await expect(
      page.getByText('Google OAuth가 설정되지 않았습니다')
    ).toBeVisible({ timeout: 5000 })
  })

  test('5. API: callback에 잘못된 state → 400 에러', async ({ request }) => {
    const token = process.env.TEST_JWT!
    const res = await request.post(`${API}/oauth/openai/callback`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { code: 'fake-code', state: 'invalid-state' },
    })
    expect(res.status()).toBe(400)
  })
})
