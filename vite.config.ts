import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.API_PROXY_TARGET || 'http://127.0.0.1:8000'
  return {
    base: '/creativity/',
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: Object.fromEntries(
        ['/admin/v1', '/api/v1', '/health'].map((prefix) => [prefix, { target }]),
      ),
    },
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
      restoreMocks: true,
    },
  }
})
