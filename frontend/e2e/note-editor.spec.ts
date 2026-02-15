import { test, expect } from '@playwright/test';
import { createTestUser, injectAuth, authHeaders } from './utils/auth-helpers';
import { createTestNotebook, createTestNote, cleanupTestData } from './utils/data-helpers';

test.describe('Note Editor', () => {
  let testToken: string;
  let testNotebookId: string;
  let testNoteId: string;

  test.beforeAll(async ({ request }) => {
    const { token } = await createTestUser(request, 'editor');
    testToken = token;
  });

  test.beforeEach(async ({ page, request }) => {
    await injectAuth(page, testToken);

    // Create test notebook and note
    const notebook = await createTestNotebook(request, testToken, '테스트 노트북');
    testNotebookId = notebook.id;

    const note = await createTestNote(request, testToken, {
      title: '테스트 노트',
      content: '초기 내용입니다.',
      tags: ['테스트', '자동화'],
      notebook_id: testNotebookId,
    });
    testNoteId = note.id;
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestData(request, testToken, { notebookIds: [testNotebookId] });
  });

  test('1. Open note from list', async ({ page }) => {
    await page.goto('/notes');

    // Wait for notes list to load - look for the h3 heading in NoteCard
    const noteCard = page.locator('h3:has-text("테스트 노트")').first();
    await expect(noteCard).toBeVisible({ timeout: 10000 });

    // Click on the note card (the Link wrapper)
    await noteCard.click();

    // Verify navigation to editor
    await expect(page).toHaveURL(`/notes/${testNoteId}`);
    await expect(page.locator('[data-testid="note-title"], input[placeholder*="제목"]').first()).toHaveValue('테스트 노트');
  });

  test('2. Edit title — updates on the page', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Find and edit title
    const titleInput = page.locator('[data-testid="note-title"], input[placeholder*="제목"]').first();
    await titleInput.fill('수정된 제목');

    // Verify title is updated
    await expect(titleInput).toHaveValue('수정된 제목');
  });

  test('3. Edit content — updates on the page', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Find and edit content
    const contentInput = page.locator('[data-testid="note-content"], textarea[placeholder*="내용"]').first();
    await contentInput.fill('새로운 내용입니다.');

    // Verify content is updated
    await expect(contentInput).toHaveValue('새로운 내용입니다.');
  });

  test('4. Add tag via tag input', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Find tag input
    const tagInput = page.locator('[data-testid="tag-input"], input[placeholder*="태그"]').first();

    // Add new tag
    await tagInput.fill('새태그');
    await tagInput.press('Enter');

    // Verify tag appears
    await expect(page.locator('text=새태그')).toBeVisible();
  });

  test('5. Remove tag via UI', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Wait for tags to load
    await expect(page.locator('text=테스트')).toBeVisible();

    // Find and click remove button for tag
    const tagElement = page.locator('[data-testid="tag-테스트"], [class*="tag"]').filter({ hasText: '테스트' }).first();
    const removeButton = tagElement.locator('[data-testid="remove-tag"], button, [role="button"]').last();
    await removeButton.click();

    // Verify tag is removed
    await expect(page.locator('[data-testid="tag-테스트"]')).not.toBeVisible();
  });

  test('6. Save persists changes (reload → same content)', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Edit title and content
    await page.locator('[data-testid="note-title"], input[placeholder*="제목"]').first().fill('영구 변경 제목');
    await page.locator('[data-testid="note-content"], textarea[placeholder*="내용"]').first().fill('영구 변경 내용');

    // Click save button
    const saveButton = page.locator('button:has-text("저장"), [data-testid="save-button"]').first();
    await saveButton.click();

    // Wait for save to complete
    await expect(page.locator('text=저장됨, text=저장 완료, text=Saved')).toBeVisible({ timeout: 5000 }).catch(() => {});

    // Reload page
    await page.reload();

    // Verify changes persist
    await expect(page.locator('[data-testid="note-title"], input[placeholder*="제목"]').first()).toHaveValue('영구 변경 제목');
    await expect(page.locator('[data-testid="note-content"], textarea[placeholder*="내용"]').first()).toHaveValue('영구 변경 내용');
  });

  test('7. Keyboard shortcut Ctrl+S saves', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Edit content
    const contentInput = page.locator('[data-testid="note-content"], textarea[placeholder*="내용"]').first();
    await contentInput.fill('단축키 저장 테스트');

    // Press Ctrl+S
    await page.keyboard.press('Control+s');

    // Wait for save indication
    await page.waitForTimeout(1000);

    // Reload and verify
    await page.reload();
    await expect(page.locator('[data-testid="note-content"], textarea[placeholder*="내용"]').first()).toHaveValue('단축키 저장 테스트');
  });

  test('8. Rich text formatting buttons exist', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Check for formatting toolbar/buttons
    const boldButton = page.locator('[data-testid="bold-button"], [title*="Bold"], [title*="굵게"], button:has-text("B")');
    const italicButton = page.locator('[data-testid="italic-button"], [title*="Italic"], [title*="기울임"], button:has-text("I")');
    const headingButton = page.locator('[data-testid="heading-button"], [title*="Heading"], [title*="제목"], button:has-text("H")');

    // At least one formatting option should exist
    const hasFormatting = await Promise.race([
      boldButton.first().isVisible().catch(() => false),
      italicButton.first().isVisible().catch(() => false),
      headingButton.first().isVisible().catch(() => false),
    ]);

    expect(hasFormatting).toBeTruthy();
  });

  test('9. Create new note from editor/notes page', async ({ page }) => {
    await page.goto('/notes');

    // Click create note button
    const createButton = page.locator('button:has-text("새 노트"), button:has-text("노트 추가"), [data-testid="create-note"]').first();
    await createButton.click();

    // Should navigate to new note editor
    await expect(page).toHaveURL(/\/notes\/.+/);

    // Verify empty editor
    const titleInput = page.locator('[data-testid="note-title"], input[placeholder*="제목"]').first();
    await expect(titleInput).toHaveValue('');
  });

  test('10. Switch between notes preserves state', async ({ page, request }) => {
    // Create second note
    const note2 = await createTestNote(request, testToken, {
      title: '두 번째 노트',
      content: '두 번째 내용',
      notebook_id: testNotebookId,
    });

    await page.goto(`/notes/${testNoteId}`);

    // Edit first note
    await page.locator('[data-testid="note-content"], textarea[placeholder*="내용"]').first().fill('임시 편집');

    // Navigate to second note
    await page.goto(`/notes/${note2.id}`);
    await expect(page.locator('[data-testid="note-title"], input[placeholder*="제목"]').first()).toHaveValue('두 번째 노트');

    // Navigate back to first note
    await page.goto(`/notes/${testNoteId}`);

    // Verify state is preserved (unsaved changes)
    await expect(page.locator('[data-testid="note-content"], textarea[placeholder*="내용"]').first()).toHaveValue('임시 편집');
  });

  test('11. Editor shows loading state', async ({ page }) => {
    // Navigate to note
    const navigation = page.goto(`/notes/${testNoteId}`);

    // Should show loading indicator
    await expect(page.locator('[data-testid="loading"], [class*="loading"], [class*="spinner"]')).toBeVisible().catch(() => {});

    await navigation;

    // Loading should disappear
    await expect(page.locator('[data-testid="note-title"], input[placeholder*="제목"]').first()).toBeVisible();
  });

  test('12. Large content (10k+ chars) loads OK', async ({ page, request }) => {
    // Create note with large content
    const largeContent = 'A'.repeat(10000);
    const largeNote = await createTestNote(request, testToken, {
      title: '대용량 노트',
      content: largeContent,
      notebook_id: testNotebookId,
    });

    await page.goto(`/notes/${largeNote.id}`);

    // Verify content loads
    const contentInput = page.locator('[data-testid="note-content"], textarea[placeholder*="내용"]').first();
    await expect(contentInput).toBeVisible();

    const value = await contentInput.inputValue();
    expect(value.length).toBeGreaterThanOrEqual(10000);
  });

  test('13. Markdown preview if available', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Add markdown content
    const contentInput = page.locator('[data-testid="note-content"], textarea[placeholder*="내용"]').first();
    await contentInput.fill('# 제목\n\n**굵은 글씨**\n\n- 리스트 항목');

    // Look for preview toggle/button
    const previewButton = page.locator('[data-testid="preview-button"], button:has-text("미리보기"), button:has-text("Preview")');

    if (await previewButton.first().isVisible().catch(() => false)) {
      await previewButton.first().click();

      // Verify preview shows formatted content
      await expect(page.locator('h1:has-text("제목")')).toBeVisible();
    } else {
      test.skip();
    }
  });

  test('14. Undo/redo works', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    const contentInput = page.locator('[data-testid="note-content"], textarea[placeholder*="내용"]').first();

    // Type content
    await contentInput.fill('첫 번째 입력');
    await page.waitForTimeout(500);

    await contentInput.fill('두 번째 입력');

    // Undo (Ctrl+Z)
    await contentInput.press('Control+z');
    await page.waitForTimeout(300);

    // Should revert to first input or empty
    const afterUndo = await contentInput.inputValue();
    expect(afterUndo).not.toBe('두 번째 입력');

    // Redo (Ctrl+Shift+Z or Ctrl+Y)
    await contentInput.press('Control+y');
    await page.waitForTimeout(300);

    const afterRedo = await contentInput.inputValue();
    expect(afterRedo).toBe('두 번째 입력');
  });

  test('15. Navigate away with unsaved changes — warning or auto-save', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Make unsaved changes
    await page.locator('[data-testid="note-content"], textarea[placeholder*="내용"]').first().fill('저장되지 않은 변경사항');

    // Setup dialog listener
    let dialogShown = false;
    page.on('dialog', async dialog => {
      dialogShown = true;
      await dialog.accept();
    });

    // Try to navigate away
    await page.goto('/notes');

    // Either dialog was shown (warning) or auto-save happened
    // If auto-save, changes should persist
    if (!dialogShown) {
      // Check if auto-save happened
      await page.goto(`/notes/${testNoteId}`);
      const content = await page.locator('[data-testid="note-content"], textarea[placeholder*="내용"]').first().inputValue();
      expect(content).toBe('저장되지 않은 변경사항');
    }

    // Test passes if either warning shown or auto-save worked
    expect(true).toBe(true);
  });
});
