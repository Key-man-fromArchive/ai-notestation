// @TASK P5-T5.1 - API 클라이언트 (fetch 래퍼)
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#api-통신

const BASE_URL = '/api'

/**
 * API 에러 클래스
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string
  ) {
    super(`API Error: ${status}`)
    this.name = 'ApiError'
  }
}

/**
 * API 클라이언트 클래스
 * - fetch 래퍼
 * - JWT 토큰 관리
 * - 자동 JSON 파싱 및 에러 핸들링
 */
class ApiClient {
  private token: string | null = null

  /**
   * JWT 토큰 설정
   */
  setToken(token: string): void {
    this.token = token
    // LocalStorage에도 저장 (페이지 새로고침 대응)
    localStorage.setItem('auth_token', token)
  }

  /**
   * 현재 access token 반환
   */
  getToken(): string | null {
    return this.token
  }

  /**
   * JWT 토큰 제거
   */
  clearToken(): void {
    this.token = null
    localStorage.removeItem('auth_token')
  }

  /**
   * Refresh token 저장
   */
  setRefreshToken(token: string): void {
    localStorage.setItem('refresh_token', token)
  }

  /**
   * Refresh token 조회
   */
  getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token')
  }

  /**
   * Refresh token 삭제
   */
  clearRefreshToken(): void {
    localStorage.removeItem('refresh_token')
  }

  /**
   * LocalStorage에서 토큰 복원
   */
  restoreToken(): void {
    const token = localStorage.getItem('auth_token')
    if (token) {
      this.token = token
    }
  }

  /**
   * HTTP 요청 공통 로직
   */
  async request<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept-Language': localStorage.getItem('language') || 'ko',
    }

    // Authorization 헤더 추가
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    // options의 headers 병합
    if (options?.headers) {
      Object.assign(headers, options.headers)
    }

    const url = `${BASE_URL}${path}`

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })

      // 에러 응답 처리
      if (!response.ok) {
        const body = await response.text()

        // Setup guard: 503 setup_required → redirect to /setup
        if (response.status === 503) {
          try {
            const parsed = JSON.parse(body)
            if (parsed.detail === 'setup_required' && !window.location.pathname.startsWith('/setup')) {
              window.location.href = '/setup'
              return undefined as T
            }
          } catch {
            // Not JSON, fall through
          }
        }

        throw new ApiError(response.status, body)
      }

      // 204 No Content 처리
      if (response.status === 204) {
        return undefined as T
      }

      // JSON 파싱
      return await response.json()
    } catch (error) {
      // ApiError는 그대로 던지기
      if (error instanceof ApiError) {
        throw error
      }

      // 네트워크 에러 등
      throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * GET 요청
   */
  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' })
  }

  /**
   * POST 요청
   */
  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  /**
   * PUT 요청
   */
  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  }

  /**
   * PATCH 요청
   */
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  }

  /**
   * DELETE 요청
   */
  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }
}

/**
 * 싱글톤 API 클라이언트 인스턴스
 */
export const apiClient = new ApiClient()

// 앱 시작 시 토큰 복원
apiClient.restoreToken()
