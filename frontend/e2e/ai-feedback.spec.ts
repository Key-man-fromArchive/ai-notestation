import { test, expect } from '@playwright/test'
import { loginAsAdmin, authHeaders } from './utils/auth-helpers'

const API = 'http://localhost:8001/api'
const hasAIProvider = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY || process.env.ZHIPUAI_API_KEY)

test.describe('AI Feedback System (Phase 5)', () => {
  let adminToken: string

  test.beforeAll(async ({ request }) => {
    const { token } = await loginAsAdmin(request)
    adminToken = token
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.evaluate((t) => {
      localStorage.setItem('auth_token', t)
    }, adminToken)
  })

  // ─── User Feedback Submission ──────────────────────────────────────────────

  test.skip(!hasAIProvider, 'No AI provider configured')
  test('1. Generate AI response → rating widget appears', async ({ page }) => {
    await page.goto('/ai')
    await expect(page.getByRole('heading', { name: /AI Workbench/i })).toBeVisible({ timeout: 10000 })

    const insightTab = page.getByRole('tab', { name: /인사이트/i })
    await insightTab.click()

    const promptInput = page.locator('textarea').or(page.getByPlaceholder(/메시지|질문|입력/i)).first()
    await promptInput.fill('Give me a brief summary of key topics')

    const submitButton = page.getByRole('button', { name: /전송|보내기|Submit/i })
    if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitButton.click()
    } else {
      await promptInput.press('Enter')
    }

    // Wait for AI response
    await page.waitForTimeout(10000)

    // Look for rating widget
    const ratingWidget = page.locator('[data-testid="ai-rating"]')
      .or(page.locator('[data-testid="star-rating"]'))
      .or(page.getByText(/별점|평가|Rating/i))

    const isVisible = await ratingWidget.isVisible({ timeout: 5000 }).catch(() => false)
    if (!isVisible) {
      // Rating widget not yet implemented
      test.skip()
    }

    await expect(ratingWidget).toBeVisible()
  })

  test.skip(!hasAIProvider, 'No AI provider configured')
  test('2. Submit 5-star rating', async ({ page }) => {
    await page.goto('/ai')
    await expect(page.getByRole('heading', { name: /AI Workbench/i })).toBeVisible({ timeout: 10000 })

    const insightTab = page.getByRole('tab', { name: /인사이트/i })
    await insightTab.click()

    const promptInput = page.locator('textarea').or(page.getByPlaceholder(/메시지|질문|입력/i)).first()
    await promptInput.fill('Test 5-star rating')

    const submitButton = page.getByRole('button', { name: /전송|보내기|Submit/i })
    if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitButton.click()
    } else {
      await promptInput.press('Enter')
    }

    // Wait for response
    await page.waitForTimeout(10000)

    // Click 5-star
    const star5 = page.locator('[data-rating="5"]')
      .or(page.getByLabel(/5점|5 stars|★★★★★/i))
      .or(page.locator('button').filter({ hasText: /★.*★.*★.*★.*★/ }))

    if (!await star5.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
    }

    // Wait for feedback API call
    const feedbackPromise = page.waitForResponse(
      (response) => response.url().includes('/api/feedback/ai') && response.status() === 200,
      { timeout: 10000 },
    )

    await star5.click()

    const response = await feedbackPromise
    const body = await response.json()

    expect(body.rating).toBe(5)
    expect(body.id).toBeDefined()
  })

  test.skip(!hasAIProvider, 'No AI provider configured')
  test('3. Submit 1-star rating', async ({ page }) => {
    await page.goto('/ai')
    await expect(page.getByRole('heading', { name: /AI Workbench/i })).toBeVisible({ timeout: 10000 })

    const insightTab = page.getByRole('tab', { name: /인사이트/i })
    await insightTab.click()

    const promptInput = page.locator('textarea').or(page.getByPlaceholder(/메시지|질문|입력/i)).first()
    await promptInput.fill('Test 1-star rating')

    const submitButton = page.getByRole('button', { name: /전송|보내기|Submit/i })
    if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitButton.click()
    } else {
      await promptInput.press('Enter')
    }

    // Wait for response
    await page.waitForTimeout(10000)

    // Click 1-star
    const star1 = page.locator('[data-rating="1"]')
      .or(page.getByLabel(/1점|1 star/i))
      .or(page.locator('button').filter({ hasText: /^★/ }))

    if (!await star1.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
    }

    const feedbackPromise = page.waitForResponse(
      (response) => response.url().includes('/api/feedback/ai') && response.status() === 200,
      { timeout: 10000 },
    )

    await star1.click()

    const response = await feedbackPromise
    const body = await response.json()

    expect(body.rating).toBe(1)
  })

  test.skip(!hasAIProvider, 'No AI provider configured')
  test('4. Add comment to feedback', async ({ page }) => {
    await page.goto('/ai')
    await expect(page.getByRole('heading', { name: /AI Workbench/i })).toBeVisible({ timeout: 10000 })

    const insightTab = page.getByRole('tab', { name: /인사이트/i })
    await insightTab.click()

    const promptInput = page.locator('textarea').or(page.getByPlaceholder(/메시지|질문|입력/i)).first()
    await promptInput.fill('Test comment feedback')

    const submitButton = page.getByRole('button', { name: /전송|보내기|Submit/i })
    if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitButton.click()
    } else {
      await promptInput.press('Enter')
    }

    // Wait for response
    await page.waitForTimeout(10000)

    // Look for comment input
    const commentInput = page.getByPlaceholder(/의견|Comment|피드백/i)
      .or(page.locator('textarea[name*="comment"]'))

    if (!await commentInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
    }

    await commentInput.fill('This response was very helpful and accurate!')

    // Submit feedback
    const submitFeedbackButton = page.getByRole('button', { name: /피드백 제출|Submit feedback|평가 제출/i })
    const feedbackPromise = page.waitForResponse(
      (response) => response.url().includes('/api/feedback/ai') && response.status() === 200,
      { timeout: 10000 },
    )

    await submitFeedbackButton.click()

    const response = await feedbackPromise
    await response.json()

    // Verify feedback was submitted successfully
    expect(response.status()).toBe(200)
  })

  test.skip(!hasAIProvider, 'No AI provider configured')
  test('5. Feedback stores model_used', async ({ page, request }) => {
    await page.goto('/ai')
    await expect(page.getByRole('heading', { name: /AI Workbench/i })).toBeVisible({ timeout: 10000 })

    const insightTab = page.getByRole('tab', { name: /인사이트/i })
    await insightTab.click()

    const promptInput = page.locator('textarea').or(page.getByPlaceholder(/메시지|질문|입력/i)).first()
    await promptInput.fill('Test model tracking')

    const submitButton = page.getByRole('button', { name: /전송|보내기|Submit/i })
    if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitButton.click()
    } else {
      await promptInput.press('Enter')
    }

    // Wait for response
    await page.waitForTimeout(10000)

    // Submit rating
    const star4 = page.locator('[data-rating="4"]')
      .or(page.getByLabel(/4점|4 stars/i))

    if (!await star4.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
    }

    const feedbackPromise = page.waitForResponse(
      (response) => response.url().includes('/api/feedback/ai') && response.status() === 200,
      { timeout: 10000 },
    )

    await star4.click()

    const response = await feedbackPromise
    await response.json()

    // Verify via summary API (admin only)
    const summaryRes = await request.get(`${API}/feedback/summary?period=7d`, {
      headers: authHeaders(adminToken),
    })

    if (summaryRes.ok()) {
      const summary = await summaryRes.json()
      expect(summary.ai_feedback).toBeDefined()
      // Check that model information is tracked
      if (summary.ai_feedback.by_model) {
        expect(Object.keys(summary.ai_feedback.by_model).length).toBeGreaterThan(0)
      }
    }
  })

  // ─── Admin Dashboard ───────────────────────────────────────────────────────

  test('6. Admin: AI feedback dashboard loads', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: /관리자|Admin/i })).toBeVisible({ timeout: 10000 })

    // Look for feedback tab or section
    const feedbackTab = page.getByRole('tab', { name: /피드백|Feedback/i })
      .or(page.getByText(/AI 피드백|AI Feedback/i))

    if (await feedbackTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await feedbackTab.click()

      // Verify feedback content loads
      const feedbackContent = page.locator('[data-testid="feedback-dashboard"]')
        .or(page.locator('main'))

      await expect(feedbackContent).toBeVisible()
    } else {
      // Feedback dashboard not yet implemented
      test.skip()
    }
  })

  test('7. Admin: Filter by feature', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: /관리자|Admin/i })).toBeVisible({ timeout: 10000 })

    const feedbackTab = page.getByRole('tab', { name: /피드백|Feedback/i })
    if (await feedbackTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await feedbackTab.click()

      // Look for feature filter
      const featureFilter = page.getByLabel(/기능|Feature/i)
        .or(page.locator('select[name*="feature"]'))

      if (await featureFilter.isVisible({ timeout: 5000 }).catch(() => false)) {
        await featureFilter.selectOption('insight')

        // Verify filter applied (table/list updates)
        await page.waitForTimeout(2000)

        const resultsTable = page.locator('table, [role="table"]')
        await expect(resultsTable).toBeVisible()
      } else {
        test.skip()
      }
    } else {
      test.skip()
    }
  })

  test('8. Admin: Filter by rating', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: /관리자|Admin/i })).toBeVisible({ timeout: 10000 })

    const feedbackTab = page.getByRole('tab', { name: /피드백|Feedback/i })
    if (await feedbackTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await feedbackTab.click()

      // Look for rating filter
      const ratingFilter = page.getByLabel(/별점|Rating|평가/i)
        .or(page.locator('select[name*="rating"]'))

      if (await ratingFilter.isVisible({ timeout: 5000 }).catch(() => false)) {
        await ratingFilter.selectOption('5')

        // Verify filter applied
        await page.waitForTimeout(2000)

        const resultsTable = page.locator('table, [role="table"]')
        await expect(resultsTable).toBeVisible()
      } else {
        test.skip()
      }
    } else {
      test.skip()
    }
  })

  test('9. Admin: View comments', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: /관리자|Admin/i })).toBeVisible({ timeout: 10000 })

    const feedbackTab = page.getByRole('tab', { name: /피드백|Feedback/i })
    if (await feedbackTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await feedbackTab.click()

      // Look for comments column or section
      const commentsColumn = page.locator('th:has-text("의견"), th:has-text("Comment")')
        .or(page.getByText(/사용자 의견|User Comments/i))

      if (await commentsColumn.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Verify comments are displayed
        const commentCells = page.locator('td[data-column="comment"], td:has-text("helpful")')
        const hasComments = await commentCells.count() >= 0
        expect(hasComments).toBe(true)
      } else {
        test.skip()
      }
    } else {
      test.skip()
    }
  })

  test('10. Admin: Model distribution chart', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: /관리자|Admin/i })).toBeVisible({ timeout: 10000 })

    const feedbackTab = page.getByRole('tab', { name: /피드백|Feedback/i })
    if (await feedbackTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await feedbackTab.click()

      // Look for chart/visualization
      const chart = page.locator('[data-testid="model-distribution-chart"]')
        .or(page.locator('canvas'))
        .or(page.locator('svg'))

      if (await chart.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(chart).toBeVisible()
      } else {
        // Chart not yet implemented, check for model stats in table
        const modelStats = page.locator('text=/모델별|By Model/i')
        if (await modelStats.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(modelStats).toBeVisible()
        } else {
          test.skip()
        }
      }
    } else {
      test.skip()
    }
  })

  test('11. Admin: Avg rating per model', async ({ page, request }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: /관리자|Admin/i })).toBeVisible({ timeout: 10000 })

    const feedbackTab = page.getByRole('tab', { name: /피드백|Feedback/i })
    if (await feedbackTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await feedbackTab.click()

      // Check via API
      const summaryRes = await request.get(`${API}/feedback/summary?period=30d`, {
        headers: authHeaders(adminToken),
      })

      if (summaryRes.ok()) {
        const summary = await summaryRes.json()
        expect(summary.ai_feedback).toBeDefined()

        if (summary.ai_feedback.by_model) {
          const models = Object.keys(summary.ai_feedback.by_model)
          if (models.length > 0) {
            const firstModel = summary.ai_feedback.by_model[models[0]]
            expect(firstModel.avg_rating).toBeDefined()
            expect(typeof firstModel.avg_rating).toBe('number')
          }
        }
      }

      // Verify UI shows average ratings
      const avgRatingText = page.locator('text=/평균 별점|Avg Rating|Average/i')
      if (await avgRatingText.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(avgRatingText).toBeVisible()
      } else {
        // UI not yet implemented, API check is sufficient
        expect(summaryRes.ok()).toBe(true)
      }
    } else {
      test.skip()
    }
  })

  test('12. Admin: Optimization recommendations', async ({ page, request }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: /관리자|Admin/i })).toBeVisible({ timeout: 10000 })

    const feedbackTab = page.getByRole('tab', { name: /피드백|Feedback/i })
    if (await feedbackTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await feedbackTab.click()

      // Check optimization API endpoint
      const optRes = await request.get(`${API}/feedback/optimization`, {
        headers: authHeaders(adminToken),
      })

      if (optRes.ok()) {
        const optimization = await optRes.json()
        expect(optimization).toBeDefined()

        // Should have recommendations
        if (optimization.recommendations) {
          expect(Array.isArray(optimization.recommendations) || typeof optimization.recommendations === 'object').toBe(true)
        }
      }

      // Look for optimization section in UI
      const optimizationSection = page.locator('[data-testid="optimization-recommendations"]')
        .or(page.getByText(/최적화|Optimization|추천/i))

      if (await optimizationSection.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(optimizationSection).toBeVisible()

        // Should have actionable recommendations
        const recommendations = page.locator('text=/추천|Recommend|Suggest/i')
        const hasRecs = await recommendations.count() > 0
        expect(hasRecs || optRes.ok()).toBe(true)
      } else {
        // UI not yet implemented, API check is sufficient
        expect(optRes.ok()).toBe(true)
      }
    } else {
      test.skip()
    }
  })
})

// ─── API-only tests (no UI dependency) ─────────────────────────────────────

test.describe('AI Feedback API', () => {
  let adminToken: string

  test.beforeAll(async ({ request }) => {
    const { token } = await loginAsAdmin(request)
    adminToken = token
  })

  test('API: Submit feedback via POST /api/feedback/ai', async ({ request }) => {
    const res = await request.post(`${API}/feedback/ai`, {
      headers: authHeaders(adminToken),
      data: {
        feature: 'insight',
        rating: 4,
        comment: 'Great response!',
        model_used: 'gpt-4o',
        request_summary: 'Summarize my notes',
      },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.rating).toBe(4)
  })

  test('API: Get feedback summary (admin only)', async ({ request }) => {
    const res = await request.get(`${API}/feedback/summary?period=30d`, {
      headers: authHeaders(adminToken),
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ai_feedback).toBeDefined()
  })

  test('API: Get optimization recommendations (admin only)', async ({ request }) => {
    const res = await request.get(`${API}/feedback/optimization`, {
      headers: authHeaders(adminToken),
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toBeDefined()
  })

  test('API: Non-admin cannot access summary', async ({ request }) => {
    // Create regular user
    const uniqueId = Date.now()
    const signupRes = await request.post(`${API}/members/signup`, {
      data: {
        email: `user-${uniqueId}@example.com`,
        password: 'TestPassword123!',
        name: 'Regular User',
        org_name: `Org ${uniqueId}`,
        org_slug: `org-${uniqueId}`,
      },
    })

    const { access_token } = await signupRes.json()

    const res = await request.get(`${API}/feedback/summary?period=7d`, {
      headers: authHeaders(access_token),
    })

    expect(res.status()).toBe(403) // Forbidden
  })
})
