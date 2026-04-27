import { defineConfig } from '@playwright/test'

// WEB_URL lets a worktree point Playwright at a non-default web port. The
// dev:worktree orchestrator writes it into .dev-ports.local; npm scripts that
// run E2E load it via dotenv-cli.
const baseURL = process.env.WEB_URL ?? 'http://localhost:5173'

// Tests are independent: each seeds its own gym/users via Prisma and tears
// down in afterEach. Auth uses JWT cookie injection (tests/lib/auth.ts) so
// there is no `/login` form round-trip and no shared browser state across
// tests. That makes parallel execution safe. See #111 for the migration.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  timeout: 60_000,
  globalSetup: './tests/global-setup.ts',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
