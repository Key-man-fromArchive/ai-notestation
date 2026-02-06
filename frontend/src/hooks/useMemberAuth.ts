import { useState, useCallback } from 'react'
import { apiClient, ApiError } from '@/lib/api'

export interface MemberUser {
  user_id: number
  email: string
  name: string
  org_id: number
  org_slug: string
  role: string
}

interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user_id: number
  email: string
  name: string
  org_id: number
  org_slug: string
  role: string
}

interface SignupRequest {
  email: string
  password: string
  name: string
  org_name: string
  org_slug: string
}

interface RefreshResponse {
  access_token: string
  token_type: string
}

const MEMBER_USER_KEY = 'member_user'

function saveMemberUser(user: MemberUser): void {
  localStorage.setItem(MEMBER_USER_KEY, JSON.stringify(user))
}

function loadMemberUser(): MemberUser | null {
  const stored = localStorage.getItem(MEMBER_USER_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as MemberUser
  } catch {
    return null
  }
}

function clearMemberUser(): void {
  localStorage.removeItem(MEMBER_USER_KEY)
}

export function useMemberAuth() {
  const [user, setUser] = useState<MemberUser | null>(() => loadMemberUser())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await apiClient.post<LoginResponse>('/members/login', {
        email,
        password,
      })

      apiClient.setToken(data.access_token)
      apiClient.setRefreshToken(data.refresh_token)

      const memberUser: MemberUser = {
        user_id: data.user_id,
        email: data.email,
        name: data.name,
        org_id: data.org_id,
        org_slug: data.org_slug,
        role: data.role,
      }

      saveMemberUser(memberUser)
      setUser(memberUser)
      return memberUser
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Invalid email or password')
        } else if (err.status === 403) {
          setError('No active organization membership')
        } else {
          setError('Login failed. Please try again.')
        }
      } else {
        setError('Network error. Please check your connection.')
      }
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const signup = useCallback(async (request: SignupRequest) => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await apiClient.post<LoginResponse>('/members/signup', request)

      apiClient.setToken(data.access_token)
      apiClient.setRefreshToken(data.refresh_token)

      const memberUser: MemberUser = {
        user_id: data.user_id,
        email: data.email,
        name: data.name,
        org_id: data.org_id,
        org_slug: data.org_slug,
        role: data.role,
      }

      saveMemberUser(memberUser)
      setUser(memberUser)
      return memberUser
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          const body = JSON.parse(err.body)
          setError(body.detail || 'Email or organization already exists')
        } else if (err.status === 422) {
          setError('Invalid input. Please check your information.')
        } else {
          setError('Signup failed. Please try again.')
        }
      } else {
        setError('Network error. Please check your connection.')
      }
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    apiClient.clearToken()
    apiClient.clearRefreshToken()
    clearMemberUser()
    setUser(null)
  }, [])

  const refreshToken = useCallback(async () => {
    const refreshTokenValue = apiClient.getRefreshToken()
    if (!refreshTokenValue) return false

    try {
      const data = await apiClient.post<RefreshResponse>('/members/refresh', {
        refresh_token: refreshTokenValue,
      })
      apiClient.setToken(data.access_token)
      return true
    } catch {
      logout()
      return false
    }
  }, [logout])

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    signup,
    logout,
    refreshToken,
  }
}
