import { useQuery } from '@tanstack/react-query'

interface SharedNotePreview {
  id: number
  title: string
  preview: string
}

interface SharedNoteContent {
  id: number
  title: string
  content_html: string
  content_text: string
}

interface SharedNotebookContent {
  id: number
  name: string
  description: string | null
  notes: SharedNotePreview[]
}

export interface SharedContentResponse {
  type: 'notebook' | 'note'
  notebook: SharedNotebookContent | null
  note: SharedNoteContent | null
  expires_at: string | null
}

interface UseSharedContentOptions {
  email?: string
}

async function fetchSharedContent(
  token: string,
  email?: string,
): Promise<SharedContentResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (email) {
    headers['X-Email'] = email
  }

  const response = await fetch(`/api/shared/${token}`, { headers })

  if (!response.ok) {
    const body = await response.text()
    let detail = 'Failed to load shared content'
    try {
      const parsed = JSON.parse(body)
      detail = parsed.detail || detail
    } catch {}

    const error = new Error(detail) as Error & { status: number }
    error.status = response.status
    throw error
  }

  return response.json()
}

export function useSharedContent(
  token: string,
  options: UseSharedContentOptions = {},
) {
  return useQuery<SharedContentResponse, Error & { status?: number }>({
    queryKey: ['shared-content', token, options.email],
    queryFn: () => fetchSharedContent(token, options.email),
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}
