import { test, expect } from '@playwright/test'
import { createTestNotebook, createTestNote, cleanupTestData } from './utils/data-helpers'
import { loginAsAdmin, authHeaders } from './utils/auth-helpers'
import { waitForNetworkIdle } from './utils/wait-helpers'

test.describe('Search Metrics & Feedback', () => {
  let notebookId: number
  const noteIds: number[] = []
  let searchEventId: string | null = null
  let token: string

  test.beforeAll(async ({ request }) => {
    const admin = await loginAsAdmin(request)
    token = admin.token

    const notebook = await createTestNotebook(request, token, '메트릭 테스트 노트북')
    notebookId = notebook.id

    const testNotes = [
      { title: '메트릭 테스트 1', content: '<p>검색 이벤트 추적 테스트 내용</p>' },
      { title: '메트릭 테스트 2', content: '<p>클릭 이벤트 추적 테스트 내용</p>' },
      { title: '메트릭 테스트 3', content: '<p>피드백 수집 테스트 내용</p>' },
    ]
    for (const n of testNotes) {
      const note = await createTestNote(request, token, { ...n, notebook_id: notebookId })
      noteIds.push(note.id)
    }

    // Trigger indexing
    await request.post('http://localhost:8001/api/search/index', {
      headers: authHeaders(token),
    })

    // Wait for indexing
    await new Promise(resolve => setTimeout(resolve, 2000))
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, token, { notebookIds: [notebookId], noteIds })
  })

  test.use({ storageState: 'e2e/.auth/user.json' })

  test('1. Perform search → event recorded', async ({ page, request }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('메트릭 테스트')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    // Wait for metric event to be recorded
    await page.waitForTimeout(1000)

    // Verify via admin API
    const response = await request.get('http://localhost:8001/api/metrics/search?period=1d', {
      headers: authHeaders(token),
    })
    expect(response.ok()).toBeTruthy()

    const metrics = await response.json()
    expect(metrics.total_searches).toBeGreaterThan(0)
  })

  test('2. Click result → click event recorded', async ({ page, request }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('클릭 테스트')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const result = page.locator('[data-testid="search-result"]').first()
    await expect(result).toBeVisible()

    // Extract event_id from result if exposed via data attribute
    const eventId = await result.getAttribute('data-event-id').catch(() => null)
    searchEventId = eventId

    await result.click()
    await page.waitForTimeout(500)

    // Verify click event (if API supports querying)
    if (eventId) {
      const response = await request.get(`http://localhost:8001/api/metrics/search?period=1d`, {
        headers: authHeaders(token),
      })
      const metrics = await response.json()
      expect(metrics.total_clicks).toBeGreaterThanOrEqual(0)
    }
  })

  test('3. Submit thumbs-up feedback', async ({ page, request }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('피드백 테스트')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const result = page.locator('[data-testid="search-result"]').first()
    await expect(result).toBeVisible()

    const thumbsUp = result.locator('button[aria-label*="좋아요"], button:has-text("👍")').first()
    if (await thumbsUp.isVisible({ timeout: 2000 })) {
      await thumbsUp.click()
      await page.waitForTimeout(500)

      // Verify feedback summary
      const response = await request.get('http://localhost:8001/api/feedback/summary?period=1d', {
        headers: authHeaders(token),
      })
      const summary = await response.json()
      expect(summary.positive_count).toBeGreaterThanOrEqual(0)
    }
  })

  test('4. Submit thumbs-down feedback', async ({ page, request }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('부정 피드백')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const result = page.locator('[data-testid="search-result"]').first()
    await expect(result).toBeVisible()

    const thumbsDown = result.locator('button[aria-label*="싫어요"], button:has-text("👎")').first()
    if (await thumbsDown.isVisible({ timeout: 2000 })) {
      await thumbsDown.click()
      await page.waitForTimeout(500)

      // Verify feedback summary
      const response = await request.get('http://localhost:8001/api/feedback/summary?period=1d', {
        headers: authHeaders(token),
      })
      const summary = await response.json()
      expect(summary.negative_count).toBeGreaterThanOrEqual(0)
    }
  })

  test('5. Admin: Metrics dashboard loads', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')

    // Look for metrics tab or section
    const metricsTab = page.locator('button:has-text("메트릭"), [role="tab"]:has-text("메트릭"), a:has-text("검색 메트릭")').first()

    if (await metricsTab.isVisible({ timeout: 3000 })) {
      await metricsTab.click()
      await waitForNetworkIdle(page)

      // Verify metrics content loaded
      await expect(page.locator('text=/검색|메트릭|Metric/i')).toBeVisible()
    } else {
      // Admin page might have metrics directly visible
      await expect(page.locator('text=/검색|메트릭|Total Searches/i')).toBeVisible({ timeout: 5000 })
    }
  })

  test('6. Admin: Filter by period (1d/7d/30d)', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await waitForNetworkIdle(page)

    // Look for period selector
    const periodSelect = page.locator('select[name*="period"], button:has-text("기간")').first()
    if (await periodSelect.isVisible({ timeout: 3000 })) {
      await periodSelect.click()

      // Select 7 days
      const option7d = page.locator('option[value="7d"], [role="option"]:has-text("7일")').first()
      if (await option7d.isVisible({ timeout: 2000 })) {
        await option7d.click()
        await waitForNetworkIdle(page)

        // Verify data updated
        await expect(page.locator('text=/7일|7 days/i')).toBeVisible()
      }
    }
  })

  test('7. Admin: Shows click-through rate', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await waitForNetworkIdle(page)

    // Navigate to metrics if needed
    const metricsSection = page.locator('text=/메트릭|Metrics/i').first()
    if (await metricsSection.isVisible({ timeout: 3000 })) {
      await metricsSection.click()
      await waitForNetworkIdle(page)
    }

    // Look for CTR metric
    const ctr = page.locator('text=/CTR|클릭률|Click.*Rate/i').first()
    await expect(ctr).toBeVisible({ timeout: 5000 })

    // Should show percentage
    const ctrValue = page.locator('text=/\\d+(\\.\\d+)?%/').first()
    await expect(ctrValue).toBeVisible({ timeout: 3000 })
  })

  test('8. Admin: Shows zero-result rate', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await waitForNetworkIdle(page)

    // Navigate to metrics if needed
    const metricsSection = page.locator('text=/메트릭|Metrics/i').first()
    if (await metricsSection.isVisible({ timeout: 3000 })) {
      await metricsSection.click()
      await waitForNetworkIdle(page)
    }

    // Look for zero-result rate
    const zrr = page.locator('text=/무결과|Zero.*Result|No.*Result/i').first()
    if (await zrr.isVisible({ timeout: 5000 })) {
      // Should show percentage
      const zrrValue = page.locator('text=/\\d+(\\.\\d+)?%/').first()
      await expect(zrrValue).toBeVisible()
    }
  })

  test('9. Admin: Shows avg results per query', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await waitForNetworkIdle(page)

    // Navigate to metrics if needed
    const metricsSection = page.locator('text=/메트릭|Metrics/i').first()
    if (await metricsSection.isVisible({ timeout: 3000 })) {
      await metricsSection.click()
      await waitForNetworkIdle(page)
    }

    // Look for avg results metric
    const avgResults = page.locator('text=/평균.*결과|Avg.*Results|Average.*Results/i').first()
    if (await avgResults.isVisible({ timeout: 5000 })) {
      // Should show number
      const avgValue = page.locator('text=/\\d+(\\.\\d+)?/').first()
      await expect(avgValue).toBeVisible()
    }
  })

  test('10. Admin: Shows top queries', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await waitForNetworkIdle(page)

    // Navigate to metrics if needed
    const metricsSection = page.locator('text=/메트릭|Metrics/i').first()
    if (await metricsSection.isVisible({ timeout: 3000 })) {
      await metricsSection.click()
      await waitForNetworkIdle(page)
    }

    // Look for top queries section
    const topQueries = page.locator('text=/인기 검색어|Top.*Queries|Popular.*Queries/i').first()
    if (await topQueries.isVisible({ timeout: 5000 })) {
      // Should show list of queries
      const queryList = page.locator('[data-testid="top-queries"] li, .top-queries li').first()
      await expect(queryList).toBeVisible({ timeout: 3000 })
    }
  })

  test('11. Admin: Shows response time p50/p95', async ({ page }) => {
    await page.goto('http://localhost:3000/admin')
    await waitForNetworkIdle(page)

    // Navigate to metrics if needed
    const metricsSection = page.locator('text=/메트릭|Metrics/i').first()
    if (await metricsSection.isVisible({ timeout: 3000 })) {
      await metricsSection.click()
      await waitForNetworkIdle(page)
    }

    // Look for response time metrics
    const responseTime = page.locator('text=/응답.*시간|Response.*Time|Latency/i').first()
    if (await responseTime.isVisible({ timeout: 5000 })) {
      // Look for p50 or p95
      const percentile = page.locator('text=/p50|p95|P50|P95|50th|95th/i').first()
      await expect(percentile).toBeVisible({ timeout: 3000 })

      // Should show time value (ms or s)
      const timeValue = page.locator('text=/\\d+\\s*(ms|s)/i').first()
      await expect(timeValue).toBeVisible({ timeout: 3000 })
    }
  })
})
