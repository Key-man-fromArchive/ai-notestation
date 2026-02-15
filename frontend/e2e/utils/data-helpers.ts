import type { APIRequestContext } from '@playwright/test'
import { authHeaders } from './auth-helpers'

const API = 'http://localhost:8001/api'

/**
 * Create a notebook via API.
 */
export async function createTestNotebook(
  request: APIRequestContext,
  token: string,
  name?: string,
  category?: string,
) {
  const notebookName = name || `Test Notebook ${Date.now()}`
  const res = await request.post(`${API}/notebooks`, {
    headers: authHeaders(token),
    data: {
      name: notebookName,
      ...(category && { category }),
    },
  })

  if (res.status() !== 201) {
    const body = await res.text()
    throw new Error(`Failed to create notebook (${res.status()}): ${body}`)
  }

  return await res.json()
}

/**
 * Create a note via API.
 */
export async function createTestNote(
  request: APIRequestContext,
  token: string,
  options: {
    title?: string
    content?: string
    tags?: string[]
    notebook_id?: number
  } = {},
) {
  const {
    title = `Test Note ${Date.now()}`,
    content = '<p>Test content for E2E testing</p>',
    tags = [],
    notebook_id,
  } = options

  const res = await request.post(`${API}/notes`, {
    headers: authHeaders(token),
    data: {
      title,
      content,
      tags,
      ...(notebook_id && { notebook_id }),
    },
  })

  if (res.status() !== 201) {
    const body = await res.text()
    throw new Error(`Failed to create note (${res.status()}): ${body}`)
  }

  return await res.json()
}

/**
 * Bulk-create notes with varied content.
 */
export async function createTestNotes(
  request: APIRequestContext,
  token: string,
  count: number,
  notebook_id?: number,
) {
  const notes = []
  for (let i = 0; i < count; i++) {
    const note = await createTestNote(request, token, {
      title: `Bulk Note ${i + 1} - ${Date.now()}`,
      content: `<p>Content for note ${i + 1}. Keywords: testing, automation, e2e.</p>`,
      tags: [`tag-${i % 5}`, 'e2e-test'],
      notebook_id,
    })
    notes.push(note)
  }
  return notes
}

/**
 * Delete a note via API.
 */
export async function deleteTestNote(
  request: APIRequestContext,
  token: string,
  noteId: string,
) {
  const res = await request.delete(`${API}/notes/${noteId}`, {
    headers: authHeaders(token),
  })
  return res.status()
}

/**
 * Delete a notebook via API.
 */
export async function deleteTestNotebook(
  request: APIRequestContext,
  token: string,
  notebookId: number,
) {
  const res = await request.delete(`${API}/notebooks/${notebookId}`, {
    headers: authHeaders(token),
  })
  return res.status()
}

/**
 * Batch cleanup test data.
 */
export async function cleanupTestData(
  request: APIRequestContext,
  token: string,
  data: { noteIds?: string[]; notebookIds?: number[] },
) {
  const { noteIds = [], notebookIds = [] } = data

  // Delete notes first (they reference notebooks)
  if (noteIds.length > 0) {
    await request.post(`${API}/notes/batch-delete`, {
      headers: authHeaders(token),
      data: { note_ids: noteIds },
    })
  }

  for (const id of notebookIds) {
    await deleteTestNotebook(request, token, id)
  }
}

/**
 * Get notes list via API.
 */
export async function getTestNotes(
  request: APIRequestContext,
  token: string,
  params?: Record<string, string>,
) {
  const url = new URL(`${API}/notes`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  const res = await request.get(url.toString(), {
    headers: authHeaders(token),
  })

  return await res.json()
}
