import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/이메일|email/i).fill('ai-note@labnote.ai')
  await page.getByLabel(/비밀번호|password/i).fill('invirus0682!')
  await page.getByRole('button', { name: /로그인/i }).click()

  // Wait for redirect to dashboard
  await page.waitForURL('/', { timeout: 15000 })
  await expect(page.getByRole('heading', { name: /대시보드/i })).toBeVisible({ timeout: 10000 })

  // Save auth state
  await page.context().storageState({ path: AUTH_FILE })
})
