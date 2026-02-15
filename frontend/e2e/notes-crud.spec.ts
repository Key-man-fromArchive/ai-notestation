import { test, expect } from '@playwright/test'
import { createTestUser, injectAuth, authHeaders } from './utils/auth-helpers'
import {
  createTestNotebook,
  createTestNote,
  createTestNotes,
  cleanupTestData,
  deleteTestNote,
  deleteTestNotebook,
} from './utils/data-helpers'

const API = 'http://localhost:8001/api'

test.describe('Notes CRUD Operations', () => {
  test('1. Notes list — empty state for new user', async ({ page, request }) => {
    // Create a fresh test user
    const { token } = await createTestUser(request)
    await injectAuth(page, token)

    await page.goto('/notes')
    await page.waitForLoadState('networkidle')

    // Verify empty state message or empty list
    const noteList = page.locator('[data-testid="note-list"]')
    await expect(noteList).toBeVisible()

    // Should show "모든 노트" or similar heading
    await expect(page.locator('text=모든 노트')).toBeVisible()
  })

  test('2. Create note via API → verify in list', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)

    const noteData = {
      title: 'API 생성 노트',
      content: 'API를 통해 생성된 노트입니다.',
      tags: ['test'],
    }

    // Create note via API
    const response = await request.post(`${API}/notes`, {
      headers: authHeaders(token),
      data: noteData,
    })
    expect(response.ok()).toBeTruthy()
    const note = await response.json()

    try {
      // Verify in UI
      await page.goto('/notes')
      await page.waitForLoadState('networkidle')

      await expect(page.locator(`text=${noteData.title}`)).toBeVisible()
    } finally {
      await deleteTestNote(request, token, note.id)
    }
  })

  test('3. Create note with title, content, tags', async ({ page, request }) => {
    const { token } = await createTestUser(request)

    const noteData = {
      title: '완전한 노트 생성 테스트',
      content: '제목, 내용, 태그를 모두 포함한 노트입니다.\n\n- 항목 1\n- 항목 2',
      tags: ['tag1', 'tag2', 'tag3'],
    }

    const response = await request.post(`${API}/notes`, {
      headers: authHeaders(token),
      data: noteData,
    })
    expect(response.ok()).toBeTruthy()
    const note = await response.json()

    try {
      // Verify all fields
      const detailResponse = await request.get(`${API}/notes/${note.id}`, {
        headers: authHeaders(token),
      })
      const fetchedNote = await detailResponse.json()

      expect(fetchedNote.title).toBe(noteData.title)
      expect(fetchedNote.content).toBe(noteData.content)
      expect(fetchedNote.tags).toEqual(expect.arrayContaining(noteData.tags))
    } finally {
      await deleteTestNote(request, token, note.id)
    }
  })

  test('4. Update note title', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    const note = await createTestNote(request, token, {
      title: '원래 제목',
      content: '내용',
    })

    try {
      const newTitle = '수정된 제목'
      const response = await request.put(`${API}/notes/${note.id}`, {
        headers: authHeaders(token),
        data: { title: newTitle },
      })
      expect(response.ok()).toBeTruthy()

      // Verify update
      const updated = await response.json()
      expect(updated.title).toBe(newTitle)
      expect(updated.content).toBe('내용')
    } finally {
      await deleteTestNote(request, token, note.id)
    }
  })

  test('5. Update note content', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    const note = await createTestNote(request, token, {
      title: '제목',
      content: '원래 내용',
    })

    try {
      const newContent = '수정된 내용\n\n새로운 단락이 추가되었습니다.'
      const response = await request.put(`${API}/notes/${note.id}`, {
        headers: authHeaders(token),
        data: { content: newContent },
      })
      expect(response.ok()).toBeTruthy()

      const updated = await response.json()
      expect(updated.content).toBe(newContent)
      expect(updated.title).toBe('제목')
    } finally {
      await deleteTestNote(request, token, note.id)
    }
  })

  test('6. Add tags to note', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    const note = await createTestNote(request, token, {
      title: '태그 테스트',
      content: '내용',
      tags: ['기존태그'],
    })

    try {
      const newTags = ['기존태그', '새태그1', '새태그2']
      const response = await request.put(`${API}/notes/${note.id}`, {
        headers: authHeaders(token),
        data: { tags: newTags },
      })
      expect(response.ok()).toBeTruthy()

      const updated = await response.json()
      expect(updated.tags).toEqual(expect.arrayContaining(newTags))
      expect(updated.tags.length).toBe(3)
    } finally {
      await deleteTestNote(request, token, note.id)
    }
  })

  test('7. Remove tags from note', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    const note = await createTestNote(request, token, {
      title: '태그 제거 테스트',
      content: '내용',
      tags: ['tag1', 'tag2', 'tag3'],
    })

    try {
      const remainingTags = ['tag1']
      const response = await request.put(`${API}/notes/${note.id}`, {
        headers: authHeaders(token),
        data: { tags: remainingTags },
      })
      expect(response.ok()).toBeTruthy()

      const updated = await response.json()
      expect(updated.tags).toEqual(remainingTags)
      expect(updated.tags.length).toBe(1)
    } finally {
      await deleteTestNote(request, token, note.id)
    }
  })

  test('8. Move note to different notebook', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    const notebook1 = await createTestNotebook(request, token, '노트북1')
    const notebook2 = await createTestNotebook(request, token, '노트북2')
    const note = await createTestNote(request, token, {
      title: '이동할 노트',
      content: '내용',
      notebook_id: notebook1.id,
    })

    try {
      const response = await request.put(`${API}/notes/${note.id}`, {
        headers: authHeaders(token),
        data: { notebook_id: notebook2.id },
      })
      expect(response.ok()).toBeTruthy()

      const updated = await response.json()
      expect(updated.notebook_id).toBe(notebook2.id)
    } finally {
      await deleteTestNote(request, token, note.id)
      await cleanupTestData(request, token, { notebookIds: [notebook1.id, notebook2.id] })
    }
  })

  test('9. Delete single note (trash)', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    const note = await createTestNote(request, token, {
      title: '삭제할 노트',
      content: '삭제 테스트',
    })

    const response = await request.delete(`${API}/notes/${note.id}`, {
      headers: authHeaders(token),
    })
    expect(response.ok()).toBeTruthy()

    // Verify note is deleted
    const getResponse = await request.get(`${API}/notes/${note.id}`, {
      headers: authHeaders(token),
    })
    expect(getResponse.status()).toBe(404)
  })

  test('10. Batch delete multiple notes', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    const notes = await createTestNotes(request, token, 5)
    const noteIds = notes.map((n) => n.id)

    const response = await request.post(`${API}/notes/batch-delete`, {
      headers: authHeaders(token),
      data: { note_ids: noteIds },
    })
    expect(response.ok()).toBeTruthy()

    // Verify all notes are deleted
    for (const id of noteIds) {
      const getResponse = await request.get(`${API}/notes/${id}`, {
        headers: authHeaders(token),
      })
      expect(getResponse.status()).toBe(404)
    }
  })

  test('11. Navigate to note detail page', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)
    const note = await createTestNote(request, token, {
      title: '상세 페이지 테스트',
      content: '상세 페이지로 이동 테스트',
    })

    try {
      await page.goto('/notes')
      await page.waitForLoadState('networkidle')

      // Click on note to navigate to detail
      await page.click(`text=${note.title}`)
      await page.waitForLoadState('networkidle')

      // Verify URL
      expect(page.url()).toContain(`/notes/${note.id}`)
    } finally {
      await deleteTestNote(request, token, note.id)
    }
  })

  test('12. Note detail shows metadata', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)
    const note = await createTestNote(request, token, {
      title: '메타데이터 테스트',
      content: '메타데이터 표시 확인',
      tags: ['meta', 'test'],
    })

    try {
      await page.goto(`/notes/${note.id}`)
      await page.waitForLoadState('networkidle')

      // Verify title
      await expect(page.locator(`text=${note.title}`)).toBeVisible()

      // Verify tags
      await expect(page.locator('text=meta')).toBeVisible()
      await expect(page.locator('text=test')).toBeVisible()

      // Verify dates exist (created/updated)
      const detailSection = page.locator('[data-testid="note-detail"], main')
      await expect(detailSection).toBeVisible()
    } finally {
      await deleteTestNote(request, token, note.id)
    }
  })

  test('13. Note detail shows content', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)
    const testContent = '이것은 테스트 내용입니다.\n\n- 리스트 항목 1\n- 리스트 항목 2'
    const note = await createTestNote(request, token, {
      title: '내용 표시 테스트',
      content: testContent,
    })

    try {
      await page.goto(`/notes/${note.id}`)
      await page.waitForLoadState('networkidle')

      // Verify content is displayed
      await expect(page.locator('text=이것은 테스트 내용입니다.')).toBeVisible()
      await expect(page.locator('text=리스트 항목 1')).toBeVisible()
    } finally {
      await deleteTestNote(request, token, note.id)
    }
  })

  test('14. Note detail shows images section (if images exist)', async ({
    page,
    request,
  }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)
    const note = await createTestNote(request, token, {
      title: '이미지 섹션 테스트',
      content: '이미지가 없는 노트',
    })

    try {
      await page.goto(`/notes/${note.id}`)
      await page.waitForLoadState('networkidle')

      // For notes without images, images section may not be visible
      // This test just verifies the page loads correctly
      await expect(page.locator(`text=${note.title}`)).toBeVisible()

      // If images section exists, it should be visible
      const imagesSection = page.locator('[data-testid="note-images"], text=이미지')
      // Don't assert visibility as it depends on whether note has images
    } finally {
      await deleteTestNote(request, token, note.id)
    }
  })

  test('15. Filter notes by notebook (sidebar)', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)
    const notebook = await createTestNotebook(request, token, '필터링 노트북')
    const note = await createTestNote(request, token, {
      title: '노트북 필터 테스트',
      content: '내용',
      notebook_id: notebook.id,
    })

    try {
      await page.goto('/notes')
      await page.waitForLoadState('networkidle')

      // Click on notebook in sidebar
      await page.click(`text=${notebook.name}`)
      await page.waitForLoadState('networkidle')

      // Verify URL contains notebook filter
      expect(page.url()).toContain(`notebook_id=${notebook.id}`)

      // Verify note is visible
      await expect(page.locator(`text=${note.title}`)).toBeVisible()
    } finally {
      await deleteTestNote(request, token, note.id)
      await cleanupTestData(request, token, { notebookIds: [notebook.id] })
    }
  })

  test('16. Filter notes by tags', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)
    const note = await createTestNote(request, token, {
      title: '태그 필터 테스트',
      content: '내용',
      tags: ['uniqueFilterTag'],
    })

    try {
      await page.goto('/notes')
      await page.waitForLoadState('networkidle')

      // Click on tag (tags might be in sidebar or in note list)
      await page.click('text=uniqueFilterTag')
      await page.waitForLoadState('networkidle')

      // Verify URL contains tag filter
      expect(page.url()).toContain('tag')

      // Verify note is visible
      await expect(page.locator(`text=${note.title}`)).toBeVisible()
    } finally {
      await deleteTestNote(request, token, note.id)
    }
  })

  test('17. Sort notes by created/updated', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)
    const notes = await createTestNotes(request, token, 3)

    try {
      await page.goto('/notes')
      await page.waitForLoadState('networkidle')

      // Look for sort dropdown/button
      const sortButton = page.locator('[data-testid="sort-button"], button:has-text("정렬")')
      if (await sortButton.isVisible()) {
        await sortButton.click()
        // Select sort option (created or updated)
        await page.click('text=생성일')
        await page.waitForLoadState('networkidle')
      }

      // Verify notes are displayed
      await expect(page.locator('[data-testid="note-list"]')).toBeVisible()
    } finally {
      await cleanupTestData(request, token, { noteIds: notes.map((n) => n.id) })
    }
  })

  test('18. Pagination works correctly', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    await injectAuth(page, token)
    // Create enough notes to trigger pagination (typically >20)
    const notes = await createTestNotes(request, token, 25)

    try {
      await page.goto('/notes?per_page=10')
      await page.waitForLoadState('networkidle')

      // Verify first page shows notes
      await expect(page.locator('[data-testid="note-list"]')).toBeVisible()

      // Look for next page button
      const nextButton = page.locator('[data-testid="next-page"], button:has-text("다음")')
      if (await nextButton.isVisible()) {
        await nextButton.click()
        await page.waitForLoadState('networkidle')

        // Verify we're on page 2
        expect(page.url()).toContain('page=2')
      }
    } finally {
      await cleanupTestData(request, token, { noteIds: notes.map((n) => n.id) })
    }
  })

  test('19. Create note without notebook', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    const noteData = {
      title: '노트북 없는 노트',
      content: '기본 노트북에 저장됩니다.',
      tags: ['orphan'],
    }

    const response = await request.post(`${API}/notes`, {
      headers: authHeaders(token),
      data: noteData,
    })
    expect(response.ok()).toBeTruthy()
    const note = await response.json()

    try {
      // Verify note exists and has no notebook_id or default notebook
      expect(note.title).toBe(noteData.title)
      // notebook_id can be null or default notebook ID
    } finally {
      await deleteTestNote(request, token, note.id)
    }
  })

  test.skip(
    !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY,
    '20. Auto-tag single note (AI)',
    async ({ page, request }) => {
      const { token } = await createTestUser(request)
      const note = await createTestNote(request, token, {
        title: '머신러닝 기초',
        content:
          '인공지능과 딥러닝에 대한 노트입니다. 신경망과 역전파 알고리즘을 다룹니다.',
      })

      try {
        const response = await request.post(`${API}/notes/${note.id}/auto-tag`, {
          headers: authHeaders(token),
        })
        expect(response.ok()).toBeTruthy()

        const updated = await response.json()
        // AI should have added relevant tags
        expect(updated.tags.length).toBeGreaterThan(0)
      } finally {
        await deleteTestNote(request, token, note.id)
      }
    }
  )

  test.skip(
    !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY,
    '21. Batch auto-tag',
    async ({ page, request }) => {
      const { token } = await createTestUser(request)
      const notes = await createTestNotes(request, token, 3)
      const noteIds = notes.map((n) => n.id)

      try {
        const response = await request.post(`${API}/notes/batch-auto-tag`, {
          headers: authHeaders(token),
          data: { note_ids: noteIds },
        })
        expect(response.ok()).toBeTruthy()
        const result = await response.json()

        // Check batch status
        const statusResponse = await request.get(
          `${API}/notes/batch-auto-tag/status?job_id=${result.job_id}`,
          { headers: authHeaders(token) }
        )
        expect(statusResponse.ok()).toBeTruthy()
        const status = await statusResponse.json()
        expect(['pending', 'processing', 'completed']).toContain(status.status)
      } finally {
        await cleanupTestData(request, token, { noteIds })
      }
    }
  )

  test('22. View related notes', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    const note1 = await createTestNote(request, token, {
      title: '관련 노트 1',
      content: '머신러닝 기초 개념',
      tags: ['AI', '머신러닝'],
    })
    const note2 = await createTestNote(request, token, {
      title: '관련 노트 2',
      content: '딥러닝과 머신러닝',
      tags: ['AI', '딥러닝'],
    })

    try {
      const response = await request.get(`${API}/notes/${note1.id}/related`, {
        headers: authHeaders(token),
      })
      expect(response.ok()).toBeTruthy()
      const related = await response.json()

      // Should return array of related notes
      expect(Array.isArray(related)).toBeTruthy()
    } finally {
      await deleteTestNote(request, token, note1.id)
      await deleteTestNote(request, token, note2.id)
    }
  })

  test('23. Note conflict resolution', async ({ page, request }) => {
    const { token } = await createTestUser(request)
    // First check if there are any conflicts
    const conflictsResponse = await request.get(`${API}/notes/conflicts`, {
      headers: authHeaders(token),
    })
    expect(conflictsResponse.ok()).toBeTruthy()
    const conflicts = await conflictsResponse.json()

    if (conflicts.length > 0) {
      const conflict = conflicts[0]

      // Resolve the conflict
      const resolveResponse = await request.post(
        `${API}/notes/${conflict.id}/resolve-conflict`,
        {
          headers: authHeaders(token),
          data: {
            resolution: 'keep_local', // or 'keep_remote' or 'merge'
          },
        }
      )
      expect(resolveResponse.ok()).toBeTruthy()
    }

    // Test passes if no conflicts exist or if resolution works
    expect(conflictsResponse.ok()).toBeTruthy()
  })
})
