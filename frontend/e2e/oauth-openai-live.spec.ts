import { test, expect } from '@playwright/test'

const TOKEN = process.env.TEST_JWT!

test.describe('OpenAI OAuth Live Browser Test', () => {

  test('Settings → OpenAI 연결 → OpenAI 로그인 페이지 도달', async ({ page }) => {
    // Step 1: JWT 주입하여 로그인 상태 만들기
    await page.goto('/login')
    await page.evaluate((t) => {
      localStorage.setItem('auth_token', t)
    }, TOKEN)

    // Step 2: Settings 페이지 이동
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'e2e-screenshots/01-settings-page.png', fullPage: true })

    // Step 3: OpenAI 연결 버튼 확인
    const openaiButton = page.getByText('OpenAI로 연결')
    await expect(openaiButton).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'e2e-screenshots/02-openai-button-visible.png', fullPage: true })

    // Step 4: Google OAuth 설정 확인 (연결 버튼 표시)
    await expect(page.getByText('Google로 연결')).toBeVisible()
    await page.screenshot({ path: 'e2e-screenshots/03-google-configured.png', fullPage: true })

    // Step 5: OpenAI 연결 클릭 → OpenAI 페이지로 리다이렉트
    await openaiButton.click()

    // OpenAI 페이지 로드 대기
    await page.waitForURL('**/auth.openai.com/**', { timeout: 15000 })
    // domcontentloaded만 기다림 (OpenAI 페이지는 networkidle이 오래 걸림)
    await page.waitForLoadState('domcontentloaded')
    await page.screenshot({ path: 'e2e-screenshots/04-openai-login-page.png', fullPage: true })

    // Step 6: OpenAI 로그인 페이지 도달 확인
    expect(page.url()).toContain('auth.openai.com')
    console.log('Final URL:', page.url())
  })
})
