import { defineConfig } from '@playwright/test'

// WEB_URL lets a worktree point Playwright at a non-default web port. The
// dev:worktree orchestrator writes it into .dev-ports.local; npm scripts that
// run E2E load it via dotenv-cli.
const baseURL = process.env.WEB_URL ?? 'http://localhost:5173'

// Specs hammer the dev API with bcrypt-cost-10 logins and seed dozens of users
// in beforeAll. Running multiple files in parallel saturates the API CPU and
// trips the 30s waitForURL on /login → /dashboard. Force a single worker so
// logins serialize across files (each file already uses describe.serial, so
// this matches the in-file model). See issue #101.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalSetup: './tests/global-setup.ts',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
