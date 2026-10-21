import { defineConfig, devices } from '@playwright/test'

import { loadRootEnv, productionServer } from './e2e/support/server'

/**
 * Smoke, access and accessibility tests against the production build, on the test database,
 * signed in through the Clerk development instance (keys from the repo's .env):
 *   pnpm db:up && pnpm --filter @muni/web build && pnpm test:e2e
 * The register project (e2e/register.setup.ts) seeds the database as of today; the setup
 * project (e2e/auth.setup.ts) then creates the e2e users and signs each role in once.
 */
loadRootEnv()
const PORT = 3061

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${String(PORT)}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'register', testMatch: /register\.setup\.ts/ },
    { name: 'setup', testMatch: /auth\.setup\.ts/, dependencies: ['register'] },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: productionServer(PORT),
})
