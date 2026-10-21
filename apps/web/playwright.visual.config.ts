import { defineConfig } from '@playwright/test'

import { loadRootEnv, productionServer, READ_PORT, READ_PORTS } from './e2e/support/server'

/**
 * Screenshots of every page and the states worth looking at (hover, open rows, forms with
 * errors, dialogs, popovers, phone widths), in both themes, for a person to review
 * (e2e/visual.shots.ts), on the production build:
 *   pnpm --filter @muni/web build && pnpm test:visual
 * Nothing is compared automatically; the shots are written to visual-shots/<theme>/ (outside
 * test-results/, which every Playwright run empties). Nothing is saved, so the shots run side
 * by side on the readers' servers.
 */
loadRootEnv()

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  workers: '75%',
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${String(READ_PORT)}`, reducedMotion: 'reduce' },
  projects: [
    { name: 'register', testMatch: /register\.setup\.ts/ },
    { name: 'setup', testMatch: /auth\.setup\.ts/, dependencies: ['register'] },
    { name: 'visual', testMatch: '**/*.shots.ts', dependencies: ['setup'] },
  ],
  webServer: READ_PORTS.map(port => productionServer(port)),
})
