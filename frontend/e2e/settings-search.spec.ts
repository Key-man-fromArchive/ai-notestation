import { test, expect } from '@playwright/test'

test.describe('Settings - Search Engine Tab', () => {
  test('Search indexing section visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    // Check for "검색 인덱싱" heading with Database icon
    await expect(page.getByText('검색 인덱싱')).toBeVisible()
    await expect(page.getByText('노트를 검색 인덱스에 추가합니다')).toBeVisible()
  })

  test('Stats show indexing info', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    // Check for stats: "총 노트", "인덱싱됨", "대기 중"
    await expect(page.getByText(/총 노트/i)).toBeVisible()

    // Either "인덱싱됨" or "대기 중" should be visible
    const indexed = page.getByText(/인덱싱됨/i)
    const pending = page.getByText(/대기 중/i)
    const statsVisible = await indexed.isVisible().catch(() => false) ||
                         await pending.isVisible().catch(() => false)
    expect(statsVisible).toBe(true)
  })

  test('Indexing button visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    // Check for "인덱싱 시작" button
    const indexButton = page.getByRole('button', { name: /인덱싱 시작/i })
    await expect(indexButton).toBeVisible()
  })

  test('Force re-index button visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '검색엔진' }).click()
    await page.waitForTimeout(300)

    // Check for "강제 재인덱싱" or "강제 리임베딩" button
    const forceButton = page.getByRole('button', { name: /강제 재인덱싱|강제 리임베딩/i })
    await expect(forceButton).toBeVisible()
  })
})

test.describe('Settings - Data Analysis Tab', () => {
  test('Image sync section visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '데이터분석' }).click()
    await page.waitForTimeout(300)

    // Check for "이미지 동기화" section and button
    await expect(page.getByText(/이미지 동기화/).first()).toBeVisible()
    const syncButton = page.getByRole('button', { name: /이미지 동기화/i })
    await expect(syncButton).toBeVisible()
  })

  test('Batch analysis section visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '데이터분석' }).click()
    await page.waitForTimeout(300)

    // Check for "배치 분석" section with stats grid
    await expect(page.getByText(/배치 분석/i)).toBeVisible()

    // Check for stats: "총 이미지", "OCR 완료", "Vision 완료"
    const totalImages = page.getByText(/총 이미지/i)
    const ocrComplete = page.getByText(/OCR 완료/i)
    const visionComplete = page.getByText(/Vision 완료/i)

    const statsVisible = await totalImages.isVisible().catch(() => false) ||
                         await ocrComplete.isVisible().catch(() => false) ||
                         await visionComplete.isVisible().catch(() => false)
    expect(statsVisible).toBe(true)

    // Check for "배치 분석 시작" button
    const batchButton = page.getByRole('button', { name: /배치 분석 시작/i })
    await expect(batchButton).toBeVisible()
  })

  test('OCR engine section visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '데이터분석' }).click()
    await page.waitForTimeout(300)

    // Check for "OCR 엔진" section with select dropdown
    await expect(page.getByText(/OCR 엔진/).first()).toBeVisible()

    // Look for OCR engine options (AI Vision, PaddleOCR, GLM OCR)
    const ocrSelect = page.locator('select, [role="combobox"]').filter({ hasText: /AI Vision|PaddleOCR|GLM OCR/i })
    const ocrText = page.getByText(/AI Vision|PaddleOCR|GLM OCR/i)

    const ocrVisible = await ocrSelect.first().isVisible().catch(() => false) ||
                       await ocrText.first().isVisible().catch(() => false)
    expect(ocrVisible).toBe(true)
  })

  test('Vision model section visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '데이터분석' }).click()
    await page.waitForTimeout(300)

    // Check for "비전 모델" section with select dropdown
    await expect(page.getByText(/비전 모델|Vision 모델/).first()).toBeVisible()

    // Look for vision model options (GLM-4.6V, Claude, GPT-4o, etc.)
    const visionSelect = page.locator('select, [role="combobox"]').filter({ hasText: /GLM|Claude|GPT/i })
    const visionText = page.getByText(/GLM-4\.6V|Claude|GPT-4o/i)

    const visionVisible = await visionSelect.first().isVisible().catch(() => false) ||
                          await visionText.first().isVisible().catch(() => false)
    expect(visionVisible).toBe(true)
  })
})
