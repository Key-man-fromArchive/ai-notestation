import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { apiClient } from '@/lib/api'

interface User {
  username: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

/**
 * 인증 상태 관리 Provider
 * - 앱 시작 시 저장된 토큰으로 /auth/me 호출하여 인증 확인
 * - 실패 시 refresh token으로 재시도
 * - login/logout 메서드 제공
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 토큰으로 사용자 정보 조회
  const fetchUser = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiClient.get<User>('/auth/me')
      setUser(data)
      return true
    } catch {
      return false
    }
  }, [])

  // refresh token으로 access token 갱신
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    const refreshToken = apiClient.getRefreshToken()
    if (!refreshToken) return false

    try {
      const data = await apiClient.post<{
        access_token: string
        token_type: string
      }>('/token/refresh', { refresh_token: refreshToken })
      apiClient.setToken(data.access_token)
      return true
    } catch {
      return false
    }
  }, [])

  // 앱 시작 시 인증 상태 복원
  useEffect(() => {
    const restoreAuth = async () => {
      // 먼저 member auth 체크 (로컬 DB 인증)
      const memberUser = localStorage.getItem('member_user')
      const hasToken = apiClient.getToken()
      
      if (memberUser && hasToken) {
        // member auth가 있고 토큰도 있으면 member auth 사용
        try {
          const parsed = JSON.parse(memberUser)
          setUser({ username: parsed.email || parsed.name })
          setIsLoading(false)
          return
        } catch {
          // JSON 파싱 실패시 토큰 정리하고 계속
          localStorage.removeItem('member_user')
        }
      }
      
      // 저장된 access token이 있으면 NAS 사용자 정보 조회
      if (apiClient.getToken()) {
        const ok = await fetchUser()
        if (!ok) {
          // access token 만료 → refresh 시도
          const refreshed = await refreshAccessToken()
          if (refreshed) {
            await fetchUser()
          } else {
            apiClient.clearToken()
            apiClient.clearRefreshToken()
          }
        }
      } else {
        // access token 없지만 refresh token이 있으면 시도
        const refreshed = await refreshAccessToken()
        if (refreshed) {
          await fetchUser()
        }
      }
      setIsLoading(false)
    }

    restoreAuth()
  }, [fetchUser, refreshAccessToken])

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiClient.post<{
      access_token: string
      refresh_token: string
      token_type: string
    }>('/auth/login', { username, password })

    apiClient.setToken(data.access_token)
    apiClient.setRefreshToken(data.refresh_token)
    setUser({ username })
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
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/**
 * 인증 컨텍스트 사용 hook
 * AuthProvider 외부에서 호출하면 에러 발생
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
