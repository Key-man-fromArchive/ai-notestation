// @TASK P0-T0.4 - Vite + React 19 초기화
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#프론트엔드
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0', // Docker 환경에서 외부 접근 허용
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
})
