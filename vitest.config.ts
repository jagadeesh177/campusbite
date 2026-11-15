import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      // server-only throws outside the React server runtime; services are plain Node in tests
      'server-only': path.resolve(process.cwd(), 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup-env.ts'],
    fileParallelism: false, // integration tests share one database
    testTimeout: 30_000,
    hookTimeout: 180_000,
    include: ['tests/**/*.test.ts'],
  },
})
