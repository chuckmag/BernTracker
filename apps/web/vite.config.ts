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
  // Resolve workspace packages (`@wodalytics/*`) via their `exports.source`
  // condition, i.e. directly from src/*.ts. Without this Vite falls back to
  // `default` → `dist/index.js` and prebundles the compiled output, which
  // means edits to packages/types or packages/db don't show up until you
  // manually rebuild dist/. Reading source removes that whole loop and lets
  // HMR fire on cross-package changes.
  resolve: {
    conditions: ['source'],
  },
  server: {
    port: webPort,
    strictPort: true,
    // `/uploads` is proxied so dev image URLs returned by the local-fs
    // ImageStorage backend (e.g. `/uploads/avatars/<id>/<file>.webp`) load
    // through the Vite dev server instead of 404ing — same-origin assumption
    // that holds in prod via nginx.
    proxy: {
      '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true },
      '/uploads': { target: `http://localhost:${apiPort}`, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
