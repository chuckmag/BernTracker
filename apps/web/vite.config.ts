import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// WEB_PORT + API_PORT are honored so a worktree can pick its own pair via
// `npm run dev:worktree`. Defaults preserve the historical 5173/3000 behavior
// when run outside the worktree workflow.
const webPort = parseInt(process.env.WEB_PORT ?? '5173', 10)
const apiPort = process.env.API_PORT ?? '3000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `source` makes Vite resolve workspace packages via their exports.source
  // condition (./src/*.ts) instead of the prebuilt ./dist/*.js. Without it,
  // edits in packages/types don't HMR — and a stale Vite prebundle can fail
  // with "no exported member X" even after a manual `tsc` rebuild.
  // Lifted from #138/ea8b09c.
  resolve: {
    conditions: ['source'],
  },
  server: {
    port: webPort,
    strictPort: true,
    proxy: { '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
