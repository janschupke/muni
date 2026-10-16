import { defineConfig } from '@playwright/test'

import { productionServer } from './e2e/support/server'

/**
 * Lighthouse audits of every public page (e2e/lighthouse.audit.ts), on the production build:
 *   pnpm --filter @muni/web build && pnpm test:lighthouse
 * Reports land in test-results/lighthouse/.
 */
const PORT = 3062

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.audit.ts',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${String(PORT)}` },
  webServer: productionServer(PORT),
})
