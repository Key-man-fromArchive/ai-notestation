import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  outputDir: 'e2e/test-results',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /fullsuite\.spec\.ts|auth\.setup\.ts/,
      use: { browserName: 'chromium' },
    },
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'authenticated',
      testMatch: /fullsuite\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/user.json' },
    },
  ],
})
