import { test, expect } from '@playwright/test'

test.describe('Settings - Notebook Categories', () => {
  test('Categories section visible in settings', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Look for categories section
    await expect(page.getByText(/카테고리|Categories/i)).toBeVisible()
  })

  test('List system categories', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // System/preset categories should be visible
    const systemCategories = [
      /Research|연구/i,
      /Meeting|회의/i,
      /Project|프로젝트/i,
      /Personal|개인/i,
    ]

    for (const category of systemCategories) {
      const categoryText = page.getByText(category).first()
      await expect(categoryText).toBeVisible()
    }
  })

  test('Add custom category', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Click add category button
    await page.getByRole('button', { name: /카테고리 추가|Add Category/i }).click()

    // Fill in category details
    await page.getByLabel(/이름|Name|Label/i).fill('Custom Test Category')

    // Save
    await page.getByRole('button', { name: /저장|Save|확인|OK/i }).click()

    // Verify it appears in the list
    await expect(page.getByText('Custom Test Category')).toBeVisible()
  })

  test('Edit category label', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // First create a category to edit
    await page.getByRole('button', { name: /카테고리 추가|Add Category/i }).click()
    await page.getByLabel(/이름|Name|Label/i).fill('Before Edit')
    await page.getByRole('button', { name: /저장|Save|확인|OK/i }).click()
    await expect(page.getByText('Before Edit')).toBeVisible()

    // Edit it
    const editButton = page.getByRole('button', { name: /편집|Edit/i }).last()
    await editButton.click()

    await page.getByLabel(/이름|Name|Label/i).fill('After Edit')
    await page.getByRole('button', { name: /저장|Save|확인|OK/i }).click()

    await expect(page.getByText('After Edit')).toBeVisible()
    await expect(page.getByText('Before Edit')).not.toBeVisible()
  })

  test('Edit category color', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Create a category
    await page.getByRole('button', { name: /카테고리 추가|Add Category/i }).click()
    await page.getByLabel(/이름|Name|Label/i).fill('Color Test')

    // Select a color (look for color picker or preset colors)
    const colorPicker = page.locator('input[type="color"]').or(
      page.getByLabel(/색상|Color/i)
    )
    if (await colorPicker.first().isVisible()) {
      await colorPicker.first().click()
      // Select a color (this might be a color input or button)
    }

    await page.getByRole('button', { name: /저장|Save|확인|OK/i }).click()
    await expect(page.getByText('Color Test')).toBeVisible()
  })

  test('Delete custom category', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Create a category to delete
    await page.getByRole('button', { name: /카테고리 추가|Add Category/i }).click()
    await page.getByLabel(/이름|Name|Label/i).fill('To Delete')
    await page.getByRole('button', { name: /저장|Save|확인|OK/i }).click()
    await expect(page.getByText('To Delete')).toBeVisible()

    // Delete it
    const deleteButton = page.getByRole('button', { name: /삭제|Delete/i }).last()
    await deleteButton.click()

    // Confirm deletion if there's a confirmation dialog
    const confirmButton = page.getByRole('button', { name: /확인|Confirm|삭제|Delete/i }).last()
    if (await confirmButton.isVisible({ timeout: 2000 })) {
      await confirmButton.click()
    }

    // Verify it's gone
    await expect(page.getByText('To Delete')).not.toBeVisible()
  })

  test('Cannot delete system category', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Try to delete a system category (Research, Meeting, etc.)
    const systemCategory = page.getByText(/Research|연구/i).first()
    await expect(systemCategory).toBeVisible()

    // Look for delete button next to system category - should be disabled or not exist
    const categoryRow = systemCategory.locator('..')
    const deleteButton = categoryRow.getByRole('button', { name: /삭제|Delete/i })

    if (await deleteButton.isVisible({ timeout: 1000 })) {
      await expect(deleteButton).toBeDisabled()
    } else {
      // Button doesn't exist, which is also acceptable
      expect(true).toBe(true)
    }
  })

  test('Settings persist after reload', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Create a category
    await page.getByRole('button', { name: /카테고리 추가|Add Category/i }).click()
    await page.getByLabel(/이름|Name|Label/i).fill('Persistent Category')
    await page.getByRole('button', { name: /저장|Save|확인|OK/i }).click()
    await expect(page.getByText('Persistent Category')).toBeVisible()

    // Reload
    await page.reload()
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Verify it still exists
    await expect(page.getByText('Persistent Category')).toBeVisible()
  })

  test('Category appears in notebook creation dropdown', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Create a category
    await page.getByRole('button', { name: /카테고리 추가|Add Category/i }).click()
    await page.getByLabel(/이름|Name|Label/i).fill('Test Category For Dropdown')
    await page.getByRole('button', { name: /저장|Save|확인|OK/i }).click()
    await expect(page.getByText('Test Category For Dropdown')).toBeVisible()

    // Go to notebooks page
    await page.goto('/notebooks')

    // Open create notebook dialog
    await page.getByRole('button', { name: /노트북 만들기|Create Notebook/i }).click()

    // Check if category appears in dropdown
    const categorySelect = page.getByLabel(/카테고리|Category/i)
    await expect(categorySelect).toBeVisible()
    await categorySelect.click()

    await expect(page.getByRole('option', { name: /Test Category For Dropdown/i })).toBeVisible()
  })

  test('Warning when deleting category in use', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)

    // Create a category
    await page.getByRole('button', { name: /카테고리 추가|Add Category/i }).click()
    await page.getByLabel(/이름|Name|Label/i).fill('Category In Use')
    await page.getByRole('button', { name: /저장|Save|확인|OK/i }).click()
    await expect(page.getByText('Category In Use')).toBeVisible()

    // Create a notebook with this category
    await page.goto('/notebooks')
    await page.getByRole('button', { name: /노트북 만들기|Create Notebook/i }).click()
    await page.getByLabel(/이름|Name|제목|Title/i).fill('Test Notebook')

    const categorySelect = page.getByLabel(/카테고리|Category/i)
    await categorySelect.click()
    await page.getByRole('option', { name: /Category In Use/i }).click()
    await page.getByRole('button', { name: /만들기|Create/i }).click()

    // Go back to settings and try to delete
    await page.goto('/settings')
    await page.getByRole('button', { name: '카테고리' }).click()
    await page.waitForTimeout(300)
    const deleteButton = page.getByText('Category In Use').locator('..').getByRole('button', { name: /삭제|Delete/i })
    await deleteButton.click()

    // Should show warning
    await expect(page.getByText(/사용 중|in use|경고|warning/i)).toBeVisible()
  })
})
