import { test, expect } from '@playwright/test'

test.describe('Settings - Notebook Categories', () => {
  test('Categories section visible in settings', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Look for categories heading
    await expect(page.getByText(/노트북 카테고리/i)).toBeVisible()
  })

  test('Categories description visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    await expect(page.getByText(/노트북에 할당할 수 있는 카테고리/i)).toBeVisible()
  })

  test('Default labnote category exists', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // The default 'labnote' category should exist as a protected row
    await expect(page.locator('input[value="labnote"]')).toBeVisible()
  })

  test('Category column headers visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Column headers
    await expect(page.getByText(/값.*ID/i).or(page.getByText('값 (ID)'))).toBeVisible()
    await expect(page.getByText('한국어')).toBeVisible()
    await expect(page.getByText('영어')).toBeVisible()
    await expect(page.getByText('색상')).toBeVisible()
  })

  test('Add category button exists', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    await expect(page.getByRole('button', { name: /카테고리 추가/i })).toBeVisible()
  })

  test('Add new category row', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Count existing category rows (inputs with placeholder "category_id")
    const beforeCount = await page.locator('input[placeholder="category_id"]').count()

    // Click add category button
    await page.getByRole('button', { name: /카테고리 추가/i }).click()

    // A new row should appear
    const afterCount = await page.locator('input[placeholder="category_id"]').count()
    expect(afterCount).toBe(beforeCount + 1)
  })

  test('Protected category cannot be deleted', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // The labnote category's delete button should be disabled
    const deleteBtn = page.getByRole('button', { name: /Delete labnote/i })
    if (await deleteBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Button exists but should be visually disabled (cursor-not-allowed class)
      const classes = await deleteBtn.getAttribute('class')
      expect(classes).toContain('cursor-not-allowed')
    }
  })

  test('Reset button exists', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    await expect(page.getByRole('button', { name: /기본값으로 초기화/i })).toBeVisible()
  })

  test('Category AI settings expandable', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Click expand button on first category row
    const expandBtn = page.getByRole('button', { name: /Expand AI settings/i }).first()
    await expandBtn.click()

    // AI settings panel should appear
    await expect(page.getByText(/AI 설정/i)).toBeVisible()
    await expect(page.getByText(/AI 분석 프롬프트/i)).toBeVisible()
  })

  test('Save button exists for categories', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // There should be a save button
    await expect(page.getByRole('button', { name: /저장|Save/i })).toBeVisible()
  })
})
