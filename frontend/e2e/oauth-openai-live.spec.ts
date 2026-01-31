import { test, expect } from '@playwright/test'

const TOKEN = process.env.TEST_JWT!

test.describe('OAuth Live Browser Tests', () => {

  test('Settings → ChatGPT 연결 → auth.openai.com 페이지 도달', async ({ page }) => {
    // Step 1: JWT 주입하여 로그인 상태 만들기
    await page.goto('/login')
    await page.evaluate((t) => {
      localStorage.setItem('auth_token', t)
    }, TOKEN)

    // Step 2: Settings 페이지 이동
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'e2e-screenshots/01-settings-page.png', fullPage: true })

    // Step 3: ChatGPT 연결 버튼 확인
    const chatgptButton = page.getByText('ChatGPT (Plus/Pro)로 연결')
    await expect(chatgptButton).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'e2e-screenshots/02-chatgpt-button-visible.png', fullPage: true })

    // Step 4: Google 연결 버튼도 확인
    await expect(page.getByText('Google로 연결')).toBeVisible({ timeout: 5000 })

    // Step 5: ChatGPT 연결 클릭 → auth.openai.com으로 리다이렉트
    await chatgptButton.click()

    // auth.openai.com 페이지 로드 대기
    await page.waitForURL('**/auth.openai.com/**', { timeout: 15000 })
    await page.waitForLoadState('domcontentloaded')
    await page.screenshot({ path: 'e2e-screenshots/03-openai-login-page.png', fullPage: true })

    // Step 6: OpenAI 로그인 페이지 도달 확인
    expect(page.url()).toContain('auth.openai.com')
    console.log('Final URL:', page.url())
  })

  test('Settings → Google 연결 → Google 로그인 페이지 도달', async ({ page }) => {
    // Step 1: JWT 주입하여 로그인 상태 만들기
    await page.goto('/login')
    await page.evaluate((t) => {
      localStorage.setItem('auth_token', t)
    }, TOKEN)

    // Step 2: Settings 페이지 이동
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // Step 3: Google 연결 버튼 확인 & 클릭
    const googleButton = page.getByText('Google로 연결')
    await expect(googleButton).toBeVisible({ timeout: 5000 })
    await googleButton.click()

    // Google 페이지 로드 대기
    await page.waitForURL('**/accounts.google.com/**', { timeout: 15000 })
    await page.waitForLoadState('domcontentloaded')
    await page.screenshot({ path: 'e2e-screenshots/04-google-login-page.png', fullPage: true })

    // Step 4: Google 로그인 페이지 도달 확인
    expect(page.url()).toContain('accounts.google.com')
    console.log('Final URL:', page.url())
  })
})
