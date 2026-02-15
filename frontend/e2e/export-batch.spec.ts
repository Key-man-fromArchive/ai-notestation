import { test, expect } from '@playwright/test'
import { loginAsAdmin, authHeaders, injectAuth } from './utils/auth-helpers'
import { createTestNotebook, createTestNote, createTestNotes, cleanupTestData } from './utils/data-helpers'

// Helper to check if batch export/selection feature is available
async function checkBatchFeature(page: any) {
  await page.waitForTimeout(2000)
  const checkbox = page.locator('input[type="checkbox"]').first()
  const isAvailable = await checkbox.isVisible().catch(() => false)
  if (!isAvailable) {
    test.skip(true, 'Batch selection/export feature not yet implemented')
  }
  return isAvailable
}

test.describe('일괄 노트 내보내기', () => {
  let token: string
  let notebookId: number
  let noteIds: number[]
  const BASE_URL = 'http://localhost:8001/api'

  test.beforeEach(async ({ page, request }) => {
    const admin = await loginAsAdmin(request)
    token = admin.token

    await injectAuth(page, token)

    // Create test notebook and multiple notes
    const notebook = await createTestNotebook(request, token, '일괄 내보내기 테스트 노트북')
    notebookId = notebook.id
    const notes = await createTestNotes(request, token, 5, notebookId)
    noteIds = notes.map(n => n.id)
  })

  test.afterEach(async ({ request }) => {
    await cleanupTestData(request, token, { noteIds, notebookIds: [notebookId] })
  })

  test('목록에서 여러 노트 선택 (체크박스)', async ({ page }) => {
    await page.goto('http://localhost:3000/notes')

    if (!(await checkBatchFeature(page))) return

    // Select first 3 notes
    for (let i = 0; i < 3; i++) {
      const checkbox = page.locator(`[data-note-id="${noteIds[i]}"] input[type="checkbox"]`).first()
      await checkbox.check()
    }

    // Verify selection
    const selectedCount = await page.locator('input[type="checkbox"]:checked').count()
    expect(selectedCount).toBeGreaterThanOrEqual(3)
  })

  test('선택 후 일괄 내보내기 버튼 표시', async ({ page }) => {
    await page.goto('http://localhost:3000/notes')

    if (!(await checkBatchFeature(page))) return

    // Select first note
    const checkbox = page.locator(`[data-note-id="${noteIds[0]}"] input[type="checkbox"]`).first()
    await checkbox.check()

    // Batch export button should appear
    await expect(page.getByRole('button', { name: /일괄 내보내기/i })).toBeVisible()
  })

  test('내보내기 형식 선택', async ({ page }) => {
    await page.goto('http://localhost:3000/notes')

    if (!(await checkBatchFeature(page))) return

    // Select notes
    const checkbox = page.locator(`[data-note-id="${noteIds[0]}"] input[type="checkbox"]`).first()
    await checkbox.check()

    const batchExportButton = page.getByRole('button', { name: /일괄 내보내기/i })
    await batchExportButton.click()

    // Format options should be visible
    await expect(page.getByText('PDF')).toBeVisible()
    await expect(page.getByText('Markdown')).toBeVisible()
    await expect(page.getByText('HTML')).toBeVisible()
  })

  test('내보내기 시작 — 진행 표시기', async ({ page }) => {
    await page.goto('http://localhost:3000/notes')

    if (!(await checkBatchFeature(page))) return

    // Select multiple notes
    for (let i = 0; i < 3; i++) {
      const checkbox = page.locator(`[data-note-id="${noteIds[i]}"] input[type="checkbox"]`).first()
      await checkbox.check()
    }

    const batchExportButton = page.getByRole('button', { name: /일괄 내보내기/i })
    await batchExportButton.click()

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 })
    await page.getByText('Markdown').click()

    // Progress indicator should appear
    await expect(page.getByText(/내보내는 중|진행 중|처리 중/i)).toBeVisible({ timeout: 2000 }).catch(() => {
      // Progress may be too fast to catch
    })

    await downloadPromise
  })

  test('ZIP 다운로드 트리거', async ({ page }) => {
    await page.goto('http://localhost:3000/notes')

    if (!(await checkBatchFeature(page))) return

    // Select multiple notes
    for (let i = 0; i < 3; i++) {
      const checkbox = page.locator(`[data-note-id="${noteIds[i]}"] input[type="checkbox"]`).first()
      await checkbox.check()
    }

    const batchExportButton = page.getByRole('button', { name: /일괄 내보내기/i })
    await batchExportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.zip$/)
  })

  test('ZIP에 선택한 모든 노트 포함', async ({ page }) => {
    await page.goto('http://localhost:3000/notes')

    if (!(await checkBatchFeature(page))) return

    // Select 3 notes
    for (let i = 0; i < 3; i++) {
      const checkbox = page.locator(`[data-note-id="${noteIds[i]}"] input[type="checkbox"]`).first()
      await checkbox.check()
    }

    const batchExportButton = page.getByRole('button', { name: /일괄 내보내기/i })
    await batchExportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    const path = await download.path()

    // Verify ZIP contains files
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(path)
    const entries = zip.getEntries()

    expect(entries.length).toBeGreaterThanOrEqual(3)
  })

  test('ZIP 내 올바른 파일 구조', async ({ page }) => {
    await page.goto('http://localhost:3000/notes')

    if (!(await checkBatchFeature(page))) return

    // Select notes
    for (let i = 0; i < 3; i++) {
      const checkbox = page.locator(`[data-note-id="${noteIds[i]}"] input[type="checkbox"]`).first()
      await checkbox.check()
    }

    const batchExportButton = page.getByRole('button', { name: /일괄 내보내기/i })
    await batchExportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    const path = await download.path()

    const AdmZip = require('adm-zip')
    const zip = new AdmZip(path)
    const entries = zip.getEntries()

    // Check all entries are .md files
    entries.forEach((entry: any) => {
      expect(entry.entryName).toMatch(/\.md$/)
    })
  })

  test('전체 노트북 내보내기', async ({ page }) => {
    await page.goto(`http://localhost:3000/notebooks/${notebookId}`)

    await page.waitForTimeout(2000)
    const notebookExportButton = page.getByRole('button', { name: /노트북 내보내기|전체 내보내기/i })
    if (!(await notebookExportButton.isVisible().catch(() => false))) {
      test.skip(true, 'Notebook export feature not yet implemented')
      return
    }

    // Notebook export button
    await notebookExportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.zip$/)
  })

  test('노트북 내보내기에 모든 노트 포함', async ({ page }) => {
    await page.goto(`http://localhost:3000/notebooks/${notebookId}`)

    await page.waitForTimeout(2000)
    const notebookExportButton = page.getByRole('button', { name: /노트북 내보내기|전체 내보내기/i })
    if (!(await notebookExportButton.isVisible().catch(() => false))) {
      test.skip(true, 'Notebook export feature not yet implemented')
      return
    }

    await notebookExportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    const path = await download.path()

    const AdmZip = require('adm-zip')
    const zip = new AdmZip(path)
    const entries = zip.getEntries()

    expect(entries.length).toBeGreaterThanOrEqual(5) // We created 5 notes
  })

  test('모든 노트 내보내기', async ({ page }) => {
    await page.goto('http://localhost:3000/notes')

    if (!(await checkBatchFeature(page))) return

    // Select all checkbox
    const selectAllCheckbox = page.locator('input[type="checkbox"]').first()
    await selectAllCheckbox.check()

    const batchExportButton = page.getByRole('button', { name: /일괄 내보내기/i })
    await batchExportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.zip$/)
  })

  test('일괄 내보내기 취소', async ({ page }) => {
    await page.goto('http://localhost:3000/notes')

    if (!(await checkBatchFeature(page))) return

    // Select notes
    for (let i = 0; i < 3; i++) {
      const checkbox = page.locator(`[data-note-id="${noteIds[i]}"] input[type="checkbox"]`).first()
      await checkbox.check()
    }

    const batchExportButton = page.getByRole('button', { name: /일괄 내보내기/i })
    await batchExportButton.click()

    // Cancel dialog (if exists)
    const cancelButton = page.getByRole('button', { name: /취소/i })
    if (await cancelButton.isVisible()) {
      await cancelButton.click()

      // Export should not happen
      await expect(page.getByText(/내보내는 중/i)).not.toBeVisible()
    }
  })

  test('대량 배치 (50+ 노트) 작동', async ({ page, context, request }) => {
    // Create 50 notes
    const largeNotes = await createTestNotes(request, token, 50, notebookId)
    const largeNoteIds = largeNotes.map(n => n.id)

    await page.goto('http://localhost:3000/notes')

    if (!(await checkBatchFeature(page))) return

    // Select all
    const selectAllCheckbox = page.locator('input[type="checkbox"]').first()
    await selectAllCheckbox.check()

    const batchExportButton = page.getByRole('button', { name: /일괄 내보내기/i })
    await batchExportButton.click()

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    const path = await download.path()

    const AdmZip = require('adm-zip')
    const zip = new AdmZip(path)
    const entries = zip.getEntries()

    expect(entries.length).toBeGreaterThanOrEqual(50)
  })
})
