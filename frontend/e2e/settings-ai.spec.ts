import { test, expect } from '@playwright/test'

test.describe('Settings - AI 모델', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)
  })

  test('AI model settings heading visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'AI 모델 설정', level: 3 })).toBeVisible()
  })

  test('AI model settings description visible', async ({ page }) => {
    await expect(page.getByText('기본 모델과 선택기에 표시할 모델을 설정합니다.')).toBeVisible()
  })

  test('Default model label and combobox visible', async ({ page }) => {
    await expect(page.getByText('기본 모델')).toBeVisible()
    await expect(page.getByRole('combobox')).toBeVisible()
  })

  test('Default model combobox has options', async ({ page }) => {
    const combobox = page.getByRole('combobox')
    await combobox.click()
    await page.waitForTimeout(200)

    // Should have model options visible (e.g., GLM-5, GLM-4.7, etc.)
    const options = page.getByRole('option')
    await expect(options.first()).toBeVisible()
  })

  test('Can change default model selection', async ({ page }) => {
    const combobox = page.getByRole('combobox')

    // Get initial value
    const initialValue = await combobox.textContent()

    // Open combobox
    await combobox.click()
    await page.waitForTimeout(200)

    // Select a different option (second option)
    const options = page.getByRole('option')
    const optionsCount = await options.count()

    if (optionsCount > 1) {
      await options.nth(1).click()
      await page.waitForTimeout(200)

      // Value should have changed
      const newValue = await combobox.textContent()
      expect(newValue).not.toBe(initialValue)
    }
  })

  test('Visible models section exists', async ({ page }) => {
    await expect(page.getByText('표시할 모델')).toBeVisible()
  })

  test('Select all and deselect all buttons visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: '모두 선택' })).toBeVisible()
    await expect(page.getByRole('button', { name: '모두 해제' })).toBeVisible()
  })

  test('Provider group checkbox visible', async ({ page }) => {
    // Look for provider group (e.g., "- zhipuai")
    const providerCheckbox = page.getByRole('checkbox').filter({ hasText: /zhipuai|openai|anthropic|google/i })
    await expect(providerCheckbox.first()).toBeVisible()
  })

  test('Individual model checkboxes visible', async ({ page }) => {
    // Look for individual model checkboxes (e.g., GLM-5, GLM-4.7, etc.)
    const modelCheckboxes = page.getByRole('checkbox')
    const count = await modelCheckboxes.count()

    // Should have at least one model checkbox
    expect(count).toBeGreaterThan(0)
  })

  test('Can toggle model checkbox', async ({ page }) => {
    // Find first model checkbox (not provider group)
    const modelCheckboxes = page.getByRole('checkbox')
    const firstCheckbox = modelCheckboxes.first()

    // Get initial state
    const initialChecked = await firstCheckbox.isChecked()

    // Toggle
    await firstCheckbox.click()
    await page.waitForTimeout(200)

    // State should have changed
    const newChecked = await firstCheckbox.isChecked()
    expect(newChecked).not.toBe(initialChecked)
  })

  test('Provider group shows model count', async ({ page }) => {
    // Provider checkbox should show count like "11/11"
    const providerWithCount = page.locator('label:has-text(/\\d+\\/\\d+/)')
    await expect(providerWithCount.first()).toBeVisible()
  })

  test('Select all button toggles all model checkboxes', async ({ page }) => {
    const selectAllButton = page.getByRole('button', { name: '모두 선택' })

    // Click select all
    await selectAllButton.click()
    await page.waitForTimeout(300)

    // All model checkboxes should be checked
    const modelCheckboxes = page.getByRole('checkbox')
    const count = await modelCheckboxes.count()

    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const isChecked = await modelCheckboxes.nth(i).isChecked()
        expect(isChecked).toBe(true)
      }
    }
  })

  test('Deselect all button unchecks all model checkboxes', async ({ page }) => {
    const deselectAllButton = page.getByRole('button', { name: '모두 해제' })

    // First select all
    await page.getByRole('button', { name: '모두 선택' }).click()
    await page.waitForTimeout(300)

    // Then deselect all
    await deselectAllButton.click()
    await page.waitForTimeout(300)

    // All model checkboxes should be unchecked
    const modelCheckboxes = page.getByRole('checkbox')
    const count = await modelCheckboxes.count()

    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const isChecked = await modelCheckboxes.nth(i).isChecked()
        expect(isChecked).toBe(false)
      }
    }
  })
})
