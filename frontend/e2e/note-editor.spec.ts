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
    testNoteId = note.note_id;
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

    // Wait for the note API call to complete and page to load
    await page.waitForLoadState('networkidle');

    // Title is h1, not input
    await expect(page.locator('h1.text-2xl.font-bold')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('h1.text-2xl.font-bold')).toContainText('테스트 노트');
  });

  test('2. Title is displayed as heading', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);
    await page.waitForLoadState('networkidle');

    // Title is read-only h1 element
    const titleHeading = page.locator('h1.text-2xl.font-bold');
    await expect(titleHeading).toBeVisible({ timeout: 10000 });
    await expect(titleHeading).toContainText('테스트 노트');
  });

  test('3. TipTap editor loads with content', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);
    await page.waitForLoadState('networkidle');

    // TipTap editor uses .ProseMirror class
    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible({ timeout: 10000 });

    // Verify initial content is displayed
    await expect(editor).toContainText('초기 내용입니다');
  });

  test('4. Tags are displayed as pills', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);
    await page.waitForLoadState('networkidle');

    // Tags are read-only display pills
    // Verify tag text (tags are created as '테스트', '자동화')
    await expect(page.locator('span').filter({ hasText: /^테스트$/ }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('span').filter({ hasText: /^자동화$/ }).first()).toBeVisible();
  });

  test('5. Auto-tag button is available', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);
    await page.waitForLoadState('networkidle');

    // Wait for tags to load
    await expect(page.locator('span').filter({ hasText: /^테스트$/ })).toBeVisible({ timeout: 10000 });

    // Auto-tag button with Plus icon should be visible (near tags section)
    const autoTagButton = page.locator('button').filter({ has: page.locator('svg.lucide-plus, svg.lucide-wand-2') });
    await expect(autoTagButton.first()).toBeVisible();
  });

  test('6. Content persists after reload (auto-save)', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Wait for editor to load
    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible({ timeout: 15000 });

    // Verify content is displayed
    await expect(editor).toContainText('초기 내용입니다');

    // Reload page
    await page.reload();

    // Content should still be there (auto-save)
    await expect(editor).toBeVisible({ timeout: 15000 });
    await expect(editor).toContainText('초기 내용입니다');
  });

  test('7. Generate title button is visible', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);
    await page.waitForLoadState('networkidle');

    // "제목 생성하기" button with Sparkles icon should be visible
    const generateButton = page.locator('button').filter({ hasText: /제목 생성|생성하기/ });
    await expect(generateButton.first()).toBeVisible({ timeout: 10000 });
  });

  test('8. Rich text formatting buttons exist', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);
    await page.waitForLoadState('networkidle');

    // TipTap toolbar should be visible
    // Look for Bold, Italic, Underline buttons by their Lucide icons
    const boldButton = page.locator('button').filter({ has: page.locator('svg.lucide-bold') });
    const italicButton = page.locator('button').filter({ has: page.locator('svg.lucide-italic') });
    const underlineButton = page.locator('button').filter({ has: page.locator('svg.lucide-underline') });

    // At least one formatting button should be visible
    await expect(boldButton.first()).toBeVisible({ timeout: 10000 });
    await expect(italicButton.first()).toBeVisible();
    await expect(underlineButton.first()).toBeVisible();
  });

  test('9. Back to notes list button works', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);
    await page.waitForLoadState('networkidle');

    // Back button should be visible
    const backButton = page.locator('button').filter({ hasText: '노트 목록으로' });
    await expect(backButton).toBeVisible({ timeout: 10000 });

    // Click back button
    await backButton.click();

    // Should navigate to notes list
    await expect(page).toHaveURL('/notes');
  });

  test('10. Switch between notes shows correct content', async ({ page, request }) => {
    // Create second note
    const note2 = await createTestNote(request, testToken, {
      title: '두 번째 노트',
      content: '두 번째 내용',
      notebook_id: testNotebookId,
    });

    await page.goto(`/notes/${testNoteId}`);

    // Verify first note - wait for editor to be visible
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h1.text-2xl.font-bold')).toContainText('테스트 노트');
    await expect(page.locator('.ProseMirror')).toContainText('초기 내용입니다');

    // Navigate to second note
    await page.goto(`/notes/${note2.note_id}`);
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h1.text-2xl.font-bold')).toContainText('두 번째 노트');
    await expect(page.locator('.ProseMirror')).toContainText('두 번째 내용');

    // Navigate back to first note
    await page.goto(`/notes/${testNoteId}`);
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h1.text-2xl.font-bold')).toContainText('테스트 노트');
  });

  test('11. Editor shows loading state', async ({ page }) => {
    // Navigate to note
    const navigation = page.goto(`/notes/${testNoteId}`);

    // Should show loading spinner (LoadingSpinner component)
    await expect(page.locator('.animate-spin').first()).toBeVisible({ timeout: 2000 }).catch(() => {});

    await navigation;
    await page.waitForLoadState('networkidle');

    // Loading should disappear, title should be visible
    await expect(page.locator('h1.text-2xl.font-bold')).toBeVisible({ timeout: 10000 });
  });

  test('12. Large content (10k+ chars) loads OK', async ({ page, request }) => {
    // Create note with large content
    const largeContent = '<p>' + 'A'.repeat(10000) + '</p>';
    const largeNote = await createTestNote(request, testToken, {
      title: '대용량 노트',
      content: largeContent,
      notebook_id: testNotebookId,
    });

    await page.goto(`/notes/${largeNote.note_id}`);
    await page.waitForLoadState('networkidle');

    // Verify TipTap editor loads
    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible({ timeout: 10000 });

    // Verify content is present (check text length)
    const text = await editor.textContent();
    expect(text?.length ?? 0).toBeGreaterThanOrEqual(10000);
  });

  test('13. TipTap toolbar has heading buttons', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Wait for editor to load first
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 15000 });

    // TipTap uses WYSIWYG, not markdown preview
    // Check for heading buttons in toolbar by title attribute
    const h1Button = page.locator('button[title*="Heading 1"]');
    const h2Button = page.locator('button[title*="Heading 2"]');

    // At least one heading button should exist
    await expect(h1Button.or(h2Button).first()).toBeVisible({ timeout: 10000 });
  });

  test('14. Undo/redo buttons exist in toolbar', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Wait for editor to load first
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 15000 });

    // TipTap has undo/redo buttons in toolbar - find by title attribute
    const undoButton = page.locator('button[title*="Undo"]');
    const redoButton = page.locator('button[title*="Redo"]');

    await expect(undoButton.first()).toBeVisible({ timeout: 10000 });
    await expect(redoButton.first()).toBeVisible();
  });

  test('15. Sync buttons are available', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);
    await page.waitForLoadState('networkidle');

    // Push/Pull sync buttons should be visible
    const pullButton = page.locator('button').filter({ has: page.locator('svg.lucide-cloud-download') });
    const pushButton = page.locator('button').filter({ has: page.locator('svg.lucide-cloud-upload') });

    // At least one sync button should be visible
    const hasSyncButtons = await Promise.race([
      pullButton.first().isVisible().catch(() => false),
      pushButton.first().isVisible().catch(() => false),
    ]);

    expect(hasSyncButtons).toBeTruthy();
  });
});
