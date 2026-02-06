import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface OAuthStatus {
  connected: boolean
  provider: string
  email?: string | null
  expires_at?: string | null
}

interface OAuthConfigStatus {
  provider: string
  configured: boolean
  auth_mode?: 'device_code' | 'code_paste' | 'api_key' | ''
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

interface DeviceCodeStartResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string | null
  expires_in: number
  interval: number
}

interface DeviceCodePollResponse {
  status: 'pending' | 'completed' | 'expired' | 'denied' | 'slow_down'
  connected: boolean
  provider?: string
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
    enabled: provider === 'openai' || provider === 'google' || provider === 'anthropic',
    staleTime: 5 * 60 * 1000,
  })

  const statusQuery = useQuery<OAuthStatus>({
    queryKey: ['oauth', 'status', provider],
    queryFn: () => apiClient.get(`/oauth/${provider}/status`),
    enabled: provider === 'openai' || provider === 'google' || provider === 'anthropic',
  })

  const connectMutation = useMutation({
    mutationFn: async () => {
      const data = await apiClient.get<{ authorization_url: string; state: string }>(
        `/oauth/${provider}/authorize`
      )
      // Store provider in sessionStorage for callback page
      sessionStorage.setItem('oauth_provider', provider)
      return data
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

  const startDeviceFlowMutation = useMutation({
    mutationFn: () =>
      apiClient.post<DeviceCodeStartResponse>(`/oauth/${provider}/device/start`, {}),
  })

  const pollDeviceTokenMutation = useMutation({
    mutationFn: (deviceCode: string) =>
      apiClient.post<DeviceCodePollResponse>(`/oauth/${provider}/device/poll`, {
        device_code: deviceCode,
      }),
    onSuccess: data => {
      if (data.connected) {
        queryClient.invalidateQueries({ queryKey: ['oauth', 'status', provider] })
      }
    },
  })

  return {
    configured: configQuery.data?.configured ?? false,
    connected: statusQuery.data?.connected ?? false,
    email: statusQuery.data?.email ?? null,
    authMode: configQuery.data?.auth_mode ?? '',
    isLoading: statusQuery.isLoading || configQuery.isLoading,
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    connectError: connectMutation.error,
    connect: connectMutation.mutateAsync,
    authUrl: connectMutation.data?.authorization_url ?? null,
    authState: connectMutation.data?.state ?? null,
    disconnect: disconnectMutation.mutate,
    exchangeCode: callbackMutation.mutateAsync,
    isExchangingCode: callbackMutation.isPending,
    callbackError: callbackMutation.error,
    startDeviceFlow: startDeviceFlowMutation.mutateAsync,
    deviceFlowData: startDeviceFlowMutation.data ?? null,
    isStartingDeviceFlow: startDeviceFlowMutation.isPending,
    deviceFlowError: startDeviceFlowMutation.error,
    pollDeviceToken: pollDeviceTokenMutation.mutateAsync,
    isPollingDevice: pollDeviceTokenMutation.isPending,
    pollError: pollDeviceTokenMutation.error,
  }
}
