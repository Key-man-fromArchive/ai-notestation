// @TASK P6-T6.4 - useMemberAuth hook tests
// @SPEC docs/plans/phase6-member-auth.md

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMemberAuth } from '../hooks/useMemberAuth'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  apiClient: {
    post: vi.fn(),
    setToken: vi.fn(),
    setRefreshToken: vi.fn(),
    clearToken: vi.fn(),
    clearRefreshToken: vi.fn(),
    getRefreshToken: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public body: string,
    ) {
      super(`API Error: ${status}`)
      this.name = 'ApiError'
    }
  },
}))

describe('useMemberAuth hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('login', () => {
    it('successfully logs in user', async () => {
      const mockResponse = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        token_type: 'bearer',
        user_id: 1,
        email: 'test@example.com',
        name: 'Test User',
        org_id: 1,
        org_slug: 'test-org',
        role: 'owner',
      }

      vi.mocked(api.apiClient.post).mockResolvedValue(mockResponse)

      const { result } = renderHook(() => useMemberAuth())

      await act(async () => {
        const user = await result.current.login('test@example.com', 'password')
        expect(user.email).toBe('test@example.com')
        expect(user.org_slug).toBe('test-org')
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.email).toBe('test@example.com')
      expect(api.apiClient.setToken).toHaveBeenCalledWith('mock-access-token')
      expect(api.apiClient.setRefreshToken).toHaveBeenCalledWith(
        'mock-refresh-token',
      )
    })

    it('handles login failure with 401', async () => {
      vi.mocked(api.apiClient.post).mockRejectedValue(
        new api.ApiError(401, '{"detail": "Invalid credentials"}'),
      )

      const { result } = renderHook(() => useMemberAuth())

      await act(async () => {
        try {
          await result.current.login('test@example.com', 'wrong-password')
        } catch {
          void 0
        }
      })

      expect(result.current.error).toBe('Invalid email or password')
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('handles login failure with 403', async () => {
      vi.mocked(api.apiClient.post).mockRejectedValue(
        new api.ApiError(403, '{"detail": "No active membership"}'),
      )

      const { result } = renderHook(() => useMemberAuth())

      await act(async () => {
        try {
          await result.current.login('test@example.com', 'password')
        } catch {
          void 0
        }
      })

      expect(result.current.error).toBe('No active organization membership')
    })
  })

  describe('signup', () => {
    it('successfully signs up user', async () => {
      const mockResponse = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        token_type: 'bearer',
        user_id: 1,
        email: 'new@example.com',
        name: 'New User',
        org_id: 1,
        org_slug: 'new-org',
        role: 'owner',
      }

      vi.mocked(api.apiClient.post).mockResolvedValue(mockResponse)

      const { result } = renderHook(() => useMemberAuth())

      await act(async () => {
        const user = await result.current.signup({
          email: 'new@example.com',
          password: 'securepassword123',
          name: 'New User',
          org_name: 'New Org',
          org_slug: 'new-org',
        })
        expect(user.email).toBe('new@example.com')
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.org_slug).toBe('new-org')
    })

    it('handles signup conflict (409)', async () => {
      vi.mocked(api.apiClient.post).mockRejectedValue(
        new api.ApiError(409, '{"detail": "Email already registered"}'),
      )

      const { result } = renderHook(() => useMemberAuth())

      await act(async () => {
        try {
          await result.current.signup({
            email: 'existing@example.com',
            password: 'password123',
            name: 'User',
            org_name: 'Org',
            org_slug: 'org',
          })
        } catch {
          void 0
        }
      })

      expect(result.current.error).toBe('Email already registered')
    })

    it('handles signup validation error (422)', async () => {
      vi.mocked(api.apiClient.post).mockRejectedValue(
        new api.ApiError(422, '{"detail": "Validation error"}'),
      )

      const { result } = renderHook(() => useMemberAuth())

      await act(async () => {
        try {
          await result.current.signup({
            email: 'test@example.com',
            password: 'short',
            name: 'User',
            org_name: 'Org',
            org_slug: 'ab',
          })
        } catch {
          void 0
        }
      })

      expect(result.current.error).toBe(
        'Invalid input. Please check your information.',
      )
    })
  })

  describe('logout', () => {
    it('clears user and tokens', async () => {
      const mockResponse = {
        access_token: 'token',
        refresh_token: 'refresh',
        token_type: 'bearer',
        user_id: 1,
        email: 'test@example.com',
        name: 'Test',
        org_id: 1,
        org_slug: 'test',
        role: 'owner',
      }

      vi.mocked(api.apiClient.post).mockResolvedValue(mockResponse)

      const { result } = renderHook(() => useMemberAuth())

      await act(async () => {
        await result.current.login('test@example.com', 'password')
      })

      expect(result.current.isAuthenticated).toBe(true)

      act(() => {
        result.current.logout()
      })

      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.user).toBeNull()
      expect(api.apiClient.clearToken).toHaveBeenCalled()
      expect(api.apiClient.clearRefreshToken).toHaveBeenCalled()
    })
  })

  describe('refreshToken', () => {
    it('returns false when no refresh token', async () => {
      vi.mocked(api.apiClient.getRefreshToken).mockReturnValue(null)

      const { result } = renderHook(() => useMemberAuth())

      let refreshResult: boolean | undefined
      await act(async () => {
        refreshResult = await result.current.refreshToken()
      })

      expect(refreshResult).toBe(false)
    })

    it('refreshes token successfully', async () => {
      vi.mocked(api.apiClient.getRefreshToken).mockReturnValue('valid-refresh')
      vi.mocked(api.apiClient.post).mockResolvedValue({
        access_token: 'new-access-token',
        token_type: 'bearer',
      })

      const { result } = renderHook(() => useMemberAuth())

      let refreshResult: boolean | undefined
      await act(async () => {
        refreshResult = await result.current.refreshToken()
      })

      expect(refreshResult).toBe(true)
      expect(api.apiClient.setToken).toHaveBeenCalledWith('new-access-token')
    })

    it('logs out on refresh failure', async () => {
      vi.mocked(api.apiClient.getRefreshToken).mockReturnValue('invalid-refresh')
      vi.mocked(api.apiClient.post).mockRejectedValue(new Error('Invalid token'))

      const { result } = renderHook(() => useMemberAuth())

      let refreshResult: boolean | undefined
      await act(async () => {
        refreshResult = await result.current.refreshToken()
      })

      expect(refreshResult).toBe(false)
      expect(api.apiClient.clearToken).toHaveBeenCalled()
    })
  })
})
