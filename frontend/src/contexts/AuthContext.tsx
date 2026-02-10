import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { apiClient } from '@/lib/api'

export interface User {
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

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (data: SignupRequest) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchUser = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiClient.get<User>('/auth/me')
      setUser(data)
      return true
    } catch {
      return false
    }
  }, [])

  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    const refreshToken = apiClient.getRefreshToken()
    if (!refreshToken) return false

    try {
      const data = await apiClient.post<{
        access_token: string
        token_type: string
      }>('/auth/token/refresh', { refresh_token: refreshToken })
      apiClient.setToken(data.access_token)
      return true
    } catch {
      return false
    }
  }, [])

  // Restore auth on app startup
  useEffect(() => {
    const restoreAuth = async () => {
      if (apiClient.getToken()) {
        const ok = await fetchUser()
        if (!ok) {
          const refreshed = await refreshAccessToken()
          if (refreshed) {
            await fetchUser()
          } else {
            apiClient.clearToken()
            apiClient.clearRefreshToken()
          }
        }
      } else {
        const refreshed = await refreshAccessToken()
        if (refreshed) {
          await fetchUser()
        }
      }
      setIsLoading(false)
    }

    restoreAuth()
  }, [fetchUser, refreshAccessToken])

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiClient.post<{
      access_token: string
      refresh_token: string
      user_id: number
      email: string
      name: string
      org_id: number
      org_slug: string
      role: string
    }>('/auth/login', { email, password })

    apiClient.setToken(data.access_token)
    apiClient.setRefreshToken(data.refresh_token)

    setUser({
      user_id: data.user_id,
      email: data.email,
      name: data.name,
      org_id: data.org_id,
      org_slug: data.org_slug,
      role: data.role,
    })
  }, [])

  const signup = useCallback(async (request: SignupRequest) => {
    const data = await apiClient.post<{
      access_token: string
      refresh_token: string
      user_id: number
      email: string
      name: string
      org_id: number
      org_slug: string
      role: string
    }>('/members/signup', request)

    apiClient.setToken(data.access_token)
    apiClient.setRefreshToken(data.refresh_token)

    setUser({
      user_id: data.user_id,
      email: data.email,
      name: data.name,
      org_id: data.org_id,
      org_slug: data.org_slug,
      role: data.role,
    })
  }, [])

  const logout = useCallback(() => {
    apiClient.clearToken()
    apiClient.clearRefreshToken()
    localStorage.removeItem('member_user')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
