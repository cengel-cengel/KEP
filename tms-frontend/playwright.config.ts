import { defineConfig } from '@playwright/test';

/**
 * Playwright config — Mock-E2E (FE-only).
 *
 * BaseURL = vite-preview (npm run preview, port 4173).
 * Tests setzen Auth-Token via addInitScript-localStorage,
 * mocken API-Calls per page.route. Kein echtes BE nötig.
 *
 * Lokal:
 *   npm run build          (oder Hook erzwingt es eh beim Push)
 *   npx playwright install chromium   (einmalig)
 *   npm run e2e
 *
 * CI/Vercel: NICHT eingebunden (E2E ist nicht im pre-push, zu
 * langsam; lokal/CI-Job separat).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    actionTimeout: 5_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npm run preview',
    port: 4173,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
});
