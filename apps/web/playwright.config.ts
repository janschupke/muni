import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke tests against the production build, on the seeded test database (port 5439):
 *   pnpm db:up && pnpm test:integration   # migrates and seeds 5439
 *   pnpm --filter @muni/web build && pnpm test:e2e
 * Runs signed out (no Clerk keys): the public read-only register.
 */
const PORT = 3061
const TEST_DB = 'postgresql://muni:muni@localhost:5439/muni_test'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: TEST_DB,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
      CLERK_SECRET_KEY: '',
    },
  },
})
