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
