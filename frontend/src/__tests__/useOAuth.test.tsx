// @TASK P6D-T6D.4 - useOAuth hook 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#oauth-인증

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useOAuth } from '../hooks/useOAuth'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useOAuth hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns disconnected status when not connected', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      connected: false,
      provider: 'google',
    })

    const { result } = renderHook(() => useOAuth('google'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(false)
    })

    expect(result.current.email).toBeNull()
  })

  it('returns connected status with email', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      connected: true,
      provider: 'google',
      email: 'user@gmail.com',
    })

    const { result } = renderHook(() => useOAuth('google'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    expect(result.current.email).toBe('user@gmail.com')
  })

  it('disables query for unsupported providers', () => {
    const { result } = renderHook(() => useOAuth('anthropic'), {
      wrapper: createWrapper(),
    })

    expect(result.current.connected).toBe(false)
    expect(result.current.isLoading).toBe(false)
  })

  it('exchanges code via callback', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      connected: false,
      provider: 'google',
    })

    vi.mocked(api.apiClient.post).mockResolvedValue({
      connected: true,
      provider: 'google',
      email: 'user@gmail.com',
    })

    const { result } = renderHook(() => useOAuth('google'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const response = await result.current.exchangeCode({
      code: 'auth-code',
      state: 'state-123',
    })

    expect(response.connected).toBe(true)
    expect(api.apiClient.post).toHaveBeenCalledWith('/oauth/google/callback', {
      code: 'auth-code',
      state: 'state-123',
    })
  })

  it('handles code exchange error', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      connected: false,
      provider: 'google',
    })

    vi.mocked(api.apiClient.post).mockRejectedValue(
      new Error('Token exchange failed')
    )

    const { result } = renderHook(() => useOAuth('google'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await expect(
      result.current.exchangeCode({
        code: 'invalid-code',
        state: 'state-123',
      })
    ).rejects.toThrow('Token exchange failed')
  })

  it('disconnects OAuth provider', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      connected: true,
      provider: 'google',
      email: 'user@gmail.com',
    })

    vi.mocked(api.apiClient.delete).mockResolvedValue({
      connected: false,
      provider: 'google',
    })

    const { result } = renderHook(() => useOAuth('google'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    await result.current.disconnect()

    expect(api.apiClient.delete).toHaveBeenCalledWith('/oauth/google/disconnect')
  })

  it('supports OpenAI OAuth', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      connected: true,
      provider: 'openai',
      email: 'user@openai.com',
    })

    const { result } = renderHook(() => useOAuth('openai'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
      expect(result.current.email).toBe('user@openai.com')
    })
  })

  it('loads OAuth status on mount', async () => {
    vi.mocked(api.apiClient.get).mockResolvedValue({
      connected: true,
      provider: 'google',
      email: 'user@gmail.com',
    })

    renderHook(() => useOAuth('google'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(api.apiClient.get).toHaveBeenCalledWith('/oauth/google/status')
    })
  })
})
