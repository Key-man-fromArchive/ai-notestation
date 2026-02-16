import { test, expect } from '@playwright/test'

test.describe('Settings - AI 모델', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
    await page.locator('button').filter({ hasText: 'AI 모델' }).click()
    await page.waitForTimeout(300)
    // Wait for tab content to load
    await expect(page.getByRole('heading', { name: 'AI 모델 설정', level: 3 })).toBeVisible()
  })

  test('AI model settings heading visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'AI 모델 설정', level: 3 })).toBeVisible()
  })

  test('AI model settings description visible', async ({ page }) => {
    await expect(page.getByText('기본 모델과 선택기에 표시할 모델을 설정합니다.')).toBeVisible()
  })

  test('Default model label and select visible', async ({ page }) => {
    // Use exact match to avoid strict mode violation
    await expect(page.getByText('기본 모델', { exact: true })).toBeVisible()
    // Native <select> elements have role="combobox" in some browsers, but not all
    // More reliable to check for the select element directly
    const selectElement = page.locator('select').first()
    await expect(selectElement).toBeVisible()
  })

  test('Default model select has options', async ({ page }) => {
    const selectElement = page.locator('select').first()
    await selectElement.click()
    await page.waitForTimeout(200)

    // Should have model options (e.g., GLM-5, GLM-4.7, etc.)
    const options = selectElement.locator('option')
    await expect(options.first()).toBeAttached()
    const optionCount = await options.count()
    expect(optionCount).toBeGreaterThan(0)
  })

  test('Can change default model selection', async ({ page }) => {
    const selectElement = page.locator('select').first()

    // Get initial value
    const initialValue = await selectElement.inputValue()

    // Get options
    const options = selectElement.locator('option')
    const optionsCount = await options.count()

    if (optionsCount > 1) {
      // Select second option
      const secondOptionValue = await options.nth(1).getAttribute('value')
      await selectElement.selectOption(secondOptionValue!)
      await page.waitForTimeout(200)

      // Value should have changed
      const newValue = await selectElement.inputValue()
      expect(newValue).not.toBe(initialValue)
      expect(newValue).toBe(secondOptionValue)
    }
  })

  test('Visible models section exists', async ({ page }) => {
    await expect(page.getByText('표시할 모델', { exact: true })).toBeVisible()
  })

  test('Select all and deselect all buttons visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: '모두 선택' })).toBeVisible()
    await expect(page.getByRole('button', { name: '모두 해제' })).toBeVisible()
  })

  test('Provider group checkbox visible', async ({ page }) => {
    // Look for provider group checkbox - checkboxes are in labels
    // The provider name text is in the label, not the checkbox itself
    const providerSection = page.locator('label:has(input[type="checkbox"])').filter({ hasText: /zhipuai|openai|anthropic|google/i })
    await expect(providerSection.first()).toBeVisible()

    // Verify checkbox exists within the label
    const checkbox = providerSection.first().locator('input[type="checkbox"]')
    await expect(checkbox).toBeAttached()
  })

  test('Individual model checkboxes visible', async ({ page }) => {
    // Look for individual model checkboxes
    const modelCheckboxes = page.locator('input[type="checkbox"]')
    const count = await modelCheckboxes.count()

    // Should have at least one model checkbox
    expect(count).toBeGreaterThan(0)
  })

  test('Can toggle model checkbox', async ({ page }) => {
    // First, ensure all models are selected so we can safely uncheck one
    await page.getByRole('button', { name: '모두 선택' }).click()
    await page.waitForTimeout(300)

    // Find checkboxes
    const modelCheckboxes = page.locator('input[type="checkbox"]')
    const count = await modelCheckboxes.count()

    // If there's more than one checkbox, toggle the second one (first might be provider group)
    if (count > 1) {
      const checkbox = modelCheckboxes.nth(1)
      const initialChecked = await checkbox.isChecked()

      // Click the checkbox
      await checkbox.click()
      await page.waitForTimeout(200)

      // State should have changed
      const newChecked = await checkbox.isChecked()
      expect(newChecked).not.toBe(initialChecked)
    }
  })

  test('Provider group shows model count', async ({ page }) => {
    // Provider count is in a span with format "N/M" (e.g., "11/11")
    const providerCount = page.locator('span').filter({ hasText: /^\d+\/\d+$/ })
    await expect(providerCount.first()).toBeVisible()
  })

  test('Select all button toggles all model checkboxes', async ({ page }) => {
    const selectAllButton = page.getByRole('button', { name: '모두 선택' })

    // Click select all
    await selectAllButton.click()
    await page.waitForTimeout(300)

    // All model checkboxes should be checked
    const modelCheckboxes = page.locator('input[type="checkbox"]')
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

    // All model checkboxes should be unchecked (except at least one must remain)
    const modelCheckboxes = page.locator('input[type="checkbox"]')
    const count = await modelCheckboxes.count()

    // After deselect all, at least the default model remains checked
    // So we just verify that not all are checked
    if (count > 0) {
      let checkedCount = 0
      for (let i = 0; i < count; i++) {
        if (await modelCheckboxes.nth(i).isChecked()) {
          checkedCount++
        }
      }
      // Should have fewer checked than total (most should be unchecked)
      expect(checkedCount).toBeLessThan(count)
    }
  })
})
