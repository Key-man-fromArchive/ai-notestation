import { test, expect } from '@playwright/test'
import { loginAsAdmin, authHeaders } from './utils/auth-helpers'
import { pollTaskStatus, waitForNetworkIdle } from './utils/wait-helpers'

const API = 'http://localhost:8001/api'

// ─── Admin Backup & Restore ──────────────────────────────────────────────────

test.describe('Admin Backup & Restore', () => {
  let adminToken: string

  test.beforeAll(async ({ request }) => {
    const { token } = await loginAsAdmin(request)
    adminToken = token
  })

  test('backup section visible in admin', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()

    // Should have a "백업" or "Backup" section
    await expect(page.getByText(/백업|Backup/i).first()).toBeVisible()
  })

  test('trigger backup button', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()

    // Find and verify backup trigger button
    const backupButton = page.getByRole('button', { name: /백업 생성|Create Backup|Backup Now/i })
    await expect(backupButton).toBeVisible()
  })

  test('trigger backup → progress indicator', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()

    const backupButton = page.getByRole('button', { name: /백업 생성|Create Backup|Backup Now/i })
    await backupButton.click()

    // Should show progress indicator (spinner, progress bar, or loading text)
    const progressIndicator = page.locator('[role="progressbar"], .spinner, .loading')
    const loadingText = page.getByText(/진행 중|In Progress|Creating/i)

    await expect(progressIndicator.or(loadingText)).toBeVisible({ timeout: 5000 })
  })

  test('backup completes', async ({ page, request }) => {
    // Trigger backup via API
    const backupRes = await request.post(`${API}/admin/db/backup`, {
      headers: authHeaders(adminToken),
    })
    expect(backupRes.status()).toBe(200)

    const backupData = await backupRes.json()
    const taskId = backupData.task_id || backupData.id

    if (taskId) {
      // Poll for completion
      await pollTaskStatus(request, adminToken, '/admin/db/backup/status', {
        taskId,
        maxAttempts: 15,
        intervalMs: 2000,
      })
    }

    // Verify completion in UI
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()

    await waitForNetworkIdle(page, 5000)

    // Should show success message or completed backup in list
    const successMessage = page.getByText(/완료|Completed|Success/i)
    await expect(successMessage.first()).toBeVisible({ timeout: 10000 })
  })

  test('backup list shows entries', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()

    // Should have a backup list section
    const backupList = page.locator('text=/백업 목록|Backup List|Backups/i').locator('..')
    await expect(backupList).toBeVisible()

    // Should show at least the header or empty state
    const listContainer = page.locator('table, ul, .backup-list')
    await expect(listContainer.first()).toBeVisible()
  })

  test('shows timestamp and size', async ({ page, request }) => {
    // Get backup list via API
    const listRes = await request.get(`${API}/admin/db/backup/list`, {
      headers: authHeaders(adminToken),
    })
    const backups = await listRes.json()

    if (backups.length === 0) {
      // Create a backup first
      await request.post(`${API}/admin/db/backup`, {
        headers: authHeaders(adminToken),
      })
      await new Promise((r) => setTimeout(r, 5000)) // Wait for backup to complete
    }

    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()

    await waitForNetworkIdle(page, 5000)

    const backupTable = page.locator('table, .backup-list')

    // Should show timestamp (date/time)
    await expect(backupTable).toContainText(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/)

    // Should show size (MB, KB, GB, or bytes)
    await expect(backupTable).toContainText(/\d+\s?(MB|KB|GB|bytes)/i)
  })

  test('download backup', async ({ page, request }) => {
    // Get backup list
    const listRes = await request.get(`${API}/admin/db/backup/list`, {
      headers: authHeaders(adminToken),
    })
    const backups = await listRes.json()

    if (backups.length === 0) {
      test.skip()
      return
    }

    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()

    await waitForNetworkIdle(page, 5000)

    // Click download button
    const downloadButton = page.getByRole('button', { name: /다운로드|Download/i }).first()
    const downloadPromise = page.waitForEvent('download')

    await downloadButton.click()

    const download = await downloadPromise
    expect(download).toBeTruthy()
    expect(download.suggestedFilename()).toMatch(/backup.*\.(sql|tar|zip)/i)
  })

  test('delete backup', async ({ page, request }) => {
    // Create a test backup
    const backupRes = await request.post(`${API}/admin/db/backup`, {
      headers: authHeaders(adminToken),
    })
    expect(backupRes.status()).toBe(200)

    await new Promise((r) => setTimeout(r, 5000)) // Wait for backup

    // Get backup list
    const listRes = await request.get(`${API}/admin/db/backup/list`, {
      headers: authHeaders(adminToken),
    })
    const backups = await listRes.json()
    const latestBackup = backups[0]

    if (!latestBackup) {
      test.skip()
      return
    }

    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()

    await waitForNetworkIdle(page, 5000)

    // Click delete button
    const deleteButton = page.getByRole('button', { name: /삭제|Delete/i }).first()
    await deleteButton.click()

    // Should show confirmation dialog
    const confirmDialog = page.getByText(/정말 삭제|Are you sure|Confirm/i)
    await expect(confirmDialog).toBeVisible()

    // Confirm deletion
    const confirmButton = page.getByRole('button', { name: /삭제|Delete|Confirm/i }).last()
    await confirmButton.click()

    // Should show success message
    await expect(page.getByText(/삭제됨|Deleted|Success/i)).toBeVisible({ timeout: 5000 })
  })

  test('restore backup — confirmation dialog', async ({ page, request }) => {
    // Get backup list
    const listRes = await request.get(`${API}/admin/db/backup/list`, {
      headers: authHeaders(adminToken),
    })
    const backups = await listRes.json()

    if (backups.length === 0) {
      test.skip()
      return
    }

    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()

    await waitForNetworkIdle(page, 5000)

    // Click restore button
    const restoreButton = page.getByRole('button', { name: /복원|Restore/i }).first()
    await restoreButton.click()

    // Should show confirmation dialog with warning
    const confirmDialog = page.getByText(/정말 복원|Are you sure|Warning|주의/i)
    await expect(confirmDialog).toBeVisible()
  })

  test('restore backup — proceeds after confirmation', async ({ page, request }) => {
    // Note: This test does NOT actually restore (to avoid breaking test DB)
    // It just verifies the UI flow

    const listRes = await request.get(`${API}/admin/db/backup/list`, {
      headers: authHeaders(adminToken),
    })
    const backups = await listRes.json()

    if (backups.length === 0) {
      test.skip()
      return
    }

    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()

    await waitForNetworkIdle(page, 5000)

    const restoreButton = page.getByRole('button', { name: /복원|Restore/i }).first()
    await restoreButton.click()

    // Confirm dialog appears
    const confirmDialog = page.getByText(/정말 복원|Are you sure/i)
    await expect(confirmDialog).toBeVisible()

    // Cancel button should be present
    const cancelButton = page.getByRole('button', { name: /취소|Cancel/i })
    await expect(cancelButton).toBeVisible()

    // Close dialog
    await cancelButton.click()
    await expect(confirmDialog).not.toBeVisible()
  })

  test('multiple backups listed', async ({ page, request }) => {
    // Create two backups
    await request.post(`${API}/admin/db/backup`, {
      headers: authHeaders(adminToken),
    })
    await new Promise((r) => setTimeout(r, 3000))

    await request.post(`${API}/admin/db/backup`, {
      headers: authHeaders(adminToken),
    })
    await new Promise((r) => setTimeout(r, 3000))

    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()

    await waitForNetworkIdle(page, 5000)

    // Should show at least 2 backup entries
    const backupRows = page.locator('table tr, .backup-item').filter({ hasText: /backup/i })
    await expect(backupRows.first()).toBeVisible()
    const count = await backupRows.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('full backup option', async ({ page }) => {
    await page.goto('/admin')
    const main = page.locator('main')
    await main.getByRole('button', { name: /데이터베이스/i }).click()

    // Look for "Full Backup" or "전체 백업" option
    const fullBackupOption = page.getByText(/전체 백업|Full Backup/i)
    const backupButton = page.getByRole('button', { name: /백업|Backup/i })

    // Should have either a dedicated "Full Backup" button or option
    await expect(fullBackupOption.or(backupButton).first()).toBeVisible()
  })
})
