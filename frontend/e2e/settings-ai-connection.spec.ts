import { test, expect } from '@playwright/test'

test.describe('Settings - AI Connection Test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings?tab=connection')
    await page.waitForLoadState('networkidle')
  })

  test('AI Connection Test button is visible in API Keys section', async ({ page }) => {
    const btn = page.getByRole('button', { name: /AI 연결 테스트|Test AI Connection/i })
    await expect(btn).toBeVisible({ timeout: 10000 })
  })

  test('clicking AI Connection Test shows per-provider results', async ({ page }) => {
    const btn = page.getByRole('button', { name: /AI 연결 테스트|Test AI Connection/i })
    await expect(btn).toBeVisible({ timeout: 10000 })

    // Click the test button
    await btn.click()

    // Wait for results to appear (up to 30s for API calls)
    const results = page.locator('.space-y-1\\.5')
    await expect(results).toBeVisible({ timeout: 30000 })

    // Should show 4 provider results
    const resultItems = results.locator('> div')
    const count = await resultItems.count()
    expect(count).toBe(4)

    // Each result should contain a provider name
    for (let i = 0; i < count; i++) {
      const item = resultItems.nth(i)
      const text = await item.textContent()
      expect(text).toMatch(/OpenAI|Anthropic|Google|ZhipuAI/i)
    }

    // Button should return to normal state after test completes
    const normalBtn = page.getByRole('button', { name: /AI 연결 테스트|Test AI Connection/i })
    await expect(normalBtn).toBeVisible({ timeout: 5000 })
  })
})
