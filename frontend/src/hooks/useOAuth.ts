import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api'

interface OAuthStatus {
  connected: boolean
  provider: string
  email?: string | null
  expires_at?: string | null
}

interface OAuthConfigStatus {
  provider: string
  configured: boolean
}

interface OAuthCallbackParams {
  code: string
  state: string
}

interface OAuthCallbackResponse {
  connected: boolean
  provider: string
  email?: string
}

/**
 * OAuth 연결 관리 hook
 * - 설정 상태 확인 (client_id 설정 여부)
 * - 연결 상태 조회
 * - OAuth 인증 시작 (리다이렉트)
 * - 연결 해제
 */
export function useOAuth(provider: string) {
  const queryClient = useQueryClient()

  const configQuery = useQuery<OAuthConfigStatus>({
    queryKey: ['oauth', 'config', provider],
    queryFn: () => apiClient.get(`/oauth/${provider}/config-status`),
    enabled: provider === 'openai' || provider === 'google',
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const statusQuery = useQuery<OAuthStatus>({
    queryKey: ['oauth', 'status', provider],
    queryFn: () => apiClient.get(`/oauth/${provider}/status`),
    enabled: provider === 'openai' || provider === 'google',
  })

  const connectMutation = useMutation({
    mutationFn: async () => {
      const data = await apiClient.get<{ authorization_url: string; state: string }>(
        `/oauth/${provider}/authorize`
      )
      // Store provider in sessionStorage for callback page
      sessionStorage.setItem('oauth_provider', provider)
      // Redirect to OAuth provider
      window.location.href = data.authorization_url
    },
  })

  const callbackMutation = useMutation({
    mutationFn: (params: OAuthCallbackParams) =>
      apiClient.post<OAuthCallbackResponse>(`/oauth/${provider}/callback`, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oauth', 'status', provider] })
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => apiClient.delete(`/oauth/${provider}/disconnect`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oauth', 'status', provider] })
    },
  })

  return {
    configured: configQuery.data?.configured ?? false,
    connected: statusQuery.data?.connected ?? false,
    email: statusQuery.data?.email ?? null,
    isLoading: statusQuery.isLoading || configQuery.isLoading,
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    connectError: connectMutation.error,
    connect: connectMutation.mutate,
    disconnect: disconnectMutation.mutate,
    exchangeCode: callbackMutation.mutateAsync,
    callbackError: callbackMutation.error,
  }
}
