import { test, expect } from '@playwright/test'

test.describe('Settings - AI & API Keys', () => {
  test('AI settings section visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByText(/API 키 관리|API Key/i)).toBeVisible()
  })

  test('Add OpenAI API key field', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Look for OpenAI API key input
    const openaiField = page.getByLabel(/OpenAI.*API.*키|OpenAI.*API.*Key/i)
    await expect(openaiField).toBeVisible()
  })

  test('Add Anthropic API key field', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Look for Anthropic API key input
    const anthropicField = page.getByLabel(/Anthropic.*API.*키|Anthropic.*API.*Key/i)
    await expect(anthropicField).toBeVisible()
  })

  test('API key masked in UI', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Enter a test key
    const keyInput = page.getByLabel(/OpenAI.*API.*키|OpenAI.*API.*Key/i)
    await keyInput.fill('sk-test1234567890abcdef')

    // Check if it's a password type or masked
    const inputType = await keyInput.getAttribute('type')
    expect(inputType).toBe('password')
  })

  test('Test connection button exists', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Look for test/verify button for API keys
    const testButton = page.getByRole('button', { name: /테스트|Test|확인|Verify/i }).first()
    await expect(testButton).toBeVisible()
  })

  test('Auto-detect provider after adding key', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Add an API key
    await page.getByLabel(/OpenAI.*API.*키|OpenAI.*API.*Key/i).fill('sk-test123')
    await page.getByRole('button', { name: /저장|Save/i }).click()

    // Wait for save confirmation
    await expect(page.getByText(/저장됨|Saved/i)).toBeVisible({ timeout: 5000 })

    // Provider should be auto-detected (look for OpenAI in provider list)
    await expect(page.getByText(/OpenAI/i)).toBeVisible()
  })

  test('Select default provider dropdown', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Look for provider selection dropdown
    const providerSelect = page.locator('select').filter({ hasText: /프로바이더|Provider/i }).or(
      page.getByLabel(/기본 프로바이더|Default Provider/i)
    )
    await expect(providerSelect.first()).toBeVisible()
  })

  test('Select default model dropdown', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Look for model selection dropdown
    const modelSelect = page.locator('select').filter({ hasText: /모델|Model/i }).or(
      page.getByLabel(/기본 모델|Default Model/i)
    )
    await expect(modelSelect.first()).toBeVisible()
  })

  test('Model list changes with provider selection', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Setup: ensure we have API keys for multiple providers
    await page.getByLabel(/OpenAI.*API.*키|OpenAI.*API.*Key/i).fill('sk-openai-test')
    await page.getByLabel(/Anthropic.*API.*키|Anthropic.*API.*Key/i).fill('sk-ant-test')
    await page.getByRole('button', { name: /저장|Save/i }).click()
    await expect(page.getByText(/저장됨|Saved/i)).toBeVisible({ timeout: 5000 })

    await page.reload()
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Select OpenAI provider
    const providerSelect = page.getByLabel(/기본 프로바이더|Default Provider/i).first()
    await providerSelect.selectOption({ label: /OpenAI/i })

    // Check that model list contains OpenAI models
    await expect(page.getByText(/gpt-4|gpt-3.5/i)).toBeVisible()

    // Switch to Anthropic
    await providerSelect.selectOption({ label: /Anthropic/i })

    // Check that model list contains Anthropic models
    await expect(page.getByText(/claude/i)).toBeVisible()
  })

  test('Save API key settings', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    await page.getByLabel(/OpenAI.*API.*키|OpenAI.*API.*Key/i).fill('sk-new-key-12345')
    await page.getByRole('button', { name: /저장|Save/i }).click()

    await expect(page.getByText(/저장됨|Saved|성공/i)).toBeVisible({ timeout: 5000 })
  })

  test('Settings persist after reload', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    const testKey = 'sk-persist-test-key'
    await page.getByLabel(/OpenAI.*API.*키|OpenAI.*API.*Key/i).fill(testKey)
    await page.getByRole('button', { name: /저장|Save/i }).click()
    await expect(page.getByText(/저장됨|Saved/i)).toBeVisible({ timeout: 5000 })

    // Reload and verify
    await page.reload()
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)
    const keyField = page.getByLabel(/OpenAI.*API.*키|OpenAI.*API.*Key/i)

    // Either value is masked or shows partial key
    const value = await keyField.inputValue()
    expect(value.length).toBeGreaterThan(0)
  })

  test('Remove API key', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Clear the API key field
    await page.getByLabel(/OpenAI.*API.*키|OpenAI.*API.*Key/i).clear()
    await page.getByRole('button', { name: /저장|Save/i }).click()
    await expect(page.getByText(/저장됨|Saved/i)).toBeVisible({ timeout: 5000 })

    // Verify it's empty after reload
    await page.reload()
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByLabel(/OpenAI.*API.*키|OpenAI.*API.*Key/i)).toHaveValue('')
  })

  test('Disconnect status shown for missing keys', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Clear all API keys
    await page.getByLabel(/OpenAI.*API.*키|OpenAI.*API.*Key/i).clear()
    await page.getByLabel(/Anthropic.*API.*키|Anthropic.*API.*Key/i).clear()
    await page.getByRole('button', { name: /저장|Save/i }).click()
    await expect(page.getByText(/저장됨|Saved/i)).toBeVisible({ timeout: 5000 })

    await page.reload()
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Look for disconnected/not configured status
    await expect(page.getByText(/미설정|미연결|Not configured|Disconnected/i)).toBeVisible()
  })

  test('Multiple providers can be configured', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Add keys for multiple providers
    await page.getByLabel(/OpenAI.*API.*키|OpenAI.*API.*Key/i).fill('sk-openai-multi')
    await page.getByLabel(/Anthropic.*API.*키|Anthropic.*API.*Key/i).fill('sk-ant-multi')

    // Check for Google or other providers if available
    const googleField = page.getByLabel(/Google.*API.*키|Google.*API.*Key/i)
    if (await googleField.isVisible()) {
      await googleField.fill('google-key-test')
    }

    await page.getByRole('button', { name: /저장|Save/i }).click()
    await expect(page.getByText(/저장됨|Saved/i)).toBeVisible({ timeout: 5000 })

    await page.reload()
    await page.getByRole('button', { name: 'AI 모델' }).click()
    await page.waitForTimeout(300)

    // Verify all providers are shown as configured
    await expect(page.getByText(/OpenAI/i)).toBeVisible()
    await expect(page.getByText(/Anthropic/i)).toBeVisible()
  })
})
