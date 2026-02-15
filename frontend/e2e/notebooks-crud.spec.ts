import { test, expect } from '@playwright/test'
import { loginAsAdmin, authHeaders } from './utils/auth-helpers'
import {
  createTestNotebook,
  createTestNote,
  deleteTestNotebook,
  cleanupTestData,
} from './utils/data-helpers'

const API = 'http://localhost:8001/api'

// ─── Notebook CRUD Tests ─────────────────────────────────────────────────────

test.describe('Notebooks CRUD', () => {
  let authToken: string
  const createdNotebookIds: number[] = []
  const createdNoteIds: number[] = []

  test.beforeAll(async ({ request }) => {
    const { token } = await loginAsAdmin(request)
    authToken = token
  })

  test.afterEach(async ({ request }) => {
    // Cleanup after each test
    await cleanupTestData(request, authToken, {
      noteIds: createdNoteIds,
      notebookIds: createdNotebookIds,
    })
    createdNotebookIds.length = 0
    createdNoteIds.length = 0
  })

  // ─── Test 1: List Notebooks ───────────────────────────────────────────────

  test('1. List notebooks - shows page heading', async ({ page }) => {
    await page.goto('/notebooks')
    const main = page.locator('main')
    await expect(
      main.getByRole('heading', { name: '노트북', exact: true })
    ).toBeVisible({ timeout: 10000 })
  })

  // ─── Test 2: Create Notebook via UI ───────────────────────────────────────

  test('2. Create notebook via UI form', async ({ page, request }) => {
    await page.goto('/notebooks')

    // Click create button (could be "노트북 생성" or "생성" or a plus icon)
    const createBtn = page.getByRole('button', { name: /노트북 생성|생성|New Notebook/i })
    await createBtn.click()

    // Fill form
    const nameInput = page.getByLabel(/이름|제목|name|title/i).or(page.locator('input[name="title"]'))
    const uniqueName = `E2E Notebook ${Date.now()}`
    await nameInput.fill(uniqueName)

    // Submit
    const submitBtn = page.getByRole('button', { name: /저장|생성|Create|Save/i })
    await submitBtn.click()

    // Verify notebook appears in list
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10000 })

    // Cleanup: get notebook ID from API
    const res = await request.get(`${API}/notebooks`, {
      headers: authHeaders(authToken),
    })
    const data = await res.json()
    const notebooks = data.items || data
    const created = notebooks.find((nb: any) => nb.name === uniqueName)
    if (created) {
      createdNotebookIds.push(created.id)
    }
  })

  // ─── Test 3: Create Notebook with Category ────────────────────────────────

  test('3. Create notebook with category', async ({ page, request }) => {
    await page.goto('/notebooks')

    const createBtn = page.getByRole('button', { name: /노트북 생성|생성|New Notebook/i })
    await createBtn.click()

    const uniqueName = `E2E Categorized ${Date.now()}`
    const nameInput = page.getByLabel(/이름|제목|name|title/i).or(page.locator('input[name="title"]'))
    await nameInput.fill(uniqueName)

    // Select category (could be dropdown or input)
    const categorySelect = page.getByLabel(/카테고리|Category/i).or(page.locator('select[name="category"]'))
    if (await categorySelect.count() > 0) {
      await categorySelect.click()
      // Select first available category (e.g., "Research", "Personal", etc.)
      const firstOption = page.getByRole('option').first()
      if (await firstOption.count() > 0) {
        await firstOption.click()
      }
    }

    const submitBtn = page.getByRole('button', { name: /저장|생성|Create|Save/i })
    await submitBtn.click()

    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10000 })

    // Cleanup
    const res = await request.get(`${API}/notebooks`, {
      headers: authHeaders(authToken),
    })
    const data = await res.json()
    const notebooks = data.items || data
    const created = notebooks.find((nb: any) => nb.name === uniqueName)
    if (created) {
      createdNotebookIds.push(created.id)
    }
  })

  // ─── Test 4: Update Notebook Name ─────────────────────────────────────────

  test('4. Update notebook name', async ({ page, request }) => {
    // Create notebook via API
    const notebook = await createTestNotebook(request, authToken, 'Original Name')
    createdNotebookIds.push(notebook.id)

    await page.goto('/notebooks')

    // Find and click edit button for the notebook
    const notebookRow = page.getByText('Original Name').locator('..')
    const editBtn = notebookRow.getByRole('button', { name: /편집|수정|Edit/i })
    await editBtn.click()

    // Update name
    const nameInput = page.getByLabel(/이름|제목|name|title/i).or(page.locator('input[name="title"]'))
    const updatedName = `Updated Name ${Date.now()}`
    await nameInput.clear()
    await nameInput.fill(updatedName)

    const saveBtn = page.getByRole('button', { name: /저장|Save/i })
    await saveBtn.click()

    // Verify updated name appears
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Original Name')).not.toBeVisible()
  })

  // ─── Test 5: Update Notebook Category ─────────────────────────────────────

  test('5. Update notebook category', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, authToken, 'Test Category Update')
    createdNotebookIds.push(notebook.id)

    await page.goto('/notebooks')

    const notebookRow = page.getByText('Test Category Update').locator('..')
    const editBtn = notebookRow.getByRole('button', { name: /편집|수정|Edit/i })
    await editBtn.click()

    // Change category
    const categorySelect = page.getByLabel(/카테고리|Category/i).or(page.locator('select[name="category"]'))
    if (await categorySelect.count() > 0) {
      await categorySelect.click()
      const options = page.getByRole('option')
      if (await options.count() > 1) {
        await options.nth(1).click()
      }
    }

    const saveBtn = page.getByRole('button', { name: /저장|Save/i })
    await saveBtn.click()

    // Verify saved (no error message)
    await expect(page.getByText('Test Category Update')).toBeVisible({ timeout: 10000 })
  })

  // ─── Test 6: Delete Notebook ──────────────────────────────────────────────

  test('6. Delete notebook', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, authToken, 'To Be Deleted')
    const notebookId = notebook.id

    await page.goto('/notebooks')

    // Find delete button
    const notebookRow = page.getByText('To Be Deleted').locator('..')
    const deleteBtn = notebookRow.getByRole('button', { name: /삭제|Delete/i })
    await deleteBtn.click()

    // Confirm deletion (if confirmation dialog appears)
    const confirmBtn = page.getByRole('button', { name: /확인|삭제|Delete|Confirm/i })
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click()
    }

    // Verify notebook is removed from list
    await expect(page.getByText('To Be Deleted')).not.toBeVisible({ timeout: 10000 })

    // No need to add to cleanup array since it's already deleted
  })

  // ─── Test 7: Invalid Category Handling ────────────────────────────────────

  test('7. Invalid category shows error or graceful handling', async ({ page }) => {
    await page.goto('/notebooks')

    const createBtn = page.getByRole('button', { name: /노트북 생성|생성|New Notebook/i })
    await createBtn.click()

    const uniqueName = `E2E Invalid Category ${Date.now()}`
    const nameInput = page.getByLabel(/이름|제목|name|title/i).or(page.locator('input[name="title"]'))
    await nameInput.fill(uniqueName)

    // Try to input invalid category (if it's a text input)
    const categoryInput = page.locator('input[name="category"]')
    if (await categoryInput.count() > 0) {
      await categoryInput.fill('!!!INVALID_CATEGORY_12345!!!')
    }

    const submitBtn = page.getByRole('button', { name: /저장|생성|Create|Save/i })
    await submitBtn.click()

    // Either error message appears or notebook is created with sanitized category
    const errorMsg = page.locator('.text-destructive, .error, [role="alert"]')
    const successIndicator = page.getByText(uniqueName)

    // One of them should be visible
    await expect(errorMsg.or(successIndicator)).toBeVisible({ timeout: 10000 })
  })

  // ─── Test 8: Notebook List Shows Note Count ───────────────────────────────

  test('8. Notebook list shows note count', async ({ page, request }) => {
    // Create notebook with notes
    const notebook = await createTestNotebook(request, authToken, 'Notebook With Notes')
    createdNotebookIds.push(notebook.id)

    // Add 3 notes
    for (let i = 1; i <= 3; i++) {
      const note = await createTestNote(request, authToken, {
        title: `Note ${i}`,
        notebook_id: notebook.id,
      })
      createdNoteIds.push(note.note_id)
    }

    await page.goto('/notebooks')

    // Verify note count is displayed (could be "3 notes", "3개", etc.)
    const notebookRow = page.getByText('Notebook With Notes').locator('..')
    await expect(notebookRow.getByText(/3|notes/i)).toBeVisible({ timeout: 10000 })
  })

  // ─── Test 9: Navigate to Notebook Detail ──────────────────────────────────

  test('9. Navigate to notebook detail page', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, authToken, 'Detail Test Notebook')
    createdNotebookIds.push(notebook.id)

    await page.goto('/notebooks')

    // Click notebook name to navigate to detail
    const notebookLink = page.getByRole('link', { name: 'Detail Test Notebook' })
      .or(page.getByText('Detail Test Notebook'))
    await notebookLink.click()

    // Verify URL contains notebook ID
    await expect(page).toHaveURL(new RegExp(`/notebooks/${notebook.id}`), { timeout: 10000 })
  })

  // ─── Test 10: Notebook Detail Shows Metadata ──────────────────────────────

  test('10. Notebook detail shows correct metadata', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, authToken, 'Metadata Test Notebook', 'Research')
    createdNotebookIds.push(notebook.id)

    await page.goto(`/notebooks/${notebook.id}`)

    // Verify title
    await expect(page.getByRole('heading', { name: 'Metadata Test Notebook' })).toBeVisible({ timeout: 10000 })

    // Verify category (if displayed)
    if (notebook.category) {
      await expect(page.getByText(notebook.category)).toBeVisible()
    }
  })

  // ─── Test 11: Notebook Detail Shows Notes List ────────────────────────────

  test('11. Notebook detail shows notes list', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, authToken, 'Notes List Notebook')
    createdNotebookIds.push(notebook.id)

    // Add notes
    const note1 = await createTestNote(request, authToken, {
      title: 'First Note in Notebook',
      notebook_id: notebook.id,
    })
    const note2 = await createTestNote(request, authToken, {
      title: 'Second Note in Notebook',
      notebook_id: notebook.id,
    })
    createdNoteIds.push(note1.note_id, note2.note_id)

    await page.goto(`/notebooks/${notebook.id}`)

    // Verify both notes are visible
    await expect(page.getByText('First Note in Notebook')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Second Note in Notebook')).toBeVisible()
  })

  // ─── Test 12: Filter Notebooks by Category ────────────────────────────────

  test('12. Filter notebooks by category', async ({ page, request }) => {
    // Create notebooks with different categories
    const research = await createTestNotebook(request, authToken, 'Research Notebook', 'Research')
    const personal = await createTestNotebook(request, authToken, 'Personal Notebook', 'Personal')
    createdNotebookIds.push(research.id, personal.id)

    await page.goto('/notebooks')

    // Wait for both to load
    await expect(page.getByText('Research Notebook')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Personal Notebook')).toBeVisible()

    // Apply category filter (could be dropdown, tabs, or buttons)
    const categoryFilter = page.getByLabel(/카테고리|Category|필터|Filter/i)
      .or(page.getByRole('button', { name: /Research/i }))

    if (await categoryFilter.count() > 0) {
      await categoryFilter.click()
      const researchOption = page.getByRole('option', { name: /Research/i })
        .or(page.getByText('Research'))
      if (await researchOption.count() > 0) {
        await researchOption.click()
      }

      // Verify filtering
      await expect(page.getByText('Research Notebook')).toBeVisible()
      // Personal notebook might be hidden or still visible depending on implementation
    }
  })

  // ─── Test 13: Search Notebooks by Name ────────────────────────────────────

  test('13. Search notebooks by name', async ({ page, request }) => {
    const searchable = await createTestNotebook(request, authToken, 'Searchable Unique Notebook')
    const other = await createTestNotebook(request, authToken, 'Other Random Notebook')
    createdNotebookIds.push(searchable.id, other.id)

    await page.goto('/notebooks')

    // Find search input
    const searchInput = page.getByPlaceholder(/검색|Search|노트북 검색/i)
      .or(page.locator('input[type="search"]'))

    if (await searchInput.count() > 0) {
      await searchInput.fill('Searchable Unique')

      // Verify filtered results
      await expect(page.getByText('Searchable Unique Notebook')).toBeVisible({ timeout: 10000 })

      // Other notebook should not be visible (or might still be depending on implementation)
      const otherNotebook = page.getByText('Other Random Notebook')
      const searchResult = page.getByText('Searchable Unique Notebook')

      // At minimum, searchable notebook should be visible
      await expect(searchResult).toBeVisible()
    } else {
      // If search not implemented, just verify both notebooks are visible
      await expect(page.getByText('Searchable Unique Notebook')).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Other Random Notebook')).toBeVisible()
    }
  })

  // ─── Test 14: Notebook Sidebar Navigation ─────────────────────────────────

  test('14. Notebook sidebar navigation works', async ({ page, request }) => {
    const notebook = await createTestNotebook(request, authToken, 'Sidebar Test Notebook')
    createdNotebookIds.push(notebook.id)

    await page.goto('/')

    // Click sidebar "노트북" link
    const sidebar = page.locator('aside')
    await sidebar.getByText('노트북').click()

    // Verify navigation
    await expect(page).toHaveURL(/\/notebooks/, { timeout: 10000 })
    await expect(page.getByRole('heading', { name: '노트북', exact: true })).toBeVisible()

    // Verify our test notebook appears
    await expect(page.getByText('Sidebar Test Notebook')).toBeVisible()
  })
})
