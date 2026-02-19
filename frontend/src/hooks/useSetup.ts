import { useMutation, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

interface SetupStatus {
  initialized: boolean
  current_step: number
  total_steps: number
}

interface SystemInfo {
  cpu_count: number
  memory_gb: number
  disk_total_gb: number
  disk_free_gb: number
  platform: string
  python_version: string
}

interface StepResponse {
  step: number
}

interface AITestResult {
  provider: string
  success: boolean
  message: string
}

interface AIResponse {
  step: number
  test_results: AITestResult[] | null
}

interface CompleteResponse {
  success: boolean
  access_token: string
  refresh_token: string
  user_id: number
  org_id: number
}

export function useSetupStatus() {
  return useQuery<SetupStatus>({
    queryKey: ['setup', 'status'],
    queryFn: () => apiClient.get('/setup/status'),
    retry: false,
  })
}

export function useSystemInfo() {
  return useQuery<SystemInfo>({
    queryKey: ['setup', 'system-info'],
    queryFn: () => apiClient.get('/setup/system-info'),
  })
}

export function useSetupLanguage() {
  return useMutation<StepResponse, Error, { language: string }>({
    mutationFn: (data) => apiClient.post('/setup/language', data),
  })
}

export function useSetupAdmin() {
  return useMutation<StepResponse, Error, {
    email: string
    password: string
    name: string
    org_name: string
    org_slug: string
  }>({
    mutationFn: (data) => apiClient.post('/setup/admin', data),
  })
}

export function useSetupAI() {
  return useMutation<AIResponse, Error, {
    providers: { provider: string; api_key: string }[]
    test: boolean
  }>({
    mutationFn: (data) => apiClient.post('/setup/ai', data),
  })
}

export function useSetupDataSource() {
  return useMutation<StepResponse, Error, {
    skip: boolean
    nas_url?: string
    nas_port?: number
    nas_account?: string
    nas_password?: string
  }>({
    mutationFn: (data) => apiClient.post('/setup/datasource', data),
  })
}

export function useSetupComplete() {
  return useMutation<CompleteResponse, Error, void>({
    mutationFn: () => apiClient.post('/setup/complete', {}),
  })
}

export type { SetupStatus, SystemInfo, AITestResult, AIResponse, CompleteResponse }
