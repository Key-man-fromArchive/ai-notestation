import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/이메일|email/i).fill('ceo@invirustech.com')
  await page.getByLabel(/비밀번호|password/i).fill('!1npark2beom')
  await page.getByRole('button', { name: /로그인|Login/i }).click()

  // Wait for redirect to dashboard
  await page.waitForURL('/', { timeout: 15000 })
  await expect(page.getByRole('heading', { name: /대시보드|Dashboard/i })).toBeVisible({ timeout: 10000 })

  // Set language to Korean so all tests see Korean UI
  await page.evaluate(() => localStorage.setItem('language', 'ko'))

  // Save auth state (includes language preference in localStorage)
  await page.context().storageState({ path: AUTH_FILE })
})
