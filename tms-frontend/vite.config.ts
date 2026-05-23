/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // globals:true aktiviert auto-cleanup von @testing-library/react
    // (afterEach Hook wird global registriert, kein leakage zw. Tests).
    globals: true,
    // e2e/ ist Playwright-Test-Dir (eigener Runner via `npm run e2e`),
    // NICHT Vitest. Sonst versucht Vitest die Specs zu laufen und
    // crasht mit "Playwright Test did not expect test.describe()".
    exclude: ['node_modules', 'dist', 'e2e'],
  },
})
