import { test, expect } from '@playwright/test'

test.describe('Settings - Synology NAS Connection', () => {
  test('NAS section visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByText(/NAS|Synology|시놀로지/i)).toBeVisible()
  })

  test('NAS form has URL/port/username/password fields', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)

    // Look for input fields related to NAS connection
    const main = page.locator('main')
    await expect(main.getByLabel(/URL|주소/i)).toBeVisible()
    await expect(main.getByLabel(/포트|port/i)).toBeVisible()
    await expect(main.getByLabel(/사용자|username/i)).toBeVisible()
    await expect(main.getByLabel(/비밀번호|password/i)).toBeVisible()
  })

  test('Enter NAS credentials', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)

    await page.getByLabel(/URL|주소/i).fill('https://nas.example.com')
    await page.getByLabel(/포트|port/i).fill('5001')
    await page.getByLabel(/사용자|username/i).fill('testuser')
    await page.getByLabel(/비밀번호|password/i).fill('testpass')

    // Verify values are entered
    await expect(page.getByLabel(/URL|주소/i)).toHaveValue('https://nas.example.com')
    await expect(page.getByLabel(/포트|port/i)).toHaveValue('5001')
  })

  test('Test connection button exists', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByRole('button', { name: /테스트 연결|Test Connection/i })).toBeVisible()
  })

  test.skip('Test connection - success indicator', async ({ page }) => {
    // Skip if NAS is not configured in environment
    test.skip(!process.env.NAS_HOST, 'NAS not available')

    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)

    // Fill with valid credentials from env
    await page.getByLabel(/URL|주소/i).fill(process.env.NAS_HOST!)
    await page.getByLabel(/포트|port/i).fill(process.env.NAS_PORT || '5001')
    await page.getByLabel(/사용자|username/i).fill(process.env.NAS_USERNAME!)
    await page.getByLabel(/비밀번호|password/i).fill(process.env.NAS_PASSWORD!)

    await page.getByRole('button', { name: /테스트 연결|Test Connection/i }).click()

    // Wait for success indicator (toast, success message, green check, etc.)
    await expect(page.getByText(/성공|Success|연결됨|Connected/i)).toBeVisible({ timeout: 10000 })
  })

  test('Test connection - fail indicator', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)

    // Use invalid credentials
    await page.getByLabel(/URL|주소/i).fill('https://invalid.nas.com')
    await page.getByLabel(/포트|port/i).fill('5001')
    await page.getByLabel(/사용자|username/i).fill('wronguser')
    await page.getByLabel(/비밀번호|password/i).fill('wrongpass')

    await page.getByRole('button', { name: /테스트 연결|Test Connection/i }).click()

    // Wait for error indicator
    await expect(page.getByText(/실패|Failed|오류|Error|연결 불가/i)).toBeVisible({ timeout: 10000 })
  })

  test('Save NAS settings', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)

    await page.getByLabel(/URL|주소/i).fill('https://nas.example.com')
    await page.getByLabel(/포트|port/i).fill('5001')
    await page.getByLabel(/사용자|username/i).fill('testuser')
    await page.getByLabel(/비밀번호|password/i).fill('testpass')

    // Find and click save button
    await page.getByRole('button', { name: /저장|Save/i }).click()

    // Wait for success indicator
    await expect(page.getByText(/저장됨|Saved|성공/i)).toBeVisible({ timeout: 5000 })
  })

  test('Settings persist after reload', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)

    await page.getByLabel(/URL|주소/i).fill('https://persistent.nas.com')
    await page.getByLabel(/포트|port/i).fill('5002')
    await page.getByRole('button', { name: /저장|Save/i }).click()
    await expect(page.getByText(/저장됨|Saved|성공/i)).toBeVisible({ timeout: 5000 })

    // Reload and verify
    await page.reload()
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByLabel(/URL|주소/i)).toHaveValue('https://persistent.nas.com')
    await expect(page.getByLabel(/포트|port/i)).toHaveValue('5002')
  })

  test('Clear NAS settings', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)

    // Clear all fields
    await page.getByLabel(/URL|주소/i).clear()
    await page.getByLabel(/포트|port/i).clear()
    await page.getByLabel(/사용자|username/i).clear()
    await page.getByLabel(/비밀번호|password/i).clear()

    await page.getByRole('button', { name: /저장|Save/i }).click()
    await expect(page.getByText(/저장됨|Saved|성공/i)).toBeVisible({ timeout: 5000 })

    // Verify cleared
    await page.reload()
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByLabel(/URL|주소/i)).toHaveValue('')
  })

  test('Trigger sync button visible', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)
    // Sync button might be in NAS section or main page
    const syncButton = page.getByRole('button', { name: /동기화|Sync/i }).first()
    await expect(syncButton).toBeVisible()
  })

  test('Sync status indicator', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)
    // Look for sync status text (connected, disconnected, syncing, etc.)
    const statusPattern = /상태|Status|연결됨|Disconnected|Syncing/i
    const statusText = page.getByText(statusPattern).first()
    await expect(statusText).toBeVisible()
  })

  test('Last sync timestamp shown', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '연결' }).click()
    await page.waitForTimeout(300)
    // Look for timestamp or "never synced" text
    const timestampPattern = /마지막 동기화|Last sync|Never|없음|ago|전/i
    const timestamp = page.getByText(timestampPattern).first()
    await expect(timestamp).toBeVisible()
  })
})
