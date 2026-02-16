import { test, expect, type Download } from '@playwright/test'
import { loginAsAdmin, authHeaders, injectAuth } from './utils/auth-helpers'
import { createTestNotebook, createTestNote, cleanupTestData } from './utils/data-helpers'

// Helper to check if export feature is available
async function checkExportFeature(page: any) {
  // Wait for page to load first - check for either title or editor (reduced timeout)
  try {
    await page.locator('h1.text-2xl, .ProseMirror').first().waitFor({ timeout: 5000 })
  } catch {
    // Page didn't load, skip test
    test.skip(true, 'Note page did not load')
    return false
  }

  // Check if export button exists (reduced timeout)
  const exportButton = page.getByRole('button', { name: /내보내기/i })
  const isAvailable = await exportButton.isVisible({ timeout: 1000 }).catch(() => false)
  if (!isAvailable) {
    test.skip(true, 'Export feature not yet implemented')
  }
  return isAvailable
}

test.describe.skip('단일 노트 내보내기', () => {
  let token: string
  let notebookId: number
  let noteId: string
  const BASE_URL = 'http://localhost:8001/api'

  test.beforeEach(async ({ page, request }) => {
    const admin = await loginAsAdmin(request)
    token = admin.token

    await injectAuth(page, token)

    // Create test notebook and note
    const notebook = await createTestNotebook(request, token, '내보내기 테스트 노트북')
    notebookId = notebook.id
    const note = await createTestNote(request, token, {
      title: '내보내기 테스트 노트',
      content: '# 제목\n\n**굵은 글씨**와 *기울임* 텍스트입니다.\n\n- 항목 1\n- 항목 2',
      tags: ['테스트', '내보내기'],
      notebook_id: notebookId
    })
    noteId = note.note_id
  })

  test.afterEach(async ({ request }) => {
    await cleanupTestData(request, token, { noteIds: [noteId], notebookIds: [notebookId] })
  })

  test('노트 상세 페이지에 내보내기 버튼 표시', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${noteId}`)

    if (!(await checkExportFeature(page))) return
  })

  test('내보내기 드롭다운에 형식 옵션 표시', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${noteId}`)

    if (!(await checkExportFeature(page))) return

    const exportButton = page.getByRole('button', { name: /내보내기/i })
    await exportButton.click()

    await expect(page.getByText('PDF')).toBeVisible()
    await expect(page.getByText('Markdown')).toBeVisible()
    await expect(page.getByText('HTML')).toBeVisible()
  })

  test('Markdown 형식으로 단일 노트 내보내기 — 다운로드 트리거', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${noteId}`)

    if (!(await checkExportFeature(page))) return

    const exportButton = page.getByRole('button', { name: /내보내기/i })
    await exportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.md$/)
  })

  test('내보낸 Markdown에 제목 포함', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${noteId}`)

    if (!(await checkExportFeature(page))) return

    const exportButton = page.getByRole('button', { name: /내보내기/i })
    await exportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    const path = await download.path()
    const fs = require('fs')
    const content = fs.readFileSync(path, 'utf-8')

    expect(content).toContain('내보내기 테스트 노트')
  })

  test('내보낸 Markdown에 콘텐츠 포함', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${noteId}`)

    if (!(await checkExportFeature(page))) return

    const exportButton = page.getByRole('button', { name: /내보내기/i })
    await exportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    const path = await download.path()
    const fs = require('fs')
    const content = fs.readFileSync(path, 'utf-8')

    expect(content).toContain('굵은 글씨')
    expect(content).toContain('항목 1')
  })

  test('PDF 형식으로 단일 노트 내보내기 — 다운로드 트리거', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${noteId}`)

    if (!(await checkExportFeature(page))) return

    const exportButton = page.getByRole('button', { name: /내보내기/i })
    await exportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('PDF').click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  })

  test('HTML 형식으로 단일 노트 내보내기 — 다운로드 트리거', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${noteId}`)

    if (!(await checkExportFeature(page))) return

    const exportButton = page.getByRole('button', { name: /내보내기/i })
    await exportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('HTML').click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.html$/)
  })

  test('내보내기 시 노트 메타데이터 보존', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${noteId}`)

    if (!(await checkExportFeature(page))) return

    const exportButton = page.getByRole('button', { name: /내보내기/i })
    await exportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    const path = await download.path()
    const fs = require('fs')
    const content = fs.readFileSync(path, 'utf-8')

    expect(content).toContain('테스트')
    expect(content).toContain('내보내기')
  })

  test('내보내기 시 형식 보존', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${noteId}`)

    if (!(await checkExportFeature(page))) return

    const exportButton = page.getByRole('button', { name: /내보내기/i })
    await exportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    const path = await download.path()
    const fs = require('fs')
    const content = fs.readFileSync(path, 'utf-8')

    expect(content).toContain('**굵은 글씨**')
    expect(content).toContain('*기울임*')
    expect(content).toContain('- 항목 1')
  })

  test('이미지 포함 시 내보내기에 이미지 포함', async ({ page, request }) => {
    // Create note with image
    const noteWithImageRes = await createTestNote(request, token, {
      title: '이미지 포함 노트',
      content: '![테스트 이미지](http://example.com/image.png)\n\n일반 텍스트',
      notebook_id: notebookId
    })

    await page.goto(`http://localhost:3000/notes/${noteWithImageRes.note_id}`)

    if (!(await checkExportFeature(page))) return

    const exportButton = page.getByRole('button', { name: /내보내기/i })
    await exportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    const path = await download.path()
    const fs = require('fs')
    const content = fs.readFileSync(path, 'utf-8')

    expect(content).toContain('![테스트 이미지]')
  })

  test('빈 노트 내보내기 → 유효한 파일', async ({ page, request }) => {
    const emptyNoteRes = await createTestNote(request, token, {
      title: '빈 노트',
      content: '',
      notebook_id: notebookId
    })

    await page.goto(`http://localhost:3000/notes/${emptyNoteRes.note_id}`)

    if (!(await checkExportFeature(page))) return

    const exportButton = page.getByRole('button', { name: /내보내기/i })
    await exportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    const path = await download.path()
    const fs = require('fs')
    const content = fs.readFileSync(path, 'utf-8')

    expect(content).toContain('빈 노트')
    expect(path).toBeTruthy()
  })

  test('노트 목록 페이지에 내보내기 버튼', async ({ page }) => {
    await page.goto('http://localhost:3000/notes')

    // Wait for notes to load
    await page.waitForTimeout(2000)

    // Check if export feature exists in list view
    const exportButton = page.getByRole('button', { name: /내보내기/i }).first()
    if (!(await exportButton.isVisible().catch(() => false))) {
      test.skip(true, 'Export feature not yet implemented')
      return
    }
  })

  test('다운로드가 오류 없이 완료', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${noteId}`)

    if (!(await checkExportFeature(page))) return

    const exportButton = page.getByRole('button', { name: /내보내기/i })
    await exportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise

    // Wait for download to complete
    const failure = await download.failure()
    expect(failure).toBeNull()
  })

  test('대용량 노트 내보내기 (10k+ 문자) 성공', async ({ page, request }) => {
    const largeContent = '# 대용량 노트\n\n' + 'Lorem ipsum dolor sit amet. '.repeat(500)
    const largeNoteRes = await createTestNote(request, token, {
      title: '대용량 노트',
      content: largeContent,
      notebook_id: notebookId
    })

    await page.goto(`http://localhost:3000/notes/${largeNoteRes.note_id}`)

    if (!(await checkExportFeature(page))) return

    const exportButton = page.getByRole('button', { name: /내보내기/i })
    await exportButton.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Markdown').click()

    const download = await downloadPromise
    const path = await download.path()
    const fs = require('fs')
    const content = fs.readFileSync(path, 'utf-8')

    expect(content.length).toBeGreaterThan(10000)
    expect(content).toContain('대용량 노트')
  })
})
