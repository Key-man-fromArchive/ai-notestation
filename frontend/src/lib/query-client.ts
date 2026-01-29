// @TASK P0-T0.4 - TanStack Query 클라이언트 설정
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#데이터-페칭
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5분
      gcTime: 1000 * 60 * 30, // 30분 (이전 cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})
