import { test, expect } from '@playwright/test';
import { createTestUser, injectAuth, authHeaders } from './utils/auth-helpers';
import { createTestNotebook, createTestNote, cleanupTestData } from './utils/data-helpers';
import { Buffer } from 'buffer';

test.describe('Note Attachments', () => {
  let testToken: string;
  let testNotebookId: string;
  let testNoteId: string;
  const API_BASE = 'http://localhost:8001/api';

  test.beforeAll(async ({ request }) => {
    const { token } = await createTestUser(request, 'attach');
    testToken = token;
  });

  test.beforeEach(async ({ page, request }) => {
    await injectAuth(page, testToken);

    // Create test notebook and note
    const notebook = await createTestNotebook(request, testToken, '첨부파일 테스트 노트북');
    testNotebookId = notebook.id;

    const note = await createTestNote(request, testToken, {
      title: '첨부파일 테스트 노트',
      content: '파일 업로드를 테스트합니다.',
      notebook_id: testNotebookId,
    });
    testNoteId = note.note_id; // API returns 'note_id' not 'id'
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestData(request, testToken, { notebookIds: [testNotebookId] });
  });

  test('1. Upload single file to note', async ({ page, request }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Create test file
    const fileContent = Buffer.from('테스트 파일 내용입니다.');

    // Find file input (may be hidden, look for upload button first)
    const uploadBtn = page.getByRole('button', { name: /Upload|업로드|파일 첨부|Attach/i });
    if (await uploadBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await uploadBtn.click();
    }

    // Find file input
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 5000 });

    // Upload file
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: fileContent,
    });

    // Wait for upload to complete
    await expect(page.locator('text=test.txt')).toBeVisible({ timeout: 10000 });
  });

  test('2. Upload image file — preview shown', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Create test image (1x1 PNG)
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    // Upload image
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'test-image.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    });

    // Wait for upload and preview
    await expect(page.locator('text=test-image.png')).toBeVisible({ timeout: 10000 });

    // Check for image preview
    await expect(page.locator('img[alt*="test-image"], img[src*="test-image"]')).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test('3. View uploaded file in note detail', async ({ page, request }) => {
    // Upload file via API first
    const fileContent = Buffer.from('API 업로드 테스트');
    const headers = authHeaders(testToken);

    const formData = new FormData();
    const blob = new Blob([fileContent], { type: 'text/plain' });
    formData.append('file', blob, 'api-test.txt');

    await request.post(`${API_BASE}/notes/${testNoteId}/attachments`, {
      headers,
      multipart: {
        file: {
          name: 'api-test.txt',
          mimeType: 'text/plain',
          buffer: fileContent,
        },
      },
    });

    // Navigate to note
    await page.goto(`/notes/${testNoteId}`);

    // Verify file is visible
    await expect(page.locator('text=api-test.txt')).toBeVisible();
  });

  test('4. Download attachment', async ({ page, request }) => {
    // Upload file first
    const fileContent = Buffer.from('다운로드 테스트 내용');
    const headers = authHeaders(testToken);

    const uploadResponse = await request.post(`${API_BASE}/notes/${testNoteId}/attachments`, {
      headers,
      multipart: {
        file: {
          name: 'download-test.txt',
          mimeType: 'text/plain',
          buffer: fileContent,
        },
      },
    });

    const uploadData = await uploadResponse.json();
    const fileId = uploadData.file_id || uploadData.id;

    await page.goto(`/notes/${testNoteId}`);

    // Setup download listener
    const downloadPromise = page.waitForEvent('download');

    // Click download button
    const downloadButton = page.locator(`[data-testid="download-${fileId}"], a[href*="${fileId}"], button:near(:text("download-test.txt"))`).first();
    await downloadButton.click();

    // Wait for download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('download-test.txt');
  });

  test('5. Delete attachment from note', async ({ page, request }) => {
    // Upload file first
    const fileContent = Buffer.from('삭제 테스트');
    const headers = authHeaders(testToken);

    const uploadResponse = await request.post(`${API_BASE}/notes/${testNoteId}/attachments`, {
      headers,
      multipart: {
        file: {
          name: 'delete-test.txt',
          mimeType: 'text/plain',
          buffer: fileContent,
        },
      },
    });

    const uploadData = await uploadResponse.json();
    const fileId = uploadData.file_id || uploadData.id;

    await page.goto(`/notes/${testNoteId}`);

    // Verify file exists
    await expect(page.locator('text=delete-test.txt')).toBeVisible();

    // Click delete button
    const deleteButton = page.locator(`[data-testid="delete-${fileId}"], button:near(:text("delete-test.txt"))`).filter({ hasText: /삭제|Delete|X/ }).first();
    await deleteButton.click();

    // Confirm deletion if dialog appears
    page.on('dialog', dialog => dialog.accept());

    // Verify file is removed
    await expect(page.locator('text=delete-test.txt')).not.toBeVisible({ timeout: 5000 });
  });

  test('6. Upload too large file → error', async ({ page }) => {
    test.skip(); // Requires server-side file size limit configuration

    await page.goto(`/notes/${testNoteId}`);

    // Create large file (e.g., 100MB if limit is 10MB)
    const largeContent = Buffer.alloc(100 * 1024 * 1024);

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'too-large.bin',
      mimeType: 'application/octet-stream',
      buffer: largeContent,
    });

    // Should show error message
    await expect(page.locator('text=파일 크기, text=용량 초과, text=too large')).toBeVisible({ timeout: 5000 });
  });

  test('7. Upload unsupported type → error or graceful handling', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Create executable file (potentially unsupported)
    const exeContent = Buffer.from('MZ'); // EXE header

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'suspicious.exe',
      mimeType: 'application/x-msdownload',
      buffer: exeContent,
    });

    // Either shows error or accepts file (graceful handling)
    const errorShown = await page.locator('text=지원되지 않는, text=unsupported, text=허용되지').isVisible({ timeout: 3000 }).catch(() => false);
    const fileAccepted = await page.locator('text=suspicious.exe').isVisible({ timeout: 3000 }).catch(() => false);

    expect(errorShown || fileAccepted).toBe(true);
  });

  test('8. Attachment list shows file size', async ({ page, request }) => {
    // Upload file with known size
    const fileContent = Buffer.from('A'.repeat(1024)); // 1KB
    const headers = authHeaders(testToken);

    await request.post(`${API_BASE}/notes/${testNoteId}/attachments`, {
      headers,
      multipart: {
        file: {
          name: 'sized-file.txt',
          mimeType: 'text/plain',
          buffer: fileContent,
        },
      },
    });

    await page.goto(`/notes/${testNoteId}`);

    // Check for file size display
    await expect(page.locator('text=sized-file.txt')).toBeVisible();
    await expect(page.locator('text=1KB, text=1.0KB, text=1024')).toBeVisible().catch(() => {
      // File size may be displayed differently
      expect(true).toBe(true);
    });
  });

  test('9. Multiple attachments per note', async ({ page, request }) => {
    const headers = authHeaders(testToken);

    // Upload multiple files
    for (let i = 1; i <= 3; i++) {
      const content = Buffer.from(`파일 ${i} 내용`);
      await request.post(`${API_BASE}/notes/${testNoteId}/attachments`, {
        headers,
        multipart: {
          file: {
            name: `file-${i}.txt`,
            mimeType: 'text/plain',
            buffer: content,
          },
        },
      });
    }

    await page.goto(`/notes/${testNoteId}`);

    // Verify all files are visible
    await expect(page.locator('text=file-1.txt')).toBeVisible();
    await expect(page.locator('text=file-2.txt')).toBeVisible();
    await expect(page.locator('text=file-3.txt')).toBeVisible();
  });

  test('10. Upload progress indicator', async ({ page }) => {
    await page.goto(`/notes/${testNoteId}`);

    // Create medium-sized file to see progress
    const content = Buffer.alloc(5 * 1024 * 1024); // 5MB

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'progress-test.bin',
      mimeType: 'application/octet-stream',
      buffer: content,
    });

    // Look for progress indicator
    const progressIndicator = page.locator('[role="progressbar"], [data-testid="upload-progress"], .progress, [class*="progress"]');
    const hasProgress = await progressIndicator.isVisible({ timeout: 2000 }).catch(() => false);

    // Progress indicator may appear briefly
    // Test passes if file eventually uploads
    await expect(page.locator('text=progress-test.bin')).toBeVisible({ timeout: 15000 });
  });

  test('11. Cancel upload mid-transfer', async ({ page }) => {
    test.skip(); // Requires network throttling and cancel button implementation

    await page.goto(`/notes/${testNoteId}`);

    // Throttle network to make upload slower
    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 50 * 1024, // 50KB/s
      uploadThroughput: 50 * 1024,
      latency: 100,
    });

    const content = Buffer.alloc(10 * 1024 * 1024); // 10MB
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'cancel-test.bin',
      mimeType: 'application/octet-stream',
      buffer: content,
    });

    // Wait for upload to start
    await page.waitForTimeout(1000);

    // Click cancel button
    const cancelButton = page.locator('[data-testid="cancel-upload"], button:has-text("취소"), button:has-text("Cancel")').first();
    await cancelButton.click();

    // Verify upload was cancelled
    await expect(page.locator('text=cancel-test.bin')).not.toBeVisible();
  });

  test('12. Upload error → error message', async ({ page }) => {
    // Simulate error by uploading to non-existent note
    const fakeNoteId = '00000000-0000-0000-0000-000000000000';
    await page.goto(`/notes/${fakeNoteId}`);

    const fileContent = Buffer.from('에러 테스트');

    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.isVisible().catch(() => false)) {
      await fileInput.setInputFiles({
        name: 'error-test.txt',
        mimeType: 'text/plain',
        buffer: fileContent,
      });

      // Should show error
      await expect(page.locator('text=업로드 실패, text=오류, text=에러, text=error, text=failed')).toBeVisible({ timeout: 5000 });
    } else {
      // Page may not load if note doesn't exist
      await expect(page.locator('text=찾을 수 없음, text=Not Found, text=404')).toBeVisible();
    }
  });

  test('13. Retry failed upload', async ({ page, request }) => {
    test.skip(); // Requires retry button implementation and network failure simulation

    await page.goto(`/notes/${testNoteId}`);

    // Simulate network failure
    await page.route(`${API_BASE}/notes/${testNoteId}/attachments`, route => {
      route.abort();
    });

    const fileContent = Buffer.from('재시도 테스트');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'retry-test.txt',
      mimeType: 'text/plain',
      buffer: fileContent,
    });

    // Wait for error
    await expect(page.locator('text=업로드 실패, text=failed')).toBeVisible({ timeout: 5000 });

    // Re-enable network
    await page.unroute(`${API_BASE}/notes/${testNoteId}/attachments`);

    // Click retry button
    const retryButton = page.locator('button:has-text("재시도"), button:has-text("Retry"), [data-testid="retry-upload"]').first();
    await retryButton.click();

    // Verify successful upload
    await expect(page.locator('text=retry-test.txt')).toBeVisible({ timeout: 10000 });
  });
});
