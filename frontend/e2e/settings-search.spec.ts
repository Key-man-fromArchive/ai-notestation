import { test, expect } from '@playwright/test'

test.describe('Settings - Search Indexing', () => {
  test('Search indexing section visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByText(/검색 인덱싱|Search Index/i)).toBeVisible()
  })

  test('Trigger reindex button exists', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    // Look for reindex/rebuild button
    const reindexButton = page.getByRole('button', { name: /인덱스 재구성|Reindex|Rebuild/i })
    await expect(reindexButton).toBeVisible()
  })

  test.skip('Trigger reindex - shows progress', async ({ page }) => {
    // Skip if no data to index
    test.skip(!process.env.HAS_TEST_DATA, 'No test data available')

    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    await page.getByRole('button', { name: /인덱스 재구성|Reindex/i }).click()

    // Look for progress indicator (spinner, progress bar, percentage, etc.)
    const progressIndicator = page.locator('[role="progressbar"]').or(
      page.getByText(/진행|Progress|%/i)
    )
    await expect(progressIndicator).toBeVisible({ timeout: 5000 })
  })

  test('Reindex completes', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    await page.getByRole('button', { name: /인덱스 재구성|Reindex/i }).click()

    // Wait for completion message
    await expect(page.getByText(/완료|Complete|성공|Success/i)).toBeVisible({ timeout: 30000 })
  })

  test('Stats show note count', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    // Look for note count statistics
    const noteCount = page.getByText(/노트.*개|notes|documents/i).first()
    await expect(noteCount).toBeVisible()
  })

  test('Stats show embedding count', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    // Look for embedding count or vector count
    const embeddingCount = page.getByText(/임베딩|embedding|vector/i).first()
    await expect(embeddingCount).toBeVisible()
  })

  test('Clear index button exists', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    // Look for clear/delete index button
    const clearButton = page.getByRole('button', { name: /인덱스 삭제|Clear|Delete.*Index/i })
    await expect(clearButton).toBeVisible()
  })

  test('OCR engine selection dropdown visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    // Look for OCR engine selector
    const ocrSelect = page.getByLabel(/OCR.*엔진|OCR.*Engine/i).or(
      page.locator('select').filter({ hasText: /OCR/i })
    )
    await expect(ocrSelect.first()).toBeVisible()
  })

  test('OCR engine options: ai_vision, paddleocr_vl', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    const ocrSelect = page.getByLabel(/OCR.*엔진|OCR.*Engine/i).first()
    await expect(ocrSelect).toBeVisible()

    // Click to open dropdown
    await ocrSelect.click()

    // Check for options
    await expect(page.getByRole('option', { name: /ai_vision/i })).toBeVisible()
    await expect(page.getByRole('option', { name: /paddleocr_vl/i })).toBeVisible()
  })

  test('Change OCR engine persists', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    const ocrSelect = page.getByLabel(/OCR.*엔진|OCR.*Engine/i).first()
    await ocrSelect.selectOption({ label: /paddleocr_vl/i })

    await page.getByRole('button', { name: /저장|Save/i }).click()
    await expect(page.getByText(/저장됨|Saved/i)).toBeVisible({ timeout: 5000 })

    // Reload and verify
    await page.reload()
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)
    const selectedValue = await ocrSelect.inputValue()
    expect(selectedValue).toContain('paddleocr_vl')
  })

  test('Search params section visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    // Look for search parameters configuration section
    const searchParams = page.getByText(/검색 파라미터|Search Parameters|Search Settings/i).first()
    await expect(searchParams).toBeVisible()
  })
})
