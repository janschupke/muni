import { defineConfig } from '@playwright/test'

import { loadRootEnv, productionServer } from './e2e/support/server'

/**
 * Screenshots of every page and the states worth looking at (hover, open rows, forms with
 * errors, dialogs, popovers, phone widths), in both themes, for a person to review
 * (e2e/visual.shots.ts), on the production build:
 *   pnpm --filter @muni/web build && pnpm test:visual
 * Nothing is compared automatically; the shots land in visual-shots/<theme>/ (outside
 * test-results/, which every Playwright run empties).
 */
loadRootEnv()
const PORT = 3063

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${String(PORT)}`, reducedMotion: 'reduce' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'visual', testMatch: '**/*.shots.ts', dependencies: ['setup'] },
  ],
  webServer: productionServer(PORT),
})
