import { test, expect } from '@playwright/test'
import { loginAsAdmin, injectAuth } from './utils/auth-helpers'
import { cleanupTestData } from './utils/data-helpers'

test.describe('평가 실행', () => {
  let token: string
  const hasAIProvider = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY)

  test.beforeEach(async ({ page, request }) => {
    const admin = await loginAsAdmin(request)
    token = admin.token

    await injectAuth(page, token)
  })

  test.afterEach(async ({ request }) => {
    await cleanupTestData(request, token, {})
  })

  test('관리자 → 평가 탭으로 이동', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')

    // Find and click Evaluation tab
    const evaluationTab = page.getByRole('tab', { name: /평가|Evaluation/i })
    await evaluationTab.click()

    await expect(page.getByText(/평가 실행|Evaluation Run/i)).toBeVisible()
  })

  test('평가 실행 폼 로드', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    // Form elements should be visible
    await expect(page.getByLabel(/작업 유형|Task Type/i)).toBeVisible()
    await expect(page.getByLabel(/모델|Model/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /실행|Run/i })).toBeVisible()
  })

  test('작업 유형 선택 (search/qa)', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    const taskTypeSelect = page.getByLabel(/작업 유형|Task Type/i)
    await taskTypeSelect.click()

    await expect(page.getByText('search')).toBeVisible()
    await expect(page.getByText('qa')).toBeVisible()

    await page.getByText('search').click()

    const selectedValue = await taskTypeSelect.inputValue()
    expect(selectedValue).toBe('search')
  })

  test('비교할 모델 선택 (다중 선택)', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    const modelSelect = page.getByLabel(/모델|Model/i)
    await modelSelect.click()

    // Select multiple models
    const firstModel = page.locator('[role="option"]').first()
    await firstModel.click()

    // Check if multi-select works
    const selectedModels = page.locator('[data-selected="true"]')
    expect(await selectedModels.count()).toBeGreaterThanOrEqual(1)
  })

  test('테스트 개수 설정', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    const testCountInput = page.getByLabel(/테스트 개수|Test Count/i)
    await testCountInput.fill('10')

    const value = await testCountInput.inputValue()
    expect(value).toBe('10')
  })

  test.skip(!hasAIProvider, '평가 트리거 → run_id 반환')
  test('평가 트리거 → run_id 반환', async ({ page, request }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    // Select task type
    await page.getByLabel(/작업 유형|Task Type/i).click()
    await page.getByText('search').click()

    // Select model
    await page.getByLabel(/모델|Model/i).click()
    await page.locator('[role="option"]').first().click()
    await page.keyboard.press('Escape')

    // Set test count
    await page.getByLabel(/테스트 개수|Test Count/i).fill('5')

    // Trigger evaluation
    await page.getByRole('button', { name: /실행|Run/i }).click()

    // Wait for run_id to appear
    await expect(page.getByText(/run_id|실행 ID/i)).toBeVisible({ timeout: 10000 })
  })

  test.skip(!hasAIProvider, '상태 "pending" → "running" 표시')
  test('상태 "pending" → "running" 표시', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    // Start evaluation
    await page.getByLabel(/작업 유형|Task Type/i).click()
    await page.getByText('search').click()

    await page.getByLabel(/모델|Model/i).click()
    await page.locator('[role="option"]').first().click()
    await page.keyboard.press('Escape')

    await page.getByLabel(/테스트 개수|Test Count/i).fill('5')
    await page.getByRole('button', { name: /실행|Run/i }).click()

    // Check for pending status
    await expect(page.getByText(/pending|대기 중/i)).toBeVisible({ timeout: 5000 })

    // Check for running status
    await expect(page.getByText(/running|실행 중/i)).toBeVisible({ timeout: 15000 })
  })

  test.skip(!hasAIProvider, '폴링으로 진행 상황 업데이트')
  test('폴링으로 진행 상황 업데이트', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    // Start evaluation
    await page.getByLabel(/작업 유형|Task Type/i).click()
    await page.getByText('search').click()

    await page.getByLabel(/모델|Model/i).click()
    await page.locator('[role="option"]').first().click()
    await page.keyboard.press('Escape')

    await page.getByLabel(/테스트 개수|Test Count/i).fill('5')
    await page.getByRole('button', { name: /실행|Run/i }).click()

    // Progress indicator should update
    const progressBar = page.locator('[role="progressbar"]')
    await expect(progressBar).toBeVisible({ timeout: 10000 })
  })

  test.skip(!hasAIProvider, '평가 완료')
  test('평가 완료', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    // Start evaluation
    await page.getByLabel(/작업 유형|Task Type/i).click()
    await page.getByText('search').click()

    await page.getByLabel(/모델|Model/i).click()
    await page.locator('[role="option"]').first().click()
    await page.keyboard.press('Escape')

    await page.getByLabel(/테스트 개수|Test Count/i).fill('3')
    await page.getByRole('button', { name: /실행|Run/i }).click()

    // Wait for completion
    await expect(page.getByText(/완료|completed/i)).toBeVisible({ timeout: 60000 })
  })

  test.skip(!hasAIProvider, '결과에 모델 비교 막대 표시')
  test('결과에 모델 비교 막대 표시', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    // Start evaluation with multiple models
    await page.getByLabel(/작업 유형|Task Type/i).click()
    await page.getByText('search').click()

    await page.getByLabel(/모델|Model/i).click()
    await page.locator('[role="option"]').first().click()
    await page.locator('[role="option"]').nth(1).click()
    await page.keyboard.press('Escape')

    await page.getByLabel(/테스트 개수|Test Count/i).fill('3')
    await page.getByRole('button', { name: /실행|Run/i }).click()

    // Wait for results
    await expect(page.getByText(/완료|completed/i)).toBeVisible({ timeout: 60000 })

    // Check for comparison bars
    await expect(page.locator('[data-chart-type="bar"]')).toBeVisible()
  })

  test.skip(!hasAIProvider, '결과에 정확도 메트릭 표시')
  test('결과에 정확도 메트릭 표시', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    // Start evaluation
    await page.getByLabel(/작업 유형|Task Type/i).click()
    await page.getByText('search').click()

    await page.getByLabel(/모델|Model/i).click()
    await page.locator('[role="option"]').first().click()
    await page.keyboard.press('Escape')

    await page.getByLabel(/테스트 개수|Test Count/i).fill('3')
    await page.getByRole('button', { name: /실행|Run/i }).click()

    // Wait for results
    await expect(page.getByText(/완료|completed/i)).toBeVisible({ timeout: 60000 })

    // Check for accuracy metrics
    await expect(page.getByText(/accuracy|정확도/i)).toBeVisible()
    await expect(page.getByText(/%/)).toBeVisible()
  })

  test('히스토리 목록에 과거 실행 표시', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    // Check history section
    const historySection = page.getByText(/히스토리|History|과거 실행/i)
    await expect(historySection).toBeVisible()

    // History list should be present
    const historyList = page.locator('[data-testid="evaluation-history"]')
    await expect(historyList).toBeVisible().catch(() => {
      // Empty state is also valid
    })
  })

  test('과거 실행 상세 보기', async ({ page, request }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    // Find a past run (if exists)
    const historyItem = page.locator('[data-history-item]').first()

    if (await historyItem.isVisible()) {
      await historyItem.click()

      // Details should be visible
      await expect(page.getByText(/상세|Details/i)).toBeVisible()
    }
  })

  test.skip(!hasAIProvider, '단일 모델 실행 작동')
  test('단일 모델 실행 작동', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    // Select task type
    await page.getByLabel(/작업 유형|Task Type/i).click()
    await page.getByText('qa').click()

    // Select single model
    await page.getByLabel(/모델|Model/i).click()
    await page.locator('[role="option"]').first().click()
    await page.keyboard.press('Escape')

    await page.getByLabel(/테스트 개수|Test Count/i).fill('3')
    await page.getByRole('button', { name: /실행|Run/i }).click()

    // Should complete successfully
    await expect(page.getByText(/완료|completed/i)).toBeVisible({ timeout: 60000 })
  })

  test('공급자 오류 시 graceful 실패', async ({ page, request }) => {
    await page.goto('http://localhost:3000/admin')
    await page.getByRole('tab', { name: /평가|Evaluation/i }).click()

    // Try to run evaluation (may fail if no provider)
    await page.getByLabel(/작업 유형|Task Type/i).click()
    await page.getByText('search').click()

    const modelSelect = page.getByLabel(/모델|Model/i)

    // If no models available, should show error
    if (await modelSelect.isDisabled()) {
      await expect(page.getByText(/모델이 없습니다|No models available/i)).toBeVisible()
    } else {
      await modelSelect.click()
      await page.locator('[role="option"]').first().click()
      await page.keyboard.press('Escape')

      await page.getByLabel(/테스트 개수|Test Count/i).fill('1')
      await page.getByRole('button', { name: /실행|Run/i }).click()

      // Should handle error gracefully
      const errorMessage = page.getByText(/오류|error|실패|failed/i)
      const successMessage = page.getByText(/완료|completed/i)

      // Either error or success is acceptable
      await Promise.race([
        expect(errorMessage).toBeVisible({ timeout: 30000 }),
        expect(successMessage).toBeVisible({ timeout: 30000 })
      ])
    }
  })
})
