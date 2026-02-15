import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  outputDir: 'e2e/test-results',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'smoke',
      testIgnore: [/auth\.setup/],
      testMatch: [/app\.spec\.ts/],
      use: { storageState: undefined },
    },
    {
      name: 'authenticated',
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/user.json' },
      testMatch: [
        /fullsuite\.spec\.ts/,
        /notebooks-crud\.spec\.ts/,
        /notes-crud\.spec\.ts/,
        /note-editor\.spec\.ts/,
        /attachments\.spec\.ts/,
        /settings-.*\.spec\.ts/,
        /members-management\.spec\.ts/,
        /notebook-sharing\.spec\.ts/,
        /share-links\.spec\.ts/,
        /export-.*\.spec\.ts/,
        /oauth-flows\.spec\.ts/,
      ],
    },
    {
      name: 'integration',
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/user.json' },
      testMatch: [
        /search-.*\.spec\.ts/,
        /discovery-clusters\.spec\.ts/,
        /graph-view\.spec\.ts/,
        /ai-chat\.spec\.ts/,
        /ai-features\.spec\.ts/,
        /ai-feedback\.spec\.ts/,
        /capture-.*\.spec\.ts/,
      ],
    },
    {
      name: 'slow',
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/user.json', actionTimeout: 60000 },
      timeout: 120000,
      testMatch: [
        /image-analysis\.spec\.ts/,
        /evaluation-runs\.spec\.ts/,
        /ocr\.spec\.ts/,
        /operations\.spec\.ts/,
      ],
    },
    {
      name: 'admin',
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/user.json' },
      testMatch: [/admin-.*\.spec\.ts/, /search-metrics\.spec\.ts/],
    },
    {
      name: 'standalone',
      testIgnore: [/auth\.setup/],
      use: { storageState: undefined },
      testMatch: [
        /member-auth\.spec\.ts/,
        /notes\.spec\.ts/,
        /ai-workbench\.spec\.ts/,
        /oauth-openai.*\.spec\.ts/,
      ],
    },
  ],
})
