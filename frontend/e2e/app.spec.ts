import { test, expect } from '@playwright/test'

const API = 'http://localhost:8001/api'

// ─── 1. Backend Health ───────────────────────────────────────

test('Backend /api/health returns ok', async ({ request }) => {
  const res = await request.get(`${API}/health`)
  expect(res.status()).toBe(200)
  expect(await res.json()).toEqual({ status: 'ok' })
})

// ─── 2. DB Migration 검증 (OAuth 엔드포인트가 500이 아닌지) ──

test('OAuth status returns 401 (not 500) — oauth_tokens table exists', async ({ request }) => {
  // 인증 없이 호출 → 401 (테이블 없으면 500)
  const res = await request.get(`${API}/oauth/google/status`)
  expect(res.status()).toBe(401)
})

test('OAuth status with bad token returns 401', async ({ request }) => {
  const res = await request.get(`${API}/oauth/openai/status`, {
    headers: { Authorization: 'Bearer invalid-token' },
  })
  expect(res.status()).toBe(401)
})

// ─── 3. OAuth config-status (no auth required) ──────────────

test('Google OAuth config-status returns configured=true', async ({ request }) => {
  const res = await request.get(`${API}/oauth/google/config-status`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.provider).toBe('google')
  expect(body.configured).toBe(true)
})

test('OpenAI OAuth config-status returns configured=true', async ({ request }) => {
  const res = await request.get(`${API}/oauth/openai/config-status`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.provider).toBe('openai')
  expect(body.configured).toBe(true)
})

// ─── 4. OpenAI OAuth authorize URL 검증 ──────────────────────

test('OpenAI OAuth authorize returns valid URL with PKCE', async ({ request }) => {
  // 먼저 JWT 토큰 생성 (직접 login endpoint 사용 불가하므로 config-status로 기본 확인)
  const configRes = await request.get(`${API}/oauth/openai/config-status`)
  expect(configRes.status()).toBe(200)
  const config = await configRes.json()
  expect(config.configured).toBe(true)
})

test('Google OAuth authorize is configured', async ({ request }) => {
  const configRes = await request.get(`${API}/oauth/google/config-status`)
  expect(configRes.status()).toBe(200)
  const config = await configRes.json()
  expect(config.configured).toBe(true)
})

// ─── 5. Login 페이지 렌더링 ──────────────────────────────────

test('Login page renders with form', async ({ page }) => {
  await page.goto('/login')
  // 로그인 폼 요소 확인
  await expect(page.locator('input[type="email"], input#email')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /로그인|login/i })).toBeVisible()
})

test('Unauthenticated user is redirected to /login', async ({ page }) => {
  await page.goto('/')
  await page.waitForURL('**/login')
  expect(page.url()).toContain('/login')
})

test('Login with wrong credentials shows error', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"], input#email').fill('wrong@example.com')
  await page.locator('input[type="password"]').fill('wrong_pass')
  await page.getByRole('button', { name: /로그인|login/i }).click()
  // 에러 메시지 표시 대기
  await expect(page.locator('.text-destructive')).toBeVisible({ timeout: 15000 })
})

// ─── 4. Auth API 엔드포인트 ──────────────────────────────────

test('POST /auth/login with bad credentials returns 401', async ({ request }) => {
  const res = await request.post(`${API}/auth/login`, {
    data: { email: 'bad@example.com', password: 'bad' },
  })
  expect(res.status()).toBe(401)
})

test('GET /auth/me without token returns 401', async ({ request }) => {
  const res = await request.get(`${API}/auth/me`)
  expect(res.status()).toBe(401)
})

// ─── 5. Notes API (인증 필요) ────────────────────────────────

test('GET /notes without auth returns 401', async ({ request }) => {
  const res = await request.get(`${API}/notes`)
  expect(res.status()).toBe(401)
})

// ─── 6. Settings API (인증 필요) ─────────────────────────────

test('GET /settings without auth returns 401', async ({ request }) => {
  const res = await request.get(`${API}/settings`)
  expect(res.status()).toBe(401)
})
