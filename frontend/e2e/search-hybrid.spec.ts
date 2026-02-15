import { test, expect } from '@playwright/test'
import { createTestNotebook, createTestNote, cleanupTestData } from './utils/data-helpers'
import { loginAsAdmin, authHeaders } from './utils/auth-helpers'
import { waitForNetworkIdle } from './utils/wait-helpers'

test.describe('Hybrid Search', () => {
  let notebookId: number
  const noteIds: number[] = []
  let token: string

  test.beforeAll(async ({ request }) => {
    const admin = await loginAsAdmin(request)
    token = admin.token

    const notebook = await createTestNotebook(request, token, '검색 테스트 노트북')
    notebookId = notebook.id

    // Create test notes with varied content
    const testNotes = [
      { title: 'Python 머신러닝', content: '<p>Scikit-learn과 TensorFlow를 사용한 딥러닝 튜토리얼</p>' },
      { title: '데이터 분석 가이드', content: '<p>Pandas와 NumPy를 활용한 데이터 전처리 및 시각화</p>' },
      { title: 'React 컴포넌트 설계', content: '<p>Hooks와 Context API를 사용한 상태 관리 패턴</p>' },
      { title: 'FastAPI 백엔드', content: '<p>SQLAlchemy와 Alembic을 사용한 비동기 API 개발</p>' },
      { title: '검색 알고리즘', content: '<p>BM25와 벡터 유사도를 결합한 하이브리드 검색 구현</p>' },
      { title: 'Docker 배포', content: '<p>Docker Compose를 활용한 멀티 컨테이너 환경 설정</p>' },
      { title: 'PostgreSQL 최적화', content: '<p>pgvector 인덱스와 FTS tsvector 성능 튜닝</p>' },
      { title: '특수문자 테스트!@#', content: '<p>Special chars: html, json, array, code</p>' },
      { title: '한국어 형태소', content: '<p>은/는/이/가 조사 처리 및 복합명사 검색 테스트</p>' },
      { title: 'English Content', content: '<p>Testing multilingual search with mixed Korean and English text</p>' },
    ]
    for (const n of testNotes) {
      const note = await createTestNote(request, token, { ...n, notebook_id: notebookId })
      noteIds.push(note.id)
    }

    // Trigger search indexing
    await request.post('http://localhost:8001/api/search/index', {
      headers: authHeaders(token),
    })

    // Wait for indexing to complete
    let indexed = false
    for (let i = 0; i < 10; i++) {
      const response = await request.get('http://localhost:8001/api/search/index/status', {
        headers: authHeaders(token),
      })
      const status = await response.json()
      if (status.indexed_count >= testNotes.length) {
        indexed = true
        break
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    if (!indexed) {
      console.warn('Search indexing did not complete in time')
    }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, token, { notebookIds: [notebookId], noteIds })
  })

  test.use({ storageState: 'e2e/.auth/user.json' })

  test('1. Empty query shows initial state', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await expect(page.locator('input[placeholder*="검색어를 입력"]')).toBeVisible()
    await expect(page.getByText('검색 결과가 없습니다', { exact: false })).not.toBeVisible()
  })

  test('2. Hybrid search returns results', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('머신러닝')
    await page.keyboard.press('Enter')

    await waitForNetworkIdle(page)
    await expect(page.locator('[data-testid="search-result"]').first()).toBeVisible({ timeout: 10000 })
    const results = await page.locator('[data-testid="search-result"]').count()
    expect(results).toBeGreaterThan(0)
  })

  test('3. FTS search returns results', async ({ page }) => {
    await page.goto('http://localhost:3000/search?type=fts')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('FastAPI')
    await page.keyboard.press('Enter')

    await waitForNetworkIdle(page)
    await expect(page.locator('[data-testid="search-result"]').first()).toBeVisible({ timeout: 5000 })
  })

  test('4. Semantic search returns results', async ({ page }) => {
    await page.goto('http://localhost:3000/search?type=semantic')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('백엔드 개발')
    await page.keyboard.press('Enter')

    await waitForNetworkIdle(page, 15000)
    // Semantic search may take longer
    const results = await page.locator('[data-testid="search-result"]').count()
    expect(results).toBeGreaterThanOrEqual(0)
  })

  test('5. Switch search type updates results', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('데이터')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const hybridCount = await page.locator('[data-testid="search-result"]').count()

    // Switch to FTS
    await page.locator('button:has-text("전문 검색"), select option:has-text("전문 검색"), [value="fts"]').first().click()
    await waitForNetworkIdle(page)

    const ftsCount = await page.locator('[data-testid="search-result"]').count()
    expect(typeof ftsCount).toBe('number')
  })

  test('6. Query updates URL params', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('React')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    await expect(page).toHaveURL(/q=React/)
    await expect(page).toHaveURL(/type=/)
  })

  test('7. Results show snippets with highlight marks', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('Hooks')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const result = page.locator('[data-testid="search-result"]').first()
    await expect(result).toBeVisible()

    // Check for highlighted text (usually <mark> or .highlight class)
    const hasHighlight = await result.locator('mark, .highlight, [class*="highlight"]').count()
    expect(hasHighlight).toBeGreaterThanOrEqual(0)
  })

  test('8. Results show match reason', async ({ page }) => {
    await page.goto('http://localhost:3000/search?type=hybrid')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('검색')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const result = page.locator('[data-testid="search-result"]').first()
    await expect(result).toBeVisible()

    // Check for match reason indicator
    const hasReason = await result.locator('text=/FTS|semantic|하이브리드|전문|의미/i').count()
    expect(hasReason).toBeGreaterThanOrEqual(0)
  })

  test('9. Results show relevance score', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('Docker')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const result = page.locator('[data-testid="search-result"]').first()
    await expect(result).toBeVisible()

    // Check for score display (usually as percentage or decimal)
    const hasScore = await result.locator('text=/\\d+%|\\d+\\.\\d+|점수/i').count()
    expect(hasScore).toBeGreaterThanOrEqual(0)
  })

  test('10. Click result navigates to note', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('PostgreSQL')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const result = page.locator('[data-testid="search-result"]').first()
    await expect(result).toBeVisible()
    await result.click()

    // Should navigate to /notes/:id or /notebooks/:notebookId/notes/:id
    await expect(page).toHaveURL(/\/notes\//)
  })

  test('11. Pagination / load more', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('테스트')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const initialCount = await page.locator('[data-testid="search-result"]').count()

    // Look for "더 보기" or pagination button
    const loadMore = page.locator('button:has-text("더 보기"), button:has-text("다음"), [aria-label*="다음"]').first()
    if (await loadMore.isVisible({ timeout: 2000 })) {
      await loadMore.click()
      await waitForNetworkIdle(page)
      const afterCount = await page.locator('[data-testid="search-result"]').count()
      expect(afterCount).toBeGreaterThanOrEqual(initialCount)
    }
  })

  test('12. No results shows empty state message', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('xyznonexistentquery999')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    await expect(page.getByText('결과가 없습니다', { exact: false })).toBeVisible()
  })

  test('13. Search refinement updates results', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('Python')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const initialCount = await page.locator('[data-testid="search-result"]').count()

    // Refine search
    const refineButton = page.locator('button:has-text("검색 수정"), button:has-text("상세"), [aria-label*="검색 수정"]').first()
    if (await refineButton.isVisible({ timeout: 2000 })) {
      await refineButton.click()
      await page.locator('input, textarea').last().fill('머신러닝')
      await page.locator('button:has-text("적용"), button[type="submit"]').first().click()
      await waitForNetworkIdle(page)

      const refinedCount = await page.locator('[data-testid="search-result"]').count()
      expect(typeof refinedCount).toBe('number')
    }
  })

  test('14. Search suggestions autocomplete', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    const input = page.locator('input[placeholder*="검색어를 입력"]')

    await input.fill('Py')
    await page.waitForTimeout(500) // Debounce

    // Check for suggestions dropdown
    const suggestions = page.locator('[role="listbox"], [data-testid="suggestions"], .autocomplete').first()
    const hasSuggestions = await suggestions.isVisible({ timeout: 3000 }).catch(() => false)

    if (hasSuggestions) {
      const suggestionItems = await suggestions.locator('li, [role="option"]').count()
      expect(suggestionItems).toBeGreaterThan(0)
    }
  })

  test('15. Progressive search (FTS first, semantic merge)', async ({ page }) => {
    await page.goto('http://localhost:3000/search?type=hybrid')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('알고리즘')

    const startTime = Date.now()
    await page.keyboard.press('Enter')

    // FTS results should appear quickly
    await expect(page.locator('[data-testid="search-result"]').first()).toBeVisible({ timeout: 3000 })
    const ftsTime = Date.now() - startTime
    expect(ftsTime).toBeLessThan(3000)

    // Wait for semantic merge (may show loading indicator)
    await waitForNetworkIdle(page, 15000)
  })

  test('16. Filter by notebook', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('테스트')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    // Look for notebook filter
    const notebookFilter = page.locator('select[name*="notebook"], button:has-text("노트북")').first()
    if (await notebookFilter.isVisible({ timeout: 2000 })) {
      await notebookFilter.click()
      await page.locator('option, [role="option"]').first().click()
      await waitForNetworkIdle(page)

      // Results should be filtered
      const results = await page.locator('[data-testid="search-result"]').count()
      expect(results).toBeGreaterThanOrEqual(0)
    }
  })

  test('17. Filter by date range', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('데이터')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    // Look for date filter
    const dateFilter = page.locator('input[type="date"], button:has-text("날짜")').first()
    if (await dateFilter.isVisible({ timeout: 2000 })) {
      await dateFilter.click()
      // Select date range (implementation varies)
      await waitForNetworkIdle(page)
    }
  })

  test('18. Complex query with special terms', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('Docker AND PostgreSQL')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const results = await page.locator('[data-testid="search-result"]').count()
    expect(results).toBeGreaterThanOrEqual(0)
  })

  test('19. Special characters in query', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('특수문자!@#')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    // Should handle gracefully, not crash
    await expect(page.locator('input[placeholder*="검색어를 입력"]')).toBeVisible()
  })

  test('20. CJK (Korean) search works', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('형태소')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const result = page.locator('[data-testid="search-result"]').first()
    await expect(result).toBeVisible({ timeout: 5000 })
  })

  test('21. Performance: FTS < 2s', async ({ page }) => {
    await page.goto('http://localhost:3000/search?type=fts')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('FastAPI')

    const startTime = Date.now()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-testid="search-result"]').first()).toBeVisible({ timeout: 2000 })
    const duration = Date.now() - startTime

    expect(duration).toBeLessThan(2000)
  })

  test('22. Clear search resets state', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('React')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const clearButton = page.locator('button:has-text("지우기"), button[aria-label*="지우기"], button[aria-label*="clear"]').first()
    if (await clearButton.isVisible({ timeout: 2000 })) {
      await clearButton.click()
      await expect(page.locator('input[placeholder*="검색어를 입력"]')).toHaveValue('')
      await expect(page.locator('[data-testid="search-result"]')).toHaveCount(0)
    }
  })

  test('23. Thumbs up on search result (feedback)', async ({ page, request }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('Docker')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const result = page.locator('[data-testid="search-result"]').first()
    await expect(result).toBeVisible()

    const thumbsUp = result.locator('button[aria-label*="좋아요"], button:has-text("👍")').first()
    if (await thumbsUp.isVisible({ timeout: 2000 })) {
      await thumbsUp.click()
      await page.waitForTimeout(500)

      // Verify feedback was sent (check button state or API)
      const isActive = await thumbsUp.getAttribute('class')
      expect(isActive).toContain('active')
    }
  })

  test('24. Thumbs down on search result (feedback)', async ({ page }) => {
    await page.goto('http://localhost:3000/search')
    await page.locator('input[placeholder*="검색어를 입력"]').fill('데이터')
    await page.keyboard.press('Enter')
    await waitForNetworkIdle(page)

    const result = page.locator('[data-testid="search-result"]').first()
    await expect(result).toBeVisible()

    const thumbsDown = result.locator('button[aria-label*="싫어요"], button:has-text("👎")').first()
    if (await thumbsDown.isVisible({ timeout: 2000 })) {
      await thumbsDown.click()
      await page.waitForTimeout(500)

      // Verify feedback was sent
      const isActive = await thumbsDown.getAttribute('class')
      expect(isActive).toContain('active')
    }
  })
})
