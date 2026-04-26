import { defineConfig } from '@playwright/test'

// WEB_URL lets a worktree point Playwright at a non-default web port. The
// dev:worktree orchestrator writes it into .dev-ports.local; npm scripts that
// run E2E load it via dotenv-cli.
const baseURL = process.env.WEB_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './tests',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
