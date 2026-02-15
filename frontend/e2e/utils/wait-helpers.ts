import type { APIRequestContext, Page } from '@playwright/test'
import { authHeaders } from './auth-helpers'

const API = 'http://localhost:8001/api'

/**
 * Poll a task status endpoint until completed or failed.
 * Returns the final status response.
 */
export async function pollTaskStatus(
  request: APIRequestContext,
  token: string,
  endpoint: string,
  options: {
    maxAttempts?: number
    intervalMs?: number
    taskId?: string
  } = {},
) {
  const { maxAttempts = 30, intervalMs = 2000, taskId } = options
  const url = taskId ? `${API}${endpoint}?task_id=${taskId}` : `${API}${endpoint}`

  for (let i = 0; i < maxAttempts; i++) {
    const res = await request.get(url, {
      headers: authHeaders(token),
    })

    if (res.status() !== 200) {
      throw new Error(`Poll failed with status ${res.status()}`)
    }

    const body = await res.json()
    const status = body.status || body.state

    if (status === 'completed' || status === 'done' || status === 'finished') {
      return body
    }

    if (status === 'failed' || status === 'error') {
      throw new Error(`Task failed: ${JSON.stringify(body)}`)
    }

    await new Promise((r) => setTimeout(r, intervalMs))
  }

  throw new Error(`Timed out after ${maxAttempts * intervalMs}ms polling ${endpoint}`)
}

/**
 * Wait for an SSE stream to complete (data: [DONE]).
 * Uses page.waitForResponse to intercept SSE responses.
 */
export async function waitForSSEComplete(
  page: Page,
  urlPattern: string | RegExp = /\/api\/ai\/stream/,
  timeoutMs = 60000,
) {
  return page.waitForResponse(
    (response) => {
      const url = response.url()
      if (typeof urlPattern === 'string') {
        return url.includes(urlPattern) && response.status() === 200
      }
      return urlPattern.test(url) && response.status() === 200
    },
    { timeout: timeoutMs },
  )
}

/**
 * Wait for network idle state.
 */
export async function waitForNetworkIdle(page: Page, timeoutMs = 10000) {
  await page.waitForLoadState('networkidle', { timeout: timeoutMs })
}

/**
 * Wait for a specific API response.
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  timeoutMs = 15000,
) {
  return page.waitForResponse(
    (response) => {
      const url = response.url()
      if (typeof urlPattern === 'string') {
        return url.includes(urlPattern)
      }
      return urlPattern.test(url)
    },
    { timeout: timeoutMs },
  )
}
