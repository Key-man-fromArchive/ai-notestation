import { test, expect } from '@playwright/test'

test.describe('Settings - Synology NAS Connection', () => {
  test('NAS section visible', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('button').filter({ hasText: '연결' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByText(/Synology NAS 연결/i)).toBeVisible()
  })

  test('NAS form has URL/username/password fields', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('button').filter({ hasText: '연결' }).click()
    await page.waitForTimeout(300)

    const main = page.locator('main')
    // Fields use HTML IDs: nas_url, nas_user, nas_password
    await expect(main.locator('#nas_url')).toBeAttached()
    await expect(main.locator('#nas_user')).toBeAttached()
    await expect(main.locator('#nas_password')).toBeAttached()
  })

  test('NAS URL field label visible', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('button').filter({ hasText: '연결' }).click()
    await page.waitForTimeout(300)

    await expect(page.getByText(/Synology NAS URL/i)).toBeVisible()
    await expect(page.getByText(/NAS 사용자 이름/i)).toBeVisible()
    await expect(page.getByText(/NAS 비밀번호/i)).toBeVisible()
  })

  test('Test connection button exists', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('button').filter({ hasText: '연결' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByRole('button', { name: /연결 테스트|Test Connection/i })).toBeVisible()
  })

  test.skip('Test connection - success indicator', async ({ page }) => {
    // Skip if NAS is not configured in environment
    test.skip(!process.env.NAS_HOST, 'NAS not available')

    await page.goto('/settings')
    await page.locator('button').filter({ hasText: '연결' }).click()
    await page.waitForTimeout(300)

    await page.getByRole('button', { name: /연결 테스트|Test Connection/i }).click()

    // Wait for success indicator
    await expect(page.getByText(/성공|Success|연결됨|Connected/i)).toBeVisible({ timeout: 10000 })
  })

  test.skip('Test connection - fail indicator', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('button').filter({ hasText: '연결' }).click()
    await page.waitForTimeout(300)

    // Enter invalid URL via the field
    const urlField = page.locator('#nas_url')

    // Click edit button for URL field if it exists
    const editBtn = urlField.locator('..').getByRole('button', { name: /수정|Edit/i })
    if (await editBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await editBtn.click()
    }
    await urlField.fill('https://invalid.nas.com')

    // Save the field
    const saveBtn = urlField.locator('..').getByRole('button', { name: /저장|Save/i })
    if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await saveBtn.click()
      await page.waitForTimeout(500)
    }

    await page.getByRole('button', { name: /연결 테스트|Test Connection/i }).click()

    // Wait for response to complete
    await page.waitForTimeout(3000)

    // Check for error indicator (text or styling)
    const hasErrorText = await page.getByText(/실패|Failed|오류|Error|연결 불가|연결 테스트에 실패|연결 실패/i).isVisible({ timeout: 5000 }).catch(() => false)
    const hasErrorStyle = await page.locator('.text-red-600').isVisible({ timeout: 1000 }).catch(() => false)

    // At minimum, either error text or error styling should be visible
    expect(hasErrorText || hasErrorStyle).toBeTruthy()
  })

  test('NAS status indicator visible', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('button').filter({ hasText: '연결' }).click()
    await page.waitForTimeout(300)
    // Look for NAS status: connected or not configured
    const connected = page.getByText(/연결됨/i)
    const notConfigured = page.getByText(/미설정/i)
    await expect(connected.or(notConfigured)).toBeVisible()
  })

  test('Image sync section visible', async ({ page }) => {
    await page.goto('/settings')
    // Image sync is on 데이터분석 tab, not 연결 tab
    await page.locator('button').filter({ hasText: '데이터분석' }).click()
    await page.waitForTimeout(300)
    // Look for image sync section heading
    await expect(page.getByRole('heading', { name: '이미지 동기화' })).toBeVisible({ timeout: 5000 })
  })
})
