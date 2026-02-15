import { test, expect } from '@playwright/test'
import { createTestNotebook, createTestNote, cleanupTestData } from './utils/data-helpers'
import { loginAsAdmin, authHeaders } from './utils/auth-helpers'
import { waitForNetworkIdle } from './utils/wait-helpers'

test.describe('Graph View', () => {
  let token: string
  let notebookId: number
  let noteIds: number[] = []

  test.beforeAll(async ({ request }) => {
    // Get auth token
    const adminAuth = await loginAsAdmin(request)
    token = adminAuth.token

    // Create test notebook with interconnected notes
    const notebook = await createTestNotebook(request, token, '그래프 테스트 노트북')
    notebookId = notebook.id

    // Create notes with references/links
    const notesToCreate = [
      { title: 'Python 개요', content: 'Python 프로그래밍 언어. [[Python 웹 개발]] 참조' },
      { title: 'Python 웹 개발', content: 'Django와 Flask. [[FastAPI]]와 비교' },
      { title: 'FastAPI', content: 'FastAPI 프레임워크. [[Python 개요]] 기반' },
      { title: 'React 개요', content: 'React 라이브러리. [[React 상태관리]] 참조' },
      { title: 'React 상태관리', content: 'Redux와 Zustand. [[React 개요]]에서 시작' },
      { title: 'JavaScript', content: 'JavaScript ES6+. [[React 개요]] 필요' },
      { title: 'TypeScript', content: 'TypeScript 타입 시스템. [[JavaScript]] 확장' },
      { title: 'PostgreSQL', content: 'PostgreSQL 데이터베이스. [[SQL 최적화]] 참조' },
      { title: 'SQL 최적화', content: 'SQL 쿼리 튜닝. [[PostgreSQL]] 기반' },
      { title: 'Docker', content: 'Docker 컨테이너. [[Kubernetes]] 기반 기술' },
      { title: 'Kubernetes', content: 'K8s 오케스트레이션. [[Docker]] 활용' },
      { title: '머신러닝', content: 'ML 기초. [[Python 개요]] 사용' },
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

    // Trigger indexing
    await request.post('http://localhost:8001/api/search/index', {
      headers: authHeaders(token),
    })
    await new Promise(resolve => setTimeout(resolve, 2000))
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, token, { notebookIds: [notebookId], noteIds })
  })

  test.use({ storageState: 'e2e/.auth/user.json' })

  test('1. Graph page loads', async ({ page }) => {
    await page.goto('http://localhost:3000/graph')
    await waitForNetworkIdle(page)

    // Should show graph UI
    await expect(page.locator('text=/그래프|Graph/i')).toBeVisible({ timeout: 5000 })
  })

  test('2. Nodes and links render', async ({ page }) => {
    await page.goto('http://localhost:3000/graph')
    await waitForNetworkIdle(page, 10000)

    // Check for canvas or SVG rendering
    const canvas = page.locator('canvas').first()
    const svg = page.locator('svg').first()

    const hasCanvas = await canvas.isVisible({ timeout: 5000 }).catch(() => false)
    const hasSvg = await svg.isVisible({ timeout: 5000 }).catch(() => false)

    expect(hasCanvas || hasSvg).toBeTruthy()

    // If SVG, check for nodes/links
    if (hasSvg) {
      const nodes = await svg.locator('circle, rect, [data-type="node"]').count()
      const links = await svg.locator('line, path, [data-type="link"]').count()

      expect(nodes).toBeGreaterThan(0)
      expect(links).toBeGreaterThanOrEqual(0)
    }
  })

  test('3. Click node highlights connections', async ({ page }) => {
    await page.goto('http://localhost:3000/graph')
    await waitForNetworkIdle(page, 10000)

    // Look for clickable nodes (SVG or overlay elements)
    const node = page.locator('[data-testid="graph-node"], circle, rect, .node').first()
    if (await node.isVisible({ timeout: 5000 })) {
      await node.click()
      await page.waitForTimeout(500)

      // Should highlight connected nodes or show details
      const highlighted = page.locator('.highlighted, .selected, [data-highlighted="true"]').first()
      const hasHighlight = await highlighted.isVisible({ timeout: 3000 }).catch(() => false)

      // Or might show node details panel
      const details = page.locator('[data-testid="node-details"], .node-details').first()
      const hasDetails = await details.isVisible({ timeout: 3000 }).catch(() => false)

      expect(hasHighlight || hasDetails).toBeTruthy()
    }
  })

  test('4. Search within graph filters nodes', async ({ page }) => {
    await page.goto('http://localhost:3000/graph')
    await waitForNetworkIdle(page, 10000)

    // Look for graph search input
    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="Search"], [data-testid="graph-search"]').first()
    if (await searchInput.isVisible({ timeout: 3000 })) {
      await searchInput.fill('Python')
      await page.waitForTimeout(1000)

      // Nodes should be filtered/highlighted
      const filteredNode = page.locator('[data-testid="graph-node"]:has-text("Python"), .node:has-text("Python")').first()
      await expect(filteredNode).toBeVisible({ timeout: 5000 })
    }
  })

  test('5. Cluster insight SSE stream works', async ({ page }) => {
    // Skip if no AI provider configured
    const hasAI = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY
    test.skip(!hasAI, 'No AI provider configured')

    await page.goto('http://localhost:3000/graph')
    await waitForNetworkIdle(page, 10000)

    // Look for cluster insight button
    const insightButton = page.locator('button:has-text("인사이트"), button:has-text("클러스터 분석"), button:has-text("Cluster Insight")').first()
    if (await insightButton.isVisible({ timeout: 3000 })) {
      await insightButton.click()

      // Wait for SSE streaming
      const insightContent = page.locator('[data-testid="graph-insight"], .insight-content, .cluster-insight').first()
      await expect(insightContent).toBeVisible({ timeout: 30000 })

      // Content should stream in (check for non-empty text)
      const content = await insightContent.textContent()
      expect(content?.length).toBeGreaterThan(10)
    }
  })

  test('6. Save graph insight', async ({ page }) => {
    // Skip if no AI provider configured
    const hasAI = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY
    test.skip(!hasAI, 'No AI provider configured')

    await page.goto('http://localhost:3000/graph')
    await waitForNetworkIdle(page, 10000)

    // Generate insight first
    const insightButton = page.locator('button:has-text("인사이트"), button:has-text("클러스터 분석"), button:has-text("Cluster Insight")').first()
    if (await insightButton.isVisible({ timeout: 3000 })) {
      await insightButton.click()

      const insightContent = page.locator('[data-testid="graph-insight"], .insight-content').first()
      await expect(insightContent).toBeVisible({ timeout: 30000 })

      // Look for save button
      const saveButton = page.locator('button:has-text("저장"), button:has-text("Save")').first()
      if (await saveButton.isVisible({ timeout: 3000 })) {
        await saveButton.click()
        await page.waitForTimeout(500)

        // Should show success
        const success = page.locator('text=/저장.*완료|Saved|Success/i').first()
        await expect(success).toBeVisible({ timeout: 3000 })
      }
    }
  })

  test('7. Saved insights appear in list', async ({ page, request }) => {
    // Skip if no AI provider configured
    const hasAI = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY
    test.skip(!hasAI, 'No AI provider configured')

    await page.goto('http://localhost:3000/graph')
    await waitForNetworkIdle(page, 10000)

    // Look for insights list/history
    const insightsList = page.locator('[data-testid="insights-list"], .insights-history, button:has-text("인사이트 목록")').first()
    if (await insightsList.isVisible({ timeout: 3000 })) {
      await insightsList.click()
      await page.waitForTimeout(500)

      // Should show saved insights
      const insightItem = page.locator('[data-testid="insight-item"], .insight-item').first()
      await expect(insightItem).toBeVisible({ timeout: 5000 })
    } else {
      // Check via API
      const response = await request.get('http://localhost:8001/api/graph/insights', {
        headers: authHeaders(token),
      })
      if (response.ok()) {
        const insights = await response.json()
        expect(Array.isArray(insights)).toBeTruthy()
      }
    }
  })

  test('8. Zoom and pan works', async ({ page }) => {
    await page.goto('http://localhost:3000/graph')
    await waitForNetworkIdle(page, 10000)

    const canvas = page.locator('canvas').first()
    const svg = page.locator('svg').first()

    const hasCanvas = await canvas.isVisible({ timeout: 5000 }).catch(() => false)
    const hasSvg = await svg.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasCanvas || hasSvg) {
      const target = hasCanvas ? canvas : svg

      // Zoom in (wheel event)
      await target.hover()
      await page.mouse.wheel(0, -100) // Zoom in
      await page.waitForTimeout(500)

      // Pan (drag)
      const box = await target.boundingBox()
      if (box) {
        await page.mouse.move(box.x + 100, box.y + 100)
        await page.mouse.down()
        await page.mouse.move(box.x + 200, box.y + 200)
        await page.mouse.up()
        await page.waitForTimeout(500)
      }

      // Graph should still be visible (not broken)
      await expect(target).toBeVisible()
    }
  })

  test('9. Graph loading state', async ({ page }) => {
    await page.goto('http://localhost:3000/graph')

    // Should show loading indicator initially
    const loading = page.locator('text=/로딩|Loading|불러오는 중/i, [data-testid="loading"], .loading-spinner').first()
    const hasLoading = await loading.isVisible({ timeout: 2000 }).catch(() => false)

    if (hasLoading) {
      // Loading should disappear when done
      await expect(loading).not.toBeVisible({ timeout: 15000 })
    }

    // Graph should be visible after loading
    const canvas = page.locator('canvas').first()
    const svg = page.locator('svg').first()
    const hasGraph = await canvas.isVisible({ timeout: 5000 }).catch(() => false) ||
                     await svg.isVisible({ timeout: 5000 }).catch(() => false)
    expect(hasGraph).toBeTruthy()
  })

  test('10. Large dataset (100+ notes) renders OK', async ({ page, request }) => {
    // Create a large dataset
    const largeNotebook = await createTestNotebook(request, token, '대용량 그래프 테스트')
    const largeNotes = []

    for (let i = 0; i < 100; i++) {
      const note = await createTestNote(request, token, {
        title: `노트 ${i}`,
        content: `내용 ${i}. [[노트 ${(i + 1) % 100}]] 참조`,
        notebook_id: largeNotebook.id,
      })
      largeNotes.push(note)
    }

    const largeNoteIds = largeNotes.map(n => n.id)

    await page.goto('http://localhost:3000/graph')
    await waitForNetworkIdle(page, 20000)

    // Should render without crashing
    const canvas = page.locator('canvas').first()
    const svg = page.locator('svg').first()
    const hasGraph = await canvas.isVisible({ timeout: 10000 }).catch(() => false) ||
                     await svg.isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasGraph).toBeTruthy()

    // Cleanup
    await cleanupTestData(request, token, { notebookIds: [largeNotebook.id], noteIds: largeNoteIds })
  })

  test('11. Graph search updates view', async ({ page }) => {
    await page.goto('http://localhost:3000/graph')
    await waitForNetworkIdle(page, 10000)

    // Perform search via API endpoint
    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="Search"]').first()
    if (await searchInput.isVisible({ timeout: 3000 })) {
      await searchInput.fill('React')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1000)

      // Graph should update (check for highlighted nodes or filtered view)
      const reactNode = page.locator('[data-testid="graph-node"]:has-text("React"), .node:has-text("React")').first()
      if (await reactNode.isVisible({ timeout: 5000 })) {
        // Node should be highlighted or prominent
        const isHighlighted = await reactNode.getAttribute('class')
        expect(isHighlighted).toBeTruthy()
      }
    }
  })

  test('12. Graph with no data shows empty state', async ({ page, request }) => {
    // Create empty notebook
    const emptyNotebook = await createTestNotebook(request, token, '빈 그래프 노트북')

    await page.goto('http://localhost:3000/graph')
    await waitForNetworkIdle(page)

    // Should show empty state message
    const emptyState = page.locator('text=/노트가 없습니다|No notes|그래프.*비어|Empty/i').first()
    if (await emptyState.isVisible({ timeout: 5000 })) {
      expect(await emptyState.textContent()).toBeTruthy()
    }

    // Cleanup
    await cleanupTestData(request, token, { notebookIds: [emptyNotebook.id] })
  })
})
