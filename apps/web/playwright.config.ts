import { defineConfig, devices } from '@playwright/test'

import { productionServer } from './e2e/support/server'

/**
 * Smoke and accessibility tests against the production build, on the seeded test database:
 *   pnpm db:up && pnpm test:integration   # migrates and seeds 5439
 *   pnpm --filter @muni/web build && pnpm test:e2e
 * Runs signed out (no Clerk keys): the public read-only register.
 */
const PORT = 3061

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${String(PORT)}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: productionServer(PORT),
})
