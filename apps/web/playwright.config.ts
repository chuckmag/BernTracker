import { defineConfig } from '@playwright/test'

// Specs hammer the dev API with bcrypt-cost-10 logins and seed dozens of users
// in beforeAll. Running multiple files in parallel saturates the API CPU and
// trips the 30s waitForURL on /login → /feed and /login → /dashboard. Force
// a single worker so logins serialize across files (each file already uses
// describe.serial, so this matches the in-file model). See issue #101.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
