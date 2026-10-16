import { defineConfig } from '@playwright/test'

import { loadRootEnv, productionServer } from './e2e/support/server'

/**
 * Lighthouse audits of every page as an admin, and the introduction signed out
 * (e2e/lighthouse.audit.ts), on the production build:
 *   pnpm --filter @muni/web build && pnpm test:lighthouse
 * The setup project signs the e2e users in first. Reports land in test-results/lighthouse/.
 */
loadRootEnv()
const PORT = 3062

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${String(PORT)}` },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'lighthouse', testMatch: '**/*.audit.ts', dependencies: ['setup'] },
  ],
  webServer: productionServer(PORT),
})
