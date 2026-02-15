import { test, expect } from '@playwright/test'
import { createTestNotebook, createTestNote, cleanupTestData } from './utils/data-helpers'
import { loginAsAdmin, authHeaders } from './utils/auth-helpers'
import { waitForNetworkIdle } from './utils/wait-helpers'

test.describe('Discovery & Clustering', () => {
  let token: string
  let notebookId: number
  let noteIds: number[] = []

  test.beforeAll(async ({ request }) => {
    // Get auth token
    const adminAuth = await loginAsAdmin(request)
    token = adminAuth.token

    // Create test notebook with enough notes for clustering
    const notebook = await createTestNotebook(request, token, '발견 테스트 노트북')
    notebookId = notebook.id

    // Create diverse notes for clustering
    const notesToCreate = [
      { title: 'Python 기초', content: 'Python 프로그래밍 언어의 기본 문법과 데이터 타입' },
      { title: 'Python 고급', content: 'Python 데코레이터, 제너레이터, 컨텍스트 매니저' },
      { title: 'Python 웹 개발', content: 'Django와 Flask를 활용한 웹 애플리케이션 개발' },
      { title: 'JavaScript 기초', content: 'JavaScript ES6+ 문법과 비동기 프로그래밍' },
      { title: 'React 입문', content: 'React Hooks와 함수형 컴포넌트 패턴' },
      { title: 'React 상태관리', content: 'Redux, Zustand, Jotai를 활용한 상태 관리' },
      { title: '데이터베이스 설계', content: 'PostgreSQL 스키마 설계와 정규화' },
      { title: 'SQL 최적화', content: 'PostgreSQL 인덱스와 쿼리 성능 튜닝' },
      { title: 'Docker 입문', content: 'Docker 컨테이너와 이미지 관리' },
      { title: 'Kubernetes 배포', content: 'K8s 클러스터 구성과 배포 자동화' },
      { title: '머신러닝 기초', content: 'Scikit-learn을 활용한 지도학습' },
      { title: '딥러닝 입문', content: 'TensorFlow와 PyTorch로 시작하는 신경망' },
    ]

    const notes = []
    for (const noteData of notesToCreate) {
      const note = await createTestNote(request, token, {
        ...noteData,
        notebook_id: notebook.id,
      })
      notes.push(note)
    }
    noteIds = notes.map(n => n.id)

    // Trigger indexing for semantic search
    await request.post('http://localhost:8001/api/search/index', {
      headers: authHeaders(token),
    })
    await new Promise(resolve => setTimeout(resolve, 2000))
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, token, { notebookIds: [notebookId], noteIds })
  })

  test.use({ storageState: 'e2e/.auth/user.json' })

  test('1. Navigate to notebook discovery', async ({ page }) => {
    await page.goto(`http://localhost:3000/notebooks/${notebookId}`)
    await waitForNetworkIdle(page)

    // Look for discovery link/button
    const discoveryLink = page.locator('a[href*="/discover"], button:has-text("발견"), button:has-text("Discovery")').first()
    await expect(discoveryLink).toBeVisible({ timeout: 5000 })
    await discoveryLink.click()

    await expect(page).toHaveURL(new RegExp(`/notebooks/${notebookId}/discover`))
  })

  test('2. Discovery page loads', async ({ page }) => {
    await page.goto(`http://localhost:3000/notebooks/${notebookId}/discover`)
    await waitForNetworkIdle(page)

    // Should show discovery UI
    await expect(page.locator('text=/발견|Discovery|클러스터|Cluster/i')).toBeVisible({ timeout: 5000 })
  })

  test('3. Cluster results display', async ({ page }) => {
    await page.goto(`http://localhost:3000/notebooks/${notebookId}/discover`)
    await waitForNetworkIdle(page)

    // Trigger clustering
    const clusterButton = page.locator('button:has-text("클러스터링"), button:has-text("시작"), button:has-text("분석")').first()
    if (await clusterButton.isVisible({ timeout: 3000 })) {
      await clusterButton.click()

      // Wait for clustering task to complete
      await page.waitForTimeout(1000)

      // Look for cluster results
      const clusters = page.locator('[data-testid="cluster"], .cluster-group').first()
      await expect(clusters).toBeVisible({ timeout: 15000 })
    } else {
      // Clusters might auto-load
      const clusters = page.locator('[data-testid="cluster"], .cluster-group').first()
      await expect(clusters).toBeVisible({ timeout: 15000 })
    }
  })

  test('4. Click cluster shows notes', async ({ page }) => {
    await page.goto(`http://localhost:3000/notebooks/${notebookId}/discover`)
    await waitForNetworkIdle(page)

    // Wait for clusters to load
    const cluster = page.locator('[data-testid="cluster"], .cluster-group').first()
    await expect(cluster).toBeVisible({ timeout: 15000 })

    // Click to expand
    await cluster.click()
    await page.waitForTimeout(500)

    // Should show notes in cluster
    const clusterNotes = page.locator('[data-testid="cluster-note"], .cluster-note').first()
    await expect(clusterNotes).toBeVisible({ timeout: 3000 })
  })

  test('5. Timeline view shows distribution', async ({ page }) => {
    await page.goto(`http://localhost:3000/notebooks/${notebookId}/discover`)
    await waitForNetworkIdle(page)

    // Look for timeline tab/view
    const timelineTab = page.locator('button:has-text("타임라인"), [role="tab"]:has-text("타임라인"), button:has-text("Timeline")').first()
    if (await timelineTab.isVisible({ timeout: 3000 })) {
      await timelineTab.click()
      await waitForNetworkIdle(page)

      // Should show timeline visualization
      const timeline = page.locator('[data-testid="timeline"], .timeline-chart, svg').first()
      await expect(timeline).toBeVisible({ timeout: 5000 })
    }
  })

  test('6. Rediscovery suggestions appear', async ({ page, request }) => {
    await page.goto(`http://localhost:3000/notebooks/${notebookId}/discover`)
    await waitForNetworkIdle(page)

    // Look for rediscovery section
    const rediscoverySection = page.locator('text=/재발견|Rediscovery|다시 보기/i').first()
    if (await rediscoverySection.isVisible({ timeout: 5000 })) {
      // Should show suggestions
      const suggestion = page.locator('[data-testid="rediscovery-item"], .rediscovery-suggestion').first()
      await expect(suggestion).toBeVisible({ timeout: 5000 })
    } else {
      // Might need to fetch via API
      const response = await request.get(`http://localhost:8001/api/discovery/rediscovery?notebook_id=${notebookId}`, {
        headers: authHeaders(token),
      })
      if (response.ok()) {
        const data = await response.json()
        expect(Array.isArray(data)).toBeTruthy()
      }
    }
  })

  test('7. Click suggestion navigates to note', async ({ page }) => {
    await page.goto(`http://localhost:3000/notebooks/${notebookId}/discover`)
    await waitForNetworkIdle(page)

    // Look for rediscovery suggestion
    const suggestion = page.locator('[data-testid="rediscovery-item"], .rediscovery-suggestion').first()
    if (await suggestion.isVisible({ timeout: 5000 })) {
      await suggestion.click()

      // Should navigate to note
      await expect(page).toHaveURL(/\/notes\//, { timeout: 5000 })
    }
  })

  test('8. Similarity score shown', async ({ page }) => {
    await page.goto(`http://localhost:3000/notebooks/${notebookId}/discover`)
    await waitForNetworkIdle(page)

    // Look for cluster or rediscovery item with similarity score
    const itemWithScore = page.locator('[data-testid*="similarity"], .similarity-score, text=/\\d+%|\\d+\\.\\d+/').first()
    if (await itemWithScore.isVisible({ timeout: 5000 })) {
      const scoreText = await itemWithScore.textContent()
      expect(scoreText).toMatch(/\d+/)
    }
  })

  test('9. Not enough notes shows graceful message', async ({ page, request }) => {
    // Create a notebook with only 1 note
    const emptyNotebook = await createTestNotebook(request, token, '빈 노트북')
    await createTestNote(request, token, {
      title: '단일 노트',
      content: '클러스터링 불가',
      notebook_id: emptyNotebook.id,
    })

    await page.goto(`http://localhost:3000/notebooks/${emptyNotebook.id}/discover`)
    await waitForNetworkIdle(page)

    // Should show message about insufficient data
    const message = page.locator('text=/노트가 부족|Not enough|최소.*필요|minimum/i').first()
    await expect(message).toBeVisible({ timeout: 5000 })

    // Cleanup
    await cleanupTestData(request, token, { notebookIds: [emptyNotebook.id] })
  })

  test('10. Topic extraction works', async ({ page }) => {
    await page.goto(`http://localhost:3000/notebooks/${notebookId}/discover`)
    await waitForNetworkIdle(page)

    // Wait for clusters
    const cluster = page.locator('[data-testid="cluster"], .cluster-group').first()
    await expect(cluster).toBeVisible({ timeout: 15000 })

    // Cluster should have topic label
    const topic = cluster.locator('[data-testid="cluster-topic"], .cluster-topic, .topic-label').first()
    if (await topic.isVisible({ timeout: 3000 })) {
      const topicText = await topic.textContent()
      expect(topicText?.length).toBeGreaterThan(0)
    }
  })

  test('11. Cluster insight (AI SSE stream)', async ({ page }) => {
    // Skip if no AI provider configured
    const hasAI = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY
    test.skip(!hasAI, 'No AI provider configured')

    await page.goto(`http://localhost:3000/notebooks/${notebookId}/discover`)
    await waitForNetworkIdle(page)

    // Wait for clusters
    const cluster = page.locator('[data-testid="cluster"], .cluster-group').first()
    await expect(cluster).toBeVisible({ timeout: 15000 })

    // Click to expand
    await cluster.click()
    await page.waitForTimeout(500)

    // Look for insight button
    const insightButton = page.locator('button:has-text("인사이트"), button:has-text("분석"), button:has-text("Insight")').first()
    if (await insightButton.isVisible({ timeout: 3000 })) {
      await insightButton.click()

      // Wait for SSE streaming
      const insightContent = page.locator('[data-testid="cluster-insight"], .insight-content').first()
      await expect(insightContent).toBeVisible({ timeout: 30000 })

      // Content should be non-empty
      const content = await insightContent.textContent()
      expect(content?.length).toBeGreaterThan(10)
    }
  })

  test('12. Save cluster insight', async ({ page }) => {
    // Skip if no AI provider configured
    const hasAI = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY
    test.skip(!hasAI, 'No AI provider configured')

    await page.goto(`http://localhost:3000/notebooks/${notebookId}/discover`)
    await waitForNetworkIdle(page)

    // Wait for clusters
    const cluster = page.locator('[data-testid="cluster"], .cluster-group').first()
    await expect(cluster).toBeVisible({ timeout: 15000 })

    // Click to expand
    await cluster.click()
    await page.waitForTimeout(500)

    // Generate insight
    const insightButton = page.locator('button:has-text("인사이트"), button:has-text("분석"), button:has-text("Insight")').first()
    if (await insightButton.isVisible({ timeout: 3000 })) {
      await insightButton.click()

      // Wait for insight to complete
      const insightContent = page.locator('[data-testid="cluster-insight"], .insight-content').first()
      await expect(insightContent).toBeVisible({ timeout: 30000 })

      // Look for save button
      const saveButton = page.locator('button:has-text("저장"), button:has-text("Save")').first()
      if (await saveButton.isVisible({ timeout: 3000 })) {
        await saveButton.click()
        await page.waitForTimeout(500)

        // Should show success indicator
        const success = page.locator('text=/저장.*완료|Saved|Success/i').first()
        await expect(success).toBeVisible({ timeout: 3000 })
      }
    }
  })
})
